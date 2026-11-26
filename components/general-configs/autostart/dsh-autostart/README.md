# DSH autostart and recovery

This Windows supervisor is adapted from [Ghost011118/dsh-autostart](https://github.com/Ghost011118/dsh-autostart) (MIT). It launches this project's `dsh-navegador.mjs` wrapper, not a second direct `dsh web` instance.

The wrapper keeps the existing authentication bridge and the `dsh-model-provider-label` profile plugin. It listens on port 3080 for localhost, the current private IPv4 subnet, and current Tailscale peers. The browser URL does not ask for the DSH token.

`install-supervisor.ps1` installs `DSH Browser Supervisor` for the current user with an interactive logon token, triggered when that user signs in. This keeps DSH in the same Windows desktop session as the user, so native dialogs remain visible. It passes the owner's DSH profile, Node.js path, and Tailscale CLI path explicitly, and keeps the old `iniciar-harness.vbs` entry as a no-op. The supervisor survives idle periods and battery changes, restarts DSH after a process exit, and checks the proxy's private health route every 10 seconds after a three-minute startup grace. Three failed health checks restart the wrapper and its child process tree. Task Scheduler also retries the supervisor if it exits unexpectedly. The installer adds a small user-level `dsh` shim: `dsh web` opens this fixed endpoint, while other DSH commands still use the original desktop command.

## Commands

- `setup.cmd` — install or update the interactive logon task and start it now.
- `setup.cmd -status` — show supervisor and DSH state.
- `setup.cmd -restart` — restart the supervised DSH process.
- `setup.cmd -pause` — leave DSH running but pause automatic restarts.
- `setup.cmd -start` — resume automatic restarts.
- `setup.cmd -stop` — stop DSH and pause automatic restarts.
- `setup.cmd -control` — open the small control panel.
- `setup.cmd -uninstall` — removes the logon task, command shim, and control shortcut; it leaves a running DSH process alone.

The task starts after the configured user signs in and runs only in that user's interactive session. The PC must remain awake, signed in, and connected to the network to serve other devices. Port 3080 listens on all IPv4 interfaces; the bridge accepts peers from the current private LAN subnet and Tailscale network, without asking browser users for the DSH token.
