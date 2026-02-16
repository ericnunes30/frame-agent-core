import * as fs from 'fs';
import * as path from 'path';
import { resolve } from 'path';
import { logger } from '../../infrastructure/logging/logger';
import type { AgentConfigFile, AgentModelConfig, ResolvedAgentConfig } from '../interfaces/agentConfig.interface';

const configFileCacheByPath = new Map<string, AgentConfigFile | null>();

const ENV_VAR_REGEX = /\$\{([^}:]+)(?::-([^}]*))?\}/g;

function substituteEnvVars(value: string): string {
  if (typeof value !== 'string') return value;
  return value.replace(ENV_VAR_REGEX, (_match, varName, defaultValue) => {
    const envValue = process.env[varName];
    if (envValue !== undefined) return envValue;
    if (defaultValue !== undefined) return defaultValue;
    return '';
  });
}

function toNumberIfPossible(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+\.?\d*$/.test(trimmed)) return parseFloat(trimmed);
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
  }
  return value;
}

function substituteEnvVarsRecursive<T>(config: T): T {
  if (typeof config === 'string') {
    const substituted = substituteEnvVars(config);
    return toNumberIfPossible(substituted) as T;
  }

  if (Array.isArray(config)) {
    return config.map((item) => substituteEnvVarsRecursive(item)) as T;
  }

  if (config !== null && typeof config === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      result[key] = substituteEnvVarsRecursive(value);
    }
    return result as T;
  }

  return config;
}

function loadConfigFile(projectRoot: string, configFile?: string): AgentConfigFile | null {
  const root = resolve(projectRoot);
  const configPath = configFile ? resolve(configFile) : path.join(root, '.code', 'config.json');

  if (configFileCacheByPath.has(configPath)) return configFileCacheByPath.get(configPath) ?? null;

  if (!fs.existsSync(configPath)) {
    logger.debug(`[agentConfig] Config file nao encontrado: ${configPath}, usando apenas ENV`);
    configFileCacheByPath.set(configPath, null);
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content) as AgentConfigFile;
    configFileCacheByPath.set(configPath, parsed);
    logger.debug(`[agentConfig] Config carregado com sucesso: ${configPath}`);
    return parsed;
  } catch (error) {
    logger.error('[agentConfig] Erro ao carregar config de agente:', error);
    configFileCacheByPath.set(configPath, null);
    return null;
  }
}

export function loadAgentConfig(
  projectRoot: string,
  agentName: string,
  options?: { configFile?: string }
): ResolvedAgentConfig {
  const configFile = loadConfigFile(projectRoot, options?.configFile);
  if (!configFile) return { fromConfigFile: false };

  const agentSpecific = configFile.agents?.[agentName];
  const merged: AgentModelConfig = {
    ...(configFile.defaults || {}),
    ...(agentSpecific || {}),
  };

  const resolved = substituteEnvVarsRecursive<AgentModelConfig>(merged);
  return {
    ...resolved,
    fromConfigFile: true,
  };
}

export function clearConfigCache(projectRoot?: string, configFile?: string): void {
  if (configFile) {
    configFileCacheByPath.delete(resolve(configFile));
    return;
  }
  if (projectRoot) {
    // best-effort: remove any entries under this root
    const root = resolve(projectRoot);
    for (const key of Array.from(configFileCacheByPath.keys())) {
      if (key.startsWith(root)) configFileCacheByPath.delete(key);
    }
    return;
  }
  configFileCacheByPath.clear();
}

export function reloadConfig(projectRoot: string, configFile?: string): void {
  clearConfigCache(projectRoot, configFile);
  loadConfigFile(projectRoot, configFile);
}
