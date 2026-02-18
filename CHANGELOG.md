# Changelog

## 0.0.9 - 2026-02-18
- Enabled conditional ToDoIst plan guardrails in core agent flow wiring by creating the `execute` node with `todoPlanGuard` when `toDoIst` is available to the agent.
- Ensures runtime blocking of non-incremental plan transitions (e.g., mass completion) in `frame-code-cli` executions that run through core.

## 0.0.8 - 2026-02-18
- Updated dependency to `@ericnunes/frame-agent-sdk@^0.0.12` to consume the latest ToDoIst guardrails, prompt propagation, and ReAct/SAP runtime fixes.

## 0.0.7 - 2026-02-17
- Added `resolveSessionTelemetryContext` in telemetry utilities to centralize `sessionId`/`userId` resolution (CLI args + env + UUID fallback).
- Runtime `run()` now guarantees a `sessionId` in `state.metadata` and supports optional `userId`.
- Langfuse native OpenAI integration now forwards `sessionId` and `userId` into `observeOpenAI` trace config.
- Langfuse native OpenAI integration now sanitizes null `input_audio`/`audio` fields before multimodal processing to reduce noisy SDK errors in OpenAI-compatible providers.
- Console telemetry sink now writes via `process.stdout.write(..., 'utf8')` for better UTF-8 rendering in terminals (including Windows/MINGW).
- Added `LANGFUSE_SUPPRESS_NOISE` (default `true`) to hide known non-fatal Langfuse multimodal noise while keeping other errors visible.
- Updated dependency to `@ericnunes/frame-agent-sdk@^0.0.11`.

## 0.0.6 - 2026-02-17
- Update dependency to `@ericnunes/frame-agent-sdk@^0.0.10` to include incremental ToDoIst planning actions (`add_task`, `remove_task`, `reorder_tasks`).

## 0.0.5 - 2026-02-17
- Langfuse hybrid telemetry: add explicit native OpenAI flush integration (`observeOpenAI.flushAsync`) in the default telemetry flush lifecycle.
- Improve short-lived CLI run reliability so traces/generations are persisted before process termination.
- Update dependency to `@ericnunes/frame-agent-sdk@^0.0.9`.

## 0.0.1 - 2026-02-16
- Primeira publicacao do frame-agent-core como runtime/headless do frame-code-cli.
- Layout configuravel (default `.code/*`): agentes, MCP, config.json, AGENTS.md, skills.
- Registry de agentes + engines ReAct com policies de tools, sub-agentes via call_flow e descoberta MCP.
- Tooling nativo: search, filesystem, terminal, sleep, list_capabilities/enable_capability (skills+MCP), final_answer/ask_user.
- Compressao de contexto via CompressionManager e compressionPolicy.
- Telemetria integrada (trace + telemetry) e logging estruturado.
- Compatibilidade atual com @ericnunes/frame-agent-sdk local (file:../frame-agent-sdk); publicar o SDK antes de publicar o core.
