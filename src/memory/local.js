import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class LocalMemoryStore {
  constructor(path = join(homedir(), '.kr-humanizer', 'memory.json')) {
    this.path = path;
  }

  async readAll() {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8'));
      return Array.isArray(value) ? value : [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async search(query, limit = 8) {
    const terms = new Set(query.toLowerCase().split(/\s+/u).filter(Boolean));
    const items = await this.readAll();
    return items
      .map((item) => ({ ...item, score: item.text.toLowerCase().split(/\s+/u).filter((term) => terms.has(term)).length }))
      .sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async add(text, metadata = {}) {
    const items = await this.readAll();
    items.push({ id: randomUUID(), text, metadata, createdAt: new Date().toISOString() });
    const kept = items.slice(-500);
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(kept, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.path);
    return kept.at(-1);
  }
}
