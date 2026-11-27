# Plano Final de Execução — Migração do Autostart para Runtime Staged em `$DSH_HOME`

> **Repositório:** `D:\Projetos\spig-dsh-toolkit`  
> **Documentos de origem:** [AUTOSTART_MIGRATION_PLAN.md](AUTOSTART_MIGRATION_PLAN.md) + [AUTOSTART_MIGRATION_REVIEW.md](AUTOSTART_MIGRATION_REVIEW.md)  
> **Data de consolidação:** 2026-11-26  
> **Status:** Especificação final pronta para execução faseada

---

## 0. Contrato de Execução para o Agente (Leia Antes de Qualquer Edição)

### 0.1 Objetivo
Tornar o componente **General Configs → Windows Logon Autostart (porta `3080`)** do plugin `spig-dsh-toolkit` **100% autocontido**:
- Código-fonte em `components/general-configs/autostart/` permanece **imutável e read-only** (nunca recebe `run/`, `logs/` ou `backup/`).
- Runtime operacional e estado único ficam em `%USERPROFILE%\.dsh\plugins\spig-dsh-toolkit\autostart\` (via `dshHomePath`).
- Esta máquina migra com segurança do supervisor legado (`D:\Projetos\DeepSeekHarness\dsh-autostart`) para o runtime staged, sem split-brain e com rollback automático em caso de falha.
- Após validação pós-cutover, `LEGACY_AUTOSTART_DIR` é removido e o autostart recebe hardening de portabilidade para PC novo (`tailscale` opcional, descoberta de binários e `-BindMode`).

### 0.2 Escopo Aprovado vs. Explicitamente Fora de Escopo
| Dentro do escopo | Fora do escopo agora (NÃO implementar) |
|---|---|
| Runtime staged + re-sync por SHA no mount do plugin | Fallback `ELECTRON_RUN_AS_NODE=1` para substituir `node.exe` no launcher |
| Estado único (`run/`, `logs/`, `backup/`) em `$DSH_HOME` via `-StateDir` | Reduzir `RestartCount` da Task de `999` para `10` (manter `999`) |
| Mutex por recurso (`Port + DshHome`) | Rotação automática de logs em `logs/` |
| Handoff determinístico + guarda anti-suicídio in-tree no instalador | Reescrita da UI do cliente (não tocar em `src/client/` na 0a/Fase 3) |
| Cutover fora da árvore do DSH (task agendada temporária com auto-rollback) | |
| Remoção de `LEGACY_AUTOSTART_DIR` + guarda estática anti-paths hardcoded | |
| Portabilidade (Fase 0b): `tailscale` opcional, descoberta de `node`/DSH, `-BindMode` | |

### 0.3 Decisões Padrão (Confirmar com o Usuário Apenas Antes da Fase 1 e da Fase 0b)
1. **Execução da Fase 1 (cutover):** opção **(b) task agendada temporária** fora da árvore do DSH, com log em `cutover.log`, auto-rollback no `catch` e auto-remoção no `finally` (alternativa manual **(a)** documentada na seção 4.4 caso o usuário prefira rodar fora).
2. **Acesso de rede nesta máquina:** manter **`lan-tailscale`** (`0.0.0.0` + Tailscale), preservado em `autostart/config.json`.
3. **Acesso de rede em instalações novas (Fase 0b):** default **`loopback`** (`127.0.0.1`, sem expor `:3080` na LAN).

### 0.4 Regras Invioláveis (Se Quebrar Qualquer Uma, PARE)
1. **NUNCA rode `-Stop` ou `install-supervisor.ps1` migrando do legado diretamente de dentro de um comando `pwsh` filho do DSH vivo.** Todo comando disparado pelo agente é processo-filho do wrapper `dsh-navegador.mjs`; `taskkill /T` mata o próprio script no meio e deixa a máquina sem supervisor.
2. **Arquivos `.ps1` e `.cmd` DEVEM ser estritamente ASCII (`0x00–0x7F`).** Nunca use acentos, travessões (`—`), setas (`→`) ou aspas tipográficas em scripts PowerShell ou batch (eles precisam sobreviver a qualquer codepage Windows sem BOM).
3. **Comandos `git` neste host Windows:** prefixe sempre com `$env:GIT_CONFIG_COUNT='0'` (PowerShell) ou `GIT_CONFIG_COUNT=0`.
4. **Gate obrigatório antes de cada commit:** rode `npm run check && npm test`. Nunca use `--no-verify` nem `--force`.
5. **Commits focados e separados:** nunca misture Fase 0a, Fase 3 e Fase 0b no mesmo commit, e nunca toque em código de Subscriptions/Antigravity.
6. **Nunca crie `run/`, `logs/` ou `backup/` dentro do repositório git.** Em testes, use sempre diretórios temporários (`os.tmpdir()`).
7. **`node scripts/build.mjs`:** só rode se alterar `src/client/`. As fases 0a, 3 e 0b são 100% host/scripts e não exigem rebuild de `lib/client.js`.

---

## 1. Arquitetura Alvo e Mapa de Fases

### 1.1 Layout de Diretórios

```text
[1. Bundle imutável — dentro do plugin spig-dsh-toolkit (repo ou node_modules)]
components/general-configs/autostart/
├── dsh-navegador.mjs
├── local-web-proxy.mjs
├── dsh-picker-browse.patch.yml
└── dsh-autostart/
    ├── dsh-web-launcher.ps1
    ├── install-supervisor.ps1
    ├── install-control-shortcut.ps1
    ├── dsh-control.ps1
    ├── setup.cmd
    ├── control-dsh.cmd
    ├── LICENSE
    └── README.md

          │  syncAutostartRuntime() — cópia atômica por arquivo (sem rm -rf)
          │  disparado em setEnabled(true) e no mount do plugin (se já instalado)
          ▼

[2. Runtime operacional + Estado único — SEMPRE sob $DSH_HOME]
%USERPROFILE%\.dsh\plugins\spig-dsh-toolkit\autostart\
├── config.json                  # (Fase 0b) { "version": 1, "bindMode": "loopback" | "lan-tailscale" }
├── runtime\                     # Cópia operacional estável (path nunca muda em upgrades)
│   ├── manifest.json            # { version, packageVersion, sourceSha256, syncedAt, files }
│   ├── dsh-navegador.mjs
│   ├── local-web-proxy.mjs
│   ├── dsh-picker-browse.patch.yml
│   └── dsh-autostart\           # Scripts apontados pela Task, dsh.cmd e DSH Control.lnk
│       ├── dsh-web-launcher.ps1
│       ├── install-supervisor.ps1
│       ├── install-control-shortcut.ps1
│       ├── dsh-control.ps1
│       ├── setup.cmd
│       ├── control-dsh.cmd
│       ├── LICENSE
│       └── README.md
├── run\                         # ÚNICO diretório de estado (getStatus = querySupervisor = launcher)
│   ├── supervisor.json
│   ├── dsh-web.json
│   ├── dsh-web.pid
│   ├── pause.sentinel           # presente somente quando pausado/parado
│   └── restart-attempts.log
├── logs\
│   ├── launcher-*.log
│   ├── child-stdout.log
│   ├── child-stderr.log
│   └── cutover.log              # gerado na Fase 1
└── backup\
    └── DSH-Browser-Supervisor-task-before-boot.xml
```

### 1.2 Allowlist Estrita do Sync (`AUTOSTART_RUNTIME_FILES`)
O sync **NUNCA** copia recursivamente o diretório inteiro (para jamais arrastar `run/`, `logs/`, `backup/` ou arquivos temporários). Ele copia exclusivamente esta lista fixa (em ordem alfabética para cálculo determinístico do SHA-256):

```js
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
```

### 1.3 Ordem Obrigatória de Execução

| Ordem | Fase | O que faz | Downtime | Commit |
|---|---|---|---|---|
| **1** | **Fase 0a** | `-StateDir`, mutex `Port+DshHome`, handoff + guarda anti-suicídio, runtime staged + re-sync por SHA no mount, paridade `getStatus`/`querySupervisor`, `.gitignore`, isolamento do teste em `toolkit.test.mjs`, testes novos | **0 s** | **Commit 1** (`Stage autostart runtime and state under DSH_HOME`) |
| **2** | **Fase 1** | Cutover desta máquina via task agendada temporária (ou manual) com auto-rollback por `$stage` | **~15–20 s** | Nenhum (operação runtime) |
| **3** | **Fase 2** | Auditoria pós-cutover (9 verificações obrigatórias, incluindo botão Restart real) | **~15 s** (teste Restart) | Nenhum (validação) |
| **4** | **Fase 3** | Remover `LEGACY_AUTOSTART_DIR`, limpar `run/` e `logs/` residuais do repo, vacina anti-paths hardcoded (`/` e `\`), atualizar `docs/ARCHITECTURE.md` | **0 s** | **Commit 2** (`Remove legacy autostart fallback after cutover`) |
| **5** | **Fase 0b** | Portabilidade PC novo: `tailscale` opcional, descoberta de `node`/DSH, `-BindMode` (`loopback` default / `lan-tailscale` preservado nesta máquina sem queda silenciosa) + testes | **0 s** | **Commit 3** (`Add autostart BindMode and portable binary discovery`) |
| **—** | **Fase 4** | Runbook de rollback (somente em caso de falha) | ~15–20 s | `git revert` se aplicável |

> **Por que Fase 0b vem depois da Fase 3?** Para que o cutover da Fase 1 troque apenas o **local** do runtime/estado, mantendo 100% do comportamento de rede (`0.0.0.0` + Tailscale) e descoberta de binários idêntico ao legado. Menos variáveis mudando ao mesmo tempo = cutover previsível.

---

## 2. Armadilhas Estruturais Já Descobertas (NÃO Caia Nelas)

Estas 5 armadilhas foram identificadas na leitura direta do código atual e causariam bugs silenciosos se ignoradas:

1. **`-Status` hoje cria `run/` e `logs/` como efeito colateral** (`dsh-web-launcher.ps1:107-108` executa `New-Item` no topo do script antes de `if ($Status)`).  
   - **Correção obrigatória:** mover `New-Item` de `$runDir` e `$LogDir` para **depois** do bloco `if ($Status) { ... exit 0 }` (e garantir `New-Item` antes de `Set-Paused`, `Write-Log`, `Write-ProcessRecord` e do loop principal). Assim `-Status` é 100% read-only e nunca suja o repo durante a transição.
2. **`startup.available` na UI (`src/client/general-configs-client.js:1427`) depende de o autostart estar disponível ANTES do staging.**  
   - **Correção obrigatória:** `getStatus().available` deve verificar `process.platform === "win32" && existsSync(join(bundleAutostartDir, "install-supervisor.ps1"))` — **NUNCA** `existsSync(stagedSetupCmd)`. Caso contrário, em um PC novo (onde `runtime/` ainda não existe), a UI exibiria "Startup indisponível" e o usuário nunca conseguiria ligar o toggle.
3. **No layout staged, `scriptPath` e `stateDir` são pastas diferentes.**  
   - Hoje `startup.js:182-189` assume que `dsh-web-launcher.ps1` e `run/` ficam na mesma pasta (`string[]`). No layout staged, o script fica em `<stateDir>/runtime/dsh-autostart/dsh-web-launcher.ps1`, mas `run/` fica em `<stateDir>/run/`.  
   - **Correção obrigatória:** na Fase 0a, `candidateDescriptors()` retorna objetos `{ id, scriptPath, stateDir, passStateDir }`, e quando `passStateDir` é `true`, **toda** invocação ao launcher (`-Status`, `-Restart`, etc.) passa `"-StateDir", descriptor.stateDir`.
4. **`Start-SupervisorProcess` dentro de `dsh-web-launcher.ps1:253-265` precisa repassar `-StateDir`.**  
   - Quando `-Start` ou `-Restart` relança o supervisor, se `-StateDir` não for repassado nos `$args`, o novo supervisor cai no default `$PSScriptRoot` e grava `run/` dentro de `runtime/dsh-autostart/run/` em vez de `autostart/run/`.
5. **`install-supervisor.ps1` precisa usar `$StateDir` em 4 lugares diferentes** (não apenas nos argumentos da Task):  
   - `$backupDir = Join-Path $StateDir 'backup'` (não `$PSScriptRoot\backup`)  
   - `if ($Action -eq 'Remove') { & $launcher -Pause -StateDir $StateDir | Out-Null ... }`  
   - `& $controlInstaller -InstallDir $PSScriptRoot -StateDir $StateDir | Out-Null`  
   - `Remove-Item (Join-Path $StateDir 'run\pause.sentinel'),(Join-Path $StateDir 'run\stop.sentinel') ...`

---

## 3. Fase 0a — Especificação Detalhada (Commit 1, Zero Downtime)

### 3.1 `components/general-configs/autostart/dsh-autostart/dsh-web-launcher.ps1`

> **Lembrete:** arquivo 100% ASCII.

1. **Parâmetros (`param(...)`, linhas 36–53):**
   - Adicionar `[string]$StateDir = '',`.
   - Alterar `[string]$LogDir = ''` (default vazio, resolvido após `$StateDir`).
2. **Resolução de `$StateDir`, `$runDir` e `$LogDir` (após linha 55):**
   ```powershell
   if (-not $StateDir -and $env:DSH_AUTOSTART_STATE_DIR) { $StateDir = $env:DSH_AUTOSTART_STATE_DIR }
   if (-not $StateDir) { $StateDir = $PSScriptRoot }
   $script:StateDir = [IO.Path]::GetFullPath($StateDir)
   if (-not $LogDir) { $LogDir = Join-Path $script:StateDir 'logs' }
   $LogDir = [IO.Path]::GetFullPath($LogDir)
   $runDir = Join-Path $script:StateDir 'run'
   ```
   - `$pidFile`, `$stateFile`, `$stopFile`, `$legacyStopFile`, `$supervisorFile` continuam derivando de `$runDir` (sem mudança de nomes).
   - `$script:WrapperPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\dsh-navegador.mjs'))` permanece relativo a `$PSScriptRoot` (que no staged é `runtime\dsh-autostart`, logo `..\dsh-navegador.mjs` aponta exatamente para `runtime\dsh-navegador.mjs`).
3. **Tornar `-Status` 100% read-only:**
   - **Remover** `New-Item -ItemType Directory -Force -Path $runDir | Out-Null` e `New-Item ... $LogDir` das linhas 107–108.
   - Criar helper:
     ```powershell
     function Ensure-StateDirs {
       if (-not (Test-Path -LiteralPath $runDir)) { New-Item -ItemType Directory -Force -Path $runDir | Out-Null }
       if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
     }
     ```
   - Chamar `Ensure-StateDirs` dentro de `Write-Log`, `Write-ProcessRecord`, `Set-Paused`, e logo **após** o bloco de comandos de controle (antes de `Write-Log "launcher starting..."` na linha 342).
   - No bloco `if ($Status)` (linhas 289–296), incluir `stateDir = $script:StateDir` no objeto JSON retornado:
     ```powershell
     [ordered]@{
       paused = [bool](Test-Paused)
       supervisorRunning = $supervisorRunning
       dshRunning = [bool]$managed
       dshPid = $managed
       port = $Port
       installDir = $PSScriptRoot
       stateDir = $script:StateDir
       logDir = $LogDir
     } | ConvertTo-Json -Compress
     ```
4. **Corrigir `Start-SupervisorProcess` (linhas 253–265):**
   - Repassar `-StateDir` explicitamente e só anexar parâmetros opcionais quando não vazios:
     ```powershell
     function Start-SupervisorProcess {
       $exe = [Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
       $args = @(
         '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
         '-File', ('"' + $PSCommandPath + '"'),
         '-Port', [string]$Port,
         '-RestartDelay', [string]$RestartDelay,
         '-UpdateCheckInterval', [string]$UpdateCheckInterval,
         '-StateDir', ('"' + $script:StateDir + '"'),
         '-LogDir', ('"' + $LogDir + '"'),
         '-DshUserProfile', ('"' + $script:DshUserProfile + '"'),
         '-DshHome', ('"' + $script:DshHome + '"')
       )
       if ($script:NodePath) { $args += @('-NodePath', ('"' + $script:NodePath + '"')) }
       if ($script:TailscalePath) { $args += @('-TailscalePath', ('"' + $script:TailscalePath + '"')) }
       if ($BindHost) { $args += @('-BindHost', ('"' + $BindHost + '"')) }
       Start-Process -FilePath $exe -ArgumentList $args -WindowStyle Hidden -PassThru
     }
     ```
5. **Guarda idempotente no `-Start` (linhas 334–339):**
   ```powershell
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
   ```
6. **Exportar `DSH_AUTOSTART_STATE_DIR` em `Start-DataNode` (linha ~353):**
   - Logo após `$env:DSH_HOME = $script:DshHome`, adicionar:
     ```powershell
     $env:DSH_AUTOSTART_STATE_DIR = $script:StateDir
     ```
   - Assim o wrapper `dsh-navegador.mjs` (e futuros consumidores) recebe o `$StateDir` explicitamente no ambiente, sem depender apenas de path relativo.
7. **Mutex por recurso (`Port + DshHome`) (linhas 572–578):**
   Substituir `Get-SupervisorMutexName` por:
   ```powershell
   function Get-SupervisorMutexName {
     $normalizedHome = [IO.Path]::GetFullPath($script:DshHome).TrimEnd('\').ToLowerInvariant()
     $key = "port=$Port|dshHome=$normalizedHome"
     $sha = [Security.Cryptography.SHA256]::Create()
     try { $hash = ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($key)) | ForEach-Object { $_.ToString('x2') }) -join '' }
     finally { $sha.Dispose() }
     return "Local\dsh-autostart-p$Port-$($hash.Substring(0,20))"
   }
   ```
   > Nota: o mutex legado continuava usando o hash de `$PSScriptRoot`. Quem protege o cutover único do legado para o staged é o handoff do instalador; este mutex impede split-brain em qualquer cenário futuro.

---

### 3.2 `components/general-configs/autostart/dsh-autostart/install-supervisor.ps1`

> **Lembrete:** arquivo 100% ASCII. Nesta Fase 0a, manter `RestartCount 999` e manter a descoberta atual de `node` / `tailscale` (a flexibilização de `tailscale`/binários entra isolada na Fase 0b).

1. **Parâmetros (linhas 1–4):**
   ```powershell
   param(
     [ValidateSet('Install', 'Remove')]
     [string]$Action = 'Install',
     [string]$StateDir = '',
     [ValidateSet('3080')]
     [int]$Port = 3080,
     [switch]$SkipSelfTreeGuard
   )
   ```
2. **Validação da porta e resolução de `$StateDir` e `$backupDir` (linhas 10–14):**
   - Aceitar apenas `-Port 3080` no instalador (Install e Remove) via `[ValidateSet('3080')]` no parâmetro, antes de qualquer efeito colateral. Nesta fase o wrapper e o proxy continuam fixos em `3080`; `59991` fica reservada aos testes isolados de `-Status` e `-Pause` do launcher.
   ```powershell
   if (-not $StateDir -and $env:DSH_AUTOSTART_STATE_DIR) { $StateDir = $env:DSH_AUTOSTART_STATE_DIR }
   if (-not $StateDir) { $StateDir = $PSScriptRoot }
   $StateDir = [IO.Path]::GetFullPath($StateDir)
   $backupDir = Join-Path $StateDir 'backup'
   $stateRunDir = Join-Path $StateDir 'run'
   ```
3. **Helpers de handoff e segurança (adicionar antes do bloco `if ($Action -eq 'Remove')`):**
   - `Get-TaskLauncherPath($task)`: extrai o caminho passado em `-File` dentro de `$task.Actions[0].Arguments` via regex `(?i)-File\s+(?:"([^"]+)"|(\S+))`. Se não encontrar, tenta `Join-Path $task.Actions[0].WorkingDirectory 'dsh-web-launcher.ps1'`. Retorna `[IO.Path]::GetFullPath(...)` ou `$null`.
   - `Get-TaskStateDir($task, $launcherPath)`: extrai `-StateDir` via regex `(?i)-StateDir\s+(?:"([^"]+)"|(\S+))`; fallback: `Split-Path $launcherPath -Parent`.
   - `Get-CurrentProcessAncestry`: caminha `Win32_Process.ParentProcessId` a partir de `$PID` até 24 saltos, retornando `int[]`.
   - `Find-PortOwner([int]$targetPort)`: usa `Get-NetTCPConnection -State Listen -LocalPort $targetPort` com fallback para `netstat -ano -p TCP`.
   - `Read-VerifiedRecordPid([string]$jsonPath)`: lê `{ pid, startTimeUtc }`, verifica que o processo existe via `Win32_Process` e que `CreationDate` bate com `startTimeUtc` dentro de `±1 s`; retorna `[int]$pid` ou `$null`.
   - `Wait-ProcessExit([int]$targetPid, [int]$timeoutSec)`: aguarda até `$timeoutSec` pelo desaparecimento do PID.
   - `Wait-PortFree([int]$targetPort, [int]$timeoutSec)`: aguarda até `$timeoutSec` até `Find-PortOwner $targetPort` retornar `$null`.
4. **Bloco `-Action Remove` (linhas 67–88):**
   - Trocar `& $launcher -Pause | Out-Null` por:
     ```powershell
     & $launcher -Pause -StateDir $StateDir | Out-Null
     ```
   - O restante do bloco permanece igual (o atalho já chama `& $controlInstaller -Uninstall`).
5. **Bloco `-Action Install` — Atalho e Argumentos da Task:**
   - Linha 111: `& $controlInstaller -InstallDir $PSScriptRoot -StateDir $StateDir | Out-Null`
   - Linhas 127–129 (`$arguments` da Scheduled Task): incluir `-Port` e `-StateDir`:
     ```powershell
     $arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ' + (& $quote $launcher) +
       ' -Port ' + [string]$Port +
       ' -StateDir ' + (& $quote $StateDir) +
       ' -DshUserProfile ' + (& $quote $profileRoot) + ' -DshHome ' + (& $quote $dshHome) +
       ' -NodePath ' + (& $quote $nodePath) + ' -TailscalePath ' + (& $quote $tailscalePath)
     ```
   - Linha 148 (limpeza de sentinels): usar `$stateRunDir`, nunca `$PSScriptRoot\run`:
     ```powershell
     Remove-Item (Join-Path $stateRunDir 'pause.sentinel'),(Join-Path $stateRunDir 'stop.sentinel') -Force -ErrorAction SilentlyContinue
     ```
6. **Bloco `-Action Install` — Handoff Determinístico de Supervisor de Outro Diretório (ANTES de `Register-ScheduledTask`):**
   Determinar:
   ```powershell
   $oldLauncherPath = if ($oldSupervisor) { Get-TaskLauncherPath $oldSupervisor } else { $null }
   $oldStateDir = if ($oldLauncherPath) { Get-TaskStateDir $oldSupervisor $oldLauncherPath } else { $null }
   $isCrossDirMigration = $oldLauncherPath -and ($oldLauncherPath -ine [IO.Path]::GetFullPath($launcher))
   ```
   - **Caso 1: `$isCrossDirMigration` é `$true`:**
     1. Ler `$oldManagedPid = Read-VerifiedRecordPid (Join-Path $oldStateDir 'run\dsh-web.json')` e `$oldSupervisorPid = Read-VerifiedRecordPid (Join-Path $oldStateDir 'run\supervisor.json')`.
     2. **Guarda anti-suicídio in-tree:** se `-not $SkipSelfTreeGuard` e `$oldManagedPid` estiver presente em `(Get-CurrentProcessAncestry)`:  
        `Write-Error "Cannot migrate from a different supervisor directory ($oldLauncherPath) while running inside its live DSH process tree (managed pid $oldManagedPid). Run cutover out-of-tree." -ErrorAction Continue` e `exit 6` (sem alterar `$ErrorActionPreference`).
     3. Se `$oldSupervisor.State -eq 'Running'`, chamar `Stop-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath -ErrorAction SilentlyContinue`.
     4. Se `Test-Path -LiteralPath $oldLauncherPath`: executar `& $powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $oldLauncherPath -Stop` (passando `-StateDir $oldStateDir` apenas se `$oldStateDir -ine (Split-Path $oldLauncherPath -Parent)`).
     5. Se `$oldSupervisorPid`: aguardar até `3 s` por `Wait-ProcessExit $oldSupervisorPid 3`; se ainda vivo e sua `CommandLine` contiver `dsh-web-launcher.ps1`, encerrar com `Stop-Process -Id $oldSupervisorPid -Force -ErrorAction SilentlyContinue` e aguardar mais `3 s`.
     6. Aguardar porta `$Port` livre por até `10 s`: `if (-not (Wait-PortFree $Port 10)) { Write-Error "Port $Port is still occupied after stopping previous supervisor ($oldLauncherPath). Aborting install to prevent split-brain." -ErrorAction Continue; exit 7 }`.
     7. Prosseguir para `Register-ScheduledTask -Force`, limpar sentinels em `$stateRunDir` e chamar `Start-ScheduledTask`.
   - **Caso 2: mesma pasta (`-not $isCrossDirMigration`):**
     - Checar se já existe supervisor vivo nesse mesmo `$StateDir`: `$sameSupPid = Read-VerifiedRecordPid (Join-Path $stateRunDir 'supervisor.json')` e `$sameManagedPid = Read-VerifiedRecordPid (Join-Path $stateRunDir 'dsh-web.json')`.
     - Se `$sameSupPid` já está vivo **e** `$sameManagedPid` está na ancestralidade do instalador (ou seja, re-clique no toggle pela GUI já migrada): apenas executar `Register-ScheduledTask -Force` + limpar sentinels em `$stateRunDir` (NÃO parar a task nem matar a árvore viva!).
     - Caso contrário (primeira instalação ou supervisor parado): comportamento padrão (`Stop-ScheduledTask` se `Running`, `Register-ScheduledTask -Force`, limpar sentinels, `Start-ScheduledTask`).

---

### 3.3 `dsh-control.ps1`, `install-control-shortcut.ps1`, `setup.cmd`, `control-dsh.cmd`

> **Lembrete:** todos 100% ASCII.

1. **`dsh-control.ps1`:**
   - Adicionar no topo:
     ```powershell
     param([string]$StateDir = '')
     $ErrorActionPreference = 'Stop'
     if (-not $StateDir -and $env:DSH_AUTOSTART_STATE_DIR) { $StateDir = $env:DSH_AUTOSTART_STATE_DIR }
     if (-not $StateDir) { $StateDir = $PSScriptRoot }
     $StateDir = [IO.Path]::GetFullPath($StateDir)
     ```
   - Em `Invoke-Launcher([string]$Action)` (linhas 26–29): passar `'-StateDir', $StateDir`:
     ```powershell
     function Invoke-Launcher([string]$Action) {
       try { return (& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $launcher $Action -StateDir $StateDir 2>&1 | Out-String).Trim() }
       catch { return $_.Exception.Message }
     }
     ```
   - No botão `Open Logs` (linha 91): trocar `Join-Path $PSScriptRoot 'logs'` por `Join-Path $StateDir 'logs'`.
2. **`install-control-shortcut.ps1`:**
   - Adicionar parâmetro `[string]$StateDir = ''`.
   - Se `$StateDir` for informado, normalizar com `[IO.Path]::GetFullPath(...)` e incluir no `$shortcut.Arguments`:
     ```powershell
     $shortcutArgs = '-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $controlScript + '"'
     if ($StateDir) { $shortcutArgs += ' -StateDir "' + $StateDir + '"' }
     $shortcut.Arguments = $shortcutArgs
     ```
3. **`setup.cmd`:**
   - Suportar `DSH_AUTOSTART_STATE_DIR` no ambiente e repassar `-StateDir` quando definido:
     ```bat
     @echo off
     setlocal
     set "SRC=%~dp0"
     set "STATE_ARG="
     if defined DSH_AUTOSTART_STATE_DIR set "STATE_ARG=-StateDir ^"%DSH_AUTOSTART_STATE_DIR%^""
     ```
     Anexar `%STATE_ARG%` em cada chamada `powershell.exe ...` (`install-supervisor.ps1`, `dsh-web-launcher.ps1`, `dsh-control.ps1`).
   - *(Nota: `startup.js` chamará `powershell.exe -File install-supervisor.ps1 ... -StateDir <stateDir>` diretamente em vez de depender de parsing de aspas do `cmd.exe`, enquanto `setup.cmd` continua funcionando para uso manual e rollback.)*
4. **`control-dsh.cmd`:**
   - Repassar `-StateDir "%DSH_AUTOSTART_STATE_DIR%"` quando `DSH_AUTOSTART_STATE_DIR` estiver definida.

---

### 3.4 `src/components/general-configs/startup.js` e `src/components/general-configs.js`

#### Exports e helpers novos em `src/components/general-configs/startup.js`
1. **Constantes de origem e destino:**
   - `DEFAULT_BUNDLE_AUTOSTART_ROOT`: `fileURLToPath(new URL("../../../components/general-configs/autostart", import.meta.url))`.
   - `DEFAULT_AUTOSTART_DIR`: manter exportado apontando para `join(DEFAULT_BUNDLE_AUTOSTART_ROOT, "dsh-autostart")` (compatibilidade com testes existentes como `test/toolkit.test.mjs:360`).
   - `LEGACY_AUTOSTART_DIR = "D:\\Projetos\\DeepSeekHarness\\dsh-autostart"`: **mantido na Fase 0a** (será removido na Fase 3).
   - `AUTOSTART_RUNTIME_FILES`: allowlist exata da seção 1.2.
   - `defaultAutostartStateDir(dshHomePathFn, onWarn)`:
     1. Se `process.env.DSH_AUTOSTART_STATE_DIR?.trim()` → retorna esse valor (nome unificado com os `.ps1`/`.cmd`).
     2. Senão, se `process.env.DSH_AUTOSTART_DIR?.trim()` → emite aviso via `onWarn` indicando depreciação em favor de `DSH_AUTOSTART_STATE_DIR` e retorna esse valor.
     3. Se `typeof dshHomePathFn === "function"` → tenta `dshHomePathFn("plugins", "spig-dsh-toolkit", "autostart")`.
     4. Fallback → `join(process.env.DSH_HOME?.trim() || join(homedir(), ".dsh"), "plugins", "spig-dsh-toolkit", "autostart")`.
2. **Cálculo de hash e sync atômico:**
   - `computeAutostartBundleSha256(sourceRoot)`:
     - Para cada `rel` em `AUTOSTART_RUNTIME_FILES` (já ordenado): lê `readFileSync(join(sourceRoot, rel))` e alimenta um `createHash("sha256")` com `rel + "\0"` + bytes + `"\0"`.
     - Retorna hex de 64 caracteres.
   - `readPackageVersion()`: lê `package.json` do root do plugin (`../../../package.json`) com fallback `"unknown"`.
   - `syncAutostartRuntime({ sourceRoot = DEFAULT_BUNDLE_AUTOSTART_ROOT, runtimeDir, packageVersion = readPackageVersion() })`:
     - Calcula `sourceSha256 = computeAutostartBundleSha256(sourceRoot)`.
     - Lê `manifestPath = join(runtimeDir, "manifest.json")` via `readJsonSafe`.
     - Verifica se `manifest?.sourceSha256 === sourceSha256` **E** se todos os arquivos de `AUTOSTART_RUNTIME_FILES` existem em `runtimeDir`.
     - Se sim → retorna `{ synced: false, upToDate: true, sourceSha256, runtimeDir, manifestPath }` (zero escrita em disco).
     - Se não:
       - Cria `runtimeDir` e `join(runtimeDir, "dsh-autostart")` com `mkdirSync(..., { recursive: true })` (**NUNCA** apaga `runtimeDir` antes!).
       - Para cada `rel` em `AUTOSTART_RUNTIME_FILES`: escreve em `${dest}.tmp-${process.pid}-${random}` e move com `renameSync(tmp, dest)` (limpa `tmp` no `catch`).
       - Calcula também `launcherSha256`: SHA-256 exclusivo de `dsh-autostart/dsh-web-launcher.ps1` (o script que permanece em memória no processo do supervisor). Preserva `previousManifest.launcherSyncedAt` quando `previousManifest?.launcherSha256 === launcherSha256`; só atualiza `launcherSyncedAt = now` na primeira sincronização ou quando `launcherSha256` mudar de fato.
       - Escreve `manifest.json` por último (também via temp + `renameSync`; `version: 1` na Fase 0a, incrementado para `version: 2` na Fase 0b):
         ```json
         {
           "version": 1,
           "packageVersion": "1.2.3",
           "sourceSha256": "<sha256>",
           "launcherSha256": "<sha256-do-dsh-web-launcher.ps1>",
           "syncedAt": "2026-11-26T...Z",
           "launcherSyncedAt": "2026-11-26T...Z",
           "files": ["..."]
         }
         ```
       - Retorna `{ synced: true, upToDate: true, sourceSha256, previousSha256: manifest?.sourceSha256 ?? null, runtimeDir, manifestPath }`.
3. **Descritores candidatos na Fase 0a (`candidateDescriptors`):**
   Em `createStartupController(options = {})`:
   - Aceitar:
     - `stateDir`: diretório base de estado (`options.stateDir || options.autostartDir || defaultAutostartStateDir(options.dshHomePath)`).
     - `bundleRoot`: default `DEFAULT_BUNDLE_AUTOSTART_ROOT`.
     - `legacyDir`: default `LEGACY_AUTOSTART_DIR` (se `options.includeLegacy === false`, omitir legado — essencial para testes offline determinísticos!).
     - `includeBundledFallback`: default `true` quando não desabilitado explicitamente.
     - `onWarn`: callback de log.
   - Derivar:
     - `runtimeDir = join(stateDir, "runtime")`
     - `runtimeAutostartDir = join(runtimeDir, "dsh-autostart")`
     - `bundleAutostartDir = join(bundleRoot, "dsh-autostart")`
   - Montar lista deduplicada de descritores:
     1. `staged`: `{ id: "staged", scriptPath: join(runtimeAutostartDir, "dsh-web-launcher.ps1"), stateDir, passStateDir: true }`
     2. `bundled` (se habilitado): `{ id: "bundled", scriptPath: join(bundleAutostartDir, "dsh-web-launcher.ps1"), stateDir: bundleAutostartDir, passStateDir: false }`
     3. `legacy` (se habilitado): `{ id: "legacy", scriptPath: join(legacyDir, "dsh-web-launcher.ps1"), stateDir: legacyDir, passStateDir: false }`
4. **Re-sync opt-in no mount (`syncRuntimeIfInstalled()`):**
   - Método exposto no controller retornado por `createStartupController`.
   - Lógica:
     ```js
     function syncRuntimeIfInstalled() {
       if (process.platform !== "win32") return { skipped: true, reason: "non-win32" };
       const hasManifest = existsSync(join(runtimeDir, "manifest.json"));
       const hasStagedLauncher = existsSync(join(runtimeAutostartDir, "dsh-web-launcher.ps1"));
       if (!hasManifest && !hasStagedLauncher) {
         return { skipped: true, reason: "not-installed" };
       }
       const res = syncAutostartRuntime({ sourceRoot: bundleRoot, runtimeDir });
       if (res.synced) {
         onWarn?.(
           `[autostart] runtime staged re-synced (${res.previousSha256?.slice(0, 8) ?? "none"} -> ${res.sourceSha256.slice(0, 8)}); wrapper changes apply on next DSH restart, launcher changes apply on next logon or supervisor restart.`
         );
       }
       return { skipped: false, ...res };
     }
     ```
   - Em `src/components/general-configs.js` dentro de `hostPlugin.apply(ctx, config = {})`:
     - Passar `dshHomePath` e `onWarn` para `createStartupController({ stateDir: config.autostartDir, dshHomePath, taskName: config.taskName, healthUrl: config.healthUrl, onWarn })`.
     - Chamar `try { startup.syncRuntimeIfInstalled(); } catch (err) { onWarn("autostart runtime sync failed: " + (err instanceof Error ? err.message : String(err))); }`.
5. **Paridade `getStatus()` ↔ `querySupervisor()`:**
   - Criar `resolveActiveStateDir()`: percorre `candidateDescriptors()` e escolhe o primeiro cujo `join(c.stateDir, "run", "dsh-web.json")` ou `join(c.stateDir, "run", "supervisor.json")` existe; se nenhum existir, retorna `stateDir` (o staged canônico).
   - `getStatus()`:
     - `available = process.platform === "win32" && existsSync(join(bundleAutostartDir, "install-supervisor.ps1"))` (**NUNCA** depende de `runtime/` já existir!).
     - Lê `supervisor.json`, `dsh-web.json` e `pause.sentinel` de `join(activeStateDir, "run")`.
     - Calcula `supervisorOutdated`: `true` somente quando `manifest?.launcherSyncedAt` e `supervisorMeta?.startTimeUtc` são datas válidas e `Date.parse(manifest.launcherSyncedAt) > Date.parse(supervisorMeta.startTimeUtc)` (evita falso positivo quando apenas `dsh-navegador.mjs` ou `local-web-proxy.mjs` mudou; só sinaliza reinício de supervisor quando `dsh-web-launcher.ps1` mudou de fato).
     - Retorna todos os campos atuais (`supported`, `available`, `autostartDir: stateDir`, `stateDir`, `activeStateDir`, `runtimeDir`, `runtimeSynced`, `supervisorOutdated`, `taskName`, `installed`, `taskState`, `paused`, `healthOk`, `healthStatus`, `healthUrl`, `supervisor`, `dshWeb`) para manter 100% de compatibilidade com `src/client/general-configs-client.js`.
   - `querySupervisor()`:
     - Percorre `candidateDescriptors()` na ordem `[staged, bundled, legacy]`.
     - Para cada descritor cujo `scriptPath` exista, executa:
       ```js
       const psArgs = ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", desc.scriptPath, "-Status"];
       if (desc.passStateDir) psArgs.push("-StateDir", desc.stateDir);
       ```
     - No objeto de retorno, incluir `dir: desc.stateDir`, `stateDir: desc.stateDir`, `scriptPath: desc.scriptPath`, `passStateDir: desc.passStateDir`, `source: desc.id`.
6. **`setEnabled(enabled)`:**
   - Se `enabled === true`:
     - Roda `syncAutostartRuntime({ sourceRoot: bundleRoot, runtimeDir })` primeiro.
     - Executa `powershellExe()` diretamente com:
       `["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(runtimeAutostartDir, "install-supervisor.ps1"), "-Action", "Install", "-StateDir", stateDir]`
       (`cwd: runtimeAutostartDir`, `windowsHide: true`, `timeout: 30000`).
   - Se `enabled === false`:
     - Usa `join(runtimeAutostartDir, "install-supervisor.ps1")` se existir; caso contrário fallback para `join(bundleAutostartDir, "install-supervisor.ps1")`.
     - Executa `powershellExe()` com `-Action Remove -StateDir <stateDir>`.
7. **`requestRestart()`:**
   - Loga tentativas em `logAttempt(stateDir, ...)` (sempre sob `$DSH_HOME`, nunca no repo!).
   - Em vez de exigir `existsSync(stagedLauncher)` antes de consultar, verifica que existe ao menos um descritor válido (bundle ou staged).
   - No branch `remote-restart` (`!supervisor.inManagedTree && supervisor.supervisorRunning`), usa `supervisor.scriptPath` e acrescenta `["-StateDir", supervisor.stateDir]` se `supervisor.passStateDir === true`.

---

### 3.5 `.gitignore`
Adicionar defensivamente ao final de `.gitignore`:
```gitignore
components/general-configs/autostart/dsh-autostart/run/
components/general-configs/autostart/dsh-autostart/logs/
components/general-configs/autostart/dsh-autostart/backup/
```

---

### 3.6 Testes Obrigatórios da Fase 0a (`test/toolkit.test.mjs` + `test/autostart-startup.test.mjs`)
0. **Isolar `test/toolkit.test.mjs` já na Fase 0a:** atualizar o teste `querySupervisor never throws...` para passar `{ stateDir: dir, includeLegacy: false, includeBundledFallback: false }` — assim o `npm test` para imediatamente de criar `logs/` dentro do repo e de consultar o supervisor de produção a cada execução (economizando ~9 s).

Criar `test/autostart-startup.test.mjs` cobrindo **todos** os itens abaixo (100% offline, usando `mkdtempSync`, sem tocar na porta `3080` nem no supervisor vivo):

1. **`syncAutostartRuntime`:**
   - Copia exatamente `AUTOSTART_RUNTIME_FILES`, grava `manifest.json` válido e não copia `run/`/`logs/`/`backup/`.
   - Segunda chamada sem alterações retorna `{ synced: false, upToDate: true }` (sem reescrever `syncedAt`).
   - Alteração em qualquer arquivo do bundle (em diretório temporário copiado) ou remoção de um arquivo em `runtime/` dispara re-sync (`synced: true`) e atualiza `sourceSha256`.
2. **`syncRuntimeIfInstalled()` (opt-in no mount):**
   - Em `stateDir` vazio (usuário nunca ligou Startup): retorna `{ skipped: true, reason: "not-installed" }` e **NUNCA cria** pasta `runtime/`.
   - Em `stateDir` já com `manifest.json` desatualizado: re-sincroniza, chama `onWarn` avisando sobre próximo restart e preserva `run/`/`logs/` existentes intactos.
3. **Paridade `getStatus()` ↔ `querySupervisor()`:**
   - Em `stateDir` vazio (antes do staging): `getStatus().available === (process.platform === "win32")`, `supervisor === null`, `dshWeb === null`, `paused === false`.
   - Com `run/supervisor.json`, `run/dsh-web.json` e `run/pause.sentinel` sintéticos no `stateDir` (com `includeLegacy: false, includeBundledFallback: false`): `getStatus()` lê exatamente esses registros.
4. **Testes reais dos scripts `.ps1` em Windows (isolados com `-StateDir <tmpDir>` e `-Port 59991`, `skip` se não-win32):**
   - `dsh-web-launcher.ps1 -Status -StateDir <tmpDir> -Port 59991`:
     - Retorna JSON válido com `paused: false, supervisorRunning: false, dshRunning: false, stateDir: <tmpDir>`.
     - **Prova de read-only:** `existsSync(join(tmpDir, "run")) === false` e `existsSync(join(tmpDir, "logs")) === false` após `-Status`!
   - `dsh-web-launcher.ps1 -Pause -StateDir <tmpDir> -Port 59991` seguido de `-Status`:
     - Cria `run/pause.sentinel` dentro de `<tmpDir>` (e **NÃO** dentro do repo!), e `-Status` retorna `paused: true`.
5. **Guardas do instalador, sem consultar ou alterar tarefas reais:**
   - `Install` e `Remove` com `-Port 59991` são recusados no binding de parâmetros antes de efeitos no runtime, no sistema ou na rede. Esse uso negativo do parâmetro não inicia nenhum launcher; a única utilização operacional de `59991` é nos testes isolados de `-Status` e `-Pause`.
   - Em um processo PowerShell isolado, simular ancestralidade do wrapper antigo e porta ocupada, com comandos de efeitos externos substituídos por fakes, e verificar os códigos de saída reais `6` e `7` sem alterar a preferência global de erro.
6. **Contratos estáticos dos `.ps1` / `.cmd`:**
   - Todos os `.ps1` e `.cmd` em `components/general-configs/autostart/` contêm **apenas bytes ASCII (`<= 0x7F`)**.
   - `dsh-web-launcher.ps1` contém mutex `Local\dsh-autostart-p` com `$script:DshHome` (não faz mais hash de `$PSScriptRoot`), guarda `if (Get-SupervisorProcess)` dentro de `if ($Start)`, e repassa `'-StateDir'` em `Start-SupervisorProcess`.
   - `install-supervisor.ps1` contém guarda anti-suicídio (`Get-CurrentProcessAncestry`, `exit 6`), `Wait-PortFree`, `DSH_FIXED_WEB_SHIM_V1`, `RestartCount 999`, e usa `$StateDir` para `backup`, `run\pause.sentinel`, `-Pause` e `install-control-shortcut.ps1`.

### 3.7 Gate de Saída da Fase 0a
```powershell
npm run check && npm test
$env:GIT_CONFIG_COUNT='0'; git status --short
```
- Todos os testes (anteriores + novos) DEVEM passar.
- Zero arquivos modificados fora do escopo da Fase 0a.
- Commitar como **Commit 1** (`Stage autostart runtime and state under DSH_HOME`).

---

## 4. Fase 1 — Cutover Controlado Nesta Máquina (~15–20 s de Downtime)

> **ATENÇÃO CRÍTICA:** Antes de disparar a Fase 1, avise o usuário que a Web GUI cairá por ~15–20 s durante a troca do supervisor e confirme se ele prefere **(b) task agendada temporária** (padrão) ou **(a) execução manual** num terminal externo.

### 4.1 Por que a Task Temporária Funciona
Uma Scheduled Task disparada pelo serviço `Schedule` nasce sob `svchost.exe` (fora da cadeia de `ParentProcessId` do `dsh-navegador.mjs` legado). Quando o script roda `D:\Projetos\DeepSeekHarness\dsh-autostart\setup.cmd -stop`, o `taskkill /T` mata apenas a árvore do DSH legado — **o script de cutover sobrevive**, conclui a instalação do novo supervisor staged, valida `/__dsh_health`, faz rollback automático se algo der errado e apaga a própria task temporária no `finally`.

### 4.2 Script de Cutover (`cutover-phase1.ps1`)
Gravar este script em `%USERPROFILE%\.dsh\plugins\spig-dsh-toolkit\autostart\cutover-phase1.ps1` (**fora do repo**, 100% ASCII):

```powershell
$ErrorActionPreference = 'Stop'

$repoRoot     = 'D:\Projetos\spig-dsh-toolkit'
$legacyDir    = 'D:\Projetos\DeepSeekHarness\dsh-autostart'
$dshHome      = if ($env:DSH_HOME) { [IO.Path]::GetFullPath($env:DSH_HOME) } else { Join-Path $env:USERPROFILE '.dsh' }
$stateDir     = Join-Path $dshHome 'plugins\spig-dsh-toolkit\autostart'
$runtimeDir   = Join-Path $stateDir 'runtime'
$stagedDir    = Join-Path $runtimeDir 'dsh-autostart'
$logsDir      = Join-Path $stateDir 'logs'
$logFile      = Join-Path $logsDir 'cutover.log'
$tempTaskName = 'DSH Autostart Cutover Temp'
$psExe        = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

function Write-CutoverLog([string]$msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

function Test-Health200 {
  try {
    $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:3080/__dsh_health' -UseBasicParsing -TimeoutSec 3
    return ($resp.StatusCode -eq 200)
  } catch { return $false }
}

function Wait-Health([int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Health200) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Get-Port3080Owner {
  try {
    $c = Get-NetTCPConnection -State Listen -LocalPort 3080 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return [int]$c.OwningProcess }
  } catch {}
  return $null
}

function Read-Json([string]$p) {
  if (-not (Test-Path -LiteralPath $p)) { return $null }
  try { return Get-Content -LiteralPath $p -Raw | ConvertFrom-Json } catch { return $null }
}

# Windows PowerShell 5.1 turns any native stderr line under 2>&1 into a
# terminating NativeCommandError when ErrorActionPreference is Stop.
# Always run native executables under Continue and decide solely by LASTEXITCODE.
function Invoke-Native([string]$FilePath, [string[]]$ArgumentList) {
  $prevPref = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = (& $FilePath @ArgumentList 2>&1 | Out-String).Trim()
    $code = $LASTEXITCODE
    return [pscustomobject]@{ ExitCode = $code; Output = $out }
  } finally {
    $ErrorActionPreference = $prevPref
  }
}

Write-CutoverLog '=== PHASE 1 CUTOVER START ==='
Write-CutoverLog "Cutover PID=$PID StateDir=$stateDir"

$stage = 'init'
$exitCode = 0

try {
  # 1. Pre-cutover snapshot
  $legacySup = Read-Json (Join-Path $legacyDir 'run\supervisor.json')
  $legacyWeb = Read-Json (Join-Path $legacyDir 'run\dsh-web.json')
  $oldTask = Get-ScheduledTask -TaskName 'DSH Browser Supervisor' -ErrorAction SilentlyContinue
  Write-CutoverLog "Pre-snapshot: legacySupPid=$($legacySup.pid) legacyWebPid=$($legacyWeb.pid) taskState=$($oldTask.State) taskArgs=$($oldTask.Actions[0].Arguments)"

  # 2. Sync runtime using production syncAutostartRuntime()
  $nodeExe = (Get-Command node -ErrorAction Stop).Source
  $syncScript = "import { syncAutostartRuntime } from './src/components/general-configs/startup.js'; const r = syncAutostartRuntime({ runtimeDir: process.argv[1] }); console.log(JSON.stringify(r));"
  Push-Location $repoRoot
  try {
    $syncRes = Invoke-Native $nodeExe @('-e', $syncScript, $runtimeDir)
    if ($syncRes.ExitCode -ne 0) { throw "syncAutostartRuntime failed (exit $($syncRes.ExitCode)): $($syncRes.Output)" }
    Write-CutoverLog "Runtime synced: $($syncRes.Output)"
  } finally { Pop-Location }
  $stage = 'synced'

  # 3. Stop legacy supervisor + managed wrapper
  Write-CutoverLog 'Stopping legacy supervisor via setup.cmd -stop...'
  $stage = 'legacy-stopping'
  $stopRes = Invoke-Native 'cmd.exe' @('/d', '/c', (Join-Path $legacyDir 'setup.cmd'), '-stop')
  Write-CutoverLog "Legacy stop (exit $($stopRes.ExitCode)): $($stopRes.Output)"

  # Confirm legacy supervisor process exits; force-kill verified PID if still sleeping
  if ($legacySup -and $legacySup.pid) {
    $supPid = [int]$legacySup.pid
    $deadline = (Get-Date).AddSeconds(4)
    while ((Get-Date) -lt $deadline -and (Get-Process -Id $supPid -ErrorAction SilentlyContinue)) {
      Start-Sleep -Milliseconds 300
    }
    $stillAlive = Get-CimInstance Win32_Process -Filter "ProcessId = $supPid" -ErrorAction SilentlyContinue
    if ($stillAlive -and $stillAlive.CommandLine -like '*dsh-web-launcher.ps1*') {
      Write-CutoverLog "Legacy supervisor pid $supPid still alive after -stop; stopping verified process."
      Stop-Process -Id $supPid -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 1
    }
  }

  # Wait up to 15s for port 3080 to be free
  $portDeadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $portDeadline -and (Get-Port3080Owner)) {
    Start-Sleep -Milliseconds 500
  }
  $owner = Get-Port3080Owner
  if ($owner) { throw "Port 3080 still occupied by PID $owner after stopping legacy supervisor." }
  Write-CutoverLog 'Confirmed: port 3080 is free.'
  $stage = 'legacy-stopped'

  # 4. Install and start staged supervisor
  $installer = Join-Path $stagedDir 'install-supervisor.ps1'
  Write-CutoverLog "Running staged installer: $installer -Action Install -StateDir $stateDir"
  # Mark staged-installing BEFORE invoking the installer: install-supervisor.ps1
  # registers and starts the staged task before returning, so any failure after
  # that point MUST still run staged -Stop / -Action Remove to prevent split-brain.
  $stage = 'staged-installing'
  $instRes = Invoke-Native $psExe @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $installer, '-Action', 'Install', '-StateDir', $stateDir)
  if ($instRes.ExitCode -ne 0) { throw "Staged install failed (exit $($instRes.ExitCode)): $($instRes.Output)" }
  Write-CutoverLog "Staged install output: $($instRes.Output)"
  $stage = 'staged-installed'

  # 5. Wait for /__dsh_health HTTP 200 (up to 45s)
  Write-CutoverLog 'Waiting up to 45s for http://127.0.0.1:3080/__dsh_health ...'
  if (-not (Wait-Health 45)) {
    throw 'Health check did not return 200 within 45s after staged install.'
  }

  $newSup = Read-Json (Join-Path $stateDir 'run\supervisor.json')
  $newWeb = Read-Json (Join-Path $stateDir 'run\dsh-web.json')
  Write-CutoverLog "SUCCESS: health 200 OK. newSupPid=$($newSup.pid) newWebPid=$($newWeb.pid)"
  Write-CutoverLog '=== PHASE 1 CUTOVER SUCCEEDED ==='
} catch {
  $exitCode = 1
  Write-CutoverLog "ERROR at stage [$stage]: $($_.Exception.Message)"
  if ($stage -in @('legacy-stopping', 'legacy-stopped', 'staged-installing', 'staged-installed')) {
    Write-CutoverLog 'Initiating automatic rollback to legacy supervisor...'
    try {
      if ($stage -in @('staged-installing', 'staged-installed')) {
        $stagedLauncher = Join-Path $stagedDir 'dsh-web-launcher.ps1'
        if (Test-Path -LiteralPath $stagedLauncher) {
          Invoke-Native $psExe @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $stagedLauncher, '-Stop', '-StateDir', $stateDir) | Out-Null
        }
        $stagedInstaller = Join-Path $stagedDir 'install-supervisor.ps1'
        if (Test-Path -LiteralPath $stagedInstaller) {
          Invoke-Native $psExe @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $stagedInstaller, '-Action', 'Remove', '-StateDir', $stateDir) | Out-Null
        }
      }
      Remove-Item (Join-Path $legacyDir 'run\pause.sentinel'),(Join-Path $legacyDir 'run\stop.sentinel') -Force -ErrorAction SilentlyContinue
      $rbRes = Invoke-Native 'cmd.exe' @('/d', '/c', (Join-Path $legacyDir 'setup.cmd'))
      Write-CutoverLog "Rollback setup (exit $($rbRes.ExitCode)): $($rbRes.Output)"
      $rbOk = Wait-Health 45
      Write-CutoverLog "Rollback health 200: $rbOk"
    } catch {
      Write-CutoverLog "ROLLBACK ERROR: $($_.Exception.Message)"
    }
  } else {
    Write-CutoverLog 'Failure occurred before stopping legacy supervisor; skipping rollback (legacy remains intact).'
  }
} finally {
  try {
    Unregister-ScheduledTask -TaskName $tempTaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-CutoverLog 'Removed temporary cutover scheduled task.'
  } catch {}
}
exit $exitCode
```

### 4.3 Disparo da Task Agendada Temporária — Opção (b)
```powershell
$scriptPath = Join-Path $env:USERPROFILE '.dsh\plugins\spig-dsh-toolkit\autostart\cutover-phase1.ps1'
$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$actionArgs = '-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $scriptPath + '"'
$action = New-ScheduledTaskAction -Execute $psExe -Argument $actionArgs
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName 'DSH Autostart Cutover Temp' -Action $action -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'DSH Autostart Cutover Temp'
```
> Logo após `Start-ScheduledTask`, aguarde ~20–30 s e recarregue `http://127.0.0.1:3080` (a sessão voltará sob o novo supervisor). Em seguida, inspecione `%USERPROFILE%\.dsh\plugins\spig-dsh-toolkit\autostart\logs\cutover.log` e remova `cutover-phase1.ps1` após confirmar sucesso.

### 4.4 Alternativa Manual — Opção (a)
Caso o usuário prefira rodar fora do DSH: abrir um **PowerShell externo** (fora do DSH) e executar:
```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.dsh\plugins\spig-dsh-toolkit\autostart\cutover-phase1.ps1"
```

---

## 5. Fase 2 — Verificação Rigorosa Pós-Cutover (Go / No-Go)

Rodar o bloco de auditoria abaixo e conferir **TODOS os 9 critérios** antes de iniciar a Fase 3:

```powershell
$stateDir = Join-Path $env:USERPROFILE '.dsh\plugins\spig-dsh-toolkit\autostart'

Write-Host '--- 1. Cutover log tail ---'
Get-Content (Join-Path $stateDir 'logs\cutover.log') -Tail 25

Write-Host '--- 2. Active supervisors (MUST be exactly 1, from staged runtime) ---'
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*dsh-web-launcher.ps1*' } | Select-Object ProcessId, ParentProcessId, CommandLine | Format-List

Write-Host '--- 3. Port 3080 owner & wrapper CommandLine ---'
$owner = (Get-NetTCPConnection -State Listen -LocalPort 3080 -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
Get-CimInstance Win32_Process -Filter "ProcessId = $owner" | Select-Object ProcessId, ParentProcessId, CommandLine | Format-List

Write-Host '--- 4. Staged state JSONs & sentinels ---'
Get-Content (Join-Path $stateDir 'run\supervisor.json')
Get-Content (Join-Path $stateDir 'run\dsh-web.json')
Test-Path (Join-Path $stateDir 'run\pause.sentinel')
Test-Path (Join-Path $stateDir 'run\stop.sentinel')

Write-Host '--- 5. Scheduled Tasks (main + ensure temp removed) ---'
(Get-ScheduledTask -TaskName 'DSH Browser Supervisor').Actions | Select-Object Execute, Arguments, WorkingDirectory | Format-List
Get-ScheduledTask -TaskName 'DSH Autostart Cutover Temp' -ErrorAction SilentlyContinue

Write-Host '--- 6. dsh.cmd shim & User PATH duplicates ---'
Get-Content "$env:LOCALAPPDATA\Programs\DSH-Web-Command\dsh.cmd"
([Environment]::GetEnvironmentVariable('Path', 'User') -split ';' | Where-Object { $_ -like '*DSH-Web-Command*' }).Count

Write-Host '--- 7. DSH Control.lnk shortcut ---'
$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'DSH Control.lnk'))
[pscustomobject]@{ Target=$lnk.TargetPath; Args=$lnk.Arguments; WorkDir=$lnk.WorkingDirectory } | Format-List

Write-Host '--- 8. Latest launcher log (check ZERO portCollision) ---'
$latestLog = Get-ChildItem (Join-Path $stateDir 'logs\launcher-*.log') | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Get-Content $latestLog.FullName -Tail 30
```

### Checklist Go / No-Go (Todos Obrigatórios)
- [ ] **1. `cutover.log`** terminou com `=== PHASE 1 CUTOVER SUCCEEDED ===` e a task temporária `DSH Autostart Cutover Temp` não existe mais.
- [ ] **2. Unicidade do supervisor:** exatamente **1** processo `dsh-web-launcher.ps1`, rodando de `%USERPROFILE%\.dsh\plugins\spig-dsh-toolkit\autostart\runtime\dsh-autostart\dsh-web-launcher.ps1` com `-StateDir`.
- [ ] **3. Porta `3080` e JSONs:** `run/supervisor.json` e `run/dsh-web.json` no `$stateDir` batem com os PIDs vivos; `pause.sentinel` e `stop.sentinel` ausentes no `$stateDir\run\`; `pause.sentinel` presente no diretório legado.
- [ ] **4. Task `DSH Browser Supervisor`:** `Arguments` e `WorkingDirectory` apontam para `runtime\dsh-autostart` e passam `-StateDir`.
- [ ] **5. Artefatos auxiliares:** `dsh.cmd` aponta para `runtime\dsh-navegador.mjs`; `DSH Control.lnk` aponta para `runtime\dsh-autostart\dsh-control.ps1` com `-StateDir`; `DSH-Web-Command` aparece exatamente 1 vez no `User PATH`.
- [ ] **6. Zero `portCollision`:** o `launcher-*.log` mais recente não tem mensagens de `refusing to adopt or kill it`.
- [ ] **7. API do plugin:** `querySupervisor()` retorna `managed: true, supervisorRunning: true, inManagedTree: true, source: "staged"`; `getStatus()` retorna `available: true, installed: true, healthOk: true, paused: false`, com `supervisor.pid` e `dshWeb.pid` preenchidos.
- [ ] **8. Teste real do botão Restart na Web GUI:** clicar no botão vermelho **Restart** → `method: "suicide"`, queda e retorno de `/__dsh_health` (~15 s), nova linha em `$stateDir\run\restart-attempts.log`, novo `dsh-web.json` PID mantendo o **mesmo** supervisor PID.
- [ ] **9. Repositório git limpo:** nenhum novo arquivo em `components/general-configs/autostart/dsh-autostart/run/`, `logs/` ou `backup/`. (Também remover `cutover-phase1.ps1` após auditoria.)

> **Se qualquer item falhar:** NÃO avance para a Fase 3. Diagnostique ou execute a Fase 4 (Rollback).

---

## 6. Fase 3 — Remoção do Fallback Legado + Vacinas + Docs (Commit 2)

Executar somente após todos os 9 checks da Fase 2 passarem:

1. **`src/components/general-configs/startup.js`:**
   - Remover `LEGACY_AUTOSTART_DIR` completamente.
   - Simplificar `candidateDescriptors()` para usar **somente** o descritor `staged` (`scriptPath: join(runtimeAutostartDir, "dsh-web-launcher.ps1")`, `stateDir`, `passStateDir: true`).
   - Remover a lógica de fallback para `bundled` e `legacy` em `getStatus()` e `querySupervisor()`.
2. **Limpar resíduos antigos no repositório:**
   - Apagar `components/general-configs/autostart/dsh-autostart/run/` (com `restart-attempts.log`) e o diretório vazio `components/general-configs/autostart/dsh-autostart/logs/` dentro do repo.
   - *(Nota: a pasta externa `D:\Projetos\DeepSeekHarness\dsh-autostart` permanece no disco como rollback até decisão explícita do usuário, com relatório prévio.)*
3. **Atualizar testes + adicionar vacina anti-paths hardcoded:**
   - Confirmar que `querySupervisor never throws...` em `test/toolkit.test.mjs` continua isolado no `stateDir` temporário (sem opções de fallback legado).
   - Adicionar em `test/autostart-startup.test.mjs` o teste **vacina estática permanente** que varre todos os arquivos de texto em `src/`, `lib/` e `components/` (ignorando `node_modules` e fora de `test/`) e falha se encontrar qualquer padrão proibido (tanto `\` quanto `/`, prevenindo regressões como `D:/Projetos/...`):
     - `/[A-Za-z]:[\\/](Projetos|Users)[\\/]/i`
     - `/LEGACY_AUTOSTART_DIR/`
4. **Atualizar `docs/ARCHITECTURE.md`:**
   - Substituir a nota das linhas 39–47 que menciona `D:\Projetos\DeepSeekHarness\dsh-autostart` pela descrição da arquitetura staged (`bundle imutável → $DSH_HOME/plugins/spig-dsh-toolkit/autostart/{runtime,run,logs,backup}` + re-sync por SHA no mount + restart por suicídio gracioso).
5. **Gate e Commit 2:**
   ```powershell
   npm run check && npm test
   $env:GIT_CONFIG_COUNT='0'; git status --short
   ```
   Commitar como **Commit 2** (`Remove legacy autostart fallback after cutover`).

---

## 7. Fase 0b — Portabilidade para PC Novo + `-BindMode` (Commit 3)

Esta fase torna o plugin pronto para qualquer PC Windows limpo sem quebrar o acesso LAN + Tailscale desta máquina.

### 7.1 Configuração persistida (`$StateDir\config.json`)
Schema:
```json
{
  "version": 1,
  "bindMode": "loopback"
}
```
Valores válidos para `bindMode`: `"loopback"` | `"lan-tailscale"`.

**Regra de resolução de `$BindMode` em `install-supervisor.ps1`:**
1. Se `-BindMode` foi passado explicitamente na linha de comando → usar esse valor.
2. Senão, se `$StateDir\config.json` existe e tem `bindMode` válido → usar o valor persistido.
3. Senão, se já existia a Task `DSH Browser Supervisor` sem `-BindMode` (upgrade de instalação existente nesta máquina) → usar `"lan-tailscale"` para não quebrar acesso remoto existente.
4. Senão (instalação nova em PC limpo) → default **`"loopback"`**.
5. Em todos os casos, gravar `{ "version": 1, "bindMode": <resolvido> }` atomicamente em `$StateDir\config.json`.

### 7.2 Alterações por arquivo na Fase 0b
1. **`components/general-configs/autostart/dsh-autostart/install-supervisor.ps1`:**
   - Novos parâmetros:
     ```powershell
     [ValidateSet('', 'loopback', 'lan-tailscale')]
     [string]$BindMode = '',
     [string]$DshInstallDir = '',
     [string]$NodePath = ''
     ```
   - **`tailscale` opcional:** trocar `(Get-Command tailscale -ErrorAction Stop).Source` por:
     ```powershell
     $tailscaleCmd = Get-Command tailscale -ErrorAction SilentlyContinue
     $tailscalePath = if ($tailscaleCmd -and $tailscaleCmd.Source -and (Test-Path -LiteralPath $tailscaleCmd.Source)) { $tailscaleCmd.Source } else { '' }
     ```
     E remover o `throw` quando `$tailscalePath` estiver vazio. Só incluir `-TailscalePath` nos argumentos da Task quando `$tailscalePath` não for vazio.
   - **Descoberta portátil de `node.exe`:**
     1. `-NodePath` (se informado e existir)
     2. `(Get-Command node -ErrorAction SilentlyContinue).Source`
     3. `Join-Path $env:ProgramFiles 'nodejs\node.exe'`
     4. `Join-Path $localAppData 'Programs\nodejs\node.exe'`
     5. Se nenhum existir → lançar erro claro: `"Node.js was not found in PATH or standard install locations. Install Node.js (LTS) or pass -NodePath."`
   - **Descoberta portátil de `DeepSeek Harness.exe`:**
     1. `-DshInstallDir` (se informado)
     2. `$env:DSH_INSTALL_DIR` (se definido)
     3. `Join-Path $localAppData 'Programs\DeepSeek Harness'`
     4. `Join-Path $env:ProgramFiles 'DeepSeek Harness'`
     5. Se `${env:ProgramFiles(x86)}`: `Join-Path ${env:ProgramFiles(x86)} 'DeepSeek Harness'`
     6. Validar `DeepSeek Harness.exe` e `resources\runtime\cli\bin\dsh.cmd` no diretório encontrado.
   - Passar `-BindMode`, `-DshInstallDir` (e `-TailscalePath` se presente) nos argumentos da Task.
   - Atualizar `Install-DshCommandShim` para gravar `set "DSH_BIND_MODE=__BIND_MODE__"` e `set "DSH_INSTALL_DIR=__DSH_INSTALL_DIR__"` no `dsh.cmd`, mantendo o marcador `REM DSH_FIXED_WEB_SHIM_V1` intacto.
   - Ajustar descrição da Task e mensagem de saída conforme `$effectiveBindMode` (`127.0.0.1` vs `LAN and Tailscale`).
2. **`components/general-configs/autostart/dsh-autostart/dsh-web-launcher.ps1`:**
   - Novos parâmetros: `[ValidateSet('', 'loopback', 'lan-tailscale')][string]$BindMode = ''` e `[string]$DshInstallDir = ''`.
   - Repassar `-BindMode` e `-DshInstallDir` (quando não vazios) em `Start-SupervisorProcess`.
   - Em `Start-DataNode`:
     - Exportar `$env:DSH_BIND_MODE = $script:BindMode` (se definido; ou ler de `$StateDir\config.json` como fallback).
     - Exportar `$env:DSH_INSTALL_DIR = $script:DshInstallDir` (se definido).
     - Exportar `$env:DSH_TAILSCALE_PATH` apenas quando `$script:TailscalePath` não for vazio.
3. **`components/general-configs/autostart/dsh-navegador.mjs` (ESM — SEM `__dirname`, proteção contra queda silenciosa de LAN/Tailscale):**
   - **ATENÇÃO:** `dsh-navegador.mjs` é módulo ESM; `__dirname` **não existe**. Usar `fileURLToPath(new URL('..', import.meta.url))` (importando `fileURLToPath` de `'node:url'`). No layout staged (`<stateDir>\runtime\dsh-navegador.mjs`), `new URL('..', import.meta.url)` resolve exatamente para `<stateDir>`. Além disso, `dsh-web-launcher.ps1` já exporta `DSH_AUTOSTART_STATE_DIR` em `Start-DataNode`.
   - Ordem de precedência exata para resolver `bindMode`:
     ```js
     import { fileURLToPath } from 'node:url';
     // ...
     function resolveBindMode() {
       const envMode = String(process.env.DSH_BIND_MODE || '').trim().toLowerCase();
       if (envMode === 'loopback' || envMode === 'lan-tailscale') return envMode;
       const stateDir = process.env.DSH_AUTOSTART_STATE_DIR?.trim()
         || fileURLToPath(new URL('..', import.meta.url));
       try {
         const cfg = JSON.parse(readFileSync(path.join(stateDir, 'config.json'), 'utf8'));
         if (cfg?.bindMode === 'loopback' || cfg?.bindMode === 'lan-tailscale') return cfg.bindMode;
       } catch {}
       if (process.env.DSH_BIND_HOST === '0.0.0.0') return 'lan-tailscale';
       // Fallback legado se nem env nem config.json existirem (execucao manual fora do staged).
       return 'lan-tailscale';
     }
     const bindMode = resolveBindMode();
     const bindAddress = bindMode === 'lan-tailscale' ? '0.0.0.0' : '127.0.0.1';
     const proxy = new LocalWeb(bindAddress, localHostNames);
     ```
   - Só executar `refreshTailnet()` e `setInterval(refreshTailnet, 15000)` quando `bindMode === 'lan-tailscale'` (em modo `loopback`, nem sequer invoca `tailscale`).
4. **`src/components/general-configs/startup.js` (manifest `version: 2` + guarda anti-exposição LAN em PC novo):**
   - Incrementar a constante de versão do `manifest.json` em `syncAutostartRuntime()` de `1` para **`2`** (`AUTOSTART_MANIFEST_VERSION = 2`).
   - Em `syncRuntimeIfInstalled()`:
     - Ler `previousManifest = readJsonSafe(join(runtimeDir, "manifest.json"))` **antes** do sync.
     - Somente se `previousManifest?.version === 1` **E** `!existsSync(join(stateDir, "config.json"))` (prova inequívoca de upgrade de runtime pré-0b), gravar atomicamente `{ "version": 1, "bindMode": "lan-tailscale" }` em `join(stateDir, "config.json")` **antes** de copiar o novo wrapper.
     - Se `previousManifest?.version >= 2` ou se `config.json` já existir, **nunca** gravar `lan-tailscale` nem sobrescrever `config.json`.
   - Em `setEnabled(true, { bindMode })`:
     - Quando `!existsSync(join(stateDir, "config.json"))` e `!existsSync(join(runtimeDir, "manifest.json"))` (instalação nova em PC limpo), gravar atomicamente `{ "version": 1, "bindMode": bindMode || "loopback" }` **antes** de rodar `syncAutostartRuntime()` e `install-supervisor.ps1`. Assim, mesmo que `install-supervisor.ps1` falhe (ex.: `node.exe` ausente), `config.json` já está fixado em `loopback` e `manifest.json` já nasce em `version: 2` — impossibilitando exposição acidental na LAN.
     - Passar `-BindMode` ao `install-supervisor.ps1` quando explicitado.
   - Ler `bindMode` de `join(stateDir, "config.json")` em `getStatus()` (expor `bindMode: config?.bindMode ?? null`).
5. **Nesta máquina (preservar LAN + Tailscale):**
   - Como o runtime da Fase 0a tem `manifest.version === 1` e ainda não tem `config.json`, ao aplicar a Fase 0b o `syncRuntimeIfInstalled()` grava automaticamente `config.json` com `"bindMode": "lan-tailscale"` e atualiza o manifest para `version: 2` antes de copiar o novo wrapper. Quando desejar também atualizar a Task `DSH Browser Supervisor`, rodar `install-supervisor.ps1 -Action Install -StateDir $stateDir -BindMode lan-tailscale`.

### 7.3 Testes Obrigatórios da Fase 0b (`test/autostart-startup.test.mjs`)
1. **`LocalWeb` (`local-web-proxy.mjs`):**
   - Instanciado com `'127.0.0.1'`: `allowedPeer('127.0.0.1') === true`, `allowedPeer('192.168.1.50') === false`.
   - Instanciado com `'0.0.0.0'`: loopback permitido, tailnet peer configurado via `setTailnetPeers` permitido, IP público arbitrário (`8.8.8.8`) rejeitado.
2. **Preservação de upgrade pré-0b → 0b vs. proteção de PC novo:**
   - `syncRuntimeIfInstalled()` em `stateDir` com `manifest.json` `version: 1` e sem `config.json` → cria `config.json` com `"bindMode": "lan-tailscale"` e atualiza manifest para `version: 2`.
   - `syncRuntimeIfInstalled()` em `stateDir` com `manifest.json` `version: 2` e sem `config.json` (simula PC novo cuja instalação falhou após sync) → **NÃO** cria `config.json` com `lan-tailscale`.
   - `syncRuntimeIfInstalled()` em `stateDir` que já tem `config.json` com `"bindMode": "loopback"` → preserva `"loopback"` intacto.
3. **Contratos de portabilidade:**
   - `install-supervisor.ps1` NÃO contém `Get-Command tailscale -ErrorAction Stop`.
   - `install-supervisor.ps1` contém busca de `DeepSeek Harness` em `LocalAppData` e `ProgramFiles`, e grava `config.json` com default `loopback` para instalações novas.
   - `dsh-navegador.mjs` respeita `DSH_BIND_MODE` e faz fallback para `config.json` no `stateDir` quando a variável está vazia (`loopback` → `'127.0.0.1'` sem Tailscale; `lan-tailscale` → `'0.0.0.0'` com Tailscale).
   - Todos os `.ps1`/`.cmd` continuam 100% ASCII.

### 7.4 Gate e Commit 3
```powershell
npm run check && npm test
$env:GIT_CONFIG_COUNT='0'; git status --short
```
Commitar como **Commit 3** (`Add autostart BindMode and portable binary discovery`).

---

## 8. Fase 4 — Runbook de Rollback Determinístico

Se em qualquer momento após a Fase 1 for necessário voltar ao supervisor legado (`D:\Projetos\DeepSeekHarness\dsh-autostart`, que nunca é apagado nem modificado durante a migração):

1. Abrir um **PowerShell externo** (fora do DSH) e executar:
   ```powershell
   $stateDir = Join-Path $env:USERPROFILE '.dsh\plugins\spig-dsh-toolkit\autostart'
   $stagedDir = Join-Path $stateDir 'runtime\dsh-autostart'
   $psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

   & $psExe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $stagedDir 'dsh-web-launcher.ps1') -Stop -StateDir $stateDir
   & $psExe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $stagedDir 'install-supervisor.ps1') -Action Remove -StateDir $stateDir

   Remove-Item 'D:\Projetos\DeepSeekHarness\dsh-autostart\run\pause.sentinel','D:\Projetos\DeepSeekHarness\dsh-autostart\run\stop.sentinel' -Force -ErrorAction SilentlyContinue
   cmd.exe /d /c "D:\Projetos\DeepSeekHarness\dsh-autostart\setup.cmd"
   ```
2. Confirmar retorno:
   ```powershell
   Invoke-WebRequest 'http://127.0.0.1:3080/__dsh_health' -UseBasicParsing
   ```
3. Se o Commit 2 (Fase 3) já tiver sido aplicado, reverter com:
   ```powershell
   $env:GIT_CONFIG_COUNT='0'; git revert <hash-commit-fase-3>
   ```

---

## 9. Critério Final de Aceite

### 9.1 Nesta Máquina
- Supervisor único rodando de `%USERPROFILE%\.dsh\plugins\spig-dsh-toolkit\autostart\runtime\dsh-autostart\dsh-web-launcher.ps1` com `-StateDir` e `-BindMode "lan-tailscale"`.
- `config.json` gravado com `"bindMode": "lan-tailscale"`.
- Acesso via `http://127.0.0.1:3080`, LAN e Tailscale funcionando.
- Botão **Restart** na sidebar reinicia via `method: "suicide"` em ~15 s.
- Logoff + logon sobe DSH Web automaticamente sem janela preta.
- `npm run check && npm test` 100% verde, zero referências a `D:\Projetos\DeepSeekHarness` em `src/`, `lib/` ou `components/`, e zero arquivos de runtime dentro do repositório git.

### 9.2 Em um PC Windows Novo e Limpo
Pré-requisitos: Windows 10/11 + DeepSeek Harness + Node.js instalado + plugin `spig-dsh-toolkit` no perfil `web` (sem `D:\Projetos\...`, sem Tailscale).
1. Abrir DSH Web → `Settings → Spig Toolkit` → ativar **General Configs** → ligar **Windows Logon Autostart (Startup)**.
2. Sem erro e sem prompt UAC:
   - `runtime/` é staged em `%USERPROFILE%\.dsh\plugins\spig-dsh-toolkit\autostart\runtime\` com `manifest.json`.
   - `config.json` é criado com `"bindMode": "loopback"` (porta `3080` escutando apenas em `127.0.0.1`).
   - `getStatus()` retorna `available: true, installed: true, healthOk: true, paused: false`, com `supervisor.pid` e `dshWeb.pid` preenchidos.
   - `node_modules\spig-dsh-toolkit` permanece 100% intocado.
3. Clicar em **Restart** na sidebar → reinício limpo via `method: "suicide"`.
4. Atualizar o plugin → no próximo mount do host, `syncRuntimeIfInstalled()` detecta divergência de SHA e re-sincroniza `runtime/` preservando `run/`, `logs/`, `backup/` e `config.json`.
5. Fazer logoff + logon → DSH Web sobe automaticamente na porta `3080`.

### 9.3 Melhorias Futuras (Fora de Escopo Agora)
- Suporte a PC sem `node.exe` global via `ELECTRON_RUN_AS_NODE=1` (requer validação dedicada de Electron spawning Electron no Windows).
- Rotação automática de `logs/launcher-*.log`.
- Seletor de `BindMode` (`loopback` / `lan-tailscale`) direto na UI de General Configs.
