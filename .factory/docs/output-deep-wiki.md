## Resumo Rápido

- **langchain-core**: base abstrata com interfaces, mensagens e modelos base para LLMs e ferramentas.
- **langgraph**: runtime para construir e executar grafos de agentes com suporte a estado, checkpointing e streaming.
- **DeepAgents**: harness opinativo que usa langchain-core + langgraph para fornecer um agente “baterias-incluídas” com planejamento, filesystem, sub-agentes e sandbox.

---

## Detalhes

### langchain-core
É a camada fundamental do ecossistema LangChain. Define interfaces como `BaseChatModel`, `BaseTool`, `SystemMessage`, e primitivas de mensagens e prompts. DeepAgents depende explicitamente de `langchain-core>=1.2.10` em seu `pyproject.toml` [1](#0-0)  e o usa em `graph.py` para importar tipos base e mensagens [2](#0-1) .

### langgraph
Fornece o runtime de grafos (state machines) para agentes. DeepAgents depende de `langgraph` (transitivamente via `langchain` e diretamente em locks) e `create_deep_agent` retorna um `CompiledStateGraph` pronto para execução [3](#0-2) . A documentação confirma que Deep Agents é “Built on LangGraph” .

### DeepAgents
É um harness opinativo que combina:
- Planejamento via `write_todos`/`read_todos`
- Sistema de arquivos (`ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`)
- Sub-agentes via `task`
- Execução remota via sandboxes (Modal, Runloop, Daytona)

A função `create_deep_agent` em `graph.py` orquestra middlewares e ferramentas sobre langchain-core e langgraph [4](#0-3) . O README descreve Deep Agents como “agent harness” com “batteries-included” .

### Como as dependências se conectam
- `libs/deepagents/pyproject.toml` declara `langchain-core`, `langchain`, e provedores de modelo [1](#0-0) .
- `libs/cli/pyproject.toml` (CLI) inclui `deepagents` e integrações de sandbox [5](#0-4) .
- Lockfiles mostram que `langgraph` depende de `langchain-core` [6](#0-5) .

### Onde DeepAgents entra
DeepAgents não substitui langchain-core ou langgraph; ele os utiliza para entregar um agente pronto para uso, com ferramentas e middlewares pré-configurados. Ele também expõe pontos de extensão (tools, middleware, subagents, backends) para customização [7](#0-6) .

## Notes
- A CLI (`deepagents-cli`) é uma camada adicional sobre o SDK DeepAgents, adicionando TUI, sandboxes e persistência .
- Harbor (framework de avaliação) demonstra como usar DeepAgents em benchmarks, envolvendo-o com um backend de sandbox .

Wiki pages you might want to explore:
- [Sandbox Integration (langchain-ai/deepagents)](/wiki/langchain-ai/deepagents#4.3)

### Citations

**File:** libs/deepagents/pyproject.toml (L21-27)
```text
dependencies = [
    "langchain-core>=1.2.10,<2.0.0",
    "langchain>=1.2.10,<2.0.0",
    "langchain-anthropic>=1.3.2,<2.0.0",
    "langchain-google-genai>=4.2.0,<5.0.0",
    "wcmatch",
]
```

**File:** libs/deepagents/deepagents/graph.py (L14-16)
```python
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import SystemMessage
from langchain_core.tools import BaseTool
```

**File:** libs/deepagents/deepagents/graph.py (L18-20)
```python
from langgraph.graph.state import CompiledStateGraph
from langgraph.store.base import BaseStore
from langgraph.types import Checkpointer
```

**File:** libs/deepagents/deepagents/graph.py (L70-84)
```python
    """Create a deep agent.

    !!! warning "Deep agents require a LLM that supports tool calling!"

    By default, this agent has access to the following tools:

    - `write_todos`: manage a todo list
    - `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`: file operations
    - `execute`: run shell commands
    - `task`: call subagents

    The `execute` tool allows running shell commands if the backend implements `SandboxBackendProtocol`.
    For non-sandbox backends, the `execute` tool will return an error message.

    Args:
```

**File:** libs/deepagents/deepagents/graph.py (L90-119)
```python
        tools: The tools the agent should have access to.

            In addition to custom tools you provide, deep agents include built-in tools for planning,
            file management, and subagent spawning.
        system_prompt: Custom system instructions to prepend before the base deep agent
            prompt.

            If a string, it's concatenated with the base prompt.
        middleware: Additional middleware to apply after the standard middleware stack
            (`TodoListMiddleware`, `FilesystemMiddleware`, `SubAgentMiddleware`,
            `SummarizationMiddleware`, `AnthropicPromptCachingMiddleware`,
            `PatchToolCallsMiddleware`).
        subagents: The subagents to use.

            Each subagent should be a `dict` with the following keys:

            - `name`
            - `description` (used by the main agent to decide whether to call the sub agent)
            - `prompt` (used as the system prompt in the subagent)
            - (optional) `tools`
            - (optional) `model` (either a `LanguageModelLike` instance or `dict` settings)
            - (optional) `middleware` (list of `AgentMiddleware`)
        skills: Optional list of skill source paths (e.g., `["/skills/user/", "/skills/project/"]`).

            Paths must be specified using POSIX conventions (forward slashes) and are relative
            to the backend's root. When using `StateBackend` (default), provide skill files via
            `invoke(files={...})`. With `FilesystemBackend`, skills are loaded from disk relative
            to the backend's `root_dir`. Later sources override earlier ones for skills with the
            same name (last one wins).
        memory: Optional list of memory file paths (`AGENTS.md` files) to load
```

**File:** libs/cli/pyproject.toml (L27-48)
```text
dependencies = [
    # Framework
    "deepagents==0.4.1",
    "langchain>=1.2.10,<2.0.0",
    "langgraph-checkpoint-sqlite>=3.0.0,<4.0.0",

    # Require at least one integration package
    "langchain-openai>=1.1.8,<2.0.0",

    # UI/Terminal
    "textual>=6.0.0,<8.0.0",
    "textual-autocomplete>=3.0.0,<5.0.0",
    "prompt-toolkit>=3.0.52,<4.0.0",
    "rich>=14.0.0,<15.0.0",
    "markdownify>=0.13.0,<2.0.0",

    # Sandbox integrations
    "langsmith>=0.6.6",
    "daytona>=0.113.0,<1.0.0",
    "modal>=0.65.0,<2.0.0",
    "runloop-api-client>=0.69.0",

```

**File:** libs/partners/modal/uv.lock (L1126-1137)
```text
[[package]]
name = "langgraph"
version = "1.0.8"
source = { registry = "https://pypi.org/simple" }
dependencies = [
    { name = "langchain-core" },
    { name = "langgraph-checkpoint" },
    { name = "langgraph-prebuilt" },
    { name = "langgraph-sdk" },
    { name = "pydantic" },
    { name = "xxhash" },
]
```
