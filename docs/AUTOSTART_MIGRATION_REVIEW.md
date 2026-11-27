# Revisão do plano `AUTOSTART_MIGRATION_PLAN.md`

> **Data:** 2026-11-26
> **Objeto:** [AUTOSTART_MIGRATION_PLAN.md](AUTOSTART_MIGRATION_PLAN.md)
> **Método:** leitura do código e comparação de hashes, sem executar nada no supervisor vivo.
> **Veredito:** o diagnóstico é excelente e a arquitetura está aprovada, com quatro ajustes: escopo menor, execução da Fase 1 fora da árvore do DSH, re-sync do runtime e itens adiados.

---

## 1. O que foi confirmado no código

O achado mais valioso é o **split-brain**, e ele procede. O plano original (só rodar o `setup.cmd` embutido) teria falhado.

| Afirmação do plano | Evidência | Status |
|---|---|---|
| Mutex por pasta: supervisores de pastas diferentes não se excluem | `dsh-web-launcher.ps1:572-578` — o nome do mutex vem do hash de `$PSScriptRoot` | Confirmado |
| O novo supervisor recusa adotar o wrapper legado | `dsh-web-launcher.ps1:63` (`WrapperPath` derivado de `$PSScriptRoot`) e `:158` (compara com a linha de comando) | Confirmado |
| Loop de `portCollision` a cada `RestartDelay` | `dsh-web-launcher.ps1:605-614` | Confirmado |
| `-Start` não confere se já existe supervisor | `dsh-web-launcher.ps1:334-338`: na mesma pasta o mutex segura; entre pastas diferentes, não | Confirmado |
| `getStatus()` diverge de `querySupervisor()` | `startup.js:123-125` lê `run/` só do `autostartDir`; `querySupervisor()` percorre todos os candidatos | Confirmado (bug existente) |
| Exposição da `:3080` na LAN | `local-web-proxy.mjs:153-157`: escuta em `0.0.0.0` e aceita qualquer peer da LAN local | Confirmado |
| `tailscale` é pré-requisito duro | Só no instalador. O wrapper já tolera a falta dele (`try {} catch {}` em `dsh-navegador.mjs:52`) | Parcial: o hardening é pequeno e pontual |
| `.gitignore` só ignora `node_modules/`, `*.log` e `.DS_Store` | Ignora também `.dsh/` | Imprecisão sem impacto |

**Diff completo embutido × legado:** os 6 scripts (`dsh-web-launcher.ps1`, `dsh-control.ps1`, `install-supervisor.ps1`, `install-control-shortcut.ps1`, `setup.cmd`, `control-dsh.cmd`), mais `dsh-navegador.mjs`, `local-web-proxy.mjs` e `dsh-picker-browse.patch.yml`, são todos **idênticos** (SHA-256). O corte não muda o comportamento do wrapper.

---

## 2. Onde discordo ou ajustaria

### 2.1 Lacuna crítica: quem executa a Fase 1

O plano diz "rodar de um PowerShell externo", o que está certo, mas o risco é maior do que parece. Todo comando disparado pelo agente é processo-filho do host DSH. O `setup.cmd -stop` faz `taskkill /T` na árvore e mataria o script de corte no meio, deixando a máquina **sem supervisor nenhum**.

Opções seguras:
- **(a)** o usuário roda a Fase 1 manualmente num terminal fora do DSH;
- **(b)** o agente gera um script de corte e o dispara por uma **task agendada temporária, de execução única**. Ela roda fora da árvore do DSH, sobrevive ao `taskkill`, grava log em `cutover.log` e se remove no fim.

**Preferência: (b)**, porque fica auditável e repetível.

### 2.2 A Fase 0 está grande demais e mistura assuntos

Ela junta o que o corte exige com hardening para PC novo. O `AGENTS.md` pede commits focados.

- **0a — o corte depende disto:** `stateDir` em `$DSH_HOME`, runtime staged, handoff limpo no instalador, mutex por porta, correção do `getStatus()` e `.gitignore` defensivo.
- **0b — portabilidade:** `tailscale` opcional, descoberta do `node` e do executável do DSH, `-BindMode`.
- **Adiar ou descartar:** fallback `ELECTRON_RUN_AS_NODE`, `RestartCount 10` e rotação de logs.

### 2.3 O mutex `Port + DshHome` não protege o corte

O supervisor legado continua com o nome de mutex antigo, então os dois não se excluem mesmo depois da mudança. Quem protege o corte é o **handoff**: parar o legado e confirmar a porta livre. A mudança de mutex só vale para o futuro. Vale a pena, mas não substitui o handoff.

### 2.4 A sincronização do runtime staged está vaga

"Ao habilitar/atualizar" não diz quando o re-sync acontece. Se só acontecer no toggle, um upgrade do plugin deixa `$DSH_HOME\...\runtime` defasado em silêncio.

**Proposta:** a cada montagem do plugin, comparar o SHA do `manifest.json` com o bundle. Se divergir, re-sincronizar (sobrescrever arquivos `.ps1`/`.mjs` sem lock é seguro no Windows) e avisar que vale no próximo restart. Cobrir com teste.

### 2.5 `ELECTRON_RUN_AS_NODE`: tirar do escopo agora

O wrapper sobe o próprio DSH como filho; rodá-lo com o executável do DSH como se fosse node é território não testado. Nesta máquina o `node` existe. Fica como melhoria futura, com validação própria.

### 2.6 `RestartCount 10` tem valor baixo e risco real

O launcher já reinicia o DSH num loop interno; o `RestartCount` da task só entra em ação se o próprio launcher morrer. Com 10 tentativas a cada 2 min, depois de uns 20 minutos instáveis a task desiste até o próximo logon.

**Proposta:** manter o valor atual, ou no máximo reduzir para algo como 50.

### 2.7 `BindMode` precisa de um default explícito para esta máquina

Se o default novo for `loopback`, o acesso por LAN e Tailscale some no corte.

**Proposta:** instalação nova usa `loopback`; esta máquina migra com `lan-tailscale` explícito, gravado no estado.

### 2.8 Durante a transição, `$DSH_HOME` precisa entrar como candidato

Entre a Fase 0 e a Fase 3, o `candidateDirs()` deve ficar `[stateDir em $DSH_HOME, embutido, legado]`. Senão, depois do corte o host antigo (que ainda não reiniciou) procura no lugar errado.

### 2.9 A estimativa de 2,5–4h está otimista

Os `.ps1` não têm testes. Mutex, handoff e `-StateDir` vão exigir testes de contrato (parsing do script) ou Pester. Estimativa revisada: algo como **4–6h**, ou aceitar cobertura parcial só nos `.ps1`.

---

## 3. Recomendação

Aprovar a arquitetura (runtime staged + estado único em `$DSH_HOME`), com quatro ajustes:

1. Fase 0 dividida em **0a** e **0b**, em commits separados.
2. Fase 1 executada por **task agendada temporária** fora da árvore do DSH, ou pelo usuário num terminal externo.
3. **Re-sync do runtime** a cada montagem do plugin, por SHA, com teste.
4. **Fora do escopo agora:** `ELECTRON_RUN_AS_NODE`, `RestartCount 10` e rotação de logs.

---

## 4. Decisões pendentes (antes de iniciar a Fase 0a)

- [ ] **Fase 1:** task temporária (o agente prepara e dispara) ou execução manual pelo usuário?
- [ ] **Acesso desta máquina:** manter LAN + Tailscale (`lan-tailscale`)?
- [ ] **Instalações novas:** default `loopback`, que é o mais seguro?
