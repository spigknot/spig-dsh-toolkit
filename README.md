# spig-dsh-toolkit

Plugin modular para o DeepSeek Harness (DSH) que centraliza os plugins `spig-dsh-subscriptions` e `spig-dsh-thinking-provider` como componentes independentes, cada um com seu próprio toggle em **Settings → Spig Toolkit**.

## Componentes incluídos

- **Subscriptions** (`subscriptions`): provedores por assinatura (Codex, Claude, Grok, Copilot e Google Antigravity via CLI `agy`), pools de contas, proxy HTTP, compaction model e ferramentas (`image_generate`, `video_generate`, `x_search`).
- **Thinking Provider** (`thinking-provider`): níveis de raciocínio (*reasoning effort*) para modelos de terceiros, slider no composer, rota/esforço padrão de subagentes, política de compactação e headers OpenCode.

## Instalação e substituição dos plugins individuais

1. No DSH, abra **Plugins** e desative (ou remova) os plugins individuais:
   - `spig-dsh-subscriptions`
   - `spig-dsh-thinking-provider`
2. Instale o `spig-dsh-toolkit` apontando para o diretório local `D:\Projetos\spig-dsh-toolkit` (**Plugins → Add plugin**).
3. Abra **Settings → Spig Toolkit** para ativar ou desativar cada componente individualmente.

> **Nota:** Todas as credenciais e preferências do Subscriptions (`$DSH_HOME/plugins/subscriptions/`) são preservadas automaticamente. Caso algum plugin legado ainda esteja ativo, o Toolkit detecta o conflito automaticamente e evita registro duplicado.

## Desenvolvimento

```powershell
node scripts/build.mjs
node --check lib/index.js
node --check lib/client.js
node --test test/*.test.mjs
```

Consulte [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para detalhes da arquitetura e instruções para adicionar novos componentes.
