import { readFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const STATE_VERSION = 1;

export function defaultStatePath(dshHomePathFn) {
  if (typeof dshHomePathFn === "function") {
    try {
      return dshHomePathFn("plugins", "spig-dsh-toolkit", "components.json");
    } catch {}
  }
  const base = process.env.DSH_HOME && process.env.DSH_HOME.trim().length > 0
    ? process.env.DSH_HOME.trim()
    : join(homedir(), ".dsh");
  return join(base, "plugins", "spig-dsh-toolkit", "components.json");
}

export class ComponentStateStore {
  constructor({ filePath, defaults = {}, onWarn } = {}) {
    this.filePath = filePath ?? defaultStatePath();
    this.defaults = { ...defaults };
    this.onWarn = onWarn ?? ((msg) => console.warn("[spig-dsh-toolkit]", msg));
    this.state = this._loadSync();
  }

  _loadSync() {
    const merged = { ...this.defaults };
    let raw;
    try {
      raw = readFileSync(this.filePath, "utf8");
    } catch (error) {
      if (error && error.code === "ENOENT") return merged;
      this.onWarn(`failed to read component state at ${this.filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return merged;
    }
    try {
      const clean = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
      const parsed = JSON.parse(clean);
      const map = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed.components && typeof parsed.components === "object" ? parsed.components : parsed)
        : {};
      for (const [id, value] of Object.entries(map)) {
        if (typeof value === "boolean") {
          merged[id] = value;
        }
      }
    } catch (error) {
      this.onWarn(`corrupted component state at ${this.filePath}; falling back to defaults: ${error instanceof Error ? error.message : String(error)}`);
    }
    return merged;
  }

  isEnabled(id) {
    if (Object.prototype.hasOwnProperty.call(this.state, id)) {
      return this.state[id] === true;
    }
    return this.defaults[id] === true;
  }

  snapshot() {
    return { ...this.state };
  }

  async setEnabled(id, enabled) {
    if (typeof enabled !== "boolean") {
      throw new Error(`component "${id}" enabled flag must be a boolean`);
    }
    this.state[id] = enabled;
    await this._persist();
    return enabled;
  }

  async _persist() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const payload = JSON.stringify({
      version: STATE_VERSION,
      components: this.state,
    }, null, 2) + "\n";
    const tmp = `${this.filePath}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
    try {
      await writeFile(tmp, payload, "utf8");
      await rename(tmp, this.filePath);
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => {});
      throw error;
    }
  }
}
