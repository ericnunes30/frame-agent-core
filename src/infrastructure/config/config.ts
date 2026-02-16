import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import type { IConfig } from './config.interface';

const envLoadedForRoot = new Set<string>();

function ensureEnvLoaded(projectRoot: string): void {
  const root = resolve(projectRoot);
  if (envLoadedForRoot.has(root)) return;

  const envPath = join(root, '.env');
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  const localEnvPath = join(root, '.env.local');
  if (existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
  }

  envLoadedForRoot.add(root);
}

export async function loadConfig(projectRoot: string): Promise<IConfig> {
  ensureEnvLoaded(projectRoot);

  return {
    provider: process.env.LLM_PROVIDER || 'openai',
    apiKey: process.env.LLM_API_KEY || '',
    baseURL: process.env.LLM_BASE_URL,
    vision: {
      supportsVision: process.env.LLM_SUPPORTS_VISION === 'true',
      provider: process.env.LLM_VISION_PROVIDER || process.env.LLM_PROVIDER || 'openai',
      apiKey: process.env.LLM_VISION_API_KEY || process.env.LLM_API_KEY || '',
      baseURL: process.env.LLM_VISION_BASE_URL || process.env.LLM_BASE_URL,
      model: process.env.LLM_VISION_MODEL || process.env.LLM_DEFAULT_MODEL,
    },
    defaults: {
      model: process.env.LLM_DEFAULT_MODEL || 'gpt-4o-mini',
      maxTokens: parseInt(process.env.LLM_MAX_OUTPUT_TOKENS || '4096', 10),
      maxContextTokens: parseInt(process.env.LLM_MAX_TOKENS || '128000', 10),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
      topP: process.env.LLM_TOP_P ? parseFloat(process.env.LLM_TOP_P) : undefined,
    },
    compression: {
      enabled: process.env.COMPRESSION_ENABLED !== 'false',
      threshold: parseFloat(process.env.COMPRESSION_THRESHOLD || '0.8'),
      maxCount: parseInt(process.env.COMPRESSION_MAX_COUNT || '5', 10),
      maxTokens: parseInt(process.env.COMPRESSION_MAX_TOKENS || '300', 10),
      model: process.env.COMPRESSION_MODEL,
      logging: process.env.COMPRESSION_LOGGING !== 'false',
      persist: process.env.COMPRESSION_PERSIST !== 'false',
    },
    tools: {
      mcpEnabled: process.env.MCP_TOOLS_ENABLED !== 'false',
      agentMode: process.env.AGENT_MODE === 'autonomous' ? 'autonomous' : 'interactive',
    },
  };
}

export function loadConfigSync(projectRoot: string): IConfig {
  ensureEnvLoaded(projectRoot);

  return {
    provider: process.env.LLM_PROVIDER || 'openai',
    apiKey: process.env.LLM_API_KEY || '',
    baseURL: process.env.LLM_BASE_URL,
    vision: {
      supportsVision: process.env.LLM_SUPPORTS_VISION === 'true',
      provider: process.env.LLM_VISION_PROVIDER || process.env.LLM_PROVIDER || 'openai',
      apiKey: process.env.LLM_VISION_API_KEY || process.env.LLM_API_KEY || '',
      baseURL: process.env.LLM_VISION_BASE_URL || process.env.LLM_BASE_URL,
      model: process.env.LLM_VISION_MODEL || process.env.LLM_DEFAULT_MODEL,
    },
    defaults: {
      model: process.env.LLM_DEFAULT_MODEL || 'gpt-4o-mini',
      maxTokens: parseInt(process.env.LLM_MAX_OUTPUT_TOKENS || '4096', 10),
      maxContextTokens: parseInt(process.env.LLM_MAX_TOKENS || '128000', 10),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
      topP: process.env.LLM_TOP_P ? parseFloat(process.env.LLM_TOP_P) : undefined,
    },
    compression: {
      enabled: process.env.COMPRESSION_ENABLED !== 'false',
      threshold: parseFloat(process.env.COMPRESSION_THRESHOLD || '0.8'),
      maxCount: parseInt(process.env.COMPRESSION_MAX_COUNT || '5', 10),
      maxTokens: parseInt(process.env.COMPRESSION_MAX_TOKENS || '300', 10),
      model: process.env.COMPRESSION_MODEL,
      logging: process.env.COMPRESSION_LOGGING !== 'false',
      persist: process.env.COMPRESSION_PERSIST !== 'false',
    },
    tools: {
      mcpEnabled: process.env.MCP_TOOLS_ENABLED !== 'false',
      agentMode: process.env.AGENT_MODE === 'autonomous' ? 'autonomous' : 'interactive',
    },
  };
}

export type { IConfig } from './config.interface';

