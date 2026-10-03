import { createHash, timingSafeEqual } from "node:crypto";
import type { ServerConfig } from "./config";

export function validateServerConfig(settings: ServerConfig): void {
  const local = ["127.0.0.1", "::1", "localhost"].includes(settings.host);
  if (!["127.0.0.1", "::1", "localhost"].includes(settings.tcpHost))
    throw new Error("TCP_HOST deve usar loopback. O cliente TCP não transporta a chave com TLS.");
  if (!local && (settings.accessToken.length < 32 || !settings.originsConfigured)) {
    throw new Error(
      "Para expor o servidor na rede, configure BATTLE_ACCESS_TOKEN (32 a 256 caracteres) e ALLOWED_ORIGINS explicitamente.",
    );
  }
  if (
    settings.accessToken.length > 256 ||
    (settings.accessToken && settings.accessToken.trim() !== settings.accessToken)
  ) {
    throw new Error(
      "BATTLE_ACCESS_TOKEN deve ter até 256 caracteres, sem espaços nas extremidades.",
    );
  }
  if (
    settings.allowedOrigins.length === 0 ||
    settings.allowedOrigins.some((origin) => {
      try {
        const url = new URL(origin);
        return !["http:", "https:"].includes(url.protocol) || url.origin !== origin;
      } catch {
        return true;
      }
    })
  )
    throw new Error(
      "ALLOWED_ORIGINS deve listar origens HTTP/HTTPS completas e exatas, separadas por vírgulas.",
    );
  if (
    !local &&
    settings.allowedOrigins.some((origin) => {
      const url = new URL(origin);
      return (
        url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      );
    })
  )
    throw new Error(
      "Origens externas devem usar HTTPS. Publique a ponte WebSocket por um proxy com TLS (wss).",
    );
}

export function isAllowedOrigin(origin: string | undefined, allowed: string[]): boolean {
  return typeof origin === "string" && allowed.includes(origin);
}

export function authenticate(token: string | undefined, expected: string): boolean {
  if (!expected) return true;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(token ?? ""), digest(expected));
}

export class ConnectionLimits {
  private total = 0;
  private byIp = new Map<string, number>();

  constructor(
    private maxTotal: number,
    private maxPerIp: number,
  ) {}

  acquire(address: string | undefined): (() => void) | null {
    const ip = (address ?? "unknown").replace(/^::ffff:/, "");
    const count = this.byIp.get(ip) ?? 0;
    if (this.total >= this.maxTotal || count >= this.maxPerIp) return null;
    this.total++;
    this.byIp.set(ip, count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.total--;
      const remaining = (this.byIp.get(ip) ?? 1) - 1;
      if (remaining === 0) this.byIp.delete(ip);
      else this.byIp.set(ip, remaining);
    };
  }
}

/** Token bucket: limita rajadas e a frequência sustentada de cada conexão. */
export class MessageBudget {
  private tokens: number;
  private lastAt: number;

  constructor(
    private rate: number,
    now = Date.now(),
  ) {
    this.tokens = rate;
    this.lastAt = now;
  }

  consume(now = Date.now()): boolean {
    this.tokens = Math.min(
      this.rate,
      this.tokens + (Math.max(0, now - this.lastAt) * this.rate) / 1000,
    );
    this.lastAt = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}
