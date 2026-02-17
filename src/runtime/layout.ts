import { existsSync, statSync } from 'fs';
import { resolve, isAbsolute, join } from 'path';

export interface FrameProjectLayout {
  workspaceDir: string;
  agentsDir: string;
  mcpConfigFile: string;
  agentConfigFile: string;
  rulesFile: string;
  rulesFallbackFile: string;
  skillsDir: string;
}

export const DEFAULT_FRAME_PROJECT_LAYOUT: FrameProjectLayout = {
  workspaceDir: '.agents',
  agentsDir: '.agents/agents',
  mcpConfigFile: '.agents/mcp.json',
  agentConfigFile: '.agents/config.json',
  rulesFile: '.agents/AGENTS.md',
  rulesFallbackFile: 'AGENTS.md',
  skillsDir: '.agents/skills',
};

const LEGACY_FRAME_PROJECT_LAYOUT: FrameProjectLayout = {
  workspaceDir: '.code',
  agentsDir: '.code/agents',
  mcpConfigFile: '.code/mcp.json',
  agentConfigFile: '.code/config.json',
  rulesFile: '.code/AGENTS.md',
  rulesFallbackFile: 'AGENTS.md',
  skillsDir: '.code/skills',
};

function resolvePath(root: string, p: string): string {
  if (!p) return root;
  return isAbsolute(p) ? p : resolve(root, p);
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function hasWorkspaceContent(root: string, workspaceDir: string): boolean {
  const ws = resolvePath(root, workspaceDir);
  if (!existsSync(ws) || !isDirectory(ws)) return false;

  // Any of these indicate the workspace is being used.
  const sentinels = ['agents', 'config.json', 'mcp.json', 'skills', 'AGENTS.md'];
  return sentinels.some((name) => existsSync(join(ws, name)));
}

function detectWorkspaceDir(root: string): string {
  const preferred = DEFAULT_FRAME_PROJECT_LAYOUT.workspaceDir; // ".agents"
  const legacy = LEGACY_FRAME_PROJECT_LAYOUT.workspaceDir; // ".code"

  if (hasWorkspaceContent(root, preferred)) return preferred;
  if (hasWorkspaceContent(root, legacy)) return legacy;

  // If directories exist but are empty, prefer legacy only when preferred does not exist.
  if (existsSync(resolvePath(root, preferred))) return preferred;
  if (existsSync(resolvePath(root, legacy))) return legacy;

  return preferred;
}

export function resolveProjectLayout(
  projectRoot: string,
  overrides?: Partial<FrameProjectLayout>
): FrameProjectLayout {
  const root = resolve(projectRoot);
  const workspaceDir = overrides?.workspaceDir ?? detectWorkspaceDir(root);

  return {
    workspaceDir: resolvePath(root, workspaceDir),
    agentsDir: resolvePath(root, overrides?.agentsDir ?? join(workspaceDir, 'agents')),
    mcpConfigFile: resolvePath(root, overrides?.mcpConfigFile ?? join(workspaceDir, 'mcp.json')),
    agentConfigFile: resolvePath(root, overrides?.agentConfigFile ?? join(workspaceDir, 'config.json')),
    rulesFile: resolvePath(root, overrides?.rulesFile ?? join(workspaceDir, 'AGENTS.md')),
    rulesFallbackFile: resolvePath(root, overrides?.rulesFallbackFile ?? 'AGENTS.md'),
    skillsDir: resolvePath(root, overrides?.skillsDir ?? join(workspaceDir, 'skills')),
  };
}
