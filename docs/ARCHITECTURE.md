# Arquitetura Modular — `spig-dsh-toolkit`

O `spig-dsh-toolkit` consolida múltiplos plugins do DeepSeek Harness (DSH) em um único bundle modular com ativação e desativação independente por componente.

## Visão geral

```
spig-dsh-toolkit/
├── cordis.patch.yml                # Registra o orquestrador único no perfil DSH
├── package.json                    # Manifesto do bundle (Host + Client + locales + ícone)
├── icon.svg                        # Ícone do plugin
├── locale/                         # Metadados localizados (en, pt-BR)
├── lib/
│   ├── index.js                    # Entrypoint Host (Cordis)
│   └── client.js                   # Bundle Client gerado por scripts/build.mjs
├── src/
│   ├── core/
│   │   ├── registry.js             # Registro declarativo de componentes
│   │   ├── state-store.js          # Persistência atômica de toggles ($DSH_HOME/plugins/spig-dsh-toolkit/components.json)
│   │   ├── conflict-detector.js    # Detecção de plugins legados ativos simultaneamente
│   │   ├── lifecycle.js            # Orquestrador de mount/unmount via Cordis forks
│   │   └── rpc.js                  # Rotas Fetch `/api/spig-toolkit.*`
│   ├── components/
│   │   ├── subscriptions.js        # Definição do componente Subscriptions
│   │   ├── thinking-provider.js    # Definição do componente Thinking Provider
│   │   ├── general-configs.js      # Definição do componente General Configs (defaultEnabled: false)
│   │   └── general-configs/        # Store atômico, Windows Startup (3080) e RPC /api/spig-general.*
│   └── client/
│       ├── toolkit-client.js       # UI de Settings + Plugins detail (plugins.bundle.config) + orquestrador
│       └── general-configs-client.js # UI de General Configs, Sidebar Bottom, Session Search/lupa e Compactação
├── components/                     # Runtime encapsulado dos componentes integrados
│   ├── general-configs/autostart/  # Wrapper 3080 (dsh-navegador/local-web-proxy) + supervisor Windows embutidos
│   ├── subscriptions/
│   └── thinking-provider/
├── cordis.patch.yml               # Camada do bundle: registra o toolkit + ativa
│                                  # `session-query-sqlite` (FTS5, openAt: first-search,
│                                  # path via `dshHomePath('session-search.db')`)
│
│ Nota sobre o supervisor/restart (arquitetura staged): o bundle em
│ `components/general-configs/autostart/` é imutável e sincronizado por SHA-256
│ no mount/install para `$DSH_HOME/plugins/spig-dsh-toolkit/autostart/{runtime,run,logs,backup}`.
│ `querySupervisor`/`requestRestart` operam exclusivamente sobre esse diretório
│ staged. O restart real é suicídio gracioso do próprio host quando ele prova
│ viver sob o wrapper rastreado — o wrapper encerra o proxy e o supervisor
│ reboota a árvore (~15s). Um `-Restart` disparado de DENTRO da árvore-alvo é
│ reaped pelo próprio `taskkill /T` antes de concluir (no-op silencioso); por
│ isso ele só é usado contra instância externa.
├── scripts/
│   └── build.mjs                   # Gera `lib/client.js` combinando toolkit + clients dos componentes
└── test/
    ├── toolkit.test.mjs            # Ciclo de vida, persistência, conflitos e bundle
    ├── anthropic-tool-id.test.mjs  # sanitizeAnthropicToolId (Codex → Claude)
    ├── antigravity-acp-client.test.mjs      # Handshake ACP, política de versão do CLI, fail-closed
    ├── antigravity-acp-transport.test.mjs   # Roteador ACP, fallback só pré-output, binding persistido
    ├── antigravity-acp-bridge.test.mjs      # Bridge header + resume com bridgeTag persistida
    ├── antigravity-acp-dsh.test.mjs         # Integração DSH runtime (pula sem DSH instalado)
    ├── antigravity-cli-adapter.test.mjs / antigravity-cli-catalog.test.mjs
    ├── antigravity-cli-local.test.mjs       # buildPrompt, classificação de falha, versão do CLI
    ├── antigravity-cli-recovery.test.mjs    # Overflow recovery, compactação, reserva de prompt
    ├── antigravity-cli-overflow-dsh.test.mjs # Integração recovery via DSH runtime
    ├── antigravity-context-delivery.test.mjs # Entrega incremental de contexto ao ACP
    ├── antigravity-tool-bridge*.test.mjs    # Ponte de tool calling DSH ↔ agy (incl. integração DSH)
    ├── compaction-model.test.mjs            # Roteamento do modelo de compactação
    └── provider-settings-contract.test.mjs  # Contrato do bundle: transport/bridge só Antigravity
```

## Como funciona o isolamento por componente

1. **Host (Cordis)**: Cada componente ativo é montado em seu próprio fork Cordis (`ctx.plugin(component.hostPlugin, componentConfig)`). Ao desativar um toggle, `fork.dispose()` desmonta imediatamente todos os `ctx.effect`, listeners (`ctx.on`), adapters LLM, tools e rotas RPC daquele componente.
2. **Client (Web UI)**: O bundle `lib/client.js` expõe a seção **Settings → Spig Toolkit** com um toggle para cada componente. Cada componente com UI própria é montado/desmontado dinamicamente via `ctx.plugin(...)` / `fork.dispose()` no Client, sem precisar reiniciar o DSH.
3. **Persistência**:
   - Estado dos toggles: `$DSH_HOME/plugins/spig-dsh-toolkit/components.json`.
   - Configurações do **Subscriptions**: mantidas integralmente em `$DSH_HOME/plugins/subscriptions/` (tokens OAuth, proxy, compaction-model, preferências de modelos e contas são preservados automaticamente).
   - Configurações do **Thinking Provider**: lidas da seção de configurações do DSH (`thinking-effort`), preservando configurações existentes.
4. **Prevenção de conflitos**: Antes de montar um componente, `detectLegacyConflict` verifica se o plugin standalone equivalente (`spig-dsh-subscriptions` ou `spig-dsh-thinking-provider`) está ativo no perfil. Em caso de conflito, o componente do Toolkit não é montado de forma duplicada e exibe um aviso claro na tela de configurações.

## Como adicionar um novo componente no futuro

1. **Adicione o runtime do componente** em `components/<novo-id>/` (ou implemente diretamente em `src/components/<novo-id>/`).
2. **Crie o descritor** em `src/components/<novo-id>.js` exportando:
   ```js
   export const meuComponente = {
     id: "meu-componente",
     title: "Meu Componente",
     description: "Descrição exibida nas configurações do Spig Toolkit.",
     defaultEnabled: true,
     settingsSectionId: "meu-componente",
     legacyPluginNames: ["plugin-legado-opcional"],
     resolveConfig(toolkitConfig) {
       return toolkitConfig?.meuComponente ?? {};
     },
     hostPlugin: {
       name: "spig-dsh-toolkit:meu-componente",
       inject: [],
       apply(ctx, config) {
         // Registre recursos usando ctx.effect / ctx.on para cleanup automático
       },
     },
   };
   ```
3. **Registre no `src/core/registry.js`**: importe e adicione `meuComponente` ao array `DEFAULT_COMPONENTS`.
4. **Se o componente tiver UI Client**: adicione sua entrada ao array `CLIENT_COMPONENTS` em `scripts/build.mjs` e execute `npm run build`.
5. **Valide**: execute `npm run check && npm test`.

## Fonte primária do componente Subscriptions + patches

O repositório legado `spig-dsh-subscriptions` foi **descontinuado**. Toda a
evolução da rota `subscriptions` (incluindo transporte ACP do Google
Antigravity, tool bridge, recovery de overflow e tradutor Anthropic) agora vive
**diretamente em `components/subscriptions/lib/` neste repo** — ele é a fonte
primária, não mais um espelho. Não ressincronize a partir do repo antigo; edite
aqui e porte os testes em `test/` junto (`npm test` protege as regressões).

Divergências intencionais mantidas com comentário `TOOLKIT DIVERGENCE`:

- `components/thinking-provider/lib/client.js` → `componentSwitchesFrom()`:
  quando o inventário do Host não contém nenhuma das 7 entradas legadas
  (`spig-dsh-thinking-provider` e `spig-dsh-thinking-provider/*`), o estado de
  todos os switches (`levels`, `settings`, `opencode`, `compaction`,
  `subagent`, `migration`, `composer`) deriva da entrada `spig-dsh-toolkit`.
  Sem isso, o cliente marcaria tudo como `"off"` e pularia o registro da
  slidebar de reasoning (`conversation.input.model`) e do painel de
  configurações do Thinking Provider.
- Fail-fast em espera longa de cota (`components/subscriptions/lib/index.js` +
  `components/subscriptions/lib/providers/rate-limit.js`):
  `DEFAULT_RATE_LIMIT_MAX_WAIT_MS` reduzido de 6 h para 2 min. A política de
  retry (`subscriptionRetryPolicy`) só aceita esperas divulgadas dentro de
  `maxDelayMs`; com o default anterior, um reset de 4 h (pool esgotado)
  estacionava o turno em `Retrying model request (1/10) · 14474s`, que o botão
  parar não abortava de forma confiável. Com 2 min, resets longos falham o
  turno na hora com o horário de recuperação na mensagem, e o usuário troca de
  modelo/conta ou aguarda manualmente. Quem quiser o comportamento antigo
  define `rateLimit.maxWaitMs: 21600000` explícito no config do provider.

## Política de versão do `agy` CLI (transporte ACP)

- `components/subscriptions/lib/antigravity-acp-client.js`:
  `MIN_CLI_VERSION = [1, 5, 17]`, `VERIFIED_CLI_VERSIONS = ['1.5.17', '1.5.18']`,
  `isSupportedCliVersion()` aceita `>= 1.5.17 < 2.0.0` (sufixos `-beta`/`+build`
  tolerados). Versões `1.x` aceitas mas ainda não verificadas emitem um `onWarn`
  único pedindo verificação e atualização de `VERIFIED_CLI_VERSIONS`; `< 1.5.17`,
  `2.x` ou malformadas rejeitam o handshake com `ACP_TRANSPORT`
  (`unsupported-cli-version`) e caem no `stream-json` só antes do primeiro chunk.
- Diagnóstico estruturado: rejeição carrega `acpDiagnostic`
  (`protocol-mismatch` / `agent-name-mismatch` / `unsupported-cli-version`);
  `antigravity-acp-transport.js` loga fallback como
  `code + stage + detail + session` sem vazar prompt (`detail =
  broken.acpDiagnostic ?? 'ACP request timed out'`), via `warn()` + `debugLog`
  (visível com `DSH_AGY_DEBUG=1`).
- `antigravity-cli-local.js`: `promptReserves` contabiliza `options.system`
  (~38–40 KB) no recovery para não subestimar o teto de 180 KB.
- `translate/anthropic.js` (+ espelho no bundle `index.js`):
  `sanitizeAnthropicToolId` determinístico (`tc_` + `sha256(id).base64url[0:32]`,
  IDs válidos `^[a-zA-Z0-9_-]+$` intactos) para histórico Codex
  (`call_...|fc_...`) não quebrar a API Anthropic com HTTP 400.

**Alterações em `components/*/lib/*.js` (Host-side) exigem reinício completo do
DSH** (supervisor `dsh-navegador.mjs); `node scripts/build.mjs` só reconstrói
`lib/client.js`. O build é determinístico: rebuild sem mudanças de fonte produz
byte-identical.
