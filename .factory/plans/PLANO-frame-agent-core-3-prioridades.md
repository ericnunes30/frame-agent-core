# Plano: 3 Prioridades do `frame-agent-core`

Data: 2026-02-15

Escopo: focar apenas em (1) **compressao**, (2) **visao (gating do `read_image`)**, (3) **telemetria default**.  
O restante fica listado em **Pesquisa Futura** (sem implementacao neste ciclo).

## Status (2026-02-15)
- Prioridade 1 (compressao): implementado no core.
- Prioridade 2 (visao / gating `read_image`): implementado no core.
- Prioridade 3 (telemetria default): implementado no core.

---

## Objetivo

Entregar um runtime core mais confiavel e reutilizavel (headless), mantendo o `frame-code-cli` como UX (loops, commander, stdin).

---

## Prioridade 1: Compressao (regressao: pode sumir a ultima mensagem do user)

### Problema
Hoje o core pode comprimir e acabar retornando um conjunto de `messages` que **nao preserva** a ultima mensagem do usuario (input que disparou a request).

Referencias:
- Core: `frame-agent-core/src/compression/CompressionManager.ts:186`
- Core policy: `frame-agent-core/src/policies/compressionPolicy.ts`
- Comportamento de referencia (CLI): `frame-code-cli/src/infrastructure/compression/CompressionManager.ts:277`

### Resultado esperado (criterios de aceite)
- Em qualquer compressao (proativa ou emergencial), o estado comprimido:
  - preserva ao menos: `system` + **ultima** mensagem `user`
  - idealmente preserva: `system` + primeira `user` + ultima `user`
- A policy nunca retorna `messages` sem o input atual.

### Implementacao (passos)
- Ajustar a selecao de mensagens â€œprotegidasâ€ no `CompressionManager` para bater com o comportamento do CLI.
- Garantir que `buildCompressedState()` reinsira as mensagens protegidas de forma deterministica.
- (Opcional) adicionar um â€œguardâ€ na policy: se a ultima `user` do input nao estiver presente, reanexar.

### Validacao
- Criar um teste/script simples (runtime-level) que:
  - monta um array de mensagens com `system` + varias `user/assistant`
  - simula compressao e verifica que a ultima `user` permanece no resultado

---

## Prioridade 2: Visao (gating do `read_image`)

### Problema
O core calcula `supportsVision`, mas nao faz o gating de tools. No CLI, quando `supportsVision=false`, `read_image` e removida do toolset do agente.

Referencias:
- CLI: `frame-code-cli/src/agent-runtime/registry/agentParser.ts:456`
- Core: `frame-agent-core/src/agents/internal/agentParser.ts` (tool selection + gating de `read_image`)

### Resultado esperado (criterios de aceite)
- Se `supportsVision=false`, `read_image` nao aparece em `finalTools`.
- Se `supportsVision=true`, o comportamento atual permanece.

### Implementacao (passos)
- No ponto em que `finalTools` e calculado no core:
  - aplicar filtro `finalTools = finalTools.filter(t => t.name !== 'read_image')` quando `supportsVision` for `false`
- Garantir que isso funcione tanto no fluxo â€œcreateAgentWithDefinitionâ€ quanto â€œcreateAgentFromFlowâ€ (onde aplicavel).

### Validacao
- Criar um agente de teste com `tools: [read_image, final_answer]` e setar config `supportsVision=false`.
- Validar que o engine resultante nao tem `read_image` nas tools.

---

## Prioridade 3: Telemetria default no core (batteries included)

### Problema
O core aceita `telemetry` via options, mas nao oferece um â€œdefaultâ€ reutilizavel (ConsoleTraceSink + formatter + defaults por env/params).

Referencias:
- CLI: `frame-code-cli/src/infrastructure/telemetry/telemetryConfig.ts:1`
- CLI: `frame-code-cli/src/infrastructure/telemetry/traceSinkConsole.ts:1`
- CLI: `frame-code-cli/src/infrastructure/telemetry/traceEventFormatter.ts:1`

### Resultado esperado (criterios de aceite)
- `frame-agent-core` expor uma funcao `createDefaultTelemetry(...)` (ou equivalente) que retorna:
  - `trace` (sink)
  - `telemetry` (TelemetryOptions)
  - (opcional) `verbose`
- O CLI pode passar a usar essa API depois (fora deste ciclo, se desejado).

### Implementacao (passos)
- Portar para o core os modulos de telemetria do CLI, removendo acoplamentos de UX:
  - `ConsoleTraceSink`
  - `formatTraceEventForTerminal`
  - `createDefaultTelemetry` (parametrizado)
- Definir configuracao por env e/ou params (ex.: enabled, verbose, level).

### Validacao
- Script pequeno que roda um agente simples com `createDefaultTelemetry({ enabled:true })` e confirma que:
  - eventos de tool/llm geram output no console quando verbose habilitado

---

## Sequenciamento (ordem recomendada)

1. Prioridade 1 (compressao) primeiro: risco alto de quebrar coerencia da conversa.
2. Prioridade 2 (visao) em seguida: evita toolset inconsistente com capabilities.
3. Prioridade 3 (telemetria) por ultimo: melhora DX/observabilidade sem mexer na logica do agente.

---

## Pesquisa Futura (nao executar agora)

- Persistencia de runs: definir `RunStore` (memory + file) e integrar no runtime.
- Multi-runtime por processo: hoje o core assume/enforca "1 runtime por processo" (ToolRegistry singleton). Se virar requisito, evoluir arquitetura para suportar isolamento real por runtime.
- Catalogo de agentes: completar ergonomia do `AgentRegistry` (stats/search/supervisors/unregister/default agent) como API do core.
- Multimodal/attachments runtime: utilitarios para anexar multimodal no contexto (sem commander).
- Extrair tools do SDK para o core (se a meta for SDK minimalista): `file_*`, `terminal`, `search`, etc.
- Remover side-effects do SDK: `frame-agent-sdk/src/utils/logger.ts` importa `dotenv/config`.

