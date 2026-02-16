import type { McpConfigWithMetadata } from './mcpMetadata';
import type { FrameProjectLayout } from '../../runtime/layout';
import { loadUserCodeMcpConfigs } from './discoverer';

export interface IMcpMetadata {
  id: string;
  name: string;
  namespace: string;
  type: 'mcp';
  config: McpConfigWithMetadata;
  registered: boolean;
  visible: boolean;
}

export class McpLoader {
  private readonly configs: McpConfigWithMetadata[];

  constructor(args: { projectRoot: string; configFile?: string; layout?: FrameProjectLayout }) {
    const userConfigs = loadUserCodeMcpConfigs({
      projectRoot: args.projectRoot,
      configFile: args.configFile,
      layout: args.layout,
    });
    this.configs = [...userConfigs];
  }

  loadAllMcpConfigs(): IMcpMetadata[] {
    return this.configs
      .filter((config) => config.name !== undefined)
      .map((config) => ({
        id: (config as any).id!,
        name: (config as any).name!,
        namespace: (config as any).namespace || 'default',
        type: 'mcp' as const,
        config,
        registered: (config as any).mcp?.enable !== false,
        visible: (config as any).mcp?.excludeFromList !== true,
      }));
  }

  loadVisibleMcpConfigs(): IMcpMetadata[] {
    return this.loadAllMcpConfigs().filter((m) => m.visible);
  }

  loadRegisteredMcpConfigs(): IMcpMetadata[] {
    return this.loadAllMcpConfigs().filter((m) => m.registered);
  }

  getMcpById(id: string): IMcpMetadata | undefined {
    return this.loadAllMcpConfigs().find((m) => m.id === id);
  }

  getMcpByNamespace(namespace: string): IMcpMetadata[] {
    return this.loadAllMcpConfigs().filter((m) => m.namespace === namespace);
  }
}
