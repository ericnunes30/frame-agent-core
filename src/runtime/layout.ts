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

export function resolveProjectLayout(
  projectRoot: string,
  overrides?: Partial<FrameProjectLayout>
): FrameProjectLayout {
  const root = resolve(projectRoot);
  const base = { ...DEFAULT_FRAME_PROJECT_LAYOUT, ...(overrides || {}) };

  // workspaceDir might be used as prefix; normalize once
  const workspaceDirAbs = resolvePath(root, base.workspaceDir);

  const resolved: FrameProjectLayout = {
    workspaceDir: workspaceDirAbs,
    agentsDir: resolvePath(root, base.agentsDir ?? join(base.workspaceDir, 'agents')),
    mcpConfigFile: resolvePath(root, base.mcpConfigFile ?? join(base.workspaceDir, 'mcp.json')),
    agentConfigFile: resolvePath(root, base.agentConfigFile ?? join(base.workspaceDir, 'config.json')),
    rulesFile: resolvePath(root, base.rulesFile ?? join(base.workspaceDir, 'AGENTS.md')),
    rulesFallbackFile: resolvePath(root, base.rulesFallbackFile ?? 'AGENTS.md'),
    skillsDir: resolvePath(root, base.skillsDir ?? join(base.workspaceDir, 'skills')),
  };

  return resolved;
}
