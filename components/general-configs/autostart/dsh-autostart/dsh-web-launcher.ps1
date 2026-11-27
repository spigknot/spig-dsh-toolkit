<#
  dsh-web-launcher.ps1
  =====================
  Windows boot-time + hidden-window + crash auto-restart guard for the
  customized DSH browser launcher.

  This script stays alive in the background as a supervisor for dsh web:
    * launches dsh-navegador.mjs with a hidden window (no console black box)
    * redirects stdout/stderr into logs\ (falls back to no-redirect if blocked)
    * monitors the child and its HTTP health endpoint, then restarts it
    * uses verified process state + a pause sentinel for safe user control

  Usage
  -----
    powershell -NoProfile -ExecutionPolicy Bypass -File dsh-web-launcher.ps1
        # start guarding dsh web (normally launched by the SYSTEM boot task)

    powershell -NoProfile -ExecutionPolicy Bypass -File dsh-web-launcher.ps1 -Stop
        # manual stop: write sentinel, kill the guarded dsh web, exit supervision

    powershell -NoProfile -ExecutionPolicy Bypass -File dsh-web-launcher.ps1 -Start
        # clear the pause sentinel, spawn one hidden supervisor, and return

  Optional parameters
  -------------------
    -Port           default 3080, forwarded to dsh web as --port
    -BindHost       optional, forwarded to dsh web as --host
    -RestartDelay   seconds to wait after a crash before restarting (default 2)
    -UpdateCheckInterval seconds between bounded update checks (default 5)
    -LogDir         log directory (default: logs\ beside this script)

  NOTE: this file is intentionally ASCII-only so it survives any codepage /
  BOM situation on a system with a non-UTF-8 (e.g. GBK) locale.
#>
# Adapted from https://github.com/Ghost011118/dsh-autostart (MIT).
param(
  [int]$Port = 3080,
  [string]$BindHost = '',
  [int]$RestartDelay = 2,
  [ValidateRange(2, 300)][int]$UpdateCheckInterval = 5,
  [string]$StateDir = '',
  [string]$LogDir = '',
  [string]$ChildCmd = '',
  [string]$ChildArgs = '',
  [ValidateSet('', 'loopback', 'lan-tailscale')]
  [string]$BindMode = '',
  [string]$DshUserProfile = '',
  [string]$DshHome = '',
  [string]$DshInstallDir = '',
  [string]$NodePath = '',
  [string]$TailscalePath = '',
  [switch]$Stop,
  [switch]$Pause,
  [switch]$Start,
  [switch]$Restart,
  [switch]$Status
)

$ErrorActionPreference = 'Stop'
if (-not $DshUserProfile) { $DshUserProfile = $env:USERPROFILE }
$script:DshUserProfile = [IO.Path]::GetFullPath($DshUserProfile)
$script:DshLocalAppData = Join-Path $script:DshUserProfile 'AppData\Local'
if (-not $DshHome) { $DshHome = Join-Path $script:DshUserProfile '.dsh' }
$script:DshHome = [IO.Path]::GetFullPath($DshHome)
$script:BindMode = $BindMode
$script:DshInstallDir = $DshInstallDir
$script:NodePath = $NodePath
$script:TailscalePath = $TailscalePath
$script:WrapperPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\dsh-navegador.mjs'))
if (-not $ChildCmd) {
  if ($script:NodePath -and (Test-Path -LiteralPath $script:NodePath)) { $ChildCmd = $script:NodePath }
  else {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand -and $nodeCommand.Source) { $ChildCmd = $nodeCommand.Source }
    else { $ChildCmd = Join-Path $env:ProgramFiles 'nodejs\node.exe' }
  }
}
if (-not $ChildArgs) { $ChildArgs = '"' + $script:WrapperPath + '" --no-open' }
$script:SupervisesBrowserWrapper = $ChildArgs -match '(?i)dsh-navegador\.mjs'
if (-not $StateDir -and $env:DSH_AUTOSTART_STATE_DIR) { $StateDir = $env:DSH_AUTOSTART_STATE_DIR }
if (-not $StateDir) { $StateDir = $PSScriptRoot }
$script:StateDir = [IO.Path]::GetFullPath($StateDir)
if (-not $LogDir) { $LogDir = Join-Path $script:StateDir 'logs' }
$LogDir = [IO.Path]::GetFullPath($LogDir)
$runDir = Join-Path $script:StateDir 'run'
$pidFile  = Join-Path $runDir 'dsh-web.pid'
$stateFile = Join-Path $runDir 'dsh-web.json'
$stopFile = Join-Path $runDir 'pause.sentinel'
$legacyStopFile = Join-Path $runDir 'stop.sentinel'
$supervisorFile = Join-Path $runDir 'supervisor.json'
$stampName = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile  = Join-Path $LogDir "launcher-$stampName-$PID.log"
# Locate the dsh bin.js. Prefer resolving the `dsh` shim (cmd/ps1) on PATH,
# then fall back to a global install or the npx cache it was run through.
function Resolve-DshBin {
  # 1) any dsh shim on the PATH (cmd/ps1) -> node_modules/@deepseek-ai/dsh
  $cmd = Get-Command dsh -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) {
    $dir = Split-Path $cmd.Source -Parent
    $bin = Join-Path $dir 'node_modules\@deepseek-ai\dsh\lib\bin.js'
    if (Test-Path $bin) { return $bin }
  }
  # 2) a global @deepseek-ai/dsh install
  $globalBin = Join-Path $env:APPDATA 'npm\node_modules\@deepseek-ai\dsh\lib\bin.js'
  if (Test-Path $globalBin) { return $globalBin }
  # 3) the npx cache that `npx @deepseek-ai/dsh` left behind (any hashed dir)
  if ($env:LOCALAPPDATA) {
    $cacheRoot = Join-Path $env:LOCALAPPDATA 'npm-cache\_npx'
    if (Test-Path $cacheRoot) {
      foreach ($dir in Get-ChildItem $cacheRoot -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending) {
        $cand = Join-Path $dir.FullName 'node_modules\@deepseek-ai\dsh\lib\bin.js'
        if (Test-Path $cand) { return $cand }
      }
    }
  }
  return $null
}
function Ensure-StateDirs {
  if (-not (Test-Path -LiteralPath $runDir)) { New-Item -ItemType Directory -Force -Path $runDir | Out-Null }
  if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
}

function Write-Log($msg) {
  Ensure-StateDirs
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  try { Add-Content -Path $logFile -Value "[$stamp] $msg" } catch { }
}

function Read-JsonFile($path) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  try { return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json } catch { return $null }
}

function Write-ProcessRecord($path, $proc, $kind) {
  Ensure-StateDirs
  try { $started = $proc.StartTime.ToUniversalTime().ToString('o') } catch { $started = $null }
  $record = [ordered]@{ pid = [int]$proc.Id; startTimeUtc = $started; kind = $kind }
  $tmp = "$path.$PID.tmp"
  $record | ConvertTo-Json -Compress | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $path -Force
}

function Get-ProcessInfo([int]$processId) {
  try { return Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction Stop }
  catch { return $null }
}

function Get-ProcessCreationUtc([int]$processId) {
  $item = Get-ProcessInfo $processId
  if (-not $item -or -not $item.CreationDate) { return $null }
  try { return ([DateTime]$item.CreationDate).ToUniversalTime() }
  catch { return $null }
}

function Get-ProcessCommandLine([int]$processId) {
  $item = Get-ProcessInfo $processId
  if ($item) { return [string]$item.CommandLine }
  return ''
}

function Test-IsDshWebProcess([int]$processId) {
  $line = Get-ProcessCommandLine $processId
  if ($line) {
    return ($line -match '(?i)@deepseek-ai[\\/]dsh[\\/](?:lib[\\/])?bin\.js' -and
      $line -match '(?i)(?:^|[\s"])(?:web)(?:[\s"]|$)')
  }
  $process = Get-ProcessInfo $processId
  return ($process -and $process.Name -ieq 'node.exe' -and (Find-PortOwner $Port) -eq $processId)
}

function Test-IsBrowserWrapperProcess([int]$processId) {
  $line = Get-ProcessCommandLine $processId
  if ($line) { return $line.IndexOf($script:WrapperPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 }
  $process = Get-ProcessInfo $processId
  return ($process -and $process.Name -ieq 'node.exe' -and (Find-PortOwner $Port) -eq $processId)
}

function Get-ManagedPid {
  $record = Read-JsonFile $stateFile
  if ($record -and $record.pid) {
    $processId = [int]$record.pid
    $proc = Get-ProcessInfo $processId
    if (-not $proc) { return $null }
    try {
      if ($record.startTimeUtc -is [DateTime]) {
        $expected = ([DateTime]$record.startTimeUtc).ToUniversalTime()
      } else {
        $expected = [DateTimeOffset]::Parse([string]$record.startTimeUtc,
          [Globalization.CultureInfo]::InvariantCulture,
          [Globalization.DateTimeStyles]::RoundtripKind).UtcDateTime
      }
      $created = Get-ProcessCreationUtc $processId
      if (-not $created -or [Math]::Abs(($created - $expected).TotalSeconds) -gt 1) { return $null }
    } catch { return $null }
    if ([string]$record.kind -eq 'custom') {
      if ($script:SupervisesBrowserWrapper -and -not (Test-IsBrowserWrapperProcess $processId)) { return $null }
    } elseif (-not (Test-IsDshWebProcess $processId)) { return $null }
    return $processId
  }
  if (Test-Path $pidFile) {
    try {
      $raw = (Get-Content $pidFile -Raw).Trim()
      if ($raw -match '^\d+$') {
        $legacyId = [int]$raw
        # A legacy PID file has no creation timestamp. Only retain backwards
        # compatibility when the same PID both proves it is dsh web and owns
        # this supervisor instance's configured listening port.
        $portOwner = Find-PortOwner $Port
        if ($portOwner -eq $legacyId -and (Test-IsDshWebProcess $legacyId)) { return $legacyId }
      }
    } catch { }
  }
  return $null
}

function Stop-ManagedInstance {
  $id = Get-ManagedPid
  if (-not $id) {
    Remove-Item $pidFile,$stateFile -Force -ErrorAction SilentlyContinue
    return
  }
  $proc = Get-ProcessInfo $id
  if ($proc) {
    $record = Read-JsonFile $stateFile
    if ($record -and [string]$record.kind -eq 'custom' -and $script:SupervisesBrowserWrapper) {
      try {
        & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $id /T /F 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
      } catch { try { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue } catch { } }
    } else {
      try { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue } catch { }
    }
    Start-Sleep -Milliseconds 800
    Write-Log "stopped dsh web (pid $id)"
  } else {
    Write-Log "managed pid $id not running (already exited)"
  }
  Remove-Item $pidFile,$stateFile -Force -ErrorAction SilentlyContinue
}

# Find the PID currently bound to a TCP port, so the supervisor can "adopt"
# an already-running dsh web (a real login instance) instead of starting a
# second one that would collide on the port. Tries Get-NetTCPConnection
# first, then falls back to netstat (works on older/restricted systems).
function Find-PortOwner([int]$port) {
  try {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn -and $conn.OwningProcess) { return [int]($conn.OwningProcess | Select-Object -First 1) }
  } catch { }
  try {
    $raw = netstat -ano -p TCP 2>$null
    foreach ($line in $raw) {
      if ($line -match "(?i)^\s*TCP\s+\S+:$port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
        return [int]$Matches[1]
      }
    }
  } catch { }
  return $null
}

function Test-Paused { return ((Test-Path $stopFile) -or (Test-Path $legacyStopFile)) }
function Set-Paused($reason) {
  Ensure-StateDirs
  Set-Content -LiteralPath $stopFile -Value "$reason $([DateTime]::UtcNow.ToString('o'))" -Encoding ascii
  Remove-Item $legacyStopFile -Force -ErrorAction SilentlyContinue
}
function Clear-Paused { Remove-Item $stopFile,$legacyStopFile -Force -ErrorAction SilentlyContinue }

function Start-SupervisorProcess {
  $exe = [Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
  $args = @('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden',
    '-File',('"' + $PSCommandPath + '"'),'-Port',[string]$Port,
    '-RestartDelay',[string]$RestartDelay,'-UpdateCheckInterval',[string]$UpdateCheckInterval,
    '-StateDir',('"' + $script:StateDir + '"'),
    '-LogDir',('"' + $LogDir + '"'),
    '-DshUserProfile',('"' + $script:DshUserProfile + '"'),
    '-DshHome',('"' + $script:DshHome + '"'))
  if ($script:BindMode) { $args += @('-BindMode', $script:BindMode) }
  if ($script:DshInstallDir) { $args += @('-DshInstallDir', ('"' + $script:DshInstallDir + '"')) }
  if ($script:NodePath) { $args += @('-NodePath', ('"' + $script:NodePath + '"')) }
  if ($script:TailscalePath) { $args += @('-TailscalePath', ('"' + $script:TailscalePath + '"')) }
  if ($BindHost) { $args += @('-BindHost',('"' + $BindHost + '"')) }
  Start-Process -FilePath $exe -ArgumentList $args -WindowStyle Hidden -PassThru
}

function Get-SupervisorProcess {
  $record = Read-JsonFile $supervisorFile
  if (-not $record -or -not $record.pid -or -not $record.startTimeUtc) { return $null }
  $processId = [int]$record.pid
  $proc = Get-ProcessInfo $processId
  if (-not $proc) { return $null }
  try {
    if ($record.startTimeUtc -is [DateTime]) {
      $expected = ([DateTime]$record.startTimeUtc).ToUniversalTime()
    } else {
      $expected = [DateTimeOffset]::Parse([string]$record.startTimeUtc,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind).UtcDateTime
    }
    $created = Get-ProcessCreationUtc $processId
    if (-not $created -or [Math]::Abs(($created - $expected).TotalSeconds) -gt 1) { return $null }
  } catch { return $null }
  return $proc
}

# Controls deliberately run before DSH discovery so they remain available while
# npm is replacing package files. Every control command returns quickly.
if ($Status) {
  $managed = Get-ManagedPid
  $supervisorRunning = [bool](Get-SupervisorProcess)
  [ordered]@{ paused=[bool](Test-Paused); supervisorRunning=$supervisorRunning;
    dshRunning=[bool]$managed; dshPid=$managed; port=$Port; installDir=$PSScriptRoot;
    stateDir=$script:StateDir; logDir=$LogDir } | ConvertTo-Json -Compress
  exit 0
}
if ($Pause) {
  Set-Paused 'user-pause'
  Write-Log 'pause requested; current DSH left running.'
  Write-Output 'Paused automatic restart. Current DSH was left running.'
  exit 0
}
if ($Stop) {
  Set-Paused 'user-stop'
  Stop-ManagedInstance
  Write-Log 'stop requested; DSH stopped and restart paused.'
  Write-Output 'Stopped DSH and paused automatic restart.'
  exit 0
}
if ($Restart) {
  if (Test-Paused) { Write-Error 'Automatic restart is paused. Resume first.'; exit 2 }
  $id = Get-ManagedPid
  if (-not $id) { Write-Error 'No valid tracked DSH process is running.'; exit 3 }
  $supervisor = Get-SupervisorProcess
  if (-not $supervisor) {
    try { Start-SupervisorProcess | Out-Null } catch {
      Write-Error "Could not start the supervisor; DSH was left running: $($_.Exception.Message)"
      exit 4
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(3)
    do {
      Start-Sleep -Milliseconds 100
      $supervisor = Get-SupervisorProcess
    } while (-not $supervisor -and [DateTime]::UtcNow -lt $deadline)
    if (-not $supervisor) {
      Write-Error 'Could not confirm a running supervisor; DSH was left running.'
      exit 4
    }
  }
  Stop-ManagedInstance
  Write-Output 'Restart requested.'
  exit 0
}
if ($Start) {
  Clear-Paused
  if (Get-SupervisorProcess) {
    Write-Output 'Supervisor is already running.'
    exit 0
  }
  Start-SupervisorProcess | Out-Null
  Write-Output 'Supervision resumed.'
  exit 0
}
if (Test-Paused) { Write-Log 'pause sentinel present; exiting.'; exit 0 }

Ensure-StateDirs
Write-Log "launcher starting. guarding dsh web on port $Port (crash-restart delay ${RestartDelay}s)."

function Start-DataNode {
  # The boot task runs as SYSTEM, so point the DSH process back to the signed-in
  # owner's installed app and profile before starting the browser wrapper.
  $env:DSH_USER_PROFILE = $script:DshUserProfile
  $env:DSH_LOCALAPPDATA = $script:DshLocalAppData
  $env:USERPROFILE = $script:DshUserProfile
  $env:HOME = $script:DshUserProfile
  $env:LOCALAPPDATA = $script:DshLocalAppData
  $env:APPDATA = Join-Path $script:DshUserProfile 'AppData\Roaming'
  $env:DSH_HOME = $script:DshHome
  $env:DSH_AUTOSTART_STATE_DIR = $script:StateDir
  $effectiveBindMode = $script:BindMode
  if (-not $effectiveBindMode) {
    $cfg = Read-JsonFile (Join-Path $script:StateDir 'config.json')
    if ($cfg -and ($cfg.bindMode -eq 'loopback' -or $cfg.bindMode -eq 'lan-tailscale')) { $effectiveBindMode = [string]$cfg.bindMode }
  }
  if ($effectiveBindMode) { $env:DSH_BIND_MODE = $effectiveBindMode }
  if ($script:DshInstallDir) { $env:DSH_INSTALL_DIR = $script:DshInstallDir }
  if ($script:TailscalePath) { $env:DSH_TAILSCALE_PATH = $script:TailscalePath }
  # Ensure the harness home resolves to the chosen profile regardless of how the guard was
  # launched, so the credentials document is always found. DSH_HOME unset uses
  # process home by default, but pinning it removes any ambiguity when the guard
  # is spawned from a different login/session context.
  if ([string]::IsNullOrEmpty($env:DSH_HOME)) {
    $env:DSH_HOME = Join-Path $env:USERPROFILE '.dsh'
  }
  # Best-effort credential fallback: if the credentials document holds
  # DEEPSEEK_API_KEY but the inherited environment does not, export it for the
  # freshly spawned dsh. This makes the key available through the launching
  # environment even before/without the credentials seam settling, which in turn
  # avoids intermittent "no API key" failures on this route.
  if (-not $env:DEEPSEEK_API_KEY) {
    $credDoc = Join-Path $env:DSH_HOME '.credentials.yaml'
    if (Test-Path $credDoc) {
      try {
        $text = Get-Content $credDoc -Raw
        if ($text -match '(?m)^\s*DEEPSEEK_API_KEY\s*:\s*["'']?([^#\r\n"'']+)["'']?\s*(?:#.*)?$') {
          $env:DEEPSEEK_API_KEY = $Matches[1].Trim()
          Write-Log "exported DEEPSEEK_API_KEY from $credDoc into the dsh child environment"
        }
      } catch {
        Write-Log "could not read $credDoc for DEEPSEEK_API_KEY fallback: $($_.Exception.Message)"
      }
    }
  }

  # Advanced hook (also used by tests): point the supervisor at any command.
  if ($ChildCmd) {
    $argList = @()
    if ($ChildArgs) { $argList = @($ChildArgs) }
    $outFile = Join-Path $LogDir 'child-stdout.log'
    $errFile = Join-Path $LogDir 'child-stderr.log'
    $psParams = @{
      FilePath          = $ChildCmd
      ArgumentList      = $argList
      WorkingDirectory  = $env:USERPROFILE
      WindowStyle       = 'Hidden'
      PassThru          = $true
    }
    $proc = $null
    try {
      $psParams.RedirectStandardOutput = $outFile
      $psParams.RedirectStandardError  = $errFile
      $proc = Start-Process @psParams
    } catch {
      $psParams.Remove('RedirectStandardOutput')
      $psParams.Remove('RedirectStandardError')
      try { $proc = Start-Process @psParams } catch {
        Write-Log "failed to start child: $($_.Exception.Message)"
        return $null
      }
    }
    if (-not $proc) { return $null }
    Write-ProcessRecord $stateFile $proc 'custom'
    $proc.Id | Set-Content -LiteralPath $pidFile -Encoding ascii
    Write-Log "started custom child (pid $($proc.Id)): $ChildCmd $ChildArgs"
    return $proc
  }

  # Resolve on every launch. npm/npx updates can replace or relocate the entry.
  $script:dshBin = Resolve-DshBin
  if (-not $script:dshBin) {
    Write-Log 'dsh bin.js not found (possibly updating); will retry.'
    return $null
  }

  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
  if (-not (Test-Path $node)) { throw "node executable not found: $node" }

  # dsh web alias, then its own flags (--port / --host)
  $webArgs = @('web')
  if ($Port -gt 0)       { $webArgs += @('--port', [string]$Port) }
  if ($BindHost)         { $webArgs += @('--host', $BindHost) }

  # one quoted arg per array element; Start-Process joins with spaces so node parses them
  $argList = @('"' + $dshBin + '"') + ($webArgs | ForEach-Object { '"' + $_ + '"' })

  # hidden window; log-redirect is best-effort (fall back to no-redirect if blocked)
  $outFile = Join-Path $LogDir 'dsh-web-stdout.log'
  $errFile = Join-Path $LogDir 'dsh-web-stderr.log'
  $psParams = @{
    FilePath          = $node
    ArgumentList      = $argList
    WorkingDirectory  = $env:USERPROFILE
    WindowStyle       = 'Hidden'
    PassThru          = $true
  }
  $proc = $null
  try {
    $psParams.RedirectStandardOutput = $outFile
    $psParams.RedirectStandardError  = $errFile
    $proc = Start-Process @psParams
  }
  catch {
    Write-Log "redirect blocked, retrying without redirect: $($_.Exception.Message)"
    $psParams.Remove('RedirectStandardOutput')
    $psParams.Remove('RedirectStandardError')
    try {
      $proc = Start-Process @psParams
    }
    catch {
      Write-Log "failed to start dsh web: $($_.Exception.Message)"
      return $null
    }
  }

  if (-not $proc) {
    Write-Log 'Start-Process returned no handle; treating as startup failure'
    return $null
  }
  Write-ProcessRecord $stateFile $proc 'dsh'
  $proc.Id | Set-Content -LiteralPath $pidFile -Encoding ascii
  Write-Log "started dsh web (node pid $($proc.Id)) : dsh $webArgs"
  return $proc
}

function Get-DshInstallFingerprint($binPath) {
  if (-not $binPath -or -not (Test-Path -LiteralPath $binPath)) { return $null }
  $packageRoot = Split-Path (Split-Path $binPath -Parent) -Parent
  $watchFiles = @((Join-Path $packageRoot 'package.json'),$binPath)
  $dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
  $profileRoot = Join-Path $dshHome 'profiles\web'
  $profilePackage = Join-Path $profileRoot 'package.json'
  foreach ($name in @('cordis.yml','cordis.patch.yml','package.json','pnpm-lock.yaml')) {
    $file = Join-Path $profileRoot $name
    if (Test-Path -LiteralPath $file) { $watchFiles += $file }
  }
  # Watch only direct profile dependencies. This catches plugin upgrades and
  # local edits to each declared main entry without recursively walking the
  # potentially huge node_modules tree.
  if (Test-Path -LiteralPath $profilePackage) {
    try {
      $manifest = Get-Content -LiteralPath $profilePackage -Raw | ConvertFrom-Json
      $names = @()
      foreach ($group in @('dependencies','devDependencies','optionalDependencies')) {
        if ($manifest.$group) { $names += @($manifest.$group.psobject.Properties.Name) }
      }
      foreach ($name in @($names | Sort-Object -Unique)) {
        $dependencyRoot = Join-Path (Join-Path $profileRoot 'node_modules') $name
        $dependencyPackage = Join-Path $dependencyRoot 'package.json'
        if (Test-Path -LiteralPath $dependencyPackage) {
          $watchFiles += $dependencyPackage
          try {
            $dependencyManifest = Get-Content -LiteralPath $dependencyPackage -Raw | ConvertFrom-Json
            $main = if ($dependencyManifest.main) { [string]$dependencyManifest.main } else { 'index.js' }
            $entry = Join-Path $dependencyRoot $main
            if (Test-Path -LiteralPath $entry -PathType Leaf) { $watchFiles += $entry }
          } catch { }
        }
      }
    } catch { Write-Log "profile package.json could not be parsed for update monitoring: $($_.Exception.Message)" }
  }

  $parts = @()
  foreach ($file in @($watchFiles | Sort-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $file)) { return $null }
    try {
      $item = Get-Item -LiteralPath $file
      $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
      # DSH itself can touch cordis.yml's timestamp during startup without
      # changing its contents. Timestamps therefore cause a perpetual
      # restart loop; content identity is the authoritative update signal.
      $parts += "$($item.FullName)|$($item.Length)|$hash"
    } catch { return $null }
  }
  return ($parts -join ';')
}

function Test-DshBrowserHealth {
  $response = $null
  try {
    $request = [Net.HttpWebRequest]::Create(("http://127.0.0.1:{0}/__dsh_health" -f $Port))
    $request.Method = 'GET'
    $request.Timeout = 5000
    $request.ReadWriteTimeout = 5000
    $request.Proxy = $null
    $response = $request.GetResponse()
    return ([int]$response.StatusCode -eq 200)
  } catch { return $false }
  finally { if ($response) { $response.Close() } }
}

function Wait-ChildExit($proc,$initialFingerprint) {
  $nextCheck = [DateTime]::UtcNow.AddSeconds($UpdateCheckInterval)
  $startupGraceUntil = [DateTime]::UtcNow.AddSeconds(180)
  $nextHealthCheck = [DateTime]::UtcNow.AddSeconds(10)
  $healthFailures = 0
  $pendingFingerprint = $null
  while ($proc) {
    if (Test-Paused) { return 'paused' }
    try { $proc.Refresh(); if ($proc.HasExited) { return 'exited' } } catch { return 'exited' }
    if ($script:SupervisesBrowserWrapper -and [DateTime]::UtcNow -ge $startupGraceUntil -and
        [DateTime]::UtcNow -ge $nextHealthCheck) {
      $nextHealthCheck = [DateTime]::UtcNow.AddSeconds(10)
      if (Test-DshBrowserHealth) { $healthFailures = 0 }
      else {
        $healthFailures++
        Write-Log "browser health check failed ($healthFailures/3)"
        if ($healthFailures -ge 3) { return 'unhealthy' }
      }
    }
    if (-not $ChildCmd -and $initialFingerprint -and [DateTime]::UtcNow -ge $nextCheck) {
      $nextCheck = [DateTime]::UtcNow.AddSeconds($UpdateCheckInterval)
      $currentFingerprint = Get-DshInstallFingerprint (Resolve-DshBin)
      if ($currentFingerprint -and $currentFingerprint -ne $initialFingerprint) {
        if ($pendingFingerprint -eq $currentFingerprint) { return 'updated' }
        $pendingFingerprint = $currentFingerprint
        Write-Log 'possible DSH package update detected; waiting for one stable recheck.'
      } else { $pendingFingerprint = $null }
    }
    Start-Sleep -Seconds 1
  }
  return 'exited'
}

function Get-SupervisorMutexName {
  $normalizedHome = [IO.Path]::GetFullPath($script:DshHome).TrimEnd('\').ToLowerInvariant()
  $key = "port=$Port|dshHome=$normalizedHome"
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $hash = ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($key)) | ForEach-Object {$_.ToString('x2')}) -join '' }
  finally { $sha.Dispose() }
  return "Local\dsh-autostart-p$Port-$($hash.Substring(0,20))"
}

$mutex = New-Object Threading.Mutex($false,(Get-SupervisorMutexName))
$hasMutex = $false
try {
  try { $hasMutex = $mutex.WaitOne(0,$false) } catch [Threading.AbandonedMutexException] { $hasMutex = $true }
  if (-not $hasMutex) { Write-Log 'another supervisor is already running; exiting duplicate.'; exit 0 }
  Write-ProcessRecord $supervisorFile (Get-Process -Id $PID) 'supervisor'

  while (-not (Test-Paused)) {
    $existing = $null
    $p = Get-ManagedPid
    if ($p) { $existing = Get-Process -Id $p -ErrorAction SilentlyContinue }
    $portCollision = $false
    if (-not $existing) {
      $owner = Find-PortOwner $Port
      $ownedByTarget = if ($owner -and $script:SupervisesBrowserWrapper) {
        Test-IsBrowserWrapperProcess $owner
      } elseif ($owner) { Test-IsDshWebProcess $owner } else { $false }
      if ($owner -and $ownedByTarget) {
        $existing = Get-Process -Id $owner -ErrorAction SilentlyContinue
        if ($existing) {
          $kind = if ($script:SupervisesBrowserWrapper) { 'custom' } else { 'adopted-dsh' }
          Write-ProcessRecord $stateFile $existing $kind
          $existing.Id | Set-Content -LiteralPath $pidFile -Encoding ascii
          Write-Log "adopting verified web launcher pid $owner on port $Port."
        }
      } elseif ($owner) {
        $portCollision = $true
        Write-Log "port $Port belongs to unrelated pid $owner; refusing to adopt or kill it."
      }
    }

    if (-not $existing -and -not $portCollision) { $existing = Start-DataNode }
    if (-not $existing) {
      Start-Sleep -Seconds $RestartDelay
      continue
    }

    $fingerprint = if ($ChildCmd) { $null } else { Get-DshInstallFingerprint (Resolve-DshBin) }
    $reason = Wait-ChildExit $existing $fingerprint
    if ($reason -eq 'paused') {
      Write-Log 'automatic restart paused; current DSH left running.'
      break
    }
    if ($reason -eq 'updated') {
      Write-Log 'stable DSH package update confirmed; restarting tracked DSH.'
      $tracked = Get-ManagedPid
      if ($tracked -eq $existing.Id) {
        try { Stop-Process -Id $tracked -Force -ErrorAction Stop } catch { Write-Log "update restart stop failed: $($_.Exception.Message)" }
      }
    } elseif ($reason -eq 'unhealthy') {
      Write-Log "tracked browser launcher pid $($existing.Id) failed three health checks; restarting its process tree."
      Stop-ManagedInstance
    } else { Write-Log "tracked process $($existing.Id) exited." }
    Remove-Item $pidFile,$stateFile -Force -ErrorAction SilentlyContinue
    if (-not (Test-Paused)) { Start-Sleep -Seconds $RestartDelay }
  }
} finally {
  try {
    $record = Read-JsonFile $supervisorFile
    if ($record -and [int]$record.pid -eq $PID) { Remove-Item $supervisorFile -Force -ErrorAction SilentlyContinue }
  } catch { }
  if ($hasMutex) { try { $mutex.ReleaseMutex() } catch { } }
  $mutex.Dispose()
}
