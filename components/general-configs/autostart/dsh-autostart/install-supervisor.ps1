param(
  [ValidateSet('Install', 'Remove')]
  [string]$Action = 'Install',
  [string]$StateDir = '',
  [ValidateSet('3080')]
  [int]$Port = 3080,
  [ValidateSet('', 'loopback', 'lan-tailscale')]
  [string]$BindMode = '',
  [string]$DshInstallDir = '',
  [string]$NodePath = '',
  [switch]$SkipSelfTreeGuard
)

$ErrorActionPreference = 'Stop'
$taskName = 'DeepSeek Harness'
$supervisorTaskName = 'DSH Browser Supervisor'
$taskPath = '\'
$launcher = Join-Path $PSScriptRoot 'dsh-web-launcher.ps1'
$controlInstaller = Join-Path $PSScriptRoot 'install-control-shortcut.ps1'
if (-not $StateDir -and $env:DSH_AUTOSTART_STATE_DIR) { $StateDir = $env:DSH_AUTOSTART_STATE_DIR }
if (-not $StateDir) { $StateDir = $PSScriptRoot }
$StateDir = [IO.Path]::GetFullPath($StateDir)
$backupDir = Join-Path $StateDir 'backup'
$stateRunDir = Join-Path $StateDir 'run'
$projectRoot = Split-Path $PSScriptRoot -Parent
$shimDir = Join-Path $env:LOCALAPPDATA 'Programs\DSH-Web-Command'
$shimPath = Join-Path $shimDir 'dsh.cmd'
$shimMarker = 'REM DSH_FIXED_WEB_SHIM_V1'

function Set-UserDshPath([bool]$Install) {
  $current = [Environment]::GetEnvironmentVariable('Path', 'User')
  $parts = @($current -split ';' | Where-Object { $_.Trim() -and $_.Trim().TrimEnd('\') -ine $shimDir.TrimEnd('\') })
  if ($Install) { $parts = @($shimDir) + $parts }
  [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User')
  $env:Path = if ($Install) { "$shimDir;$env:Path" } else { ($env:Path -split ';' | Where-Object { $_.Trim().TrimEnd('\') -ine $shimDir.TrimEnd('\') }) -join ';' }
}

function Install-DshCommandShim([string]$RealDsh, [string]$Node, [string]$Wrapper, [string]$BindModeValue, [string]$InstallDirValue) {
  New-Item -ItemType Directory -Force -Path $shimDir | Out-Null
  if ((Test-Path -LiteralPath $shimPath) -and -not (Get-Content -LiteralPath $shimPath -Raw).Contains($shimMarker)) {
    throw "Refusing to overwrite an unrelated command shim: $shimPath"
  }
  $content = @(
    '@echo off',
    'REM DSH_FIXED_WEB_SHIM_V1',
    'setlocal DisableDelayedExpansion',
    'set "REAL_DSH=__REAL_DSH__"',
    'set "DSH_BIND_MODE=__BIND_MODE__"',
    'set "DSH_INSTALL_DIR=__DSH_INSTALL_DIR__"',
    'if /I "%~1"=="web" goto :web',
    'call "%REAL_DSH%" %*',
    'exit /b',
    '',
    ':web',
    'if "%~2"=="" goto :web_open',
    'if /I "%~2"=="--no-open" if "%~3"=="" goto :web_no_open',
    'if /I "%~2"=="--help" if "%~3"=="" goto :web_help',
    'if /I "%~2"=="-h" if "%~3"=="" goto :web_help',
    'echo This launcher always uses port 3080 without a browser login.',
    'echo Usage: dsh web [--no-open]',
    'exit /b 2',
    '',
    ':web_open',
    '"__NODE_EXE__" "__WRAPPER_MJS__"',
    'exit /b',
    '',
    ':web_no_open',
    '"__NODE_EXE__" "__WRAPPER_MJS__" --no-open',
    'exit /b',
    '',
    ':web_help',
    'echo Usage: dsh web [--no-open]',
    'echo Opens the fixed DSH browser endpoint on port 3080. The internal DSH token is handled by the local bridge.',
    'exit /b 0'
  ) -join "`r`n"
  $content = $content.Replace('__REAL_DSH__', $RealDsh).Replace('__NODE_EXE__', $Node).Replace('__WRAPPER_MJS__', $Wrapper).Replace('__BIND_MODE__', $BindModeValue).Replace('__DSH_INSTALL_DIR__', $InstallDirValue)
  [IO.File]::WriteAllText($shimPath, $content, (New-Object Text.ASCIIEncoding))
  Set-UserDshPath $true
}

function Get-TaskLauncherPath($task) {
  $action = $task.Actions[0]
  if ($action.Arguments -match '(?i)(?:^|\s)-File\s+(?:"([^"]+)"|(\S+))') {
    $value = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
    return [IO.Path]::GetFullPath($value)
  }
  if ($action.WorkingDirectory) { return [IO.Path]::GetFullPath((Join-Path $action.WorkingDirectory 'dsh-web-launcher.ps1')) }
  return $null
}
function Get-TaskStateDir($task, $launcherPath) {
  if ($task.Actions[0].Arguments -match '(?i)(?:^|\s)-StateDir\s+(?:"([^"]+)"|(\S+))') {
    $value = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
    return [IO.Path]::GetFullPath($value)
  }
  return (Split-Path $launcherPath -Parent)
}
function Get-CurrentProcessAncestry {
  $processId = $PID
  for ($i = 0; $i -lt 24 -and $processId -gt 0; $i++) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if (-not $proc.ParentProcessId) { break }
    $processId = [int]$proc.ParentProcessId
    $processId
  }
}
function Find-PortOwner([int]$targetPort) {
  try {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $targetPort -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { return [int]$conn.OwningProcess }
  } catch {}
  foreach ($line in (netstat -ano -p TCP 2>$null)) {
    if ($line -match "(?i)^\s*TCP\s+\S+:$targetPort\s+\S+\s+LISTENING\s+(\d+)\s*$") { return [int]$Matches[1] }
  }
  return $null
}
function Read-VerifiedRecordPid([string]$jsonPath) {
  if (-not (Test-Path -LiteralPath $jsonPath)) { return $null }
  try {
    $record = Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json
    if (-not $record.pid -or -not $record.startTimeUtc) { return $null }
    $processId = [int]$record.pid
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if (-not $proc.CreationDate) { return $null }
    $expected = if ($record.startTimeUtc -is [datetime]) { $record.startTimeUtc.ToUniversalTime() } else { [DateTimeOffset]::Parse($record.startTimeUtc, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime }
    if ([Math]::Abs((([datetime]$proc.CreationDate).ToUniversalTime() - $expected).TotalSeconds) -le 1) { return $processId }
  } catch {}
  return $null
}
function Wait-ProcessExit([int]$targetPid, [int]$timeoutSec) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  do {
    if (-not (Get-Process -Id $targetPid -ErrorAction SilentlyContinue)) { return $true }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $deadline)
  return $false
}
function Wait-PortFree([int]$targetPort, [int]$timeoutSec) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  do {
    if (-not (Find-PortOwner $targetPort)) { return $true }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $deadline)
  return $false
}

if ($Action -eq 'Remove') {
  & $launcher -Pause -StateDir $StateDir | Out-Null
  Unregister-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Confirm:$false -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath -Confirm:$false -ErrorAction SilentlyContinue
  $startupEntry = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::Startup)) 'start-dsh-web.vbs'
  if ((Test-Path -LiteralPath $startupEntry) -and (Get-Content -LiteralPath $startupEntry -Raw) -like "*$launcher*") {
    Remove-Item -LiteralPath $startupEntry -Force
  }
  $legacyVbs = Join-Path $projectRoot 'iniciar-harness.vbs'
  $legacyBackup = Join-Path $backupDir 'iniciar-harness.vbs.before'
  $legacyTaskStillExists = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction SilentlyContinue
  if (-not $legacyTaskStillExists -and (Test-Path -LiteralPath $legacyBackup) -and (Test-Path -LiteralPath $legacyVbs)) {
    Copy-Item -LiteralPath $legacyBackup -Destination $legacyVbs -Force
  }
  if ((Test-Path -LiteralPath $shimPath) -and (Get-Content -LiteralPath $shimPath -Raw).Contains($shimMarker)) {
    Remove-Item -LiteralPath $shimPath -Force
    Set-UserDshPath $false
  }
  & $controlInstaller -Uninstall | Out-Null
  Write-Output 'Removed DSH logon task and browser command shim. A running DSH server was left alone.'
  exit 0
}

$profileRoot = [IO.Path]::GetFullPath($env:USERPROFILE)
$dshHome = if ($env:DSH_HOME) { [IO.Path]::GetFullPath($env:DSH_HOME) } else { Join-Path $profileRoot '.dsh' }
$localAppData = Join-Path $profileRoot 'AppData\Local'

$dshCandidates = @()
if ($DshInstallDir) { $dshCandidates += $DshInstallDir }
if ($env:DSH_INSTALL_DIR) { $dshCandidates += $env:DSH_INSTALL_DIR }
$dshCandidates += (Join-Path $localAppData 'Programs\DeepSeek Harness')
if ($env:ProgramFiles) { $dshCandidates += (Join-Path $env:ProgramFiles 'DeepSeek Harness') }
if (${env:ProgramFiles(x86)}) { $dshCandidates += (Join-Path ${env:ProgramFiles(x86)} 'DeepSeek Harness') }
$installDir = $null
foreach ($cand in $dshCandidates) {
  if ($cand -and (Test-Path -LiteralPath (Join-Path $cand 'DeepSeek Harness.exe'))) { $installDir = [IO.Path]::GetFullPath($cand); break }
}
if (-not $installDir) { throw "DeepSeek Harness was not found in standard install locations. Install DeepSeek Harness or pass -DshInstallDir." }
$realDsh = Join-Path $installDir 'resources\runtime\cli\bin\dsh.cmd'
if (-not (Test-Path -LiteralPath $realDsh)) { throw "The DSH command was not found: $realDsh" }

$nodeCandidates = @()
if ($NodePath) { $nodeCandidates += $NodePath }
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd -and $nodeCmd.Source) { $nodeCandidates += $nodeCmd.Source }
if ($env:ProgramFiles) { $nodeCandidates += (Join-Path $env:ProgramFiles 'nodejs\node.exe') }
$nodeCandidates += (Join-Path $localAppData 'Programs\nodejs\node.exe')
$resolvedNodePath = $null
foreach ($cand in $nodeCandidates) {
  if ($cand -and (Test-Path -LiteralPath $cand)) { $resolvedNodePath = [IO.Path]::GetFullPath($cand); break }
}
if (-not $resolvedNodePath) { throw 'Node.js was not found in PATH or standard install locations. Install Node.js (LTS) or pass -NodePath.' }
$nodePath = $resolvedNodePath

$tailscaleCmd = Get-Command tailscale -ErrorAction SilentlyContinue
$tailscalePath = if ($tailscaleCmd -and $tailscaleCmd.Source -and (Test-Path -LiteralPath $tailscaleCmd.Source)) { $tailscaleCmd.Source } else { '' }

$oldSupervisor = Get-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath -ErrorAction SilentlyContinue
$oldLauncherPath = if ($oldSupervisor) { Get-TaskLauncherPath $oldSupervisor }
$oldStateDir = if ($oldLauncherPath) { Get-TaskStateDir $oldSupervisor $oldLauncherPath }
$isCrossDirMigration = $oldLauncherPath -and ($oldLauncherPath -ine [IO.Path]::GetFullPath($launcher))
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$keepRunning = $false
if ($isCrossDirMigration) {
  $oldManagedPid = Read-VerifiedRecordPid (Join-Path $oldStateDir 'run\dsh-web.json')
  $oldSupervisorPid = Read-VerifiedRecordPid (Join-Path $oldStateDir 'run\supervisor.json')
  if (-not $SkipSelfTreeGuard -and $oldManagedPid -and (Get-CurrentProcessAncestry) -contains $oldManagedPid) {
    Write-Error "Cannot migrate from a different supervisor directory ($oldLauncherPath) while running inside its live DSH process tree (managed pid $oldManagedPid). Run cutover out-of-tree." -ErrorAction Continue
    exit 6
  }
  if ($oldSupervisor.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $oldLauncherPath) {
    $stopArgs = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $oldLauncherPath, '-Stop')
    if ($oldStateDir -ine (Split-Path $oldLauncherPath -Parent)) { $stopArgs += @('-StateDir', $oldStateDir) }
    & $powershell @stopArgs
  }
  if ($oldSupervisorPid -and -not (Wait-ProcessExit $oldSupervisorPid 3)) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $oldSupervisorPid" -ErrorAction SilentlyContinue
    if ($proc.CommandLine -like '*dsh-web-launcher.ps1*' -and (Read-VerifiedRecordPid (Join-Path $oldStateDir 'run\supervisor.json')) -eq $oldSupervisorPid) {
      Stop-Process -Id $oldSupervisorPid -Force -ErrorAction SilentlyContinue
      Wait-ProcessExit $oldSupervisorPid 3 | Out-Null
    }
  }
  if (-not (Wait-PortFree $Port 10)) {
    Write-Error "Port $Port is still occupied after stopping previous supervisor ($oldLauncherPath). Aborting install to prevent split-brain." -ErrorAction Continue
    exit 7
  }
} else {
  $sameSupPid = Read-VerifiedRecordPid (Join-Path $stateRunDir 'supervisor.json')
  $sameManagedPid = Read-VerifiedRecordPid (Join-Path $stateRunDir 'dsh-web.json')
  $keepRunning = $sameSupPid -and $sameManagedPid -and ((Get-CurrentProcessAncestry) -contains $sameManagedPid)
}

$configPath = Join-Path $StateDir 'config.json'
$persistedBindMode = ''
if (Test-Path -LiteralPath $configPath) {
  try {
    $cfg = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if ($cfg.bindMode -eq 'loopback' -or $cfg.bindMode -eq 'lan-tailscale') { $persistedBindMode = [string]$cfg.bindMode }
  } catch {}
}
$oldHadBindMode = $oldSupervisor -and $oldSupervisor.Actions -and ($oldSupervisor.Actions[0].Arguments -match '(?i)(?:^|\s)-BindMode\b')
$effectiveBindMode = if ($BindMode) { $BindMode } elseif ($persistedBindMode) { $persistedBindMode } elseif ($oldSupervisor -and -not $oldHadBindMode) { 'lan-tailscale' } else { 'loopback' }
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
$cfgTmp = "$configPath.$PID.tmp"
([ordered]@{ version = 1; bindMode = $effectiveBindMode } | ConvertTo-Json -Compress) + "`n" | Set-Content -LiteralPath $cfgTmp -Encoding UTF8
Move-Item -LiteralPath $cfgTmp -Destination $configPath -Force

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
if ($oldSupervisor) {
  $backup = Join-Path $backupDir 'DSH-Browser-Supervisor-task-before-boot.xml'
  if (-not (Test-Path -LiteralPath $backup)) {
    Export-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath | Set-Content -LiteralPath $backup -Encoding Unicode
  }
}
Install-DshCommandShim $realDsh $nodePath (Join-Path $projectRoot 'dsh-navegador.mjs') $effectiveBindMode $installDir
& $controlInstaller -InstallDir $PSScriptRoot -StateDir $StateDir | Out-Null

$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew

$quote = { param([string]$value) '"' + $value.Replace('"', '""') + '"' }
$arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ' + (& $quote $launcher) +
  ' -Port ' + [string]$Port + ' -StateDir ' + (& $quote $StateDir) +
  ' -BindMode ' + $effectiveBindMode +
  ' -DshUserProfile ' + (& $quote $profileRoot) + ' -DshHome ' + (& $quote $dshHome) +
  ' -DshInstallDir ' + (& $quote $installDir) +
  ' -NodePath ' + (& $quote $nodePath)
if ($tailscalePath) { $arguments += ' -TailscalePath ' + (& $quote $tailscalePath) }
$scheduledAction = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $PSScriptRoot

$legacyVbs = Join-Path $projectRoot 'iniciar-harness.vbs'
if (Test-Path -LiteralPath $legacyVbs) {
  $legacyBackup = Join-Path $backupDir 'iniciar-harness.vbs.before'
  if (-not (Test-Path -LiteralPath $legacyBackup)) { Copy-Item -LiteralPath $legacyVbs -Destination $legacyBackup }
  [IO.File]::WriteAllText($legacyVbs, 'Option Explicit:WScript.Quit 0', (New-Object Text.ASCIIEncoding))
}

try {
  if (-not $keepRunning -and -not $isCrossDirMigration -and $oldSupervisor -and $oldSupervisor.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
  }
  $taskDesc = if ($effectiveBindMode -eq 'lan-tailscale') {
    'Starts DSH when the user signs in, binds its browser bridge to LAN and Tailscale interfaces on port 3080, and restarts it after failures.'
  } else {
    'Starts DSH when the user signs in, binds its browser bridge to 127.0.0.1 on port 3080, and restarts it after failures.'
  }
  Register-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath `
    -Action $scheduledAction -Trigger $trigger -Settings $settings -Principal $principal `
    -Description $taskDesc `
    -Force | Out-Null
  Remove-Item (Join-Path $stateRunDir 'pause.sentinel'),(Join-Path $stateRunDir 'stop.sentinel') -Force -ErrorAction SilentlyContinue
  if (-not $keepRunning) { Start-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath }
} catch {
  Write-Error "Could not register the DSH logon task. Details: $($_.Exception.Message)"
  exit 5
}

Start-Sleep -Seconds 3
$task = Get-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath
$state = (Get-ScheduledTaskInfo -TaskName $supervisorTaskName -TaskPath $taskPath).LastTaskResult
Write-Output "Installed the DSH interactive logon task for $userId (task state: $($task.State); last result: $state)."
$bindSummary = if ($effectiveBindMode -eq 'lan-tailscale') { 'across LAN and Tailscale interfaces' } else { 'on 127.0.0.1 (loopback only)' }
Write-Output "It starts in the signed-in Windows session, uses the owner DSH profile, and exposes the no-login bridge on port 3080 $bindSummary."
Write-Output "The dsh web command now opens the fixed bridge; shim: $shimPath"
