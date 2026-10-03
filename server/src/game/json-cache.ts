import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Cache compartilhado de buscas, com persistência opcional e escrita atômica. */
export class PersistentJsonCache {
  private values = new Map<string, unknown>();
  private pending = new Map<string, Promise<unknown>>();

  constructor(private directory: string | null) {}

  get<T>(
    key: string,
    load: () => Promise<unknown>,
    validate: (value: unknown) => void,
  ): Promise<T> {
    if (this.values.has(key)) return Promise.resolve(this.values.get(key) as T);
    const pending = this.pending.get(key);
    if (pending) return pending as Promise<T>;
    const request = this.load(key, load, validate).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request as Promise<T>;
  }

  private async load(
    key: string,
    fetchData: () => Promise<unknown>,
    validate: (value: unknown) => void,
  ): Promise<unknown> {
    const file = this.directory
      ? join(this.directory, `${createHash("sha256").update(key).digest("hex")}.json`)
      : null;
    if (file) {
      try {
        const data: unknown = JSON.parse(await readFile(file, "utf8"));
        validate(data);
        this.values.set(key, data);
        return data;
      } catch {
        // Cache ausente ou inválido: a resposta remota válida substitui o arquivo.
      }
    }
    const data = await fetchData();
    validate(data);
    this.values.set(key, data);
    if (file && this.directory) {
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await mkdir(this.directory, { recursive: true });
        await writeFile(temporary, JSON.stringify(data), "utf8");
        await rename(temporary, file);
      } catch {
        await unlink(temporary).catch(() => undefined);
        console.warn(
          "[pokeapi] Não foi possível persistir o cache; os dados continuam disponíveis em memória.",
        );
      }
    }
    return data;
  }
}
