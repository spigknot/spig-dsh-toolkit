import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
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

export const DEFAULT_AUTOSTART_DIR = fileURLToPath(
  new URL("../../../components/general-configs/autostart/dsh-autostart", import.meta.url),
);
// Previous standalone location of these same scripts. Never a dependency:
// the bundled copy above is authoritative for installs. It is only *read*
// when it still holds the live supervisor state (run/*.json) of the running
// 3080 instance, so restart/status keep working until a reinstall migrates
// the task to the bundled copy.
export const LEGACY_AUTOSTART_DIR = "D:\\Projetos\\DeepSeekHarness\\dsh-autostart";
export const DEFAULT_TASK_NAME = "DSH Browser Supervisor";
export const DEFAULT_HEALTH_URL = "http://127.0.0.1:3080/__dsh_health";

function candidateDirs(primary) {
  const dirs = [];
  for (const d of [primary, DEFAULT_AUTOSTART_DIR, LEGACY_AUTOSTART_DIR]) {
    if (d && !dirs.includes(d)) dirs.push(d);
  }
  return dirs;
}

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
  const autostartDir = options.autostartDir || process.env.DSH_AUTOSTART_DIR || DEFAULT_AUTOSTART_DIR;
  const taskName = options.taskName || DEFAULT_TASK_NAME;
  const healthUrl = options.healthUrl || DEFAULT_HEALTH_URL;
  const setupCmdPath = join(autostartDir, "setup.cmd");

  async function getStatus() {
    const available = process.platform === "win32" && existsSync(setupCmdPath);
    const [task, health] = await Promise.all([
      queryScheduledTask(taskName),
      checkHealth(healthUrl),
    ]);
    const runDir = join(autostartDir, "run");
    const supervisorMeta = readJsonSafe(join(runDir, "supervisor.json"));
    const webMeta = readJsonSafe(join(runDir, "dsh-web.json"));
    const paused = existsSync(join(runDir, "pause.sentinel"));

    return {
      supported: process.platform === "win32",
      available,
      autostartDir,
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

  async function setEnabled(enabled) {
    if (typeof enabled !== "boolean") {
      throw new Error("startup enabled flag must be a boolean");
    }
    if (process.platform !== "win32") {
      throw new Error("Windows logon autostart is only supported on Windows");
    }
    if (!existsSync(setupCmdPath)) {
      throw new Error(`setup.cmd not found at ${setupCmdPath}`);
    }
    const args = enabled ? ["/d", "/c", setupCmdPath] : ["/d", "/c", setupCmdPath, "-uninstall"];
    const { stdout, stderr } = await execFileAsync(
      process.env.ComSpec || "cmd.exe",
      args,
      { cwd: autostartDir, windowsHide: true, timeout: 30000 },
    );
    const status = await getStatus();
    return {
      ...status,
      output: [stdout, stderr].filter(Boolean).join("\n").trim(),
    };
  }

  function launcherScript() {
    return join(autostartDir, "dsh-web-launcher.ps1");
  }

  /**
   * Ask the supervisor whether THIS web host is a managed instance.
   * Fast and side-effect free (`-Status` returns one JSON line). Checks every
   * candidate state dir (bundled first, then the legacy location) and adopts
   * whichever one currently tracks the live 3080 instance.
   */
  async function querySupervisor() {
    if (process.platform !== "win32") {
      return { supported: false, managed: false, paused: false, dir: autostartDir };
    }
    let last = null;
    for (const dir of candidateDirs(autostartDir)) {
      const script = join(dir, "dsh-web-launcher.ps1");
      if (!existsSync(script)) continue;
      try {
        const { stdout } = await execFileAsync(
          powershellExe(),
          ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Status"],
          { cwd: dir, windowsHide: true, timeout: 15000 },
        );
        const parsed = JSON.parse(String(stdout || "").trim().split(/\r?\n/).pop() || "{}");
        const result = {
          supported: true,
          managed: Boolean(parsed.dshRunning),
          paused: Boolean(parsed.paused),
          supervisorRunning: Boolean(parsed.supervisorRunning),
          dshPid: parsed.dshPid ?? null,
          port: parsed.port ?? null,
          dir,
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
          dir,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return last ?? { supported: true, managed: false, paused: false, dir: autostartDir, reason: "launcher-missing" };
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
    const script = launcherScript();
    if (!existsSync(script)) {
      throw new Error(`launcher script not found at ${script}`);
    }
    const supervisor = await querySupervisor();
    logAttempt(autostartDir, `request mode=${supervisor.managed ? "managed" : "unmanaged"} paused=${supervisor.paused} supervised=${supervisor.supervisorRunning} inTree=${supervisor.inManagedTree} dir=${supervisor.dir} pid=${supervisor.dshPid ?? "-"} reason=${supervisor.reason ?? "-"}`);
    if (supervisor.paused) {
      const err = new Error("Automatic restart is paused. Resume it first (Spig Toolkit → Startup).");
      logAttempt(autostartDir, `refused: ${err.message}`);
      throw err;
    }
    if (!supervisor.managed) {
      return { mode: "unmanaged", supervisor };
    }
    if (supervisor.inManagedTree && supervisor.supervisorRunning) {
      logAttempt(autostartDir, `suicide: exiting host so the supervisor reboots wrapper pid ${supervisor.dshPid}`);
      setTimeout(() => process.exit(0), 500);
      return { mode: "supervisor", method: "suicide", supervisor };
    }
    if (!supervisor.inManagedTree && supervisor.supervisorRunning) {
      // Different instance than this host: we are OUTSIDE its tree, so a
      // spawned `-Restart` cannot reap itself — the configuration that works
      // from a terminal.
      const restartScript = join(supervisor.dir, "dsh-web-launcher.ps1");
      const child = spawn(
        powershellExe(),
        ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", restartScript, "-Restart"],
        { cwd: supervisor.dir, windowsHide: true, detached: true, stdio: "ignore" },
      );
      child.on("error", (err) => {
        logAttempt(autostartDir, `spawn-error: ${err instanceof Error ? err.message : String(err)}`);
      });
      child.unref();
      logAttempt(autostartDir, `spawned -Restart via ${supervisor.dir} (child pid ${child.pid ?? "?"})`);
      return { mode: "supervisor", method: "remote-restart", supervisor, spawnPid: child.pid ?? null };
    }
    const err = new Error("Managed harness found, but no live supervisor to reboot it. Restart it from a terminal.");
    logAttempt(autostartDir, `refused: ${err.message}`);
    throw err;
  }

  return { getStatus, setEnabled, querySupervisor, requestRestart };
}
