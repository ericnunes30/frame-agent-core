import { ToolBase } from '@ericnunes/frame-agent-sdk';
import { promises as fs } from 'fs';
import * as path from 'path';
import { resolve } from 'path';

type ListDirectoryParams = {
  directory?: string;
  recursive?: boolean;
  maxDepth?: number;
  includeFiles?: boolean;
  includeDirs?: boolean;
  maxEntries?: number;
};

type ListDirectoryResult = {
  success: boolean;
  message: string;
  directory: string;
  entries: Array<{ path: string; type: 'file' | 'dir' }>;
  total: number;
  truncated: boolean;
};

class ListDirectoryParamsSchema {
  static schemaProperties = {
    'directory?': 'string',
    'recursive?': 'boolean',
    'maxDepth?': 'number',
    'includeFiles?': 'boolean',
    'includeDirs?': 'boolean',
    'maxEntries?': 'number',
  } as const;
}

async function existsReadable(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function walkDirectory(options: {
  root: string;
  relativeRoot: string;
  recursive: boolean;
  maxDepth: number;
  includeFiles: boolean;
  includeDirs: boolean;
  maxEntries: number;
}) {
  const { root, relativeRoot, recursive, maxDepth, includeFiles, includeDirs, maxEntries } = options;

  const entries: ListDirectoryResult['entries'] = [];
  let truncated = false;

  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const { dir, depth } = current;

    if (entries.length >= maxEntries) {
      truncated = true;
      break;
    }

    let dirents: Array<import('fs').Dirent>;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const dirent of dirents) {
      if (entries.length >= maxEntries) {
        truncated = true;
        break;
      }

      const absolutePath = path.join(dir, dirent.name);
      const relativePath = path.relative(relativeRoot, absolutePath).split(path.sep).join('/');

      if (dirent.isDirectory()) {
        if (includeDirs) entries.push({ path: relativePath, type: 'dir' });
        if (recursive && depth < maxDepth) queue.push({ dir: absolutePath, depth: depth + 1 });
      } else if (dirent.isFile()) {
        if (includeFiles) entries.push({ path: relativePath, type: 'file' });
      }
    }
  }

  return { entries, truncated };
}

export function createListDirectoryTool(args: { projectRoot: string }) {
  const projectRoot = resolve(args.projectRoot);

  return new (class extends ToolBase<ListDirectoryParams, ListDirectoryResult> {
    public readonly name = 'list_directory';
    public readonly description = 'Lista arquivos e diretorios (read-only), com opcao de recursao.';
    public readonly parameterSchema = ListDirectoryParamsSchema;

    public async execute(params: ListDirectoryParams): Promise<ListDirectoryResult> {
      const directory = params.directory?.trim() || '.';
      const recursive = params.recursive ?? false;
      const maxDepth = Number.isFinite(params.maxDepth) ? Math.max(0, Number(params.maxDepth)) : 2;
      const includeFiles = params.includeFiles ?? true;
      const includeDirs = params.includeDirs ?? true;
      const maxEntries = Number.isFinite(params.maxEntries) ? Math.max(1, Number(params.maxEntries)) : 500;

      const absolute = path.isAbsolute(directory) ? directory : path.resolve(projectRoot, directory);
      const ok = await existsReadable(absolute);
      if (!ok) {
        return {
          success: false,
          message: `Diretorio nao encontrado ou sem permissao: ${directory}`,
          directory,
          entries: [],
          total: 0,
          truncated: false,
        };
      }

      const { entries, truncated } = await walkDirectory({
        root: absolute,
        relativeRoot: absolute,
        recursive,
        maxDepth,
        includeFiles,
        includeDirs,
        maxEntries,
      });

      return {
        success: true,
        message: truncated ? 'Lista truncada por limite de entradas' : 'OK',
        directory,
        entries,
        total: entries.length,
        truncated,
      };
    }
  })();
}

