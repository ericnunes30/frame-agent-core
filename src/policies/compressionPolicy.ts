import type { ContextHooks, IGraphState } from '@ericnunes/frame-agent-sdk';
import { logger } from '../infrastructure/logging/logger';
import type { CompressionManager } from '../compression/CompressionManager';

function isTokenOverflowError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  const tokenErrorKeywords = [
    'maximum context length',
    'too many tokens',
    'context length exceeded',
    'token limit',
    'maximum tokens',
    'context window',
    'tokens exceed',
    'prompt is too long',
  ];

  return tokenErrorKeywords.some((keyword) => errorMessage.includes(keyword));
}

export function createCompressionContextPolicy(
  compressionManager: CompressionManager | null | undefined,
  options?: { maxRetries?: number }
): ContextHooks | undefined {
  if (!compressionManager) return undefined;

  const maxRetries = Math.max(0, options?.maxRetries ?? 2);

  return {
    maxRetries,
    isRetryableError: isTokenOverflowError,
    beforeRequest: async ({ attempt, messages }) => {
      try {
        const state = { messages } as IGraphState;
        const shouldCompress = await compressionManager.checkProactiveCompression(state);
        if (!shouldCompress) return;

        logger.info(`[ContextPolicy] compressao proativa (attempt=${attempt})`);
        const next = await compressionManager.performProactiveCompression(state);
        return { messages: (next.messages ?? messages) as any };
      } catch (error) {
        logger.warn('[ContextPolicy] falha na compressao proativa, seguindo sem compressao', error);
        return;
      }
    },
    onError: async ({ attempt, error, messages }) => {
      if (!isTokenOverflowError(error)) return { retry: false };

      try {
        logger.warn(`[ContextPolicy] token overflow (attempt=${attempt}), compressao emergencial e retry`);
        const state = { messages } as IGraphState;
        const next = await compressionManager.handleTokenOverflow(error, state);
        return { retry: true, messages: (next.messages ?? messages) as any };
      } catch (compressionError) {
        logger.error('[ContextPolicy] falha na compressao emergencial', compressionError);
        return { retry: false };
      }
    },
  };
}
