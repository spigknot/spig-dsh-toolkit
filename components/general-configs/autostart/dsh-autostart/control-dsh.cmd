@echo off
setlocal
set "STATE_ARG="
if defined DSH_AUTOSTART_STATE_DIR set STATE_ARG=-StateDir "%DSH_AUTOSTART_STATE_DIR%"
REM On-demand GUI. Closing the window leaves no GUI/tray process resident.
start "" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0dsh-control.ps1" %STATE_ARG%
