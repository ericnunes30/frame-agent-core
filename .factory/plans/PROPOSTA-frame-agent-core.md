# Proposta: frame-agent-core (extracao do harness do frame-code-cli)

Data: 2026-02-14

## Objetivo

Criar um pacote "headless" e reutilizavel, chamado **frame-agent-core**, que concentre as funcionalidades de runtime hoje espalhadas/embutidas no **frame-code-cli**, mantendo o **frame-code-cli** como uma camada fina de UX (comandos, loop interativo, formatacao e I/O).

Esta proposta descreve **funcionalidades** e **contratos publicos**. Nao e um plano de "mover pastas".

### Status atual (2026-02-15)
- Compressao corrigida no core (protege system + primeira/ultima user).
- Gating de `read_image` implementado quando `supportsVision=false`.
- Telemetria default adicionada no core (`src/infrastructure/telemetry`, reexport em `src/index.ts`).
- Enforced "1 runtime por processo" ao inicializar tools: falha cedo se tentar inicializar para `projectRoot` diferente no mesmo processo.
- `ToolPolicy` consolidada como fonte canonica em `src/tools/registry/toolFilter.ts` (sem duplicacao em `agents/`).
- `agentParser` refatorado para atuar como coordenador: prompt assembly, tool selection, subagent wiring (`call_flow`) e LLM config extraidos em helpers internos; logica duplicada de tool policy removida.

## Resumo Executivo

- Hoje:
  - `frame-agent-sdk` entrega o motor (GraphEngine), tool calling, tool registry/executor, telemetria, e ferramentas base (filesystem, terminal, search, todo, etc).
  - `frame-code-cli` entrega um harness opinativo: registry de agentes por `.md`, injecao de regras do projeto (`AGENTS.md`/`CLAUDE.md`), MCP config/loader + registro, compressao (proativa/emergencial) e comandos (interactive/autonomous/multi-agent/memory).
- Proposta:
  - `frame-agent-core` vira o **harness opinativo** (equivalente ao "DeepAgents"): carrega agentes, regras, skills, MCP, politicas de tools, compressao, persistencia e runtime APIs para rodar/retomar execucoes.
  - `frame-code-cli` vira o **cliente/UX** (equivalente ao "DeepAgentsCLI"): parse de args, loop de conversa, output, integracao com terminal, e escolha de perfil de permissao.
- Resultado:
  - Qualquer app (CLI, server HTTP, desktop, CI, agent embedded) consegue criar e rodar agentes com 1 factory, sem copiar o "glue code" da CLI.

## Modelo Mental: correlacao com DeepAgents

Com base nos resumos `output.md` e `output-deep-wiki.md`:

- `langchain-core` + `langgraph` -> runtime/primitivos
- `deepagents` -> harness opinativo "batteries included" (tools + middleware + memoria/skills + subagents + persistencia)
- `deepagents-cli` -> UI/terminal por cima

No nosso ecossistema, o espelho natural e:

- `frame-agent-sdk` -> runtime/primitivos
- `frame-agent-core` (novo) -> harness opinativo "batteries included"
- `frame-code-cli` -> UI/terminal por cima

## Inventario Atual (o que ja existe)

### frame-agent-sdk (primitivos)

Pontos relevantes:

- Graph runtime: `GraphEngine` (execute/pause/resume, trace/telemetry, hooks).
- Hooks para controle de contexto: `ContextHooks` (beforeRequest/onError, retry policy). Ex: `frame-agent-sdk/src/memory/contextHooks.interface.ts`.
- Tooling:
  - Tool registry/executor/validator no SDK. Ex: `frame-agent-sdk/src/tools/core/toolRegistry.ts`.
  - MCP client/base/wrapper no SDK. Ex: `frame-agent-sdk/src/tools/tools/mcp/MCPBase.ts`.
- Ferramentas base (usadas no CLI via re-export):
  - FileReadTool, FileEditTool, FileCreateTool, TerminalTool, SearchTool, ToDoIstTool, SleepTool.
  - Ex: `frame-code-cli/src/tools/native/index.ts` re-exporta tools vindas do SDK.

### frame-code-cli (harness + UX)

Pontos relevantes (harness):

- Agentes por Markdown:
  - Parser de `.md` com frontmatter YAML + discovery de agentes.
  - Wiring para GraphEngine usando template ReAct e toolRegistry.
  - Injecao de regras do projeto e prompts.
  - Ex: `frame-code-cli/src/agent-runtime/registry/agentParser.ts`.
- Regras do projeto (`AGENTS.md` / `CLAUDE.md`):
  - Loader com prioridade `.code/AGENTS.md` > `AGENTS.md` raiz; e lookup por diretorio para `AGENTS.md`/`CLAUDE.md`.
  - Ex: `frame-code-cli/src/agent-runtime/context/project-rules/loader.ts`.
- MCP (config + registry):
  - Loader que le `.code/mcp.json`, aplica metadata (enable/excludeFromList), e registra tools via `MCPBase` do SDK com aliasing.
  - Ex: `frame-code-cli/src/tools/mcp/loader.ts` e `frame-code-cli/src/tools/mcp/register.ts`.
- Skills:
  - Loader de SKILL.md em `.code` com frontmatter.
  - Ex: `frame-code-cli/src/infrastructure/skills/loader.ts`.
- Compressao de contexto:
  - CompressionManager com compressao proativa + emergencial e persistencia em arquivo por `persistKey`.
  - Ele pluga no SDK via `ContextHooks` (a CLI implementa o hook; o SDK nao implementa compressao).
  - Ex: `frame-code-cli/src/infrastructure/compression/CompressionManager.ts`.

Pontos relevantes (UX):

- Comandos: interactive/autonomous/multi-agent/memory.
- Formatting/logging/telemetry para terminal.

## O Problema (por que extrair o core)

Hoje o "harness" esta preso ao produto CLI:

- Reuso: para criar um novo app de agente (server, daemon, job runner) voce tende a copiar/reatar:
  - discovery de agentes, rules injection, MCP, skills, tool filtering, compressao, etc.
- Acoplamento em `process.cwd()` e convencoes da CLI:
  - Loaders de rules/skills/mcp e persistencia (compressao) assumem o "projeto atual" como cwd.
- Duplicacao de "glue code":
  - O SDK ja tem MCP/ToolRegistry, mas a CLI contem o orchestration e as politicas.

## Proposta: responsabilidades por camada (funcional)

### frame-agent-sdk (nao muda o papel)

Responsavel por:

- Primitivos do motor (GraphEngine, flows, nodes).
- Primitivos de tools e tool calling.
- Provider adapters e telemetria base.
- Interfaces/hook points (ContextHooks, TraceSink, etc).

### frame-agent-core (novo) = harness opinativo (headless)

Responsavel por:

1. **Runtime factory**:
   - Um ponto unico para construir runtime e rodar agentes, equivalente ao `create_deep_agent`.
2. **Agent registry**:
   - Carregar agentes a partir de definicoes (Markdown e/ou factories em codigo).
   - Resolver subagents e expor `CallFlowTool` configurado corretamente.
3. **Project rules + memory injection**:
   - Carregar `AGENTS.md` e regras por diretorio (`AGENTS.md`/`CLAUDE.md`).
4. **Capabilities**:
   - Skills: discovery + enable/disable (sem UX, apenas API).
   - MCP: carregar config, registrar, aliasing, metadata para rastreio.
5. **Tool policy + profiles**:
   - Perfis de permissao (read-only, write, exec, network, mcp, etc).
   - Integracao com `ApprovalTool` e `AskUserTool` (quando aplicavel).
6. **Context management**:
   - Compressao proativa/emergencial via `ContextHooks` do SDK.
   - Persistencia de compressao (se desejado) desacoplada de cwd.
7. **Persistencia/checkpoint** (faseada):
   - Contrato para salvar/retomar execucoes (run state), mesmo que comece com no-op.
8. **Observabilidade**:
   - TraceSink padrao + interface para integrar sinks (terminal, json, OTEL, etc).

### frame-code-cli (fica fino) = UX/terminal

Responsavel por:

- Comandos e argumentos.
- Loop interativo/autonomo/multi-agent.
- Renderizacao e output.
- Escolha de perfil de permissao e de backends (ex.: sandbox) e injecao no core.

## Contrato Publico Proposto (API do frame-agent-core)

### Factory principal

```ts
type RuntimeProfile =
  | 'safe_readonly'
  | 'developer_write'
  | 'developer_exec'
  | 'ci_headless';

type FrameRuntimeOptions = {
  projectRoot: string;                 // nao presume cwd; o caller injeta
  profile: RuntimeProfile;

  agentSources?: Array<
    | { kind: 'markdown'; glob: string }   // ex: ".code/agents/**/*.md"
    | { kind: 'builtin'; id: string }      // ex: "architect", "code-agent"
    | { kind: 'factory'; id: string; create: () => unknown }
  >;

  rules?: {
    enabled: boolean;
    rootFiles?: string[];              // default: [".code/AGENTS.md", "AGENTS.md"]
    perDirectoryFiles?: string[];      // default: ["AGENTS.md", "CLAUDE.md"]
  };

  mcp?: {
    enabled: boolean;
    configFile?: string;               // default: ".code/mcp.json"
    registerMode?: 'auto' | 'manual';  // auto respeita enable/excludeFromList
    aliasMode?: 'stripNamespace' | 'none';
  };

  skills?: {
    enabled: boolean;
    sources?: string[];                // default: [".code"]
  };

  tools?: {
    include?: string[];                // allowlist
    exclude?: string[];                // denylist
    allowAskUser?: boolean;
  };

  compression?: {
    enabled: boolean;
    persist?: boolean;
    persistKey?: string;
    threshold?: number;
    maxCount?: number;
    maxTokens?: number;
    model?: string;
  };

  telemetry?: {
    sink?: unknown;                    // TraceSink do SDK
    options?: unknown;                 // TelemetryOptions do SDK
  };

  persistence?: {
    // fase 1+: checkpoint store para runs (sqlite/file/remote)
    runs?: unknown;
  };
};

type FrameRuntime = {
  listAgents(): Array<{ id: string; name: string; description?: string }>;
  getAgent(id: string): { id: string; createEngine: (args?: any) => any };

  run(args: { agentId: string; input: string; attachments?: any[]; sessionId?: string }): Promise<any>;
  resume(args: { runId: string; input: string }): Promise<any>;

  // capabilities
  listCapabilities(): Promise<any>;
  enableCapability(id: string): Promise<void>;
};

export function createFrameRuntime(options: FrameRuntimeOptions): Promise<FrameRuntime>;
```

Notas:

- O core nao precisa impor formato final de retorno; ele pode retornar o resultado do `GraphEngine.execute`.
- O core deve expor metadados suficientes para a CLI renderizar (trace id, run id, stats, tools chamadas).

## Middleware / Harness: como o core adiciona "baterias"

DeepAgents descreve um stack de middleware padrao. O equivalente no nosso mundo e:

- **Policia de tools**: antes de executar tool call, validar contra profile/policy.
- **Rules injection**: carregar `AGENTS.md` e colar no system prompt (hoje feito no parser de agente).
- **MCP integration**: registrar tools MCP no toolRegistry do SDK, com aliasing e metadata.
- **Skills**: discovery e exposicao como "capability" (para orientar prompt ou habilitar toolpacks).
- **Compressao**: implementar `ContextHooks` (beforeRequest/onError) usando CompressionManager.
- **Subagents**: configurar `CallFlowTool` com FlowRunner + FlowRegistry e subagents permitidos.

O core deve padronizar esses comportamentos em 1 lugar, com opcoes para ligar/desligar.

## Duplicacoes e Consolidacao (SDK vs CLI)

### Ja esta no SDK (nao reimplementar no core)

- MCP client/base/wrapper (o CLI ja usa `MCPBase` do SDK).
- ToolRegistry global e infraestrutura de tool calling.
- Ferramentas base: FileRead/Edit/Create, TerminalTool, SearchTool, ToDoIstTool, SleepTool.
- Telemetria base (TraceSink, TelemetryOptions).

### Esta no CLI hoje e deve virar core (harness)

- Agent md parser + registry + discovery + wiring (hoje em `agentParser.ts` e `AgentRegistry.ts`).
- Loaders "project-scoped" dependentes de `process.cwd()`:
  - Project rules loader (`AGENTS.md`/`CLAUDE.md`).
  - Skills loader (SKILL.md).
  - MCP config loader (mcp.json) e metadata (enable/excludeFromList).
  - Persistencia de compressao em arquivo.
- CompressionManager como implementacao concreta de `ContextHooks`.
- "Capability model" (listar/habilitar MCPs e skills) usado por `list_capabilities` e `enable_capability`.

### Deve permanecer no CLI (UX)

- Comandos e argumentos.
- Renderizacao no terminal (trace format).
- Prompt loop e input attachments.

## Roadmap (incremental, sem quebrar o CLI)

### Fase 0: alinhamento de contrato (1-2 dias)

- Definir API minima `createFrameRuntime` + `run` + `listAgents`.
- Definir `RuntimeProfile` e um schema de policy (tools, mcp, filesystem, exec).
- Definir "root scope" como `projectRoot` (sem `process.cwd()` interno).

Criterio de aceite:

- Um exemplo headless (script node) consegue listar agentes e rodar 1 agente com as mesmas regras do projeto.

### Fase 1: extracao do harness sem mudar comportamento (3-7 dias)

- Migrar para o core:
  - agent parser/registry
  - loaders: rules/skills/mcp
  - compression manager + hooks
  - tool initialization (como "toolpack default" + filtro)
- CLI passa a:
  - chamar `createFrameRuntime`
  - escolher profile e ligar/desligar `allowAskUser`
  - manter output/UX

Criterio de aceite:

- `frame-code-cli` mantem paridade funcional nos comandos principais (interactive/autonomous/multi-agent/memory).

### Fase 2: persistencia de runs (checkpoint) (opcional, 1-2 semanas)

- Criar contrato `RunStore` (file/sqlite) para salvar:
  - runId, agentId, state snapshot, timestamps, traceId, metadata
- `resume(runId)` funciona de forma consistente para flows que pausam.

Criterio de aceite:

- Uma execucao pausada em `AskUserTool` pode ser retomada apos reiniciar o processo.

### Fase 3: endurecer politicas + sandbox (opcional)

- Perfis de permissao claros:
  - safe_readonly (sem terminal, sem write)
  - developer_write (write/edit permitido)
  - developer_exec (terminal permitido, com approvals)
- Opcional: backend de "sandbox" para TerminalTool (local vs remoto).

Criterio de aceite:

- Mesmo agente se comporta de forma previsivel sob perfis diferentes; e possivel auditar negacoes de policy via trace.

## Testes de Paridade (o que precisa existir)

Sem criar suite gigante de inicio, pelo menos:

- Agent loading:
  - carrega built-in agents + project agents (md)
  - parse frontmatter (inclui multiline)
- Rules injection:
  - `.code/AGENTS.md` ganha prioridade sobre `AGENTS.md`
  - `loadFromDirectory` encontra `AGENTS.md` e fallback `CLAUDE.md`
- MCP:
  - respeita enable=false (nao registra)
  - respeita excludeFromList=true (nao aparece em list_capabilities)
  - aliasing stripNamespace nao colide (detectar e falhar com mensagem clara)
- Compressao:
  - onError retry em overflow reduz contexto e retenta
  - persistKey isola compressao por agente/sessao
- Multi-agent:
  - subagent tool (`CallFlowTool`) so enxerga subagents permitidos

## Decisoes Abertas (precisa sua confirmacao)

1. O `frame-agent-core` deve ser:
   - opinativo (um "deepagents") com defaults fortes
   - ou apenas um "runtime loader" com defaults minimos?
2. Profiles de permissao:
   - queremos 3-4 perfis oficiais (recomendado), ou configuracao 100% custom?
3. Persistencia de runs:
   - prioridade agora, ou depois que o core estiver estabilizado?
4. Convencoes de definicao de agente:
   - manter markdown como formato principal
   - ou suportar code-first como 1a classe (factories) desde o inicio?

## Referencias internas (para auditoria)

- Agent parser/registry atual: `frame-code-cli/src/agent-runtime/registry/agentParser.ts`
- Project rules loader: `frame-code-cli/src/agent-runtime/context/project-rules/loader.ts`
- MCP loader/registry: `frame-code-cli/src/tools/mcp/loader.ts`, `frame-code-cli/src/tools/mcp/register.ts`
- Skills loader: `frame-code-cli/src/infrastructure/skills/loader.ts`
- CompressionManager: `frame-code-cli/src/infrastructure/compression/CompressionManager.ts`
- SDK ContextHooks: `frame-agent-sdk/src/memory/contextHooks.interface.ts`
- SDK MCP base: `frame-agent-sdk/src/tools/tools/mcp/MCPBase.ts`
