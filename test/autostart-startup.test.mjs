import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const startup = await import('../src/components/general-configs/startup.js');

test('manual controls forward the same staged state to the launcher and shortcut', () => {
  const source = name => readFileSync(join(scriptsDir, name), 'ascii');
  assert.match(source('dsh-control.ps1'), /-File \$launcher \$Action -StateDir \$StateDir/);
  assert.match(source('dsh-control.ps1'), /Join-Path \$StateDir 'logs'/);
  assert.match(source('install-control-shortcut.ps1'), /-StateDir.*\$StateDir/);
  for (const name of ['setup.cmd', 'control-dsh.cmd']) {
    const script = source(name);
    assert.match(script, /DSH_AUTOSTART_STATE_DIR/);
    assert.match(script, /-StateDir/);
    for (const line of script.split(/\r?\n/).filter(line => /powershell[.]exe/.test(line))) {
      assert.match(line, /%STATE_ARG%/);
    }
  }
});

const bundleRoot = fileURLToPath(new URL('../components/general-configs/autostart/', import.meta.url));
const scriptsDir = join(bundleRoot, 'dsh-autostart');
const winOnly = { skip: process.platform !== 'win32' };

function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'spig-autostart-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function bundledFixture(t) {
  const root = temp(t);
  const bundle = join(root, 'bundle');
  const stateDir = join(root, 'state');
  mkdirSync(join(bundle, 'dsh-autostart'), { recursive: true });
  for (const entry of readdirSync(bundleRoot, { withFileTypes: true })) {
    if (entry.isFile()) copyFileSync(join(bundleRoot, entry.name), join(bundle, entry.name));
  }
  for (const entry of readdirSync(scriptsDir, { withFileTypes: true })) {
    if (entry.isFile()) copyFileSync(join(scriptsDir, entry.name), join(bundle, 'dsh-autostart', entry.name));
  }
  return { bundle, stateDir, runtimeDir: join(stateDir, 'runtime') };
}

test('runtime sync stages only allowlisted files and repairs a missing staged file', t => {
  const { bundle, runtimeDir } = bundledFixture(t);
  for (const dir of ['run', 'logs', 'backup']) {
    mkdirSync(join(bundle, 'dsh-autostart', dir));
    writeFileSync(join(bundle, 'dsh-autostart', dir, 'ignored'), 'ignored');
  }
  const sync = () => startup.syncAutostartRuntime({ sourceRoot: bundle, runtimeDir });
  const first = sync();
  assert.equal(first.synced, true);
  const manifest = JSON.parse(readFileSync(first.manifestPath, 'utf8'));
  assert.equal(manifest.version, 2);
  assert.equal(manifest.sourceSha256, first.sourceSha256);
  assert.match(manifest.sourceSha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.launcherSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(manifest.files, startup.AUTOSTART_RUNTIME_FILES);
  assert.equal(manifest.files.length, 11);
  const listing = readdirSync(runtimeDir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => entry.parentPath === runtimeDir ? entry.name : `dsh-autostart/${entry.name}`).sort();
  assert.deepEqual(listing, [...manifest.files, 'manifest.json'].sort());
  assert.equal(sync().synced, false);
  assert.deepEqual(JSON.parse(readFileSync(first.manifestPath, 'utf8')), manifest);
  writeFileSync(join(bundle, 'dsh-autostart', 'README.md'), 'modified fixture');
  const changed = sync();
  assert.equal(changed.synced, true);
  assert.notEqual(changed.sourceSha256, manifest.sourceSha256);
  assert.equal(JSON.parse(readFileSync(first.manifestPath, 'utf8')).launcherSyncedAt, manifest.launcherSyncedAt);
  rmSync(join(runtimeDir, 'dsh-autostart', 'README.md'));
  const repaired = sync();
  assert.equal(repaired.synced, true);
  assert.equal(repaired.sourceSha256, changed.sourceSha256);
  assert.equal(readFileSync(join(runtimeDir, 'dsh-autostart', 'README.md'), 'utf8'), 'modified fixture');
});

test('mount sync skips a clean state and repairs a staged runtime without touching state', winOnly, t => {
  const { bundle, stateDir, runtimeDir } = bundledFixture(t);
  const warnings = [];
  const ctl = startup.createStartupController({ bundleRoot: bundle, stateDir, onWarn: msg => warnings.push(msg) });
  assert.deepEqual(ctl.syncRuntimeIfInstalled(), { skipped: true, reason: 'not-installed' });
  assert.equal(existsSync(stateDir), false);
  startup.syncAutostartRuntime({ sourceRoot: bundle, runtimeDir });
  for (const dir of ['run', 'logs']) {
    mkdirSync(join(stateDir, dir));
    writeFileSync(join(stateDir, dir, 'marker'), dir);
  }
  writeFileSync(join(bundle, 'dsh-autostart', 'README.md'), 'modified');
  assert.equal(ctl.syncRuntimeIfInstalled().synced, true);
  assert.match(warnings[0], /next DSH restart/);
  for (const dir of ['run', 'logs']) assert.equal(readFileSync(join(stateDir, dir, 'marker'), 'utf8'), dir);
});

test('status exposes bundle availability before staging and reads selected staged records', async t => {
  const { bundle, stateDir } = bundledFixture(t);
  const ctl = startup.createStartupController({ bundleRoot: bundle, stateDir, taskName: 'DSH-Test-Not-Installed', healthUrl: 'http://127.0.0.1:0/' });
  const empty = await ctl.getStatus();
  assert.equal(empty.available, process.platform === 'win32');
  assert.equal(empty.supervisor, null);
  assert.equal(empty.dshWeb, null);
  assert.equal(empty.paused, false);
  mkdirSync(join(stateDir, 'run'), { recursive: true });
  const supervisor = { pid: 42, startTimeUtc: '2020-01-01T00:00:00Z' };
  const web = { pid: 43 };
  writeFileSync(join(stateDir, 'run', 'supervisor.json'), JSON.stringify(supervisor));
  writeFileSync(join(stateDir, 'run', 'dsh-web.json'), JSON.stringify(web));
  writeFileSync(join(stateDir, 'run', 'pause.sentinel'), 'fixture');
  const status = await ctl.getStatus();
  assert.equal(status.activeStateDir, stateDir);
  assert.deepEqual(status.supervisor, supervisor);
  assert.deepEqual(status.dshWeb, web);
  assert.equal(status.paused, true);
});

test('bundle control scripts are ASCII and preserve launcher and installer safety contracts', () => {
  const scripts = readdirSync(bundleRoot, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(?:ps1|cmd)$/i.test(entry.name));
  for (const entry of scripts) {
    assert.equal(readFileSync(join(entry.parentPath, entry.name)).some(byte => byte > 0x7f), false, entry.name);
  }
  const launcher = readFileSync(join(scriptsDir, 'dsh-web-launcher.ps1'), 'ascii');
  const mutex = launcher.match(/function Get-SupervisorMutexName \{[\s\S]*?\n\}/u)?.[0] ?? '';
  assert.match(mutex, /Local\\dsh-autostart-p\$Port-/u);
  assert.match(mutex, /\$script:DshHome/u);
  assert.doesNotMatch(mutex, /\$PSScriptRoot/u);
  assert.match(launcher, /if \(\$Start\) \{\s*Clear-Paused\s*if \(Get-SupervisorProcess\)/u);
  assert.match(launcher, /function Start-SupervisorProcess \{[\s\S]*?'-StateDir'[^\n]*\$script:StateDir/u);
  assert.match(launcher, /\$env:DSH_AUTOSTART_STATE_DIR = \$script:StateDir/u);
  const installer = readFileSync(join(scriptsDir, 'install-supervisor.ps1'), 'ascii');
  assert.match(installer, /Join-Path \$StateDir 'backup'/u);
  assert.match(installer, /Join-Path \$StateDir 'run'/u);
  assert.match(installer, /Join-Path \$stateRunDir 'pause\.sentinel'/u);
  assert.match(installer, /\$launcher -Pause -StateDir \$StateDir/u);
  assert.match(installer, /\$controlInstaller -InstallDir \$PSScriptRoot -StateDir \$StateDir/u);
  assert.match(installer, /-RestartCount 999/u);
  assert.match(installer, /DSH_FIXED_WEB_SHIM_V1/u);
  assert.match(installer, /\$ErrorActionPreference = 'Stop'/u);
});

function powershell(script, args) {
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], {
    encoding: 'utf8', windowsHide: true, timeout: 20_000,
  });
  if (result.error) throw result.error;
  return result;
}

function control(t, pause = false) {
  const root = temp(t);
  // Before -StateDir is implemented, any accidental default path is still temporary.
  const source = join(scriptsDir, 'dsh-web-launcher.ps1');
  const script = join(root, 'dsh-web-launcher.ps1');
  copyFileSync(source, script);
  const state = join(root, 'isolated');
  const run = action => powershell(script, [action, '-StateDir', state, '-Port', '59991']);
  if (pause) {
    const result = run('-Pause');
    assert.equal(result.status, 0, result.stderr);
  }
  const result = run('-Status');
  assert.equal(result.status, 0, result.stderr);
  const info = JSON.parse(result.stdout.trim());
  assert.equal(info.stateDir, state);
  assert.equal(info.port, 59991);
  assert.equal(info.paused, pause);
  assert.equal(info.supervisorRunning, false);
  assert.equal(info.dshRunning, false);
  assert.equal(existsSync(join(root, 'run')), false);
  assert.equal(existsSync(join(root, 'logs')), false);
  return state;
}

test('launcher Status does not create any directories', winOnly, t => {
  const state = control(t);
  assert.equal(existsSync(state), false);
});

test('launcher Pause writes its sentinel only in the explicit state directory', winOnly, t => {
  const state = control(t, true);
  assert.equal(existsSync(join(state, 'run', 'pause.sentinel')), true);
});

// Intercept system cmdlets in a child scope. Unexpected calls throw rather than
// reaching the task scheduler, registry, user PATH, legacy files or live ports.
function installerProbe(t, scenario) {
  const root = temp(t);
  const launcher = join(root, 'legacy', 'dsh-web-launcher.ps1');
  mkdirSync(join(root, 'legacy', 'run'), { recursive: true });
  writeFileSync(launcher, 'throw "fake launcher must not execute"\n');
  writeFileSync(join(root, 'legacy', 'run', 'dsh-web.json'), JSON.stringify({ pid: 8124, startTimeUtc: '2020-01-01T00:00:00Z' }));
  const script = join(root, 'probe.ps1');
  const installer = join(root, 'install-supervisor.ps1');
  copyFileSync(join(scriptsDir, 'install-supervisor.ps1'), installer);
  writeFileSync(join(root, 'dsh-web-launcher.ps1'), 'throw "unexpected launcher invocation"\n');
  const fakeExe = join(root, 'fake.exe');
  writeFileSync(fakeExe, '');
  const q = value => "'" + value.replaceAll("'", "''") + "'";
  const action = scenario === 'Remove' ? 'Remove' : 'Install';
  const invalidPort = ['Install', 'Remove'].includes(scenario);
  const lines = [
    `$ErrorActionPreference = 'Stop'`,
    `function global:New-Item { param($ItemType,$Path,[switch]$Force); if ($ItemType -ne 'Directory' -or $Path -ne ${q(join(root, 'state', 'backup'))}) { throw 'unexpected New-Item' } }`,
    `function global:Remove-Item { throw 'unexpected Remove-Item' }`,
    `function global:Copy-Item { throw 'unexpected Copy-Item' }`,
    `function global:Unregister-ScheduledTask { throw 'unexpected task unregister' }`,
    `function global:Register-ScheduledTask { throw 'unexpected task register' }`,
    `function global:Start-ScheduledTask { throw 'unexpected task start' }`,
    `function global:Stop-ScheduledTask { throw 'unexpected task stop' }`,
    `function global:Export-ScheduledTask { throw 'unexpected task export' }`,
    `function global:Stop-Process { throw 'unexpected process stop' }`,
    `function global:schtasks.exe { throw 'unexpected task CLI' }`,
    `function global:Get-Command { if (${invalidPort ? '$true' : '$false'}) { throw 'unexpected discovery' }; return @{ Source = ${q(fakeExe)} } }`,
    `function global:Test-Path { param($LiteralPath); if ($LiteralPath -eq ${q(launcher)}) { return $false }; if ($LiteralPath -like '*DeepSeek Harness*') { return $true }; Microsoft.PowerShell.Management\\Test-Path -LiteralPath $LiteralPath }`,
    `function global:Get-ScheduledTask { ${invalidPort ? "throw 'unexpected task query'" : `return @{ State = 'Ready'; Actions = @(@{ Arguments = ${q(`-File "${launcher}"`)} }) }`} }`,
    `function global:Get-CimInstance { param($ClassName,$Filter); if ($Filter -eq 'ProcessId = 8124') { return @{ ProcessId = 8124; ParentProcessId = 0; CreationDate = [datetime]'2020-01-01T00:00:00Z' } }; if ($Filter -eq "ProcessId = $PID") { return @{ ParentProcessId = ${scenario === 'ancestry' ? 8124 : 0} } }; throw 'unexpected CIM lookup' }`,
    `function global:Get-NetTCPConnection { return @{ OwningProcess = 8125 } }`,
    `$global:fakeNow = [datetime]'2020-01-01'`,
    `function global:Get-Date { $global:fakeNow = $global:fakeNow.AddSeconds(4); return $global:fakeNow }`,
    `function global:Start-Sleep { }`,
    `& ${q(installer)} -Action ${action} -StateDir ${q(join(root, 'state'))} -Port ${invalidPort ? 59991 : 3080}`,
    `exit $LASTEXITCODE`,
  ];
  writeFileSync(script, lines.join('\r\n'));
  const result = powershell(script, []);
  assert.equal(existsSync(join(root, 'state')), false);
  return result;
}

for (const action of ['Install', 'Remove']) {
  test(`installer rejects a non-3080 port before side effects (${action})`, winOnly, t => {
    const result = installerProbe(t, action);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /ParameterArgumentValidationError|ValidateSetFailure/u);
    assert.match(result.stderr, /3080/u);
    assert.doesNotMatch(result.stderr, /unexpected/u);
  });
}

test('installer refuses a cross-directory handoff from inside the old wrapper tree with exit 6', winOnly, t => {
  const result = installerProbe(t, 'ancestry');
  assert.equal(result.status, 6, result.stderr);
  assert.match(result.stderr, /Run cutover out-of-tree/u);
});

test('installer refuses a cross-directory handoff on an occupied port with exit 7', winOnly, t => {
  const result = installerProbe(t, 'occupied');
  assert.equal(result.status, 7, result.stderr);
  assert.match(result.stderr, /Aborting install to prevent split-brain/u);
});

test('control shortcut installer overwrites legacy arguments and sets StateDir', winOnly, t => {
  const root = temp(t);
  const installDir = join(root, 'staged', 'dsh-autostart');
  const programsDir = join(root, 'programs');
  const stateDir = join(root, 'state');
  mkdirSync(installDir, { recursive: true });
  mkdirSync(programsDir, { recursive: true });
  copyFileSync(join(scriptsDir, 'install-control-shortcut.ps1'), join(installDir, 'install-control-shortcut.ps1'));
  copyFileSync(join(scriptsDir, 'dsh-control.ps1'), join(installDir, 'dsh-control.ps1'));

  const shortcutPath = join(programsDir, 'DSH Control.lnk');
  const q = value => "'" + value.replaceAll("'", "''") + "'";
  const seedScript = join(root, 'seed-legacy-lnk.ps1');
  writeFileSync(seedScript, [
    `$shell = New-Object -ComObject WScript.Shell`,
    `$lnk = $shell.CreateShortcut(${q(shortcutPath)})`,
    `$lnk.TargetPath = (Join-Path $PSHOME 'powershell.exe')`,
    `$lnk.Arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\\legacy\\dsh-control.ps1"'`,
    `$lnk.WorkingDirectory = 'C:\\legacy'`,
    `$lnk.Save()`,
  ].join('\r\n'));
  const seeded = powershell(seedScript, []);
  assert.equal(seeded.status, 0, seeded.stderr);

  const installed = powershell(join(installDir, 'install-control-shortcut.ps1'), [
    '-InstallDir', installDir,
    '-ProgramsDir', programsDir,
    '-StateDir', stateDir,
  ]);
  assert.equal(installed.status, 0, installed.stderr);

  const inspectScript = join(root, 'inspect-lnk.ps1');
  writeFileSync(inspectScript, [
    `$shell = New-Object -ComObject WScript.Shell`,
    `$lnk = $shell.CreateShortcut(${q(shortcutPath)})`,
    `[ordered]@{ TargetPath = $lnk.TargetPath; Arguments = $lnk.Arguments; WorkingDirectory = $lnk.WorkingDirectory } | ConvertTo-Json -Compress`,
  ].join('\r\n'));
  const inspected = powershell(inspectScript, []);
  assert.equal(inspected.status, 0, inspected.stderr);
  const info = JSON.parse(inspected.stdout.trim());
  assert.match(info.TargetPath, /powershell\.exe$/i);
  assert.equal(info.WorkingDirectory, installDir);
  assert.equal(info.Arguments.includes(join(installDir, 'dsh-control.ps1')), true, info.Arguments);
  assert.equal(info.Arguments.includes(`-StateDir "${stateDir}"`), true, info.Arguments);
  assert.equal(info.Arguments.includes('legacy'), false, info.Arguments);
});

test('production code contains no hardcoded local user/project paths or LEGACY_AUTOSTART_DIR', () => {
  const repoRoot = fileURLToPath(new URL('../', import.meta.url));
  const forbidden = [
    /[A-Za-z]:[\\/](Projetos|Users)[\\/]/i,
    /LEGACY_AUTOSTART_DIR/,
  ];
  const textExts = new Set(['.js', '.mjs', '.cjs', '.ts', '.json', '.yml', '.yaml', '.ps1', '.cmd', '.md', '.txt']);
  const hits = [];
  function scan(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full);
        continue;
      }
      const ext = entry.name.includes('.') ? entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase() : '';
      if (!textExts.has(ext)) continue;
      const content = readFileSync(full, 'utf8');
      for (const pattern of forbidden) {
        if (pattern.test(content)) hits.push(`${full}: ${pattern}`);
      }
    }
  }
  for (const top of ['src', 'lib', 'components']) {
    const full = join(repoRoot, top);
    if (existsSync(full)) scan(full);
  }
  assert.deepEqual(hits, []);
});

test('LocalWeb enforces loopback-only vs LAN+Tailscale peer policies', async () => {
  const { LocalWeb } = await import('../components/general-configs/autostart/local-web-proxy.mjs');
  const loopback = new LocalWeb('127.0.0.1', ['127.0.0.1', 'localhost']);
  assert.equal(loopback.allowedPeer('127.0.0.1'), true);
  assert.equal(loopback.allowedPeer('192.168.1.50'), false);

  const lan = new LocalWeb('0.0.0.0', ['127.0.0.1', 'localhost']);
  lan.setTailnetPeers(['100.64.0.42']);
  assert.equal(lan.allowedPeer('127.0.0.1'), true);
  assert.equal(lan.allowedPeer('100.64.0.42'), true);
  assert.equal(lan.allowedPeer('8.8.8.8'), false);
});

test('mount sync preserves pre-0b LAN+Tailscale upgrade without exposing fresh PC installs', winOnly, t => {
  // 1) Pre-0b runtime (manifest v1, no config.json) -> writes lan-tailscale and upgrades to v2
  const pre0b = bundledFixture(t);
  startup.syncAutostartRuntime({ sourceRoot: pre0b.bundle, runtimeDir: pre0b.runtimeDir });
  const m1Path = join(pre0b.runtimeDir, 'manifest.json');
  const m1 = JSON.parse(readFileSync(m1Path, 'utf8'));
  m1.version = 1;
  writeFileSync(m1Path, JSON.stringify(m1, null, 2) + '\n');
  const ctl1 = startup.createStartupController({ bundleRoot: pre0b.bundle, stateDir: pre0b.stateDir });
  assert.equal(ctl1.syncRuntimeIfInstalled().synced, true);
  assert.equal(JSON.parse(readFileSync(join(pre0b.stateDir, 'config.json'), 'utf8')).bindMode, 'lan-tailscale');
  assert.equal(JSON.parse(readFileSync(m1Path, 'utf8')).version, 2);

  // 2) New PC runtime (manifest v2, no config.json) -> does NOT create lan-tailscale config
  const fresh = bundledFixture(t);
  startup.syncAutostartRuntime({ sourceRoot: fresh.bundle, runtimeDir: fresh.runtimeDir });
  const ctl2 = startup.createStartupController({ bundleRoot: fresh.bundle, stateDir: fresh.stateDir });
  ctl2.syncRuntimeIfInstalled();
  assert.equal(existsSync(join(fresh.stateDir, 'config.json')), false);

  // 3) Existing config.json with loopback -> preserved intact
  const preserved = bundledFixture(t);
  startup.syncAutostartRuntime({ sourceRoot: preserved.bundle, runtimeDir: preserved.runtimeDir });
  writeFileSync(join(preserved.stateDir, 'config.json'), JSON.stringify({ version: 1, bindMode: 'loopback' }) + '\n');
  const m3Path = join(preserved.runtimeDir, 'manifest.json');
  const m3 = JSON.parse(readFileSync(m3Path, 'utf8'));
  m3.version = 1;
  writeFileSync(m3Path, JSON.stringify(m3, null, 2) + '\n');
  const ctl3 = startup.createStartupController({ bundleRoot: preserved.bundle, stateDir: preserved.stateDir });
  ctl3.syncRuntimeIfInstalled();
  assert.equal(JSON.parse(readFileSync(join(preserved.stateDir, 'config.json'), 'utf8')).bindMode, 'loopback');
});

test('autostart portability contracts: optional tailscale, portable discovery, and BindMode', () => {
  const installer = readFileSync(join(scriptsDir, 'install-supervisor.ps1'), 'ascii');
  assert.doesNotMatch(installer, /Get-Command\s+tailscale\s+-ErrorAction\s+Stop/i);
  assert.match(installer, /Programs\\DeepSeek Harness/);
  assert.match(installer, /ProgramFiles/);  
  assert.match(installer, /config\.json/);
  assert.match(installer, /'loopback'/);

  const wrapper = readFileSync(join(bundleRoot, 'dsh-navegador.mjs'), 'utf8');
  assert.match(wrapper, /DSH_BIND_MODE/);
  assert.match(wrapper, /config\.json/);
  assert.match(wrapper, /bindMode === 'lan-tailscale' \? '0\.0\.0\.0' : '127\.0\.0\.1'/);
  assert.match(wrapper, /if \(bindMode === 'lan-tailscale'\)/);
});
