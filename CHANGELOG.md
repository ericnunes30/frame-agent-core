# Changelog

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
