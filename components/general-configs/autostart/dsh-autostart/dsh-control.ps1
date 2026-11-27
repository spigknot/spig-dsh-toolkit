# On-demand control panel. It has no tray process and consumes no memory after
# the window is closed.
param([string]$StateDir = '')
$ErrorActionPreference = 'Stop'
if (-not $StateDir -and $env:DSH_AUTOSTART_STATE_DIR) { $StateDir = $env:DSH_AUTOSTART_STATE_DIR }
if (-not $StateDir) { $StateDir = $PSScriptRoot }
$StateDir = [IO.Path]::GetFullPath($StateDir)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$text = @{
  title = 'DSH Autostart Control'
  enabled = 'ENABLED'; paused = 'PAUSED'; running = 'RUNNING'; notRunning = 'NOT RUNNING'
  autoRestart = 'Auto-restart'; dsh = 'DSH'; supervisor = 'Supervisor'
  statusUnavailable = 'Status unavailable'; resume = 'Resume / Start'; pause = 'Pause auto-restart'
  restart = 'Restart DSH'; stop = 'Stop DSH + pause'; web = 'Open DSH Web'; logs = 'Open Logs'
  note = 'This panel runs only while open; closing it leaves no UI process.'
}

function Get-Text([string]$Key) {
  return $text[$Key]
}

$launcher = Join-Path $PSScriptRoot 'dsh-web-launcher.ps1'
if (-not (Test-Path -LiteralPath $launcher)) {
  [Windows.Forms.MessageBox]::Show('dsh-web-launcher.ps1 was not found.','DSH Control') | Out-Null
  exit 1
}

function Invoke-Launcher([string]$Action) {
  try { return (& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $launcher $Action -StateDir $StateDir 2>&1 | Out-String).Trim() }
  catch { return $_.Exception.Message }
}

$form = New-Object Windows.Forms.Form
$form.Size = New-Object Drawing.Size(470,285)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false

$status = New-Object Windows.Forms.Label
$status.Location = New-Object Drawing.Point(18,18)
$status.Size = New-Object Drawing.Size(330,58)
$status.Font = New-Object Drawing.Font('Segoe UI',10)
$form.Controls.Add($status)

$note = New-Object Windows.Forms.Label
$note.Location = New-Object Drawing.Point(18,210)
$note.Size = New-Object Drawing.Size(425,28)
$form.Controls.Add($note)

$script:actionButtons = @{}

function Refresh-Status {
  try {
    $data = (Invoke-Launcher '-Status') | ConvertFrom-Json
    $mode = if ($data.paused) { Get-Text 'paused' } else { Get-Text 'enabled' }
    $dshState = if ($data.dshRunning) { "$(Get-Text 'running') (PID $($data.dshPid))" } else { Get-Text 'notRunning' }
    $guard = if ($data.supervisorRunning) { Get-Text 'running' } else { Get-Text 'notRunning' }
    $status.Text = "$(Get-Text 'autoRestart'): $mode`r`n$(Get-Text 'dsh'): $dshState`r`n$(Get-Text 'supervisor'): $guard"
  } catch { $status.Text = "$(Get-Text 'statusUnavailable'): $($_.Exception.Message)" }
}

function Add-Button($key,$x,$y,$action) {
  $button = New-Object Windows.Forms.Button
  $button.Location = New-Object Drawing.Point($x,$y)
  $button.Size = New-Object Drawing.Size(132,38)
  $button.Add_Click({
    $result = Invoke-Launcher $action
    Start-Sleep -Milliseconds 350
    Refresh-Status
    if ($result -and $result -match 'error|failed|cannot|No valid') {
      [Windows.Forms.MessageBox]::Show($result,(Get-Text 'title')) | Out-Null
    }
  }.GetNewClosure())
  $form.Controls.Add($button)
  $script:actionButtons[$key] = $button
}

Add-Button 'resume' 18 88 '-Start'
Add-Button 'pause' 160 88 '-Pause'
Add-Button 'restart' 302 88 '-Restart'
Add-Button 'stop' 18 140 '-Stop'

$openWeb = New-Object Windows.Forms.Button
$openWeb.Location = New-Object Drawing.Point(160,140)
$openWeb.Size = New-Object Drawing.Size(132,38)
$openWeb.Add_Click({ Start-Process 'http://127.0.0.1:3080' })
$form.Controls.Add($openWeb)

$openLogs = New-Object Windows.Forms.Button
$openLogs.Location = New-Object Drawing.Point(302,140)
$openLogs.Size = New-Object Drawing.Size(132,38)
$openLogs.Add_Click({
  $path = Join-Path $StateDir 'logs'
  New-Item -ItemType Directory -Force -Path $path | Out-Null
  Start-Process explorer.exe -ArgumentList ('"' + $path + '"')
})
$form.Controls.Add($openLogs)

function Apply-Text {
  $form.Text = Get-Text 'title'
  foreach ($key in $script:actionButtons.Keys) { $script:actionButtons[$key].Text = Get-Text $key }
  $openWeb.Text = Get-Text 'web'
  $openLogs.Text = Get-Text 'logs'
  $note.Text = Get-Text 'note'
}

Apply-Text
Refresh-Status
[void]$form.ShowDialog()
