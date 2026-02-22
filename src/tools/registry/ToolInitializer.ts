import {
  toolRegistry,
  AskUserTool,
  FinalAnswerTool,
  CallFlowTool,
  FlowRegistryImpl,
  FlowRunnerImpl,
  type ITool,
} from '@ericnunes/frame-agent-sdk';
import { resolve } from 'path';

import type { RuntimeProfile } from '../../runtime/types';
import { logger } from '../../infrastructure/logging/logger';
import { registerMcpTools, shutdownMcpTools, type McpAliasMode } from '../mcp/register';
import {
  fileCreateTool,
  fileEditTool,
  fileReadTool,
  terminalTool,
  searchTool,
  toDoIstTool,
  sleepTool,
  createListDirectoryTool,
  createReadImageTool,
  createFileOutlineTool,
  createListCapabilitiesTool,
  createEnableCapabilityTool,
  createTimeNowTool,
} from '../native';
import { filterTools, getToolFilterConfig } from './toolFilter';

let toolsInitialized = false;
let toolsInitializedForRoot: string | undefined;

function getDefaultExcludedToolsForProfile(profile: RuntimeProfile): string[] {
  switch (profile) {
    case 'safe_readonly':
      return ['terminal', 'file_create', 'file_edit'];
    case 'developer_write':
      return ['terminal'];
    case 'developer_exec':
      return [];
    case 'ci_headless':
      return [];
    default:
      return [];
  }
}

export async function initializeTools(args: {
  projectRoot: string;
  profile: RuntimeProfile;
  allowAskUser?: boolean;
  excludedTools?: string[];
  mcp?: { enabled?: boolean; configFile?: string; aliasMode?: McpAliasMode };
  skills?: { dir?: string; dirs?: string[] };
}): Promise<void> {
  const projectRoot = resolve(args.projectRoot);
  if (toolsInitialized) {
    if (toolsInitializedForRoot && toolsInitializedForRoot !== projectRoot) {
      throw new Error(
        `[initializeTools] frame-agent-core suporta apenas 1 runtime por processo (toolRegistry global). ` +
          `Ja inicializado para projectRoot="${toolsInitializedForRoot}", recebeu projectRoot="${projectRoot}".`
      );
    }
    return;
  }

  const mcpEnabled = args.mcp?.enabled ?? true;
  const excludedTools = [
    ...getDefaultExcludedToolsForProfile(args.profile),
    ...(args.excludedTools ?? []),
  ];

  const filterConfig = getToolFilterConfig({
    profile: args.profile,
    mcpToolsEnabled: mcpEnabled,
    excludedTools,
    allowAskUser: args.allowAskUser,
  });

  const allTools: ITool[] = [
    searchTool,
    createListDirectoryTool({ projectRoot }),
    createReadImageTool({ projectRoot }),
    fileCreateTool,
    fileEditTool,
    fileReadTool,
    terminalTool,
    sleepTool,
    createTimeNowTool(),
    createFileOutlineTool({ projectRoot }),
    createListCapabilitiesTool({
      projectRoot,
      mcpConfigFile: args.mcp?.configFile,
      skillsDir: args.skills?.dir,
      skillsDirs: args.skills?.dirs,
    }),
    createEnableCapabilityTool({
      projectRoot,
      mcpConfigFile: args.mcp?.configFile,
      skillsDir: args.skills?.dir,
      skillsDirs: args.skills?.dirs,
    }),
    toDoIstTool,
    new FinalAnswerTool(),
    // call_flow placeholder (subagents sao configurados por engine quando necessario)
    new CallFlowTool(new FlowRunnerImpl(new FlowRegistryImpl(), {})),
  ];

  if (filterConfig.allowAskUser) {
    allTools.push(new AskUserTool());
  }

  const filteredTools = filterTools(allTools, filterConfig);
  for (const tool of filteredTools) {
    try {
      toolRegistry.register(tool);
    } catch (error) {
      logger.debug(`[initializeTools] Ignorando falha ao registrar tool ${tool.name}:`, error);
    }
  }

  if (mcpEnabled) {
    try {
      await registerMcpTools({
        projectRoot,
        configFile: args.mcp?.configFile,
        aliasMode: args.mcp?.aliasMode ?? 'stripNamespace',
      });
    } catch (err) {
      logger.error('[initializeTools] Erro ao registrar MCP tools:', err);
    }
  }

  toolsInitializedForRoot = projectRoot;
  toolsInitialized = true;
}

export async function shutdownTools(): Promise<void> {
  await shutdownMcpTools();
  toolsInitialized = false;
  toolsInitializedForRoot = undefined;
}

export { toolRegistry };
