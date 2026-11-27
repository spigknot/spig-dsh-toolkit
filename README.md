# spig-dsh-toolkit

Plugin modular para o DeepSeek Harness (DSH) que centraliza os plugins `spig-dsh-subscriptions` e `spig-dsh-thinking-provider` como componentes independentes, cada um com seu próprio toggle em **Settings → Spig Toolkit**.

## Componentes incluídos

- **Subscriptions** (`subscriptions`): provedores por assinatura (Codex, Claude, Grok, Copilot e Google Antigravity via CLI `agy`), pools de contas, proxy HTTP, compaction model e ferramentas (`image_generate`, `video_generate`, `x_search`).
- **Thinking Provider** (`thinking-provider`): níveis de raciocínio (*reasoning effort*) para modelos de terceiros, slider no composer, rota/esforço padrão de subagentes, política de compactação e headers OpenCode.
- **General Configs** (`general-configs`, serviços host sempre montados; sub-toggles da barra lateral desativados por padrão): utilidades gerais no PC — **Sidebar Bottom** (busca em sessões com Enter FTS5 + lupa interna flutuante, engrenagem de configurações substituindo `... More`) e **Contexto / Compactação** (seletor unificado de modelo de compactação compartilhando `compaction-model.json`).

> **Nota:** a inicialização supervisionada do Windows (porta 3080 sem login) e o botão de Restart da barra lateral foram movidos para o plugin `spig-dsh-supervisor`. Instale-o separadamente para essas funções.

## Instalação e substituição dos plugins individuais

1. No DSH, abra **Plugins** e desative (ou remova) os plugins individuais:
   - `spig-dsh-subscriptions`
   - `spig-dsh-thinking-provider`
2. Instale o `spig-dsh-toolkit` apontando para o diretório local `D:\Projetos\spig-dsh-toolkit` (**Plugins → Add plugin**).
3. Abra **Settings → Spig Toolkit** para ativar ou desativar cada componente individualmente.

> **Nota:** Todas as credenciais e preferências do Subscriptions (`$DSH_HOME/plugins/subscriptions/`) são preservadas automaticamente. Caso algum plugin legado ainda esteja ativo, o Toolkit detecta o conflito automaticamente e evita registro duplicado.

## Desenvolvimento

```powershell
npm run hooks:install       # ativa o pre-commit hook (.githooks/pre-commit)
npm run build               # reconstrói lib/client.js (UI)
npm run check               # valida sintaxe e imports da rota Antigravity
npm test                    # roda toda a suíte de testes
npm run diagnose:antigravity -- <session-id>  # resumo read-only de incidentes
```

> **Nota (Windows / DSH):** se o ambiente herdado definir `GIT_CONFIG_COUNT` sem chaves correspondentes, prefixe comandos `git` com `$env:GIT_CONFIG_COUNT='0'`.

Consulte [AGENTS.md](AGENTS.md) para procedimentos operacionais e [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para detalhes da arquitetura.
