# frame-agent-core

Harness headless para construir e executar agentes em cima do `@ericnunes/frame-agent-sdk`.

Este pacote e o "core" opinativo (equivalente ao DeepAgents no modelo mental):

- Carrega agentes (Markdown e/ou factories)
- Injeta regras do projeto (`AGENTS.md` / `CLAUDE.md`)
- Carrega skills (`SKILL.md`) e MCPs (`.code/mcp.json`)
- Inicializa tools e aplica politicas/perfis de permissao
- Exponibiliza uma API unica para `listAgents()`, `run()` e `resume()`

## Modelo de processo (importante)

Hoje o core assume e reforca **"1 runtime por processo"**.

Motivo: a inicializacao de tools usa estado global (ToolRegistry singleton no SDK e "toolpack" inicializado uma vez) e fica amarrada a um `projectRoot`. Se o mesmo processo tentar inicializar tools para outro `projectRoot`, o core falha cedo com erro explicito para evitar vazamento de configuracao/policy entre projetos.

Se voce precisa rodar runtimes de projetos diferentes em paralelo, rode **processos separados** (um Node por `projectRoot`).
