# Plano de Migração e Arquitetura — Autostart 100% Autocontido

> **Objetivo:** Tornar o plugin `spig-dsh-toolkit` 100% autocontido para Startup/Autostart no Windows: migrar de PC = instalar o plugin no DSH + ligar o toggle de Startup. Nenhum caminho absoluto para fora do workspace no código de produção; remover `LEGACY_AUTOSTART_DIR` após migrar esta máquina para a cópia embutida.
>
> **Repositório:** `D:\Projetos\spig-dsh-toolkit` (`main` @ `3aa07e1`, 171/171 testes verdes)  
> **Data do diagnóstico:** 2026-11-26  
> **Status:** Proposto (aguardando aprovação para iniciar Fase 0)

---

## 1. Diagnóstico do Estado Atual e das 6 Questões Críticas

### Snapshot do estado vivo nesta máquina (pré-cutover)
- **Tarefa `DSH Browser Supervisor`:** `State = Ready` (não `Running`), apontando para `D:\Projetos\DeepSeekHarness\dsh-autostart\dsh-web-launcher.ps1`.
- **Supervisor vivo:** `pwsh.exe` **PID 20928** (detached, PPID 20588), rastreando o wrapper `node.exe` **PID 30320** (`"D:\Projetos\DeepSeekHarness\dsh-navegador.mjs" --no-open`) na porta `:3080`.
- **Estado em disco:** `run/supervisor.json`, `run/dsh-web.json` e `run/dsh-web.pid` estão no diretório legado; o diretório embutido tem apenas `run/restart-attempts.log`.
- **Shim `dsh.cmd`:** em `%LOCALAPPDATA%\Programs\DSH-Web-Command\dsh.cmd`, com marcador `REM DSH_FIXED_WEB_SHIM_V1`, apontando para `D:\Projetos\DeepSeekHarness\dsh-navegador.mjs`.
- **Startup VBS:** `start-dsh-web.vbs` não existe (`False`); `iniciar-harness.vbs` existe apenas em `D:\Projetos\DeepSeekHarness\`.

### (1) Completude do plano original — lacunas encontradas
1. **`.gitignore` e `package.json` (risco de sujeira no git e vazamento em pacote):** `.gitignore` ignora apenas `node_modules/`, `*.log` e `.DS_Store`. Rodar o instalador a partir da cópia embutida criaria arquivos não ignorados dentro do repo (`run/supervisor.json`, `run/dsh-web.json`, `run/dsh-web.pid`, `run/pause.sentinel` e `backup/DSH-Browser-Supervisor-task-before-boot.xml` com usuário/SID/caminhos da máquina). Como `package.json` inclui `"components"` em `"files"`, um futuro `npm pack`/publish empacotaria estado local.
2. **Neutralização do `iniciar-harness.vbs` no plano original é no-op:** `install-supervisor.ps1` procura `iniciar-harness.vbs` em `$projectRoot` (`Split-Path $PSScriptRoot -Parent`), que na cópia embutida é `components/general-configs/autostart/` (onde esse `.vbs` não existe).
3. **Atalho `DSH Control.lnk`:** `install-control-shortcut.ps1` recria o atalho no Menu Iniciar apontando para o novo `$PSScriptRoot` (precisa entrar no checklist de verificação e no rollback).
4. **Verificações que faltavam no antes/depois:**
   - Diff explícito de `supervisor.json` e `dsh-web.json` (PID + `startTimeUtc` novos) e confirmação de que o PID legado `20928` morreu.
   - Conferência de que `dsh.cmd` mudou de `D:\Projetos\DeepSeekHarness\dsh-navegador.mjs` para o novo caminho.
   - Conferência de `Get-ScheduledTask 'DSH Browser Supervisor'` (`Actions[0].Arguments` e `WorkingDirectory`) e `User PATH` (sem duplicatas de `DSH-Web-Command`).
   - Conferência de que `pause.sentinel` e `stop.sentinel` estão ausentes no novo `run/` (e `pause.sentinel` presente no legado enquanto existir no disco).

### (2) Risco crítico de dupla instância — Split-Brain + Race Condition
Se o cutover fosse executado apenas rodando `setup.cmd` sem parada prévia:
1. `install-supervisor.ps1` só chama `Stop-ScheduledTask` quando `$oldSupervisor.State -eq 'Running'`. Como a tarefa atual está `Ready` (o supervisor vivo PID `20928` é detached), **o supervisor legado não é parado**.
2. `Start-ScheduledTask` dispara imediatamente o novo supervisor.
3. O mutex em `dsh-web-launcher.ps1` faz hash de `$PSScriptRoot` (`Local\dsh-autostart-<sha256(path)>`). Como os diretórios diferem, **os dois supervisores não se excluem**.
4. O novo supervisor encontra o PID `30320` na porta `3080`, testa `Test-IsBrowserWrapperProcess` comparando a linha de comando com `$script:WrapperPath` (novo caminho) e falha (`IndexOf` retorna `-1`).
5. O novo supervisor recusa adotar (`portCollision = $true`), não grava `dsh-web.json`, e entra em loop infinito a cada 2 s registrando `"port 3080 belongs to unrelated pid 30320; refusing to adopt or kill it."`.
6. Ao testar o botão Restart, ambos os supervisores entram em *race condition* pela porta `3080`.
7. `dsh-web-launcher.ps1 -Start` não verifica porta nem supervisor de outro diretório; confia 100% no mutex per-directory.

**Conclusão:** é obrigatório parar o supervisor legado + árvore `30320` (e confirmar morte do PID `20928` e porta `3080` livre) antes de subir o novo supervisor — além de corrigir o mutex por recurso (`Port + DshHome`) e o handoff no próprio instalador.

### (3) `processAncestry` / `inManagedTree` — janela de quebra
- `inManagedTree` em `src/components/general-configs/startup.js` verifica se `result.dshPid` aparece na cadeia de `ParentProcessId` do processo host atual (até 24 saltos).
- **Sem parada prévia:** o novo supervisor não grava `dsh-web.json` (`dshRunning: false`). Ao remover `LEGACY_AUTOSTART_DIR`, `querySupervisor()` degradaria para `managed: false` / `unmanaged`.
- **Com parada limpa do legado + boot pelo novo supervisor:** a árvore nasce sob o novo wrapper PID `N`, que já está em `dsh-web.json` e na ancestralidade do host → `inManagedTree: true` desde o primeiro segundo.
- **Bug colateral já existente:** `getStatus()` lê `run/*.json` somente de `autostartDir`, ignorando `candidateDirs`, podendo retornar `supervisor: null, dshWeb: null` mesmo com `healthOk: true`. Unificar o `stateDir` elimina essa divergência.

### (4) Outros consumidores do fallback e efeitos colaterais
- **Produção:** apenas `src/components/general-configs/startup.js` referencia `LEGACY_AUTOSTART_DIR` e `candidateDirs()`.
- **RPC e Client:** `src/components/general-configs/rpc.js` delega a `deps.startup`; `src/client/general-configs-client.js` consome `spig-general.startupStatus`, `setStartup` e `restart`.
- **Documentação:** `docs/ARCHITECTURE.md` documenta o fallback legado e precisa ser atualizado.
- **Logs divididos:** hoje `requestRestart()` escreve `restart-attempts.log` em `autostartDir/run/`, enquanto os logs e JSONs do launcher ficam no legado.
- **Ferramentas externas:** `DSH Control.lnk` (`dsh-control.ps1`) e o shim `dsh.cmd` no `User PATH`.

### (5) Estratégia de cutover
**Cutover direto (após corrigir instalador/mutex), sem feature flag e sem manter `LEGACY_AUTOSTART_DIR` por N boots.**
- `process.env.DSH_AUTOSTART_DIR` já existe como escape hatch para override manual.
- Rollback continua imediato porque `D:\Projetos\DeepSeekHarness\dsh-autostart` permanece intocado no disco.

### (6) Testes e hardening para um PC novo desconhecido
- **Teste que muda:** `test/toolkit.test.mjs` (`querySupervisor never throws...`) será atualizado para usar `stateDir` isolado.
- **Novas vacinas permanentes:**
  1. Guarda estática anti-caminhos-absolutos fora do workspace em `src/`, `lib/` e `components/`.
  2. Contrato de portabilidade do instalador/launcher (`tailscale` opcional, mutex `Port + DshHome`, estado/logs/backups em `$DSH_HOME`).
  3. Contrato `getStatus()` ↔ `querySupervisor()` lendo o mesmo `stateDir`.
  4. Auditoria Windows pós-cutover (1 único supervisor, Task, `dsh.cmd` e `DSH Control.lnk` apontando para o caminho canônico).
- **Hardening crítico:**
  - `tailscale` opcional (remover `-ErrorAction Stop`).
  - `node` no PATH com fallback para `C:\Program Files\nodejs\node.exe` e `DeepSeek Harness.exe` (`ELECTRON_RUN_AS_NODE=1`).
  - Modo de bind explícito (`loopback` vs `lan-tailscale`) para não expor `:3080` sem login em redes públicas num PC novo.
  - Reduzir `-RestartCount 999` para `10` com intervalo de `2 min`.
  - Manter scripts sob `%USERPROFILE%\.dsh` (ACL restrita ao usuário atual) para mitigar `ExecutionPolicy Bypass`.
  - Preservar guarda `REM DSH_FIXED_WEB_SHIM_V1` no `dsh.cmd`.

---

## 2. Arquitetura Recomendada: Bundle Imutável + Runtime Staged e Estado em `$DSH_HOME`

### Alternativas descartadas
| Alternativa | Veredito | Motivo técnico |
|---|---|---|
| **Supervisão dentro do Cordis host** | Não funciona | Host morre em crash/OOM/`process.exit(0)` (necessário para limpar cache ESM), não sobe no logon e não mantém proxy `:3080` + `/__dsh_health` durante boot de `dsh web --port 0`. |
| **Windows Service (SCM / NSSM / WinSW)** | Pior | Exige UAC/Admin no toggle da GUI, roda em Session 0 (quebra DPAPI/OAuth interativo) e exige binário wrapper externo. |
| **Rodar direto de `components/.../dsh-autostart` com `run/` ao lado** | Frágil | Suja git/risco no `npm pack`, quebra em upgrades sob `node_modules`/`.pnpm`, exige `tailscale`/`node` no PATH e sofre split-brain de mutex per-dir. |

### Layout proposto

```text
[Código imutável — dentro do plugin spig-dsh-toolkit]
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
    └── control-dsh.cmd
          │
          │  sync atômico ao habilitar/atualizar Startup (stamp SHA-256 + versão)
          ▼
[Runtime operacional + Estado único — sempre sob $DSH_HOME]
%USERPROFILE%\.dsh\plugins\spig-dsh-toolkit\autostart\
├── runtime\                     # Cópia operacional estável (nunca muda de path em upgrades)
│   ├── dsh-navegador.mjs
│   ├── local-web-proxy.mjs
│   ├── dsh-picker-browse.patch.yml
│   ├── manifest.json            # { version, sourceSha256, syncedAt }
│   └── dsh-autostart\           # Scripts PS1/CMD apontados pela Task, dsh.cmd e DSH Control.lnk
├── run\                         # ÚNICO diretório de estado (getStatus = querySupervisor = launcher)
│   ├── supervisor.json
│   ├── dsh-web.json
│   ├── dsh-web.pid
│   ├── pause.sentinel           # quando pausado
│   └── restart-attempts.log
├── logs\                        # Todos os logs juntos + rotação (manter últimos 20)
│   ├── launcher-*.log
│   ├── child-stdout.log
│   └── child-stderr.log
└── backup\
    └── DSH-Browser-Supervisor-task-before-boot.xml
```

### Comparativo
| Dimensão | Plano original | Arquitetura recomendada (`$DSH_HOME` staged + hardening) |
|---|---|---|
| **Portabilidade (PC novo)** | Falha sem `tailscale` ou `node` no PATH; path varia entre `pnpm` store e dev repo. | Funciona só com DSH + plugin: `tailscale` opcional, fallback `ELECTRON_RUN_AS_NODE=1`, path idêntico em qualquer PC. |
| **Robustez a upgrades** | Upgrade em `node_modules`/`.pnpm` pode apagar `run/`/`logs/` ou quebrar Task/`dsh.cmd`. | Path da Task, `dsh.cmd` e `DSH Control.lnk` nunca muda; upgrades apenas resincronizam `runtime\`. |
| **Superfície de falha** | Mutex per-dir → split-brain; `getStatus()` diverge de `querySupervisor()`. | Mutex por `Port + DshHome`; todos os componentes leem o mesmo `run\`; handoff determinístico no `Install`. |
| **Manutenibilidade** | Repo git sujo com `run/*.json` e `backup/*.xml`; risco no `npm pack`. | Repo e `node_modules` 100% read-only e limpos. |
| **Segurança** | Expõe `:3080` sem login na LAN em PC novo; `RestartCount 999`. | ACL restrita em `%USERPROFILE%\.dsh`; modo de bind explícito; `RestartCount 10`; zero caminhos hardcoded. |

---

## 3. Plano Detalhado de Implementação e Migração

### Fase 0 — Refatoração e hardening no código (zero downtime, 100% testável offline)

1. **Separar `stateDir` / `runtimeDir` em `src/components/general-configs/startup.js`:**
   - Base canônica via `dshHomePath("plugins", "spig-dsh-toolkit", "autostart")` (injetável nos testes e sobrescrevível por `DSH_AUTOSTART_DIR`).
   - Criar `syncAutostartRuntime(sourceDir, runtimeDir)` com cópia atômica e `manifest.json` (versão + SHA-256), sem tocar em `run/`, `logs/` ou `backup/`.
   - `setEnabled(true)` executa `syncAutostartRuntime` → `runtime/dsh-autostart/setup.cmd` com `-StateDir <autostartBase>` e parâmetros de descoberta.
   - `getStatus()` lê `run/*.json` do mesmo `stateDir` que `querySupervisor()` e `requestRestart()` e expõe `runtimeSynced` / `taskTarget`.
   - Manter `LEGACY_AUTOSTART_DIR` apenas até o fim da Fase 1 para preservar rollback limpo.

2. **Corrigir os 4 bugs estruturais em `components/general-configs/autostart/dsh-autostart/dsh-web-launcher.ps1`:**
   - Parâmetro `-StateDir` (default `$PSScriptRoot` para uso standalone; quando passado pela Task/plugin, aponta para `$DSH_HOME\plugins\spig-dsh-toolkit\autostart`).
   - Mutex por recurso (`Port + DshHome`): `Local\dsh-autostart-p<Port>-<sha256(DshHome.ToLowerInvariant())[0:20]>`.
   - Guarda idempotente em `-Start`: checar `Get-SupervisorProcess` antes de chamar `Start-SupervisorProcess`.
   - Fallback de runtime (`DeepSeek Harness.exe` com `ELECTRON_RUN_AS_NODE=1` quando `node.exe` não existir) + rotação simples em `logs/` (manter os 20 `launcher-*.log` mais recentes).

3. **Corrigir e endurecer `components/general-configs/autostart/dsh-autostart/install-supervisor.ps1`:**
   - `tailscale` opcional (`-ErrorAction SilentlyContinue`).
   - Descoberta de `node`: PATH → `C:\Program Files\nodejs\node.exe` → `DeepSeek Harness.exe` (`ELECTRON_RUN_AS_NODE=1`).
   - Descoberta de `DeepSeek Harness.exe`: `-DshInstallDir` → `%LOCALAPPDATA%\Programs\DeepSeek Harness` → `%ProgramFiles%\DeepSeek Harness`.
   - **Handoff limpo de supervisor anterior:**
     1. Exportar backup da task antiga para `$StateDir\backup\DSH-Browser-Supervisor-task-before-boot.xml` (se ausente).
     2. Se a task antiga apontava para outro diretório, invocar `-Stop` no launcher antigo (ou encerrar o supervisor antigo verificado) e aguardar porta `3080` liberar até 10 s.
     3. Só então executar `Register-ScheduledTask -Force` + `Start-ScheduledTask`.
   - `-RestartCount 10`, `-RestartInterval (New-TimeSpan -Minutes 2)`.
   - Parâmetro `-BindMode` (`loopback` | `lan-tailscale`).
   - Atualizar `dsh-control.ps1` e `setup.cmd` para respeitar `-StateDir` / `DSH_AUTOSTART_STATE_DIR`.

4. **Testes e validação:**
   - Adicionar as vacinas offline da seção 1.(6).
   - Rodar `npm run check && npm test` (100% verde).

---

### Fase 1 — Cutover controlado nesta máquina (~15–20 s de downtime)

> **Atenção operacional:** a sessão Web GUI roda dentro da árvore do PID `30320` (filho do supervisor legado `20928`). Executar a Fase 1 a partir de um **PowerShell 7 externo** (ou script detached com log em `$DSH_HOME\plugins\spig-dsh-toolkit\autostart\logs\cutover.log`).

1. **Snapshot pré-cutover:** registrar `legacy/run/supervisor.json` (PID `20928`), `legacy/run/dsh-web.json` (PID `30320`), `Get-ScheduledTask`, `dsh.cmd` e `DSH Control.lnk`.
2. **Parar explicitamente o supervisor legado:**
   ```powershell
   cmd /d /c "D:\Projetos\DeepSeekHarness\dsh-autostart\setup.cmd" -stop
   ```
   - Aguardar até 10 s e confirmar morte do PID `20928` e porta `3080` livre (`Get-NetTCPConnection -State Listen -LocalPort 3080` vazio).
   - Manter `pause.sentinel` no diretório legado.
3. **Instalar e subir o novo supervisor staged em `$DSH_HOME`:**
   - Sincronizar `components/general-configs/autostart/` → `$DSH_HOME\plugins\spig-dsh-toolkit\autostart\runtime\` e executar `install-supervisor.ps1 -Action Install -StateDir "$env:USERPROFILE\.dsh\plugins\spig-dsh-toolkit\autostart"`.
4. **Aguardar `/__dsh_health` retornar HTTP `200 ok`** (até 30 s) e recarregar `http://127.0.0.1:3080`.

---

### Fase 2 — Verificação rigorosa pós-cutover

- [ ] **Unicidade do supervisor:** `Get-CimInstance Win32_Process | Where CommandLine -like '*dsh-web-launcher.ps1*'` retorna exatamente 1 processo, rodando de `$DSH_HOME\plugins\spig-dsh-toolkit\autostart\runtime\dsh-autostart\dsh-web-launcher.ps1` (PID `20928` ausente).
- [ ] **Diff de estado:** `$DSH_HOME\...\run\supervisor.json` e `dsh-web.json` existem com PIDs e `startTimeUtc` novos, batendo com o processo na porta `3080`.
- [ ] **Tarefa agendada:** `Get-ScheduledTask 'DSH Browser Supervisor'` aponta `Arguments` e `WorkingDirectory` para `$DSH_HOME\...\runtime\dsh-autostart`, com `RestartCount = 10`.
- [ ] **Artefatos auxiliares:** `dsh.cmd` aponta para `runtime\dsh-navegador.mjs`; `DSH Control.lnk` aponta para `runtime\dsh-autostart\dsh-control.ps1`; `User PATH` contém `DSH-Web-Command` uma única vez.
- [ ] **Saúde da API do plugin:** `querySupervisor()` retorna `managed: true, supervisorRunning: true, inManagedTree: true`; `getStatus()` retorna `available: true, installed: true, healthOk: true, paused: false` com `supervisor` e `dshWeb` preenchidos.
- [ ] **Teste real de restart (botão vermelho na UI):** `method: "suicide"`, queda/volta de `/__dsh_health` (~15 s), nova entrada em `$DSH_HOME\...\run\restart-attempts.log` e novo PID em `dsh-web.json` mantendo o mesmo supervisor PID.
- [ ] **Repo git limpo:** zero arquivos `run/` ou `backup/` dentro de `D:\Projetos\spig-dsh-toolkit\components\...`.
- [ ] **Zero spam de `portCollision`** no `launcher-*.log` mais recente em `$DSH_HOME\...\logs\`.

---

### Fase 3 — Remoção do fallback legado + vacinas + docs + commit

1. Remover `LEGACY_AUTOSTART_DIR` e `candidateDirs()` de `src/components/general-configs/startup.js`.
2. Atualizar `test/toolkit.test.mjs` e consolidar todas as vacinas de teste (incluindo guarda estática anti-caminhos-absolutos).
3. Atualizar `docs/ARCHITECTURE.md` documentando `bundle → $DSH_HOME/.../autostart/{runtime,run,logs,backup}`.
4. Atualizar `.gitignore` defensivamente para `components/general-configs/autostart/dsh-autostart/run/` e `backup/`.
5. Rodar `npm run check && npm test` (tudo verde) e commitar com `$env:GIT_CONFIG_COUNT='0'`.

---

### Fase 4 — Rollback determinístico

1. No PowerShell externo:
   ```powershell
   cmd /d /c "$env:USERPROFILE\.dsh\plugins\spig-dsh-toolkit\autostart\runtime\dsh-autostart\setup.cmd" -stop
   cmd /d /c "$env:USERPROFILE\.dsh\plugins\spig-dsh-toolkit\autostart\runtime\dsh-autostart\setup.cmd" -uninstall
   ```
2. Reinstalar a cópia legada (ainda intacta em `D:\Projetos\DeepSeekHarness\dsh-autostart`):
   ```powershell
   cmd /d /c "D:\Projetos\DeepSeekHarness\dsh-autostart\setup.cmd"
   ```
   *(Alternativamente, restaurar o XML de `$DSH_HOME\plugins\spig-dsh-toolkit\autostart\backup\DSH-Browser-Supervisor-task-before-boot.xml` e remover `pause.sentinel` do legado.)*
3. `git revert` do commit da Fase 3 (se já aplicado).

---

## 4. Riscos, Pré-requisitos, Esforço e Critério de Aceite

### Riscos e pré-requisitos
- **Fallback `ELECTRON_RUN_AS_NODE=1` para `dsh-navegador.mjs`:** validar na Fase 0 que `fetch`, `http`, `child_process` e `AbortSignal.timeout` funcionam de forma idêntica ao `node.exe` global.
- **Modo `loopback` vs `lan-tailscale`:** preservar o acesso LAN + Tailscale nesta máquina durante a migração, enquanto instalações novas podem usar padrão seguro ou escolha explícita na UI.
- **Downtime de ~15–20 s na Fase 1:** esperado ao parar o supervisor legado e subir o novo.

### Estimativa de esforço
- **Total:** ~2,5 a 4 horas (Fase 0: ~1,5–2 h; Fase 1+2: ~20 min; Fase 3: ~40 min).
- **1º passo de maior alavancagem:** implementar a Fase 0 completa (runtime staged + `stateDir` em `$DSH_HOME` + mutex `Port + DshHome` + handoff limpo) com testes offline verdes antes de tocar no supervisor vivo.

### Critério de aceite verificável em um PC novo
Em uma máquina Windows 10/11 limpa (sem `D:\Projetos\...`, sem Tailscale e sem Node.js global no PATH), contendo apenas **DeepSeek Harness + bundle `spig-dsh-toolkit` no perfil `web`**:
1. Abrir o DSH Web → `Settings → Spig Toolkit` → ativar **General Configs** → ligar **Windows Logon Autostart (Startup)**.
2. Sem erro nem prompt UAC:
   - `getStatus()` retorna `installed: true`, `available: true`, `healthOk: true`, `paused: false`, com `supervisor.pid` e `dshWeb.pid` preenchidos.
   - `Get-ScheduledTask 'DSH Browser Supervisor'` aponta para `%USERPROFILE%\.dsh\plugins\spig-dsh-toolkit\autostart\runtime\dsh-autostart\dsh-web-launcher.ps1`.
   - `http://127.0.0.1:3080/__dsh_health` responde `200 ok`.
   - `node_modules\spig-dsh-toolkit` permanece 100% intacto (zero `run/`, `logs/` ou `backup/` dentro dele).
3. Clicar no botão vermelho **Restart** na sidebar → reinício em ~15 s via `method: "suicide"`, novo PID em `dsh-web.json`, página recarrega sozinha.
4. Fazer **logoff + logon** no Windows → DSH Web sobe automaticamente na porta `3080` sem janela de console.
