import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, appendFileSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Absolute powershell path: never depend on PATH inside the host process. */
function powershellExe() {
  const systemRoot = process.env.SystemRoot || process.env.windir || "C:\\Windows";
  const abs = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (process.platform === "win32" && existsSync(abs)) return abs;
  return "powershell.exe";
}

/**
 * Ancestor PIDs of this process (parent first), best-effort.
 * Used to prove this host lives UNDER the tracked wrapper before asking
 * for anything that kills the tree: a killer inside the victim tree can be
 * reaped by its own `taskkill /T` before finishing.
 */
async function processAncestry() {
  if (process.platform !== "win32") return [];
  try {
    const { stdout } = await execFileAsync(
      powershellExe(),
      ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
        "$p=(Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $PID)).ParentProcessId; $chain=@(); for($i=0;$i -lt 24 -and $p -gt 0;$i++){ $chain+=$p; $p=(Get-CimInstance Win32_Process -Filter ('ProcessId = '+$p) -ErrorAction SilentlyContinue).ParentProcessId }; $chain -join ','"],
      { windowsHide: true, timeout: 15000 },
    );
    return String(stdout || "").trim().split(/[\s,;]+/).map(Number)
      .filter((n) => Number.isSafeInteger(n) && n > 0);
  } catch {
    return [];
  }
}

/** Append-only trail of restart attempts; the client reports, this proves. */
function logAttempt(dir, line) {
  try {
    const runDir = join(dir, "run");
    mkdirSync(runDir, { recursive: true });
    appendFileSync(
      join(runDir, "restart-attempts.log"),
      `${new Date().toISOString()} ${line}\n`,
      "utf8",
    );
  } catch {}
}

export const DEFAULT_BUNDLE_AUTOSTART_ROOT = fileURLToPath(
  new URL("../../../components/general-configs/autostart", import.meta.url),
);
export const DEFAULT_AUTOSTART_DIR = join(DEFAULT_BUNDLE_AUTOSTART_ROOT, "dsh-autostart");
const LAUNCHER = "dsh-web-launcher.ps1";
export const AUTOSTART_RUNTIME_FILES = Object.freeze([
  "dsh-autostart/LICENSE",
  "dsh-autostart/README.md",
  "dsh-autostart/control-dsh.cmd",
  "dsh-autostart/dsh-control.ps1",
  "dsh-autostart/dsh-web-launcher.ps1",
  "dsh-autostart/install-control-shortcut.ps1",
  "dsh-autostart/install-supervisor.ps1",
  "dsh-autostart/setup.cmd",
  "dsh-navegador.mjs",
  "dsh-picker-browse.patch.yml",
  "local-web-proxy.mjs",
]);

export function defaultAutostartStateDir(dshHomePathFn, onWarn) {
  const current = process.env.DSH_AUTOSTART_STATE_DIR?.trim();
  if (current) return current;
  const alias = process.env.DSH_AUTOSTART_DIR?.trim();
  if (alias) {
    onWarn?.("[autostart] DSH_AUTOSTART_DIR is deprecated; use DSH_AUTOSTART_STATE_DIR instead.");
    return alias;
  }
  if (typeof dshHomePathFn === "function") {
    try { return dshHomePathFn("plugins", "spig-dsh-toolkit", "autostart"); } catch {}
  }
  return join(process.env.DSH_HOME?.trim() || join(homedir(), ".dsh"), "plugins", "spig-dsh-toolkit", "autostart");
}

function readBundle(sourceRoot) {
  return new Map(AUTOSTART_RUNTIME_FILES.map(rel => [rel, readFileSync(join(sourceRoot, rel))]));
}

function bundleDigest(files) {
  const hash = createHash("sha256");
  for (const [rel, bytes] of files) hash.update(rel + "\0").update(bytes).update("\0");
  return hash.digest("hex");
}

export function computeAutostartBundleSha256(sourceRoot = DEFAULT_BUNDLE_AUTOSTART_ROOT) {
  return bundleDigest(readBundle(sourceRoot));
}

function readPackageVersion() {
  return readJsonSafe(new URL("../../../package.json", import.meta.url))?.version ?? "unknown";
}

function atomicWrite(dest, bytes) {
  const tmp = `${dest}.tmp-${process.pid}-${randomUUID()}`;
  try {
    writeFileSync(tmp, bytes, { flag: "wx" });
    renameSync(tmp, dest);
  } catch (error) {
    try { unlinkSync(tmp); } catch {}
    throw error;
  }
}

export const AUTOSTART_MANIFEST_VERSION = 2;

function writeAutostartConfig(stateDir, bindMode) {
  mkdirSync(stateDir, { recursive: true });
  atomicWrite(join(stateDir, "config.json"), JSON.stringify({ version: 1, bindMode }, null, 2) + "\n");
}

export function syncAutostartRuntime({ sourceRoot = DEFAULT_BUNDLE_AUTOSTART_ROOT, runtimeDir, packageVersion = readPackageVersion() }) {
  const files = readBundle(sourceRoot);
  const sourceSha256 = bundleDigest(files);
  const manifestPath = join(runtimeDir, "manifest.json");
  const previous = readJsonSafe(manifestPath);
  const result = { upToDate: true, sourceSha256, runtimeDir, manifestPath };
  if (previous?.version === AUTOSTART_MANIFEST_VERSION && previous?.sourceSha256 === sourceSha256 && AUTOSTART_RUNTIME_FILES.every(rel => existsSync(join(runtimeDir, rel)))) {
    return { synced: false, ...result };
  }
  mkdirSync(join(runtimeDir, "dsh-autostart"), { recursive: true });
  for (const [rel, bytes] of files) atomicWrite(join(runtimeDir, rel), bytes);
  const launcherSha256 = createHash("sha256").update(files.get(`dsh-autostart/${LAUNCHER}`)).digest("hex");
  const syncedAt = new Date().toISOString();
  const launcherSyncedAt = previous?.launcherSha256 === launcherSha256 ? previous.launcherSyncedAt ?? syncedAt : syncedAt;
  atomicWrite(manifestPath, JSON.stringify({ version: AUTOSTART_MANIFEST_VERSION, packageVersion, sourceSha256, launcherSha256, syncedAt, launcherSyncedAt, files: AUTOSTART_RUNTIME_FILES }, null, 2) + "\n");
  return { synced: true, ...result, previousSha256: previous?.sourceSha256 ?? null };
}
export const DEFAULT_TASK_NAME = "DSH Browser Supervisor";
export const DEFAULT_HEALTH_URL = "http://127.0.0.1:3080/__dsh_health";

function readJsonSafe(filePath) {
  try {
    const raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/u, "");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function checkHealth(url, timeoutMs = 1500) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: null };
  }
}

async function queryScheduledTask(taskName) {
  if (process.platform !== "win32") {
    return { supported: false, installed: false, state: "unsupported" };
  }
  try {
    const { stdout } = await execFileAsync(
      "schtasks.exe",
      ["/Query", "/TN", taskName, "/FO", "LIST"],
      { windowsHide: true, timeout: 5000 },
    );
    const statusMatch = String(stdout || "").match(/^(?:Status|Estado):\s*(.+)$/im);
    return {
      supported: true,
      installed: true,
      state: statusMatch ? statusMatch[1].trim() : "Ready",
    };
  } catch {
    return { supported: true, installed: false, state: "Not installed" };
  }
}

export function createStartupController(options = {}) {
  const { onWarn } = options;
  const stateDir = options.stateDir || options.autostartDir || defaultAutostartStateDir(options.dshHomePath, onWarn);
  const bundleRoot = options.bundleRoot ?? DEFAULT_BUNDLE_AUTOSTART_ROOT;
  const runtimeDir = join(stateDir, "runtime");
  const runtimeAutostartDir = join(runtimeDir, "dsh-autostart");
  const bundleAutostartDir = join(bundleRoot, "dsh-autostart");
  const manifestPath = join(runtimeDir, "manifest.json");
  const taskName = options.taskName || DEFAULT_TASK_NAME;
  const healthUrl = options.healthUrl || DEFAULT_HEALTH_URL;

  function candidateDescriptors() {
    return [{ id: "staged", scriptPath: join(runtimeAutostartDir, LAUNCHER), stateDir, passStateDir: true }];
  }

  function syncRuntimeIfInstalled() {
    if (process.platform !== "win32") return { skipped: true, reason: "non-win32" };
    if (!existsSync(manifestPath) && !existsSync(join(runtimeAutostartDir, LAUNCHER))) {
      return { skipped: true, reason: "not-installed" };
    }
    const previousManifest = readJsonSafe(manifestPath);
    const configPath = join(stateDir, "config.json");
    if (previousManifest?.version === 1 && !existsSync(configPath)) {
      writeAutostartConfig(stateDir, "lan-tailscale");
    }
    const res = syncAutostartRuntime({ sourceRoot: bundleRoot, runtimeDir });
    if (res.synced) onWarn?.(`[autostart] runtime staged re-synced (${res.previousSha256?.slice(0, 8) ?? "none"} -> ${res.sourceSha256.slice(0, 8)}); wrapper changes apply on next DSH restart, launcher changes apply on next logon or supervisor restart.`);
    return { skipped: false, ...res };
  }

  async function getStatus() {
    const available = process.platform === "win32" && existsSync(join(bundleAutostartDir, "install-supervisor.ps1"));
    const [task, health] = await Promise.all([
      queryScheduledTask(taskName),
      checkHealth(healthUrl),
    ]);
    const activeStateDir = stateDir;
    const runDir = join(stateDir, "run");
    const supervisorMeta = readJsonSafe(join(runDir, "supervisor.json"));
    const webMeta = readJsonSafe(join(runDir, "dsh-web.json"));
    const paused = existsSync(join(runDir, "pause.sentinel")) || existsSync(join(runDir, "stop.sentinel"));
    const manifest = readJsonSafe(manifestPath);
    const config = readJsonSafe(join(stateDir, "config.json"));
    const syncedAt = Date.parse(manifest?.launcherSyncedAt);
    const startedAt = Date.parse(supervisorMeta?.startTimeUtc);
    const supervisorOutdated = Number.isFinite(syncedAt) && Number.isFinite(startedAt) && syncedAt > startedAt;

    return {
      supported: process.platform === "win32",
      available,
      autostartDir: stateDir,
      stateDir,
      activeStateDir,
      runtimeDir,
      runtimeSynced: Boolean(manifest),
      supervisorOutdated,
      bindMode: config?.bindMode ?? null,
      taskName,
      installed: task.installed,
      taskState: task.state,
      paused,
      healthOk: health.ok,
      healthStatus: health.status,
      healthUrl,
      supervisor: supervisorMeta,
      dshWeb: webMeta,
    };
  }

  async function setEnabled(enabled, setOptions = {}) {
    if (typeof enabled !== "boolean") {
      throw new Error("startup enabled flag must be a boolean");
    }
    if (process.platform !== "win32") {
      throw new Error("Windows logon autostart is only supported on Windows");
    }
    const requestedBindMode = setOptions?.bindMode;
    if (enabled) {
      if (!existsSync(join(stateDir, "config.json")) && !existsSync(manifestPath)) {
        writeAutostartConfig(stateDir, requestedBindMode || "loopback");
      }
      syncAutostartRuntime({ sourceRoot: bundleRoot, runtimeDir });
    }
    const filename = "install-supervisor.ps1";
    const staged = join(runtimeAutostartDir, filename);
    const cwd = enabled || existsSync(staged) ? runtimeAutostartDir : bundleAutostartDir;
    const script = join(cwd, filename);
    if (!existsSync(script)) throw new Error(`installer not found at ${script}`);
    const args = ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Action", enabled ? "Install" : "Remove", "-StateDir", stateDir];
    if (enabled && requestedBindMode) args.push("-BindMode", requestedBindMode);
    const { stdout, stderr } = await execFileAsync(
      powershellExe(),
      args,
      { cwd, windowsHide: true, timeout: 30000 },
    );
    const status = await getStatus();
    return {
      ...status,
      output: [stdout, stderr].filter(Boolean).join("\n").trim(),
    };
  }

  const psFileArgs = (script, action) => ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, action];
  const descriptorFields = desc => ({ dir: desc.stateDir, stateDir: desc.stateDir, scriptPath: desc.scriptPath, passStateDir: desc.passStateDir, source: desc.id });

  /**
   * Ask the staged supervisor whether THIS web host is a managed instance.
   * Fast and side-effect free (`-Status` returns one JSON line).
   */
  async function querySupervisor() {
    if (process.platform !== "win32") {
      return { supported: false, managed: false, paused: false, ...descriptorFields(candidateDescriptors()[0]), inManagedTree: false };
    }
    let last = null;
    for (const desc of candidateDescriptors()) {
      if (!existsSync(desc.scriptPath)) continue;
      const args = psFileArgs(desc.scriptPath, "-Status");
      if (desc.passStateDir) args.push("-StateDir", desc.stateDir);
      try {
        const { stdout } = await execFileAsync(
          powershellExe(), args, { windowsHide: true, timeout: 15000 },
        );
        const parsed = JSON.parse(String(stdout || "").trim().split(/\r?\n/).pop() || "{}");
        const result = {
          supported: true,
          managed: Boolean(parsed.dshRunning),
          paused: Boolean(parsed.paused),
          supervisorRunning: Boolean(parsed.supervisorRunning),
          dshPid: parsed.dshPid ?? null,
          port: parsed.port ?? null,
          ...descriptorFields(desc),
          inManagedTree: false,
        };
        if (result.managed) {
          try {
            const ancestry = await processAncestry();
            result.inManagedTree = ancestry.includes(Number(result.dshPid));
          } catch {
            result.inManagedTree = false;
          }
          return result;
        }
        last = result;
      } catch (error) {
        last = {
          supported: true,
          managed: false,
          paused: false,
          ...descriptorFields(desc),
          inManagedTree: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return last ?? { supported: true, managed: false, paused: false, ...descriptorFields(candidateDescriptors()[0]), inManagedTree: false, reason: "launcher-missing" };
  }

  /**
   * Trigger a REAL harness restart (~15s).
   *
   * Preferred path: this host exits gracefully and the wrapper + supervisor
   * boot a fresh tree on port 3080 (the designed recovery path — a killer
   * spawned INSIDE the victim tree risks being reaped by its own
   * `taskkill /T` before finishing, which is exactly the silent no-op seen
   * with `-Restart` fired from the button).
   *
   * Suicide is only used when this process provably lives under the tracked
   * wrapper (`inManagedTree`); otherwise we either fire `-Restart` from
   * outside the victim tree or refuse, never killing blindly.
   *
   * Fire-and-forget by design: the HTTP response may never flush. The client
   * polls `/__dsh_health` (down, then back up) instead of awaiting us.
   */
  async function requestRestart() {
    if (process.platform !== "win32") {
      throw new Error("Harness restart is only supported on Windows");
    }
    if (!candidateDescriptors().some(desc => existsSync(desc.scriptPath))) {
      throw new Error("autostart launcher script not found");
    }
    const supervisor = await querySupervisor();
    logAttempt(stateDir, `request mode=${supervisor.managed ? "managed" : "unmanaged"} paused=${supervisor.paused} supervised=${supervisor.supervisorRunning} inTree=${supervisor.inManagedTree} dir=${supervisor.dir} pid=${supervisor.dshPid ?? "-"} reason=${supervisor.reason ?? "-"}`);
    if (supervisor.paused) {
      const err = new Error("Automatic restart is paused. Resume it first (Spig Toolkit → Startup).");
      logAttempt(stateDir, `refused: ${err.message}`);
      throw err;
    }
    if (!supervisor.managed) {
      return { mode: "unmanaged", supervisor };
    }
    if (supervisor.inManagedTree && supervisor.supervisorRunning) {
      logAttempt(stateDir, `suicide: exiting host so the supervisor reboots wrapper pid ${supervisor.dshPid}`);
      setTimeout(() => process.exit(0), 500);
      return { mode: "supervisor", method: "suicide", supervisor };
    }
    if (!supervisor.inManagedTree && supervisor.supervisorRunning) {
      // Different instance than this host: we are OUTSIDE its tree, so a
      // spawned `-Restart` cannot reap itself — the configuration that works
      // from a terminal.
      const args = psFileArgs(supervisor.scriptPath, "-Restart");
      args.splice(4, 0, "-WindowStyle", "Hidden");
      if (supervisor.passStateDir) args.push("-StateDir", supervisor.stateDir);
      const child = spawn(
        powershellExe(), args,
        { cwd: supervisor.dir, windowsHide: true, detached: true, stdio: "ignore" },
      );
      child.on("error", (err) => {
        logAttempt(stateDir, `spawn-error: ${err instanceof Error ? err.message : String(err)}`);
      });
      child.unref();
      logAttempt(stateDir, `spawned -Restart via ${supervisor.dir} (child pid ${child.pid ?? "?"})`);
      return { mode: "supervisor", method: "remote-restart", supervisor, spawnPid: child.pid ?? null };
    }
    const err = new Error("Managed harness found, but no live supervisor to reboot it. Restart it from a terminal.");
    logAttempt(stateDir, `refused: ${err.message}`);
    throw err;
  }

  return { getStatus, setEnabled, querySupervisor, requestRestart, syncRuntimeIfInstalled };
}
