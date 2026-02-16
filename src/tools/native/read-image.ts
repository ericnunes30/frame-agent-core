import { ToolBase } from '@ericnunes/frame-agent-sdk';
import type { ReadImageParams } from '@ericnunes/frame-agent-sdk';
import { promises as fs } from 'fs';
import * as path from 'path';
import { resolve } from 'path';
import { createHash } from 'crypto';

type ReadImageToolMeta = {
  path: string;
  mimeType: string;
  bytes: number;
  detail?: 'low' | 'high' | 'auto';
  hash?: string;
};

type ReadImageToolResult = {
  observation: string;
  metadata: { readImage: ReadImageToolMeta };
};

class ReadImageParamsSchema {
  static schemaProperties = {
    source: 'string',
    'path?': 'string',
    'region?': 'object',
    'detail?': 'string',
    'maxBytes?': 'number',
  } as const;
}

function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

export function createReadImageTool(args: { projectRoot: string }) {
  const projectRoot = resolve(args.projectRoot);

  function toSafeAbsolutePath(inputPath: string): string {
    return path.isAbsolute(inputPath) ? inputPath : path.resolve(projectRoot, inputPath);
  }

  return new (class extends ToolBase<ReadImageParams, ReadImageToolResult> {
    public readonly name = 'read_image';
    public readonly description =
      'Read an image from the host environment. Returns a safe reference + metadata; the host attaches the image to the next LLM call.';
    public readonly parameterSchema = ReadImageParamsSchema;

    public async execute(params: ReadImageParams): Promise<ReadImageToolResult> {
      if (params.source !== 'path') {
        return {
          observation: `Unsupported source "${params.source}". Only "path" is supported.`,
          metadata: { readImage: { path: '', mimeType: '', bytes: 0, detail: params.detail } },
        };
      }

      const rawPath = params.path?.trim();
      if (!rawPath) {
        return {
          observation: 'Missing required param: path (when source="path").',
          metadata: { readImage: { path: '', mimeType: '', bytes: 0, detail: params.detail } },
        };
      }

      const absolutePath = toSafeAbsolutePath(rawPath);
      const stat = await fs.stat(absolutePath);
      const bytes = stat.size;

      const maxBytes = Number.isFinite(params.maxBytes) ? Math.max(1, Number(params.maxBytes)) : 12 * 1024 * 1024;
      if (bytes > maxBytes) {
        return {
          observation: `Image too large (${bytes} bytes). Max allowed is ${maxBytes} bytes.`,
          metadata: { readImage: { path: absolutePath, mimeType: inferMimeType(absolutePath), bytes, detail: params.detail } },
        };
      }

      const buffer = await fs.readFile(absolutePath);
      const hash = createHash('sha256').update(buffer).digest('hex');

      const mimeType = inferMimeType(absolutePath);
      const detail = params.detail;

      return {
        observation: `Image loaded. path="${absolutePath}", mimeType="${mimeType}", bytes=${bytes}, sha256=${hash.slice(0, 12)}...(truncated)`,
        metadata: { readImage: { path: absolutePath, mimeType, bytes, detail, hash } },
      };
    }
  })();
}

