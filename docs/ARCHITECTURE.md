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
│   │   └── thinking-provider.js    # Definição do componente Thinking Provider
│   └── client/
│       └── toolkit-client.js       # UI de Settings (Spig Toolkit) + orquestrador Client
├── components/                     # Runtime encapsulado dos componentes integrados
│   ├── subscriptions/
│   └── thinking-provider/
├── scripts/
│   └── build.mjs                   # Gera `lib/client.js` combinando toolkit + clients dos componentes
└── test/
    └── toolkit.test.mjs            # Testes automatizados de ciclo de vida, persistência, conflitos e bundle
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

## Patches aplicados sobre código vendorizado

O diretório `components/` contém cópias integrais dos runtimes originais, com
**uma única divergência intencional** (verificada por hash contra os projetos
de origem):

- `components/thinking-provider/lib/client.js` → `componentSwitchesFrom()`:
  quando o inventário do Host não contém nenhuma das 7 entradas legadas
  (`spig-dsh-thinking-provider` e `spig-dsh-thinking-provider/*`), o estado de
  todos os switches (`levels`, `settings`, `opencode`, `compaction`,
  `subagent`, `migration`, `composer`) deriva da entrada `spig-dsh-toolkit`.
  Sem isso, o cliente marcaria tudo como `"off"` e pularia o registro da
  slidebar de reasoning (`conversation.input.model`) e do painel de
  configurações do Thinking Provider.

**Ao ressincronizar `components/` com uma nova versão de um plugin original,
reaplique o patch acima e rode `node scripts/build.mjs`** (o `lib/client.js`
é gerado e commitado, e o build é determinístico: rebuild sem mudanças de
fonte produz byte-identical).
