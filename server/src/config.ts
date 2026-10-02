import { join } from "node:path";

try {
  process.loadEnvFile(join(__dirname, "..", ".env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const integerFromEnv = (name: string, fallback: number, maximum = 65535): number => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 && value <= maximum ? value : fallback;
};

export const config = {
  host: process.env.HOST ?? "127.0.0.1",
  tcpHost: process.env.TCP_HOST ?? "127.0.0.1",
  tcpPort: integerFromEnv("PORT", 3001),
  webSocketPort: integerFromEnv("WEB_PORT", 3002),
  httpPort: integerFromEnv("HTTP_PORT", 3003),
  protocolVersion: "pokemon-battle/2",
  maxPlayerNameLength: 24,
  allowedOrigins: (
    process.env.ALLOWED_ORIGINS ??
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  accessToken: process.env.BATTLE_ACCESS_TOKEN ?? "",
  originsConfigured: Boolean(process.env.ALLOWED_ORIGINS?.trim()),
  maxConnections: integerFromEnv("MAX_CONNECTIONS", 128),
  maxConnectionsPerIp: integerFromEnv("MAX_CONNECTIONS_PER_IP", 16),
  maxMessagesPerSecond: integerFromEnv("MAX_MESSAGES_PER_SECOND", 30),
  maxPendingMessages: integerFromEnv("MAX_PENDING_MESSAGES", 16),
  joinTimeoutMs: integerFromEnv("JOIN_TIMEOUT_MS", 10000, 60000),
  pokeApiCacheDir:
    process.env.POKEAPI_CACHE_DIR || join(__dirname, "..", "..", "data", "pokeapi-cache"),
};

export type ServerConfig = typeof config;
