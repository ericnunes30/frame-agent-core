# frame-agent-core: Origem do Codigo e Referenciais

Data: 2026-02-14

Este documento explica **de onde cada trecho/modulo do `frame-agent-core` foi puxado** (SDK vs Code CLI) e aponta os **referenciais** (paths) para entender os pontos logicos.

Regras deste ciclo:
- Nao alteramos `frame-code-cli` nem `frame-agent-sdk`.
- Tudo foi implementado/adaptado **apenas** em `frame-agent-core`.

## Legend

Tipos de origem usados abaixo:
- **[SDK]**: reutilizado diretamente do `@ericnunes/frame-agent-sdk` (import), sem copiar implementacao.
- **[CLI->CORE]**: portado do `frame-code-cli` (mesma logica, com adaptacoes para `projectRoot`).
- **[NOVO]**: glue/contratos criados no core para substituir acoplamentos de UX/CLI.

## Ponto Logico: como o runtime funciona (alto nivel)

1. **Criacao do runtime**
   - Core: `frame-agent-core/src/runtime/createFrameRuntime.ts`
   - Decide `projectRoot` e (opcionalmente) faz `chdir` para compatibilidade com tools do SDK que resolvem paths via `process.cwd()`.

2. **Inicializacao de tools**
   - Core: `frame-agent-core/src/tools/registry/ToolInitializer.ts`
   - Origem: `frame-code-cli/src/tools/registry/ToolInitializer.ts` (**[CLI->CORE]**) + tools do SDK (**[SDK]**)
   - Registra tools base do SDK (filesystem/terminal/search/todo/sleep) e tools locais do core (capabilities, list_directory, read_image, file_outline).
   - (Opcional) registra tools MCP via `MCPBase` do SDK.

3. **Carregamento de agentes (.md)**
   - Core: `frame-agent-core/src/agents/AgentRegistry.ts` + `frame-agent-core/src/agents/agentParser.ts`
   - Origem: `frame-code-cli/src/agent-runtime/registry/AgentRegistry.ts` e `frame-code-cli/src/agent-runtime/registry/agentParser.ts` (**[CLI->CORE]**)
   - Diferenca importante: o core nao embute os agentes built-in do produto CLI. O default do core e varrer `projectRoot/.code/agents`.

4. **Criacao do GraphEngine por agente**
   - Core: `frame-agent-core/src/agents/agentParser.ts` (funcao `createAgentFromFlow`)
   - SDK: `GraphEngine`, `createAgentNode`, `createReactValidationNode`, `createToolDetectionNode`, `createToolExecutorNode`, `CallFlowTool`, `FlowRunnerImpl`, `FlowRegistryImpl` (**[SDK]**)
   - Logica:
     - monta o `systemPrompt` (prompt externo + base + regras do projeto + contexto de compressao)
     - resolve config do LLM (ENV + `.code/config.json`)
     - filtra tools por policy + lista explicita do agente
     - expande "chrome-devtools"/namespaces MCP para tools reais (via metadata `_mcpNamespace`)
     - se supervisor: injeta lista de subagents no prompt e configura `call_flow` com subgraphs.

5. **Execucao e resume**
   - Core: `frame-agent-core/src/runtime/createFrameRuntime.ts`
   - SDK: `GraphEngine.execute()` e `GraphEngine.resume()` (**[SDK]**), com `runId` em `state.metadata.runId`
   - Observacao: persistencia de runs e apenas **em memoria** neste ciclo (Map). Persistencia em disco fica para fase posterior.

## Mapa por Funcionalidade (SDK x CLI)

### Motor de execucao (graph runtime)
- **[SDK]** `GraphEngine` + status + resume/pause
  - Referencia: `frame-agent-sdk/src/orchestrators/graph/core/GraphEngine.ts`

### Template ReAct (validate/detect/execute/end)
- **[CLI->CORE]** template do Code CLI, mas usando nodes do SDK
  - Origem: `frame-code-cli/src/agent-runtime/flows/templates/ReactAgentFlow.ts`
  - Core: `frame-agent-core/src/agents/flows/ReactAgentFlow.ts`
  - Nodes usados (**[SDK]**): `createReactValidationNode`, `createToolDetectionNode`, `createToolExecutorNode`

### Prompt/Rules do projeto (AGENTS.md / CLAUDE.md)
- **[CLI->CORE]**
  - Origem: `frame-code-cli/src/agent-runtime/context/project-rules/loader.ts`
  - Core: `frame-agent-core/src/project-rules/loader.ts`

### System prompt externo (systemPromptPath)
- **[CLI->CORE]** (refatorado para `projectRoot` + `agentDir`)
  - Origem: `frame-code-cli/src/agent-runtime/context/system-prompts/loader.ts`
  - Core: `frame-agent-core/src/system-prompts/loader.ts`

### MCP (carregar config, metadata e registrar tools)
- **[CLI->CORE]** com `MCPBase` do SDK
  - Origem:
    - `frame-code-cli/src/tools/mcp/discoverer.ts`
    - `frame-code-cli/src/tools/mcp/loader.ts`
    - `frame-code-cli/src/tools/mcp/register.ts`
    - `frame-code-cli/src/tools/mcp/mcpMetadata.ts`
    - `frame-code-cli/src/tools/mcp/mcpConfig.interface.ts`
  - Core:
    - `frame-agent-core/src/tools/mcp/discoverer.ts`
    - `frame-agent-core/src/tools/mcp/loader.ts`
    - `frame-agent-core/src/tools/mcp/register.ts`
    - `frame-agent-core/src/tools/mcp/mcpMetadata.ts`
    - `frame-agent-core/src/tools/mcp/mcpConfig.interface.ts`
  - SDK base:
    - `frame-agent-sdk/src/tools/tools/mcp/MCPBase.ts`

### Skills (SKILL.md)
- **[CLI->CORE]**
  - Origem: `frame-code-cli/src/infrastructure/skills/loader.ts`
  - Core: `frame-agent-core/src/skills/loader.ts`

### Compressao (proativa/emergencial) via Context Policy
- **[CLI->CORE]** como implementacao concreta + **[SDK]** como interface de contexto
  - Origem:
    - `frame-code-cli/src/infrastructure/compression/CompressionManager.ts`
    - `frame-code-cli/src/infrastructure/compression/LLMCompressionService.ts`
    - `frame-code-cli/src/agent-runtime/context/hooks/compressionHook.ts`
  - Core:
    - `frame-agent-core/src/compression/CompressionManager.ts`
    - `frame-agent-core/src/compression/LLMCompressionService.ts`
    - `frame-agent-core/src/context/policies/compressionPolicy.ts`
  - SDK interface:
    - `frame-agent-sdk/src/memory/contextHooks.interface.ts`

### Tools "capabilities" (listar/habilitar skills e MCPs)
- **[CLI->CORE]**
  - Origem: `frame-code-cli/src/tools/native/capabilities.ts`
  - Core: `frame-agent-core/src/tools/native/capabilities.ts`

### Tools de filesystem/terminal/search/todo
- **[SDK]** (core apenas re-exporta/casta para evitar problemas de tipos gerados)
  - SDK:
    - `frame-agent-sdk/src/tools/tools/fileReadTool.ts`
    - `frame-agent-sdk/src/tools/tools/fileEditTool.ts`
    - `frame-agent-sdk/src/tools/tools/fileCreateTool.ts`
    - `frame-agent-sdk/src/tools/tools/terminalTool.ts`
    - `frame-agent-sdk/src/tools/tools/searchTool.ts`
    - `frame-agent-sdk/src/tools/tools/toDoIstTool.ts`
    - `frame-agent-sdk/src/tools/tools/sleepTool.ts`
  - Core:
    - `frame-agent-core/src/tools/native/index.ts`

### Tools locais do produto CLI (portados para o core)
- **[CLI->CORE]** (ajustados para resolver paths a partir de `projectRoot`)
  - Origem:
    - `frame-code-cli/src/tools/native/list-directory.ts`
    - `frame-code-cli/src/tools/native/read-image.ts`
    - `frame-code-cli/src/tools/native/file-outline.ts`
  - Core:
    - `frame-agent-core/src/tools/native/list-directory.ts`
    - `frame-agent-core/src/tools/native/read-image.ts`
    - `frame-agent-core/src/tools/native/file-outline.ts`

## Mapa por Arquivo (frame-agent-core/src/*)

### Entry points

- `frame-agent-core/src/index.ts`
  - Origem: **[NOVO]**
  - Papel: exporta `createFrameRuntime` e tipos publicos.

### Runtime

- `frame-agent-core/src/runtime/createFrameRuntime.ts`
  - Origem: **[NOVO]**
  - Papel: factory headless do runtime (cria tools + carrega agentes + expõe `run/resume`).
  - Referencias SDK:
    - `frame-agent-sdk/src/orchestrators/graph/core/GraphEngine.ts` (execute/resume e `runId` em metadata)
    - `frame-agent-sdk/src/tools/core/toolRegistry.ts` (registry global de tools)

- `frame-agent-core/src/runtime/types.ts`
  - Origem: **[NOVO]**
  - Papel: contrato publico (`FrameRuntimeOptions`, `FrameRuntime`, perfis).

### Agents

- `frame-agent-core/src/agents/AgentRegistry.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/agent-runtime/registry/AgentRegistry.ts`
  - Mudancas:
    - deixou de ser singleton; agora e por runtime
    - suporta `agents.dirs` (multiplos diretorios em ordem)
    - permite overwrite (ultimo diretorio vence) para override de agente

- `frame-agent-core/src/agents/agentParser.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/agent-runtime/registry/agentParser.ts`
  - Pontos logicos principais (core):
    - parse frontmatter + multiline (`parseAgentFile`)
    - discovery por diretorios (`discoverAgents`)
    - injecao de rules do projeto (AGENTS.md) e instrucao de rules por diretorio
    - expansao de MCPs para tools via `_mcpNamespace`
    - wiring de subagents via `call_flow` com `FlowRegistryImpl/FlowRunnerImpl/CallFlowTool`
  - Referencias SDK usadas:
    - `GraphEngine`, `createAgentNode`
    - `FlowRegistryImpl`, `FlowRunnerImpl`, `CallFlowTool`
    - `toolRegistry` (global)

- `frame-agent-core/src/agents/flows/ReactAgentFlow.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/agent-runtime/flows/templates/ReactAgentFlow.ts`
  - Referencias SDK:
    - `createReactValidationNode`, `createToolDetectionNode`, `createToolExecutorNode`

- `frame-agent-core/src/agents/interfaces/agentMetadata.interface.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/agent-runtime/registry/interfaces/agentMetadata.interface.ts`
  - Papel: contrato de metadados de agente (tools, subAgents, policy, prompts, etc).

- `frame-agent-core/src/agents/enums/agentType.enum.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/agent-runtime/registry/enums/agentType.enum.ts`

- `frame-agent-core/src/agents/index.ts`
  - Origem: **[NOVO]**
  - Papel: barrel exports.

### Project Rules

- `frame-agent-core/src/project-rules/loader.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/agent-runtime/context/project-rules/loader.ts`
  - Mudancas:
    - remove `process.cwd()` interno, usa `projectRoot` injetado

### System Prompts

- `frame-agent-core/src/system-prompts/loader.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/agent-runtime/context/system-prompts/loader.ts`
  - Mudancas:
    - substitui heuristicas de `__dirname` por resolucao deterministica:
      - relativo ao arquivo do agente (quando `systemPromptPath` e relativo)
      - relativo ao `projectRoot`
      - e pastas convencionais `src/prompts` e `prompts`

### Config

- `frame-agent-core/src/infrastructure/config/config.interface.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/infrastructure/config/config.interface.ts`

- `frame-agent-core/src/infrastructure/config/config.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/infrastructure/config/config.ts`
  - Mudancas:
    - carrega `.env` e `.env.local` a partir de `projectRoot` (nao de `cwd`)
    - adiciona cache por root para evitar re-load repetido

- `frame-agent-core/src/agents/config/agentConfig.interface.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/infrastructure/config/agentConfig.interface.ts`

- `frame-agent-core/src/agents/config/agentConfig.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/infrastructure/config/agentConfig.ts`
  - Mudancas:
    - busca `.code/config.json` a partir de `projectRoot`
    - cache por root (Map)

- `frame-agent-core/src/infrastructure/config/index.ts`
  - Origem: **[NOVO]**
  - Papel: barrel exports.

### Logging

- `frame-agent-core/src/infrastructure/logging/logger.ts`
  - Origem: **[NOVO]**
  - Papel: logger simples e deterministico do core (filtra por `FRAME_LOG_LEVEL`).

### MCP

- `frame-agent-core/src/tools/mcp/mcpMetadata.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/tools/mcp/mcpMetadata.ts`

- `frame-agent-core/src/tools/mcp/mcpConfig.interface.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/tools/mcp/mcpConfig.interface.ts`

- `frame-agent-core/src/tools/mcp/discoverer.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/tools/mcp/discoverer.ts`
  - Mudancas:
    - resolve `.code/mcp.json` a partir de `projectRoot`

- `frame-agent-core/src/tools/mcp/loader.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/tools/mcp/loader.ts`

- `frame-agent-core/src/tools/mcp/register.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/tools/mcp/register.ts`
  - Mudancas:
    - removeu helpers de docker (start/stop/isRunning) por serem UX/ops do produto CLI
    - manteve apenas o registro generico (connect + createTools + alias + register)
  - Referencia SDK:
    - `frame-agent-sdk/src/tools/tools/mcp/MCPBase.ts`

- `frame-agent-core/src/tools/mcp/index.ts`
  - Origem: **[NOVO]**
  - Papel: barrel exports.

### Skills

- `frame-agent-core/src/skills/loader.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/infrastructure/skills/loader.ts`
  - Mudancas:
    - base path passa a ser `projectRoot/.code` (injetado)

### Compression + Context Policy (SDK ContextHooks)

- `frame-agent-core/src/context/policies/compressionPolicy.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/agent-runtime/context/hooks/compressionHook.ts`
  - Referencia SDK:
    - `frame-agent-sdk/src/memory/contextHooks.interface.ts`

- `frame-agent-core/src/compression/CompressionManager.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/infrastructure/compression/CompressionManager.ts`
  - Mudancas:
    - persistencia em `projectRoot/.frame-agent-compressions.<key>.json`
    - compatibilidade de leitura do legado `.frame-code-compressions.<key>.json`
    - remove dependencias diretas do logger/config do CLI e injeta `projectRoot`

- `frame-agent-core/src/compression/LLMCompressionService.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/infrastructure/compression/LLMCompressionService.ts`
  - Mudancas:
    - import do OpenAI client mais robusto (suporta export default vs named)
    - carrega config com `projectRoot`

### Tools (native)

- `frame-agent-core/src/tools/native/index.ts`
  - Origem: **[SDK] + [NOVO]**
  - Origem CLI (conceito): `frame-code-cli/src/tools/native/index.ts`
  - Papel:
    - re-exporta tools do SDK (FileRead/Edit/Create, Terminal, Search, ToDoIst, Sleep)
    - expõe factories para tools locais do core (capabilities, list_directory, read_image, file_outline)

- `frame-agent-core/src/tools/native/list-directory.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/tools/native/list-directory.ts`
  - Mudanca: paths relativos resolvidos contra `projectRoot`.

- `frame-agent-core/src/tools/native/read-image.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/tools/native/read-image.ts`
  - Mudanca: paths relativos resolvidos contra `projectRoot`.

- `frame-agent-core/src/tools/native/file-outline.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/tools/native/file-outline.ts`
  - Mudancas:
    - output simplificado (ASCII)
    - paths relativos resolvidos contra `projectRoot`

- `frame-agent-core/src/tools/native/capabilities.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/tools/native/capabilities.ts`
  - Referencias internas no core:
    - skills: `frame-agent-core/src/skills/loader.ts`
    - mcp: `frame-agent-core/src/tools/mcp/loader.ts` e `frame-agent-core/src/tools/mcp/discoverer.ts`

### Tools (registry)

- `frame-agent-core/src/tools/registry/toolFilter.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/tools/registry/toolFilter.ts`
  - Mudanca:
    - adicionou `RuntimeProfile` e defaults por perfil (em vez de depender apenas de ENV)

- `frame-agent-core/src/tools/registry/ToolInitializer.ts`
  - Origem: **[CLI->CORE]**
  - Origem exata: `frame-code-cli/src/tools/registry/ToolInitializer.ts`
  - Mudancas:
    - virou funcao parametrizada (`projectRoot`, `profile`, toggles)
    - registra tools do core + do SDK
    - integra MCP via `frame-agent-core/src/tools/mcp/register.ts`

- `frame-agent-core/src/tools/registry/index.ts`
  - Origem: **[NOVO]**
  - Papel: barrel exports.

## Itens deliberadamente NAO portados (ainda)

Do `frame-code-cli` para o core:
- Comandos/UX: `frame-code-cli/src/cli/**` (interactive/autonomous/multi-agent/memory)
- Conteudo built-in de agentes: `frame-code-cli/src/content/agents/*.md`
- Helpers de docker/ops no MCP: start/stop/isRunning (ficam no produto CLI)
- Persistencia de runs (checkpoint): no core hoje e apenas Map em memoria

## Observacoes de compatibilidade

- Muitos tools do SDK resolvem paths relativos com `process.cwd()` (ex.: `file_read` usa `path.resolve(params.filePath)`).
  - No core, isso foi enderecado com a opcao `chdirToProjectRoot` (default: true) em `createFrameRuntime`.
  - Quando migrarmos o Code CLI para o core, podemos decidir se vamos:
    - manter o `chdir` como comportamento padrao
    - ou evoluir o SDK para aceitar `projectRoot`/filesystem abstraction (fase futura)
