# Pesquisa Profunda: Gaps e Itens a Migrar para `frame-agent-core`

Data: 2026-02-15

Objetivo: identificar **o que falta no `frame-agent-core`** (comparando com `frame-code-cli` e `frame-agent-sdk`) e **o que faz sentido mover** para o core, mantendo:
- `frame-agent-sdk` como base de orquestração (engine, tipos, execução, telemetry core).
- `frame-code-cli` como camada de UX (commander, loops interativos, stdin, formatação de output).

---

## 1) Inventário Rápido (estado atual)

### O que já existe no `frame-agent-core` (runtime suficiente para “rodar agente”)
- Runtime headless: `createFrameRuntime` com `run/resume` e inicialização de tools/MCP/agentes.
  - `frame-agent-core/src/runtime/createFrameRuntime.ts`
  - `frame-agent-core/src/runtime/types.ts`
- Registro e parser de agentes `.md` (frontmatter + body), discovery por diretórios e wiring de `call_flow` para subagentes.
  - `frame-agent-core/src/agents/core/AgentRegistry.ts`
  - `frame-agent-core/src/agents/core/agentParser.ts`
- Tools: registro default, filtros por perfil, MCP loader/register e tools nativas locais (list_directory/read_image/file_outline/capabilities).
  - `frame-agent-core/src/tools/registry/ToolInitializer.ts`
  - `frame-agent-core/src/tools/registry/toolFilter.ts`
  - `frame-agent-core/src/tools/mcp/*`
  - `frame-agent-core/src/tools/native/*`
- Config: `.env`/`.env.local` e `.code/config.json` resolvidos via `projectRoot`.
  - `frame-agent-core/src/infrastructure/config/config.ts`
  - `frame-agent-core/src/agents/core/agentConfig.ts`
- Project rules (AGENTS.md/CLAUDE.md) e system prompts externos.
  - `frame-agent-core/src/project-rules/loader.ts`
  - `frame-agent-core/src/system-prompts/loader.ts`
- Compressão: manager + policy (ContextHooks do SDK).
  - `frame-agent-core/src/compression/*`
  - `frame-agent-core/src/context/policies/compressionPolicy.ts`

### O que existe no `frame-code-cli` que ainda não está no core (candidatos)
- Telemetria “pronta para uso” no terminal (ConsoleTraceSink + formatter + env flags).
  - `frame-code-cli/src/infrastructure/telemetry/*`
- Instrumentação de debug para dump do output bruto do LLM.
  - `frame-code-cli/src/infrastructure/logging/raw-output-logger.ts`
- Helpers de UX de agentes (default agent, listagem formatada), APIs extras do registry (stats/search/supervisors).
  - `frame-code-cli/src/agent-runtime/registry/initialization.ts`
  - `frame-code-cli/src/agent-runtime/registry/AgentRegistry.ts`
- Suporte explícito a visão no parser (remover `read_image` quando `supportsVision=false`).
  - `frame-code-cli/src/agent-runtime/registry/agentParser.ts`
- Utilitários de multimodal (data URL + ContentPart) e staging de attachments (mais “runtime-ish” do que commander).
  - `frame-code-cli/src/cli/input/images/*`

### O que existe no `frame-agent-sdk` que é “runtime integration” (candidatos)
- Implementações de tools de ambiente (file_read/file_edit/file_create/terminal/search/sleep/todo).
  - `frame-agent-sdk/src/tools/tools/*`
- Logger do SDK tem side-effect (carrega `dotenv/config`).
  - `frame-agent-sdk/src/utils/logger.ts`
- MCP client/wrappers também ficam dentro do pacote do SDK (dependendo do “escopo” desejado do SDK).
  - `frame-agent-sdk/src/tools/tools/mcp/*`

---

## 2) Gaps do `frame-agent-core` (o que falta mesmo)

### GAP A (alto impacto): compressão pode apagar a pergunta do usuário
No core, `CompressionManager.extractProtectedMessages()` protege apenas mensagens `system`.
Isso é perigoso porque a policy `createCompressionContextPolicy().beforeRequest()` pode substituir `messages` por um estado comprimido que **não contém a última mensagem do usuário**.

- Core atual:
  - `frame-agent-core/src/context/policies/compressionPolicy.ts`
  - `frame-agent-core/src/compression/CompressionManager.ts`
- Referência do CLI (comportamento correto): protege `system` + primeira/última mensagem do usuário.
  - `frame-code-cli/src/infrastructure/compression/CompressionManager.ts`

Recomendação:
- Portar a lógica de proteção do CLI (manter, no mínimo, `system` + última `user`), e garantir que a compressão nunca remova o input que disparou a request.

### GAP B: suporte a visão incompleto (gating + anexar imagem ao próximo request)
O CLI faz gating: remove `read_image` se `supportsVision=false`. O core hoje calcula `supportsVision`, mas não aplica o filtro.

- CLI:
  - `frame-code-cli/src/agent-runtime/registry/agentParser.ts` (remove `read_image`)
- Core:
  - `frame-agent-core/src/agents/core/agentParser.ts` (não remove)

Além disso, existe no CLI um utilitário para anexar imagem como `ContentPart[]` (data URL) ao contexto (`engine.addMessage`), mas ele não está integrado ao loop.
- `frame-code-cli/src/cli/input/images/readImageAttachment.ts`
- `frame-code-cli/src/cli/input/images/imageInput.ts`

Recomendação:
- No core: implementar pelo menos o gating de tool por capability.
- Opcional: expor um helper “runtime” para transformar metadata do `read_image` em mensagem multimodal (sem depender de commander).

### GAP C: telemetria default para runtime headless (não UX, mas “observabilidade”)
O core aceita `telemetry` em `FrameRuntimeOptions`, mas não oferece “bateria inclusa” (console sink, env flags, defaults).
No CLI isso já existe.

- CLI:
  - `frame-code-cli/src/infrastructure/telemetry/telemetryConfig.ts`
  - `frame-code-cli/src/infrastructure/telemetry/traceSinkConsole.ts`
  - `frame-code-cli/src/infrastructure/telemetry/traceEventFormatter.ts`

Recomendação:
- Mover para o core uma versão genérica: `createDefaultTelemetry({ verbose, enabled, level })` + `ConsoleTraceSink`.
- Manter no CLI apenas a decisão de UX (quando ligar, como exibir).

### GAP D: APIs de “catálogo de agentes” (ergonomia, não só execução)
O core tem `listSummaries()` e `listByType()`, mas não tem:
- `listSupervisors()`
- `searchByKeywords()`
- `getStats()`
- `unregister()`

Essas funções aparecem no registry do CLI e são úteis para UX e para integrar com outras interfaces (ex.: UI).

Referência:
- `frame-code-cli/src/agent-runtime/registry/AgentRegistry.ts`

### GAP E: estabilidade para múltiplos runtimes no mesmo processo
`initializeTools()` no core usa um flag global `toolsInitialized` e o `toolRegistry` do SDK é singleton.
Hoje isso impede (na prática) criar dois runtimes com `projectRoot` diferentes no mesmo processo sem side-effects.

- `frame-agent-core/src/tools/registry/ToolInitializer.ts`
- `frame-agent-sdk/src/tools/core/toolRegistry.ts`

Recomendação:
- Definir explicitamente a regra: “1 runtime por processo” (documentar) **ou**
- Introduzir um `ToolRegistry` por runtime (maior mudança; pode exigir alterações no SDK).

### GAP F: persistência de runs/sessões (além de RAM)
O core já tem `resume`, mas o store é um `Map` em memória.
Para casos reais (CI, servidor, UI), o runtime precisa de um “RunStore” (file/db/memory).

- `frame-agent-core/src/runtime/createFrameRuntime.ts` (Map em memória)

Recomendação:
- Definir interface mínima (ex.: `get(runId)`, `set(runId,state)`, `listBySession(sessionId)`) e fornecer `MemoryRunStore` + `FileRunStore` (JSONL/JSON).

---

## 3) O que mover do `frame-code-cli` para o core (por funcionalidade)

### 3.1 Observabilidade (mover)
- Console trace sink + formatter + “defaults” de telemetria
  - Origem: `frame-code-cli/src/infrastructure/telemetry/*`
  - Motivo: não é commander/UX; é runtime plumbing.

- Instrumentação de output bruto do LLM (debug)
  - Origem: `frame-code-cli/src/infrastructure/logging/raw-output-logger.ts`
  - Motivo: útil para qualquer host (CLI, server, UI) sem depender da UX.

### 3.2 Catálogo/ergonomia de agentes (mover)
- Helpers do registry (supervisors/search/stats) e util de default agent
  - Origem: `frame-code-cli/src/agent-runtime/registry/AgentRegistry.ts`
  - Origem: `frame-code-cli/src/agent-runtime/registry/initialization.ts`
  - Motivo: é API do “catálogo” (runtime), não do terminal.

### 3.3 Multimodal (mover parcialmente)
Mover como utilitário core (sem commander):
- `readFileAsDataUrl` + `buildMultimodalContent`
  - `frame-code-cli/src/cli/input/images/imageInput.ts`
- `stageImageAttachments` e cleanup podem ficar na CLI (é UX/ops), mas o core pode expor um helper de “resolve safe absolute path” se fizer sentido.
  - `frame-code-cli/src/cli/input/images/attachments.ts`

### 3.4 Gating por capabilities (mover)
- `supportsVision` -> filtrar `read_image`
  - Origem: `frame-code-cli/src/agent-runtime/registry/agentParser.ts`
  - Motivo: é política de runtime (capability), não UX.

---

## 4) O que mover do `frame-agent-sdk` para o core (quando o objetivo for “SDK minimalista”)

> Esta seção é opcional: só faz sentido se você quiser que o SDK vire um “engine puro” (orquestração + interfaces),
> e o core vire o runtime com integrações de ambiente.

### 4.1 Implementações de tools de ambiente (forte candidato)
Ferramentas como `file_*`, `terminal`, `search`, `todo` são dependentes de ambiente/host e tendem a ser “runtime”.
Hoje elas estão no SDK.

- Origem: `frame-agent-sdk/src/tools/tools/*`
- Motivo para mover:
  - reduz side-effects/assunções de host dentro do SDK
  - facilita ter múltiplos runtimes (CLI vs server) com toolsets diferentes
- Custo/risco:
  - breaking change no SDK (ou exige “re-export compat” por um tempo)

### 4.2 Logger do SDK com side-effect (mover/neutralizar)
`frame-agent-sdk/src/utils/logger.ts` importa `dotenv/config` (side-effect).
Isso é típico de app/host, não de biblioteca.

- Motivo: evitar carregar `.env` implicitamente via dependência
- Alternativas:
  - mover logger para core e injetar logger no SDK
  - remover `dotenv/config` e deixar o host carregar `.env`

### 4.3 MCP stack dentro do SDK (avaliar)
Se MCP for tratado como “tool integration do runtime”, pode sair do SDK.
Se MCP for considerado “tool core”, pode ficar no SDK.

- Origem: `frame-agent-sdk/src/tools/tools/mcp/*`
- Observação: o core já tem loader/config/register; o SDK tem o client/wrapper.

---

## 5) O que NÃO mover (deixar no CLI)

Esses itens são UX/IO e devem permanecer no `frame-code-cli`:
- Commander/commands e fluxos interativos/autônomos como UX (`src/cli/commands/*`).
- Leitura de stdin e readline loop (`src/cli/input/reader.ts`, `src/cli/commands/interactive.ts`).
- Políticas de “como imprimir” e textos amigáveis ao usuário (a telemetria pode ser core, mas o “quando exibir” é CLI).
- Conteúdo de agentes built-in (`src/content/agents/*.md`) como “produto”.

---

## 6) Backlog sugerido (prioridade por risco/ROI)

1. **Corrigir compressão para nunca remover a última mensagem do usuário** (GAP A).
2. **Adicionar gating de `read_image` quando `supportsVision=false`** (GAP B).
3. **Portar telemetria default (ConsoleTraceSink + formatter + defaults)** (GAP C).
4. **Completar API do AgentRegistry (search/stats/supervisors/unregister)** (GAP D).
5. **Definir/implementar RunStore persistente (FileRunStore)** (GAP F).
6. **Decidir explicitamente sobre “1 runtime por processo” vs toolRegistry por runtime** (GAP E).
7. **(Opcional) Extrair tools do SDK para o core** (Seção 4.1) e neutralizar `dotenv/config` no SDK (Seção 4.2).

