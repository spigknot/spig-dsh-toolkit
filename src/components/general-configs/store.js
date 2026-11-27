import { readFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const STORE_VERSION = 1;

export const DEFAULT_GENERAL_CONFIGS = Object.freeze({
  sidebarBottom: Object.freeze({
    sessionSearch: false,
    settingsGear: false,
  }),
});

export function defaultGeneralConfigsPath(dshHomePathFn) {
  if (typeof dshHomePathFn === "function") {
    try {
      return dshHomePathFn("plugins", "spig-dsh-toolkit", "general-configs.json");
    } catch {}
  }
  const base = process.env.DSH_HOME && process.env.DSH_HOME.trim().length > 0
    ? process.env.DSH_HOME.trim()
    : join(homedir(), ".dsh");
  return join(base, "plugins", "spig-dsh-toolkit", "general-configs.json");
}

function normalizeSettings(raw) {
  const sb = raw && typeof raw === "object" && raw.sidebarBottom && typeof raw.sidebarBottom === "object"
    ? raw.sidebarBottom
    : {};
  // Allowlist: unknown keys from older files are ignored on load and dropped
  // on the next save; they never throw.
  return {
    sidebarBottom: {
      sessionSearch: typeof sb.sessionSearch === "boolean" ? sb.sessionSearch : DEFAULT_GENERAL_CONFIGS.sidebarBottom.sessionSearch,
      settingsGear: typeof sb.settingsGear === "boolean" ? sb.settingsGear : DEFAULT_GENERAL_CONFIGS.sidebarBottom.settingsGear,
    },
  };
}

export class GeneralConfigsStore {
  constructor({ filePath, onWarn } = {}) {
    this.filePath = filePath ?? defaultGeneralConfigsPath();
    this.onWarn = onWarn ?? ((msg) => console.warn("[spig-dsh-toolkit:general-configs]", msg));
    this.state = this._loadSync();
    this._writes = Promise.resolve();
  }

  _loadSync() {
    let raw;
    try {
      raw = readFileSync(this.filePath, "utf8");
    } catch (error) {
      if (error && error.code === "ENOENT") return normalizeSettings(null);
      this.onWarn(`failed to read general configs at ${this.filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return normalizeSettings(null);
    }
    try {
      const clean = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
      const parsed = JSON.parse(clean);
      const payload = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed.settings && typeof parsed.settings === "object" ? parsed.settings : parsed)
        : {};
      return normalizeSettings(payload);
    } catch (error) {
      this.onWarn(`corrupted general configs at ${this.filePath}; falling back to defaults: ${error instanceof Error ? error.message : String(error)}`);
      return normalizeSettings(null);
    }
  }

  snapshot() {
    return {
      sidebarBottom: { ...this.state.sidebarBottom },
    };
  }

  update(patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return Promise.reject(new Error("general configs patch must be an object"));
    }
    const merged = normalizeSettings({
      sidebarBottom: {
        ...this.state.sidebarBottom,
        ...(patch.sidebarBottom && typeof patch.sidebarBottom === "object" ? patch.sidebarBottom : {}),
      },
    });
    const run = this._writes.then(async () => {
      this.state = merged;
      await this._persist();
      return this.snapshot();
    });
    this._writes = run.catch(() => undefined);
    return run;
  }

  async _persist() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const payload = JSON.stringify({
      version: STORE_VERSION,
      settings: this.state,
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
