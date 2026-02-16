Essa é a diferença fundamental:

## 🤔 DeepAgents vs LangGraph

### **LangGraph**
- **O quê**: Framework de baixo nível para construir graphs/workflows de IA
- **Abstração**: Você define manualmente:
  - Nós (nodes)
  - Edges (transições)
  - Estados
  - Lógica de controle de fluxo
- **Controle**: Total, mas precisa escrever mais código
- **Caso de uso**: Para workflows personalizados e complexos onde você quer controle total

**Exemplo com LangGraph:**
```python
from langgraph.graph import StateGraph

# Você precisa definir manualmente cada nó e transição
graph_builder = StateGraph(AgentState)
graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tools", tool_node)
graph_builder.add_edge("agent", "tools")
graph_builder.add_conditional_edges("tools", should_continue)
```

---

### **DeepAgents**
- **O quê**: Abstração de **alto nível** construída SOBRE LangGraph
- **Filosofia**: **"Agents, not graphs"** - Você se preocupa com comportamento do agente, não com graph plumbing
- **Abstrações prontas**:
  - ✅ Agente inteligente com sub-agents automáticos
  - ✅ Sistema de TODO/memória incorporado
  - ✅ Sistema de habilidades (skills) por arquivo
  - ✅ Mock file system
  - ✅ Reflexão estratégica
  - ✅ Persistência com checkpoint
  - ✅ Interface CLI pronta

**Exemplo com DeepAgents (muito mais simples):**
```python
from deepagents import DeepAgent

agent = DeepAgent(
    name="my_agent",
    instructions="You are a helpful assistant"
)

# Tudo já está configurado! Sub-agents, checkpoints, etc.
result = agent.run("Do something complex")
```

---

## 📊 Comparação Visual

| Aspecto | LangGraph | DeepAgents |
|---------|-----------|-----------|
| **Nível de abstração** | Baixo (primitivos) | Alto (agente completo) |
| **Código necessário** | Muito | Pouco |
| **Curva de aprendizado** | Mais íngreme | Mais suave |
| **Flexibilidade** | Total | Boa, mas opinada |
| **Setup de agents** | Manual | Automático |
| **Sub-agents** | Você constrói | Nativo |
| **Persistência** | Você implementa | Built-in |
| **Ideal para** | Workflows únicos | Agents "prontos para uso" |

---

## 🎯 Quando usar cada um?

### **Use DeepAgents quando:**
✅ Você quer um agente que funcione out-of-the-box  
✅ Precisa de sub-agents (agentes chamando agentes)  
✅ Quer sistema de skills baseado em arquivos  
✅ Precisa de persistência automática  
✅ Quer um CLI pronto  
✅ Está construindo um "general purpose agent"  

### **Use LangGraph quando:**
✅ Você tem um workflow muito específico  
✅ Precisa de controle fino sobre cada passo  
✅ O seu caso de uso não se encaixa em "agent padrão"  
✅ Você quer combinar com outras tecnologias customizadas  
✅ Performance é crítica (evitar abstração desnecessária)  

---

## 💡 Analogia

- **LangGraph** = Montar um carro do zero (chassis, motor, eletrônica)
- **DeepAgents** = Usar um carro pronto (tudo configurado, só dirigir)

DeepAgents é construído **sobre** LangGraph, então internamente está usando LangGraph. Você só escolhe o nível de abstração que quer trabalhar!