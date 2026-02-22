import * as fs from 'fs';
import * as path from 'path';
import {
  GraphEngine,
  createAgentNode,
  createToolExecutorNode,
  FlowRegistryImpl,
  FlowRunnerImpl,
  CallFlowTool,
  type AgentLLMConfig,
  type GraphDefinition,
  type ITool,
} from '@ericnunes/frame-agent-sdk';

import { REACT_AGENT_FLOW } from '../flows/ReactAgentFlow';
import type { IAgentMetadata } from '../interfaces/agentMetadata.interface';
import { toolRegistry } from '@ericnunes/frame-agent-sdk';
import { loadConfig } from '../../infrastructure/config/config';
import { loadAgentConfig } from './agentConfig';
import { CompressionManager } from '../../compression/CompressionManager';
import { createCompressionContextPolicy } from '../../policies/compressionPolicy';
import { loadSystemPrompt } from '../../system-prompts/loader';
import { loadProjectRules } from '../../project-rules/loader';
import { logger } from '../../infrastructure/logging/logger';
import { McpLoader } from '../../tools/mcp/loader';
import { filterToolsByPolicy as applyToolPolicy } from '../../tools/registry/toolFilter';
import type { FrameProjectLayout } from '../../runtime/layout';
import type { RuntimeTelemetryConfig } from '../../runtime/types';
import { canActAsMainAgent } from './agentRoleResolver';

/**
 * Parseia arquivo .md do agente e retorna IAgentMetadata.
 * Suporta valores multiline no frontmatter usando o formato '|'.
 *
 * Convencao atual (compatibilidade):
 * - frontmatter.systemPrompt: caminho de prompt externo (opcional)
 * - body do markdown: systemPrompt base
 */
export function parseAgentFile(filePath: string): IAgentMetadata | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    if (lines[0].trim() !== '---') {
      logger.warn('[agentParser] Arquivo sem frontmatter: ' + filePath);
      return null;
    }

    const frontmatter: Record<string, any> = {};
    let i = 1;

    for (; i < lines.length; i++) {
      if (lines[i].trim() === '---') break;

      const colonIndex = lines[i].indexOf(':');
      if (colonIndex === -1) continue;

      const key = lines[i].substring(0, colonIndex).trim();
      const valuePart = lines[i].substring(colonIndex + 1).trim();

      // Multiline value: key: |
      if (valuePart === '|' || valuePart.startsWith('| ')) {
        const multilineLines: string[] = [];
        i++;

        let baseIndent = 0;
        while (i < lines.length && lines[i].trim() !== '---') {
          const line = lines[i];
          if (line.match(/^\s*[a-zA-Z_]+:/)) break;
          if (line.trim() === '') {
            multilineLines.push('');
            i++;
            continue;
          }
          if (baseIndent === 0 && line.trim() !== '') {
            const match = line.match(/^(\s+)/);
            baseIndent = match ? match[1].length : 0;
          }
          if (line.length >= baseIndent) multilineLines.push(line.substring(baseIndent));
          i++;
        }
        i--;
        frontmatter[key] = multilineLines.join('\n');
        continue;
      }

      if (key && valuePart.length > 0) {
        const value = valuePart;
        if (value.startsWith('[') && value.endsWith(']')) {
          const arrayValue = value
            .slice(1, -1)
            .split(',')
            .map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''));

          if (key === 'subAgents' && arrayValue.length === 1 && arrayValue[0] === 'all') {
            frontmatter[key] = 'all';
          } else if (key === 'availableFor' && arrayValue.length === 1 && arrayValue[0] === 'all') {
            frontmatter[key] = 'all';
          } else {
            frontmatter[key] = arrayValue;
          }
        } else {
          if (value === 'true') frontmatter[key] = true;
          else if (value === 'false') frontmatter[key] = false;
          else if (value === 'all' && key === 'subAgents') frontmatter[key] = 'all';
          else frontmatter[key] = value.replace(/^['"]|['"]$/g, '');
        }
      }
    }

    const body = lines.slice(i + 1).join('\n').trim();

    if (!frontmatter.name || !frontmatter.type || !frontmatter.description) {
      logger.error('[agentParser] Campos obrigatorios faltando em ' + filePath);
      return null;
    }

    const agentType = frontmatter.type;
    if (agentType !== 'main-agent' && agentType !== 'sub-agent') {
      logger.warn('[agentParser] type invalido em ' + filePath + ': ' + frontmatter.type);
      return null;
    }

    const metadata: IAgentMetadata = {
      name: frontmatter.name,
      type: agentType,
      allowDualRole: frontmatter.allowDualRole === true || frontmatter.allowDualRole === 'true',
      canBeSupervisor: frontmatter.canBeSupervisor === true || frontmatter.canBeSupervisor === 'true',
      description: frontmatter.description,
      keywords: frontmatter.keywords || [],
      tools: frontmatter.tools || [],
      toolPolicy: frontmatter.toolPolicy,
      subAgents: frontmatter.subAgents,
      availableFor: frontmatter.availableFor,
      model: frontmatter.model,
      temperature: frontmatter.temperature ? parseFloat(frontmatter.temperature) : undefined,
      maxTokens: frontmatter.maxTokens ? parseInt(frontmatter.maxTokens, 10) : undefined,
      systemPromptPath: frontmatter.systemPrompt,
      systemPrompt: body,
      backstory: frontmatter.backstory,
      additionalInstructions: frontmatter.additionalInstructions,
      path: filePath,
      category: 'agents',
      compressionEnabled:
        frontmatter.compressionEnabled !== undefined
          ? frontmatter.compressionEnabled === true || frontmatter.compressionEnabled === 'true'
          : undefined,
      customErrorHandling: frontmatter.customErrorHandling === true || frontmatter.customErrorHandling === 'true',
      flowMode: frontmatter.flowMode,
      useProjectRules: frontmatter.useProjectRules !== false,
    };

    return metadata;
  } catch (error) {
    logger.error('[agentParser] Erro ao parsear ' + filePath + ':', error);
    return null;
  }
}

function discoverAgentsInDir(agentsDir: string): IAgentMetadata[] {
  const agents: IAgentMetadata[] = [];
  if (!fs.existsSync(agentsDir)) return agents;

  const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
      const agentFile = path.join(agentsDir, entry.name);
      const metadata = parseAgentFile(agentFile);
      if (metadata) agents.push(metadata);
    }
  }

  return agents;
}

export function discoverAgents(args: { projectRoot: string; agentsDirs?: string[]; layout?: FrameProjectLayout }): IAgentMetadata[] {
  const agents: IAgentMetadata[] = [];

  const defaultAgentsDirRel = path.join('.agents', 'agents');
  const legacyAgentsDirRel = path.join('.code', 'agents');
  const defaultAgentsDirAbs = path.resolve(args.projectRoot, defaultAgentsDirRel);
  const legacyAgentsDirAbs = path.resolve(args.projectRoot, legacyAgentsDirRel);
  const fallbackAgentsDir = fs.existsSync(defaultAgentsDirAbs) ? defaultAgentsDirRel : legacyAgentsDirRel;

  const dirs =
    args.agentsDirs && args.agentsDirs.length > 0
      ? args.agentsDirs
      : [args.layout?.agentsDir ?? fallbackAgentsDir];
  for (const dir of dirs) {
    const absolute = path.isAbsolute(dir) ? dir : path.join(args.projectRoot, dir);
    agents.push(...discoverAgentsInDir(absolute));
  }

  return agents;
}

function filterSubAgents(allSubAgents: IAgentMetadata[], subAgentsConfig?: string[] | 'all', supervisorName?: string): IAgentMetadata[] {
  if (supervisorName) {
    return allSubAgents.filter((agent) => {
      if (agent.name === supervisorName) return false;
      if (!agent.availableFor) return true;
      if (agent.availableFor === 'all') return true;
      return Array.isArray(agent.availableFor) ? agent.availableFor.includes(supervisorName) : false;
    });
  }

  if (!subAgentsConfig || (Array.isArray(subAgentsConfig) && subAgentsConfig.length === 0)) return [];
  if (subAgentsConfig === 'all') return allSubAgents;

  const allowedSet = new Set(subAgentsConfig);
  return allSubAgents.filter((agent) => allowedSet.has(agent.name));
}

function expandMcpTools(toolNames: string[], mcpLoader: McpLoader, allTools: ITool[]): string[] {
  const expanded: string[] = [];
  const mcpNamespaces = new Set<string>();

  for (const name of toolNames) {
    const mcpById = mcpLoader.getMcpById(name);
    if (mcpById) {
      mcpNamespaces.add(mcpById.namespace);
      continue;
    }

    const mcpByNs = mcpLoader.getMcpByNamespace(name);
    if (mcpByNs.length > 0) {
      mcpNamespaces.add(mcpByNs[0].namespace);
      continue;
    }

    expanded.push(name);
  }

  if (mcpNamespaces.size > 0) {
    for (const tool of allTools) {
      const meta = tool as any;
      if (meta._mcpNamespace && mcpNamespaces.has(meta._mcpNamespace)) {
        expanded.push(tool.name);
      }
    }
  }

  return [...new Set(expanded)];
}

function loadSystemPromptWithExternal(args: { projectRoot: string; agentFilePath: string; systemPromptPath?: string; basePrompt: string }): string {
  if (!args.systemPromptPath) return args.basePrompt;

  try {
    const agentDir = path.dirname(args.agentFilePath);
    const externalPrompt = loadSystemPrompt.loadFileContent({
      projectRoot: args.projectRoot,
      filename: args.systemPromptPath,
      agentDir,
    });
    if (!externalPrompt) return args.basePrompt;
    return externalPrompt + '\n\n' + args.basePrompt;
  } catch {
    logger.warn('[agentParser] Nao foi possivel carregar ' + args.systemPromptPath);
    return args.basePrompt;
  }
}

function resolveSupportsVision(args: { config: any; agentConfig: any }): boolean {
  return args.agentConfig.capabilities?.supportsVision ?? args.config.vision?.supportsVision ?? false;
}

function buildAgentLlmConfig(args: {
  config: any;
  agentConfig: any;
  metadata: IAgentMetadata;
  supportsVision: boolean;
  runtimeTelemetry?: RuntimeTelemetryConfig;
}): AgentLLMConfig {
  const llmConfig: AgentLLMConfig = {
    model: args.metadata.model || args.agentConfig.model || args.config.defaults?.model || 'gpt-4o-mini',
    provider: args.agentConfig.provider || args.config.provider,
    apiKey: args.agentConfig.apiKey || args.config.apiKey,
    baseUrl: args.agentConfig.baseUrl || args.config.baseURL,
    capabilities: { supportsVision: args.supportsVision },
    defaults: {
      maxTokens: args.metadata.maxTokens || args.agentConfig.maxTokens || args.config.defaults?.maxTokens,
      maxContextTokens: args.agentConfig.maxContextTokens || args.config.defaults?.maxContextTokens,
      temperature: args.metadata.temperature ?? args.agentConfig.temperature ?? args.config.defaults?.temperature,
      topP: args.agentConfig.topP ?? args.config.defaults?.topP,
    },
  };

  const llmConfigWithTelemetry = llmConfig as AgentLLMConfig & {
    openAIClientFactory?: RuntimeTelemetryConfig['openAIClientFactory'];
    nativeLlmTelemetry?: RuntimeTelemetryConfig['nativeLlmTelemetry'];
  };

  llmConfigWithTelemetry.openAIClientFactory = args.runtimeTelemetry?.openAIClientFactory;
  llmConfigWithTelemetry.nativeLlmTelemetry = args.runtimeTelemetry?.nativeLlmTelemetry;

  return llmConfigWithTelemetry;
}

function createExecuteNodeForAgent(args: { tools: ITool[]; toolPolicy?: IAgentMetadata['toolPolicy'] }) {
  const hasToDoIstTool = args.tools.some((tool) => tool.name === 'toDoIst');
  return createToolExecutorNode({
    toolPolicy: args.toolPolicy,
    todoPlanGuard: {
      enabled: hasToDoIstTool,
      minInitialPlanItems: 2,
    },
  });
}

function buildSystemPrompt(args: {
  projectRoot: string;
  metadata: IAgentMetadata;
  compressionManager?: CompressionManager;
  layout?: FrameProjectLayout;
}): string {
  let systemPrompt = loadSystemPromptWithExternal({
    projectRoot: args.projectRoot,
    agentFilePath: args.metadata.path,
    systemPromptPath: args.metadata.systemPromptPath,
    basePrompt: args.metadata.systemPrompt,
  });

  if (args.compressionManager) {
    const compressionPrompt = args.compressionManager.getCompressionPrompt();
    if (compressionPrompt) systemPrompt = compressionPrompt + '\n\n' + systemPrompt;
  }

  const projectRules = loadProjectRules.load(args.projectRoot, {
    rulesFile: args.layout?.rulesFile,
    rulesFallbackFile: args.layout?.rulesFallbackFile,
  });
  
  if (args.metadata.useProjectRules !== false && projectRules.content && projectRules.source !== 'none') {
    const rulesSection = `## Rules Project\n\n${projectRules.content}\n\n---\n\n`;
    systemPrompt = systemPrompt + rulesSection;
  }

  if (args.metadata.useProjectRules !== false) {
    const directoryInstruction =
      `### Instrucao Adicional\n\n` +
      `Arquivos AGENTS.md ou CLAUDE.md contem regras e contexto do projeto. ` +
      `Em cada diretorio acessado, verifique se existe AGENTS.md ou CLAUDE.md.\n\n`;
    systemPrompt = systemPrompt + directoryInstruction;
  }

  return systemPrompt;
}

function selectToolsForAgent(args: {
  projectRoot: string;
  mcpConfigFile?: string;
  metadata: IAgentMetadata;
  allTools: ITool[];
  supportsVision: boolean;
}): ITool[] {
  const allowedTools = applyToolPolicy(args.allTools, args.metadata.toolPolicy);

  const mcpLoader = new McpLoader({ projectRoot: args.projectRoot, configFile: args.mcpConfigFile });
  const expandedToolNames = expandMcpTools(args.metadata.tools, mcpLoader, args.allTools);

  const hasExplicitTools = Array.isArray(args.metadata.tools) && args.metadata.tools.length > 0;
  const selectedTools = hasExplicitTools ? allowedTools.filter((t) => expandedToolNames.includes(t.name)) : allowedTools;

  let finalTools = [...selectedTools];
  if (args.metadata.type === 'sub-agent' && finalTools.some((t) => t.name === 'ask_user')) {
    finalTools = finalTools.filter((t) => t.name !== 'ask_user');
  }
  if (!args.supportsVision) {
    finalTools = finalTools.filter((t) => t.name !== 'read_image');
  }

  return finalTools;
}

function maybeAppendSubAgentListToPrompt(args: {
  projectRoot: string;
  metadata: IAgentMetadata;
  systemPrompt: string;
  registry?: AgentRegistryLike;
}): string {
  if (!args.registry) return args.systemPrompt;
  if (!canActAsMainAgent(args.metadata) || !args.metadata.canBeSupervisor) return args.systemPrompt;

  const allSubAgents = args.registry.listByType('sub-agent');
  const allowedSubAgents = filterSubAgents(allSubAgents, args.metadata.subAgents, args.metadata.name);
  if (allowedSubAgents.length === 0) return args.systemPrompt;

  const subAgentList = allowedSubAgents.map((agent) => `- **${agent.name}**: ${agent.description}`).join('\n');
  return (
    args.systemPrompt +
    '\n\n## Sub-agentes Disponiveis\n\n' +
    'Voce pode chamar os seguintes sub-agentes via `call_flow`:\n\n' +
    subAgentList +
    '\n\n' +
    'Use `call_flow` com o `flowId` correspondente ao nome do sub-agente.'
  );
}

interface AgentCreationResult {
  graphDefinition: GraphDefinition;
  engine: GraphEngine;
  llmConfig: AgentLLMConfig;
}

type AgentRegistryLike = {
  listByType(type: string): IAgentMetadata[];
};

async function maybeConfigureCallFlowForSubAgents(args: {
  projectRoot: string;
  mcpConfigFile?: string;
  metadata: IAgentMetadata;
  registry?: AgentRegistryLike;
  telemetry?: RuntimeTelemetryConfig;
  skipSubAgents?: boolean;
  llmConfig: AgentLLMConfig;
  tools: ITool[];
  layout?: FrameProjectLayout;
}): Promise<ITool[]> {
  if (args.skipSubAgents) return args.tools;
  if (!canActAsMainAgent(args.metadata)) return args.tools;
  if (!args.metadata.tools.includes('call_flow')) return args.tools;
  if (!args.registry) return args.tools;

  const allSubAgents = args.registry.listByType('sub-agent');
  const allowedSubAgents = filterSubAgents(allSubAgents, args.metadata.subAgents, args.metadata.name);

  if (allowedSubAgents.length === 0) {
    return args.tools.filter((t) => t.name !== 'call_flow');
  }

  const flowRegistry = new FlowRegistryImpl();

  for (const subAgent of allowedSubAgents) {
    try {
      const effectiveSubAgent =
        subAgent.type === 'main-agent'
          ? { ...subAgent, type: 'sub-agent' as const, canBeSupervisor: false }
          : subAgent;
      const result = await createAgentWithDefinition(
        { projectRoot: args.projectRoot, mcpConfigFile: args.mcpConfigFile, layout: args.layout },
        effectiveSubAgent,
        args.telemetry
      );

      flowRegistry.register(subAgent.name, {
        id: subAgent.name,
        version: '1',
        kind: 'agentFlow',
        graph: result.graphDefinition,
      });
    } catch (error) {
      logger.error('[' + args.metadata.name + '] Erro ao criar sub-agente ' + subAgent.name + ':', error);
    }
  }

  const flowRunner = new FlowRunnerImpl(flowRegistry, { llmConfig: args.llmConfig });
  const callFlowTool = new CallFlowTool(flowRunner);

  // O SDK resolve tools via ToolRegistry global; atualizamos o `call_flow` para refletir
  // o conjunto de sub-agentes permitido para este engine.
  try {
    toolRegistry.unregister('call_flow');
  } catch {}

  try {
    toolRegistry.register(callFlowTool);
  } catch {}

  const withoutCallFlow = args.tools.filter((t) => t.name !== 'call_flow');
  return [...withoutCallFlow, callFlowTool];
}

async function createAgentWithDefinition(
  args: {
    projectRoot: string;
    mcpConfigFile?: string;
    layout?: FrameProjectLayout;
  },
  metadata: IAgentMetadata,
  telemetry?: RuntimeTelemetryConfig
): Promise<AgentCreationResult> {
  const config = await loadConfig(args.projectRoot);

  let compressionManager: CompressionManager | undefined;
  if (metadata.compressionEnabled !== false && config.compression?.enabled !== false) {
    compressionManager = new CompressionManager({
      projectRoot: args.projectRoot,
      config: { ...(config.compression as any), persistKey: 'agent-' + metadata.name },
    });
  }

  let systemPrompt = buildSystemPrompt({
    projectRoot: args.projectRoot,
    metadata,
    compressionManager,
    layout: args.layout,
  });

  const agentConfig = loadAgentConfig(args.projectRoot, metadata.name, {
    configFile: args.layout?.agentConfigFile,
  });
  const supportsVision = resolveSupportsVision({ config, agentConfig });
  const llmConfig = buildAgentLlmConfig({ config, agentConfig, metadata, supportsVision, runtimeTelemetry: telemetry });

  const allTools = toolRegistry.listTools();
  const finalTools = selectToolsForAgent({
    projectRoot: args.projectRoot,
    mcpConfigFile: args.mcpConfigFile,
    metadata,
    allTools,
    supportsVision,
  });

  const graphDefinition: GraphDefinition = { ...REACT_AGENT_FLOW, nodes: { ...REACT_AGENT_FLOW.nodes } };
  graphDefinition.nodes.execute = createExecuteNodeForAgent({
    tools: finalTools,
    toolPolicy: metadata.toolPolicy,
  });

  // Concatena o AGENTS.md ao additionalInstructions se useProjectRules estiver habilitado
  let finalAdditionalInstructions = metadata.additionalInstructions || '';
  const projectRules = loadProjectRules.load(args.projectRoot, {
    rulesFile: args.layout?.rulesFile,
    rulesFallbackFile: args.layout?.rulesFallbackFile,
  });
  if (metadata.useProjectRules !== false && projectRules.content && projectRules.source !== 'none') {
    const rulesSection = `## Rules Project\n\n${projectRules.content}\n\n---\n\n`;
    if (finalAdditionalInstructions) {
      finalAdditionalInstructions += '\n\n' + rulesSection;
    } else {
      finalAdditionalInstructions = rulesSection;
    }
  }
  
  graphDefinition.nodes.agent = createAgentNode({
    llm: llmConfig,
    promptConfig: {
      mode: 'react' as any,
      agentInfo: {
        name: metadata.name,
        goal: metadata.description,
        backstory: metadata.backstory || systemPrompt.substring(0, 500),
      },
      additionalInstructions: finalAdditionalInstructions,
      tools: finalTools,
      toolPolicy: metadata.toolPolicy,
    },
    contextHooks: createCompressionContextPolicy(compressionManager),
    autoExecuteTools: false,
    temperature: metadata.temperature ?? config.defaults?.temperature,
    maxTokens: metadata.maxTokens || config.defaults?.maxTokens,
  });

  if (metadata.customErrorHandling) {
    const originalExecuteNode = graphDefinition.nodes.execute;
    graphDefinition.nodes.execute = async (state: any, engine: any) => {
      if (state.status === 'ERROR') {
        logger.warn('[' + metadata.name + '] Erro detectado (customErrorHandling)');
      }
      return originalExecuteNode(state, engine);
    };
  }

  const engine = new GraphEngine(
    graphDefinition,
    telemetry
      ? {
          trace: telemetry.trace,
          telemetry: telemetry.telemetry,
          traceContext: { agent: { id: metadata.name, label: metadata.name } },
        }
      : undefined,
    llmConfig
  );

  return { graphDefinition, engine, llmConfig };
}

export async function createAgentFromFlow(
  args: { projectRoot: string; mcpConfigFile?: string; registry?: AgentRegistryLike; layout?: FrameProjectLayout },
  metadata: IAgentMetadata,
  telemetry?: RuntimeTelemetryConfig,
  skipSubAgents?: boolean
): Promise<GraphEngine> {
  const config = await loadConfig(args.projectRoot);

  let compressionManager: CompressionManager | undefined;
  if (metadata.compressionEnabled !== false && config.compression?.enabled !== false) {
    compressionManager = new CompressionManager({
      projectRoot: args.projectRoot,
      config: { ...(config.compression as any), persistKey: 'agent-' + metadata.name },
    });
  }

  let systemPrompt = buildSystemPrompt({
    projectRoot: args.projectRoot,
    metadata,
    compressionManager,
    layout: args.layout,
  });

  systemPrompt = maybeAppendSubAgentListToPrompt({ projectRoot: args.projectRoot, metadata, systemPrompt, registry: args.registry });

  const agentConfig = loadAgentConfig(args.projectRoot, metadata.name, {
    configFile: args.layout?.agentConfigFile,
  });
  const supportsVision = resolveSupportsVision({ config, agentConfig });
  const llmConfig = buildAgentLlmConfig({ config, agentConfig, metadata, supportsVision, runtimeTelemetry: telemetry });

  const allTools = toolRegistry.listTools();
  let finalTools = selectToolsForAgent({
    projectRoot: args.projectRoot,
    mcpConfigFile: args.mcpConfigFile,
    metadata,
    allTools,
    supportsVision,
  });

  finalTools = await maybeConfigureCallFlowForSubAgents({
    projectRoot: args.projectRoot,
    mcpConfigFile: args.mcpConfigFile,
    metadata,
    registry: args.registry,
    telemetry,
    skipSubAgents,
    llmConfig,
    tools: finalTools,
    layout: args.layout,
  });

  const graphDefinition: GraphDefinition = { ...REACT_AGENT_FLOW, nodes: { ...REACT_AGENT_FLOW.nodes } };
  graphDefinition.nodes.execute = createExecuteNodeForAgent({
    tools: finalTools,
    toolPolicy: metadata.toolPolicy,
  });

  // Concatena o AGENTS.md ao additionalInstructions se useProjectRules estiver habilitado
  let finalAdditionalInstructions = metadata.additionalInstructions || '';
  if (metadata.useProjectRules !== false && systemPrompt.includes('Rules Project')) {
    const rulesSection = systemPrompt.match(/## Rules Project[\s\S]*?(?=---\n\n|$)/)?.[0];
    if (rulesSection) {
      if (finalAdditionalInstructions) {
        finalAdditionalInstructions += '\n\n' + rulesSection;
      } else {
        finalAdditionalInstructions = rulesSection;
      }
    }
  }
  
  graphDefinition.nodes.agent = createAgentNode({
    llm: llmConfig,
    promptConfig: {
      mode: 'react' as any,
      agentInfo: {
        name: metadata.name,
        goal: metadata.description,
        backstory: metadata.backstory || systemPrompt.substring(0, 500),
      },
      additionalInstructions: finalAdditionalInstructions,
      tools: finalTools,
      toolPolicy: metadata.toolPolicy,
    },
    contextHooks: createCompressionContextPolicy(compressionManager),
    autoExecuteTools: false,
    temperature: metadata.temperature ?? config.defaults?.temperature,
    maxTokens: metadata.maxTokens || config.defaults?.maxTokens,
  });

  if (metadata.customErrorHandling) {
    const originalExecuteNode = graphDefinition.nodes.execute;
    graphDefinition.nodes.execute = async (state: any, engine: any) => {
      if (state.status === 'ERROR') {
        logger.warn('[' + metadata.name + '] Erro detectado (customErrorHandling)');
      }
      return originalExecuteNode(state, engine);
    };
  }

  const engine = new GraphEngine(
    graphDefinition,
    telemetry
      ? {
          trace: telemetry.trace,
          telemetry: telemetry.telemetry,
          traceContext: { agent: { id: metadata.name, label: metadata.name } },
        }
      : undefined,
    llmConfig
  );

  return engine;
}
