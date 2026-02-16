# Plano: Core Agnostico de Layout de Projeto (Sem Hardcode de ".code/")

## Objetivo
Tornar o `frame-agent-core` agnostico de convencoes de projeto (nome de pasta, caminhos e nomes de arquivos), sem perder as funcionalidades atuais que hoje assumem `.code/*`.

O core continua sendo o motor (agents, MCP, rules, config por agente, skills), mas passa a trabalhar com um layout configuravel em vez de uma convencao fixa.

## Nao-Objetivos (por enquanto)
- Nao tornar o core "agnostico de filesystem" (ex.: storage remoto). Continuamos usando `fs` local.
- Nao mudar a UX do `frame-code-cli` agora (ele pode continuar usando `.code/` como default).
- Nao reestruturar pastas do repo; foco em funcionalidade e API.

## Estado Atual (hardcodes de `.code`)
Hoje o core assume `.code` em pontos especificos:
- Agents discovery: default `.code/agents` (`frame-agent-core/src/agents/internal/agentParser.ts` em `discoverAgents()`).
- Agent model config: `.code/config.json` (`frame-agent-core/src/agents/internal/agentConfig.ts`).
- Project rules: `.code/AGENTS.md` (fallback `AGENTS.md`) (`frame-agent-core/src/project-rules/loader.ts`).
- Skills: default `.code` (nao `.code/skills`) (`frame-agent-core/src/skills/loader.ts`).
- MCP config: default `.code/mcp.json` (`frame-agent-core/src/tools/mcp/discoverer.ts`).

Resultado: o core "vaza" uma convencao de projeto especifica (pasta `.code/`) e isso trava adocao em outros layouts (ex.: `.frame/`, `ops/ai/`, monorepo com pasta dedicada).

## Principio De Design
Separar "capability" de "convention":
- Capability: core sabe descobrir agents, carregar rules, ler config, registrar MCP, etc.
- Convention: onde ficam esses arquivos (ex.: `.code/*`) e como se chamam.

O core deve oferecer um layout default (compat) mas nao deve depender de nomes fixos internamente.

## Proposta: `FrameProjectLayout` (layout configuravel)

### 1) Novo tipo: `FrameProjectLayout`
Um objeto com caminhos (relativos ao `projectRoot` por default) que define onde o core procura:
- `workspaceDir`: pasta "container" (default `.code`)
- `agentsDir`: (default `${workspaceDir}/agents`)
- `mcpConfigFile`: (default `${workspaceDir}/mcp.json`)
- `agentConfigFile`: (default `${workspaceDir}/config.json`)
- `rulesFile`: (default `${workspaceDir}/AGENTS.md`)
- `rulesFallbackFile`: (default `AGENTS.md`)
- `skillsDir`: (default `${workspaceDir}/skills`)

Regras:
- Aceitar valores relativos ou absolutos.
- Resolver tudo para caminho absoluto em runtime (uma unica vez) com helper central.

### 2) Resolver layout: `resolveProjectLayout(projectRoot, overrides?)`
Um helper no core que:
- parte de `DEFAULT_FRAME_PROJECT_LAYOUT` (equivalente ao comportamento atual do `.code/`)
- aplica `overrides`
- normaliza caminhos para absolutos

### 3) Integrar no runtime: `createFrameRuntime({ layout? })`
Expandir `FrameRuntimeOptions` com `layout?: Partial<FrameProjectLayout>`.

Precedencia (para manter compatibilidade):
1. `options.agents.dirs` e `options.agents.dir` (se informados)
2. `options.mcp.configFile` (se informado)
3. `options.layout` (novo)
4. `DEFAULT_FRAME_PROJECT_LAYOUT` (default atual: `.code/*`)

Assim, projetos existentes nao quebram.

## Mudancas Necessarias (por modulo)

### A) Agents discovery (`discoverAgents`)
Estado atual:
- `discoverAgents()` defaulta para `.code/agents` internamente.

Mudanca:
- Permitir `discoverAgents({ projectRoot, agentsDirs, layout? })`.
- Se `agentsDirs` nao vierem, usar `layout.agentsDir`.

Impacto:
- `AgentRegistry` precisa receber `layoutResolved` (ou receber `agentsDirs` ja resolvidos).

### B) Config por agente (`loadAgentConfig`)
Estado atual:
- Hardcode `.code/config.json` e cache por `projectRoot`.

Mudanca:
- `loadAgentConfig(projectRoot, agentName, { configFile? })`.
- Cache deve ser por caminho do arquivo (ou `${root}::${configFile}`), nao apenas `root`.

### C) Project rules (`loadProjectRules`)
Estado atual:
- Procura `.code/AGENTS.md` e depois `AGENTS.md`.

Mudanca:
- `loadProjectRules.load(projectRoot, { rulesFile?, rulesFallbackFile? })`.
- Logs nao devem mencionar `.code` explicitamente; logar o caminho real utilizado.

### D) Skills (`SkillLoader`)
Estado atual:
- Default `skillsDir = <root>/.code` e nao entra em subpastas.
- Isso nao casa com a convencao do CLI (`.code/skills/<skill>/SKILL.md`).

Mudanca:
- Default para `layout.skillsDir` (ex.: `<root>/.code/skills`).
- Compatibilidade: se `skillsDir` nao existir, suportar fallback no `workspaceDir` antigo para setups legados.
- Ergonomia: considerar `skillsDirs: string[]` para varrer mais de um local.

### E) MCP config (`loadUserCodeMcpConfigs`)
Estado atual:
- Default `.code/mcp.json` se `configFile` nao vier.

Mudanca:
- Receber `layout?` e defaultar para `layout.mcpConfigFile`.
- O runtime deve sempre passar `mcpConfigFile` resolvido, reduzindo dependencias de default.

## Entregaveis De API
- `FrameProjectLayout` (tipo)
- `DEFAULT_FRAME_PROJECT_LAYOUT` (const)
- `resolveProjectLayout(projectRoot, overrides?)` (func)
- `createFrameRuntime` aceita `layout?`

Opcional (bom para ergonomia):
- Exportar um helper `resolveDefaultAgentsDirs({ builtinDirs?, layout })` para consumidores que juntam built-ins + user agents.

## Plano De Implementacao (fatiado)

### Fase 0: Baseline e Garantias
1. Criar um smoke test no core com dois cenarios: layout default e layout custom.
2. Confirmar que o `frame-code-cli` continua passando em `npm run test:core-migration`.

### Fase 1: Introduzir Layout (sem alterar comportamento)
1. Implementar `FrameProjectLayout`, `DEFAULT_FRAME_PROJECT_LAYOUT` e `resolveProjectLayout`.
2. Adicionar `layout?` em `FrameRuntimeOptions` e resolver dentro do `createFrameRuntime`.
3. Sem refatorar modulos ainda; apenas preparar `layoutResolved` para ser passado adiante.

### Fase 2: Remover hardcodes de `.code` dos modulos
1. `project-rules/loader.ts`: aceitar paths via args e derivar defaults do layout.
2. `agents/internal/agentConfig.ts`: aceitar `configFile` e ajustar cache por path.
3. `agents/internal/agentParser.ts`: default de `discoverAgents()` baseado no layout (sem `.code` literal).
4. `skills/loader.ts`: suportar `skillsDir` ou `skillsDirs`, e default via layout.
5. `tools/mcp/discoverer.ts`: default via layout quando `configFile` nao vier.

### Fase 3: Amarrar Runtime, Registry e Tools
1. `createFrameRuntime()` deve passar layout para tudo que precisa (AgentRegistry, project rules, agent config, skills, MCP).
2. `list_capabilities` e `enable_capability` devem usar `SkillLoader({ projectRoot, skillsDir })` (ou `skillsDirs`) vindo do layout.
3. Atualizar comentarios de `FrameRuntimeOptions` que hoje citam `.code/*` (trocar por "workspace/agents dir configurado").

### Fase 4: Migracao do CLI (sem quebrar nada)
1. O CLI continua default `.code/` (pode nem passar layout e continuar funcionando).
2. Se o CLI quiser suportar outros layouts, criar flag/env no CLI (ex.: `FRAME_WORKSPACE_DIR`) e mapear para `createFrameRuntime({ layout: { workspaceDir: ... } })`.

## Testes / Validacao

Cenarios minimos:
1. Default layout: projeto com `.code/agents`, `.code/mcp.json`, `.code/config.json`, `.code/AGENTS.md`, `.code/skills/`.
2. Custom layout: mesmo projeto, mas usando `.frame/` (ou `agent/`) com os mesmos arquivos; executar `createFrameRuntime({ layout: { workspaceDir: '.frame' } })`.
3. Regressao CLI: `frame-code-cli` build e `frame-code-cli` `npm run test:core-migration`.

Validacoes (aplicar nos cenarios 1 e 2 conforme fizer sentido):
1. `runtime.listAgents()` inclui os agentes do dir configurado.
2. MCP loader encontra configs do arquivo configurado.
3. `loadProjectRules` usa `rulesFile` com prioridade e faz fallback em `rulesFallbackFile`.
4. `loadAgentConfig` le o config do caminho configurado.
5. `list_capabilities` lista skills quando elas existem no `skillsDir` configurado.

## Riscos E Cuidados
- Cache em `agentConfig.ts` hoje e por root; precisa virar por "configPath" para suportar layouts diferentes no mesmo processo.
- Logs e docs mencionando `.code` precisam ser "path-driven", senao confunde.
- `SkillLoader` precisa refletir a convencao real (`.code/skills`) para nao parecer que "skills sumiram".
- Manter compatibilidade: nenhuma mudanca deve exigir que projetos existentes movam arquivos.

## Pesquisa Futuro (nao fazer agora)
- Storage abstraction: permitir que agents/config/rules venham de outro backend (S3, DB, HTTP).
- Config injection: permitir passar `IConfig` direto sem dotenv/env (core ainda usa `.env`).
- Multi-runtime por processo: hoje tools/registry e global (1 runtime por processo). Agnostico de projeto pode amplificar essa dor.

