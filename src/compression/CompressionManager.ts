import type { AgentLLMConfig, IGraphState, Message } from '@ericnunes/frame-agent-sdk';
import { ChatHistoryManager, TokenizerService, extractTextFromMessage } from '@ericnunes/frame-agent-sdk';
import * as path from 'path';
import { resolve } from 'path';
import { LLMCompressionService } from './LLMCompressionService';
import { logger } from '../infrastructure/logging/logger';
import { loadConfigSync } from '../infrastructure/config/config';

export interface ICompressionConfig {
  enabled: boolean;
  threshold: number;
  maxCount: number;
  maxTokens: number;
  model?: string;
  logging: boolean;
  persist: boolean;
  persistKey?: string;
}

function sanitizePersistKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'default';
}

type PersistedCompressions = {
  compressoes: string[];
  compressionCount: number;
  persistKey: string;
  timestamp: string;
};

export class CompressionManager {
  private readonly projectRoot: string;
  private readonly llmService: LLMCompressionService;
  private readonly compressionConfig: ICompressionConfig;
  private readonly maxCompressoes: number;
  private readonly persistKey: string;

  private compressoes: string[] = [];
  private compressionCount = 0;

  private chatHistoryManager?: ChatHistoryManager;
  private tokenizerService?: TokenizerService;

  constructor(args: {
    projectRoot: string;
    config?: Partial<ICompressionConfig>;
    llmConfig?: AgentLLMConfig;
  }) {
    this.projectRoot = resolve(args.projectRoot);
    const defaultConfig = loadConfigSync(this.projectRoot);

    this.compressionConfig = {
      enabled: true,
      threshold: 0.8,
      maxCount: 5,
      maxTokens: 300,
      logging: true,
      persist: true,
      ...args.config,
    };

    this.maxCompressoes = this.compressionConfig.maxCount;
    this.persistKey = sanitizePersistKey(this.compressionConfig.persistKey ?? 'default');
    this.llmService = new LLMCompressionService({ projectRoot: this.projectRoot, llmConfig: args.llmConfig });

    if (!this.llmService.isConfigured()) {
      logger.warn('[CompressionManager] LLM nao configurado corretamente');
      logger.debug('[CompressionManager] Config info:', this.llmService.getConfigInfo());
    }

    const maxContextTokens = defaultConfig.defaults?.maxContextTokens || 240000;
    this.initializeTokenization(maxContextTokens);

    if (this.compressionConfig.persist) {
      this.loadPersistedCompressions();
    }

    logger.info('[CompressionManager] Inicializado', {
      enabled: this.compressionConfig.enabled,
      maxCompressoes: this.maxCompressoes,
      threshold: this.compressionConfig.threshold,
      currentCompressions: this.compressoes.length,
      persistKey: this.persistKey,
    });
  }

  private initializeTokenization(maxContextTokens: number): void {
    try {
      this.tokenizerService = new TokenizerService('gpt-4');
      this.chatHistoryManager = new ChatHistoryManager({
        maxContextTokens,
        tokenizer: this.tokenizerService,
      });
      logger.debug('[CompressionManager] Tokenizacao inicializada');
    } catch (error) {
      logger.error('[CompressionManager] Erro ao inicializar tokenizacao:', error);
    }
  }

  async handleTokenOverflow(error: Error, state: IGraphState): Promise<IGraphState> {
    if (!this.compressionConfig.enabled) throw error;
    logger.warn('[CompressionManager] Token overflow detectado, compressao emergencial');

    try {
      const messages = this.extractMessagesFromState(state);
      await this.performEmergencyCompression(messages);
      return await this.buildCompressedState(state);
    } catch (compressionError) {
      logger.error('[CompressionManager] Falha na compressao emergencial:', compressionError);
      throw error;
    }
  }

  async checkProactiveCompression(state: IGraphState): Promise<boolean> {
    if (!this.compressionConfig.enabled || !this.tokenizerService) return false;

    try {
      const messages = this.extractMessagesFromState(state);
      const currentTokens = this.tokenizerService.countTokens(messages);
      const maxTokens = 240000;
      const usageRatio = currentTokens / maxTokens;
      const shouldCompress = usageRatio >= this.compressionConfig.threshold;

      if (this.compressionConfig.logging) {
        logger.debug(`[CompressionManager] tokens=${currentTokens}/${maxTokens} ratio=${(usageRatio * 100).toFixed(1)}%`);
      }

      return shouldCompress;
    } catch (error) {
      logger.error('[CompressionManager] Erro na verificacao proativa:', error);
      return false;
    }
  }

  async performProactiveCompression(state: IGraphState): Promise<IGraphState> {
    logger.info('[CompressionManager] Compressao proativa start');
    const messages = this.extractMessagesFromState(state);
    await this.performEmergencyCompression(messages);
    return await this.buildCompressedState(state);
  }

  private async performEmergencyCompression(messages: Message[]): Promise<void> {
    if (!this.llmService.isConfigured()) {
      throw new Error('LLM nao configurado para compressao');
    }

    const contextToCompress = this.extractCompressibleContext(messages);
    if (contextToCompress.trim().length === 0) {
      logger.warn('[CompressionManager] Nenhum contexto para comprimir');
      return;
    }

    let newCompression: string;
    if (this.compressionCount === 0) {
      newCompression = await this.llmService.compressInitial(contextToCompress);
      this.compressionCount = 1;
      this.compressoes.push(newCompression);
    } else {
      newCompression = await this.llmService.compressIncremental(this.compressoes, contextToCompress);
      if (this.compressoes.length >= this.maxCompressoes) {
        await this.mergeOldestCompressions();
      }
      this.compressionCount += 1;
      this.compressoes.push(newCompression);
    }

    if (this.compressionConfig.persist) {
      this.persistCompressions();
    }
  }

  private async mergeOldestCompressions(): Promise<void> {
    if (this.compressoes.length < 2) return;
    const oldest1 = this.compressoes.shift();
    const oldest2 = this.compressoes.shift();
    if (!oldest1 || !oldest2) return;

    const merged = await this.llmService.mergeCompressions(oldest1, oldest2);
    this.compressoes.unshift(merged);
  }

  private extractMessagesFromState(state: IGraphState): Message[] {
    return (state.messages || []) as Message[];
  }

  private extractProtectedMessages(messages: Message[]): Message[] {
    const protectedIndices = this.getProtectedMessageIndices(messages);
    const out: Message[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (protectedIndices.has(i)) out.push(messages[i]);
    }
    return out;
  }

  private extractCompressibleContext(messages: Message[]): string {
    const protectedIndices = this.getProtectedMessageIndices(messages);
    const parts: string[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (protectedIndices.has(i)) continue;
      const m = messages[i];
      const role = String((m as any).role);
      if (role === 'system') continue;
      const text = extractTextFromMessage(m);
      if (!text) continue;
      parts.push(`${role}: ${text}`);
    }
    return parts.join('\n');
  }

  /**
   * Mensagens protegidas nao entram no bloco de compressao e devem ser preservadas no estado final.
   *
   * Regra minima: preservar `system` + ultima mensagem `user` para nao perder o input que disparou a request.
   * Regra ideal (CLI-like): preservar `system` + primeira `user` + ultima `user`.
   */
  private getProtectedMessageIndices(messages: Message[]): Set<number> {
    const protectedIndices = new Set<number>();

    const userIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      const role = String((messages[i] as any)?.role);
      if (role === 'system') protectedIndices.add(i);
      if (role === 'user') userIndices.push(i);
    }

    if (userIndices.length > 0) {
      protectedIndices.add(userIndices[0]);
      protectedIndices.add(userIndices[userIndices.length - 1]);
    }

    return protectedIndices;
  }

  private async buildCompressedState(originalState: IGraphState): Promise<IGraphState> {
    const originalMessages = this.extractMessagesFromState(originalState);
    const protectedMessages = this.extractProtectedMessages(originalMessages);

    const newMessages: Message[] = [...protectedMessages];
    if (this.compressoes.length > 0) {
      const compressionContext = this.getCompressionPrompt();
      newMessages.unshift({ role: 'system', content: compressionContext } as any);
    }

    return { ...originalState, messages: newMessages as any };
  }

  getCompressionPrompt(): string {
    if (this.compressoes.length === 0) return '';
    return `CONTEXTO ACUMULADO DA SESSAO:\n${this.compressoes.join('\n')}`;
  }

  getCompressionHistory(): string[] {
    return [...this.compressoes];
  }

  clearCompressions(): void {
    this.compressoes = [];
    this.compressionCount = 0;
    if (this.compressionConfig.persist) this.clearPersistedCompressions();
    logger.info('[CompressionManager] Compressoes limpas');
  }

  private getPersistPath(): string {
    return path.join(this.projectRoot, `.frame-agent-compressions.${this.persistKey}.json`);
  }

  private getLegacyPersistPath(): string {
    return path.join(this.projectRoot, `.frame-code-compressions.${this.persistKey}.json`);
  }

  private persistCompressions(): void {
    try {
      const fs = require('fs') as typeof import('fs');
      const persistPath = this.getPersistPath();

      const data: PersistedCompressions = {
        compressoes: this.compressoes,
        compressionCount: this.compressionCount,
        persistKey: this.persistKey,
        timestamp: new Date().toISOString(),
      };

      fs.writeFileSync(persistPath, JSON.stringify(data, null, 2));
      logger.debug('[CompressionManager] Compressoes persistidas');
    } catch (error) {
      logger.error('[CompressionManager] Erro ao persistir compressoes:', error);
    }
  }

  private loadPersistedCompressions(): void {
    try {
      const fs = require('fs') as typeof import('fs');
      const primary = this.getPersistPath();
      const legacy = this.getLegacyPersistPath();
      const persistPath = fs.existsSync(primary) ? primary : legacy;

      if (!fs.existsSync(persistPath)) return;

      const data = JSON.parse(fs.readFileSync(persistPath, 'utf-8')) as Partial<PersistedCompressions>;
      this.compressoes = data.compressoes || [];
      this.compressionCount = data.compressionCount || 0;
      logger.info(`[CompressionManager] Carregadas ${this.compressoes.length} compressoes persistidas`);
    } catch (error) {
      logger.error('[CompressionManager] Erro ao carregar compressoes persistidas:', error);
    }
  }

  private clearPersistedCompressions(): void {
    try {
      const fs = require('fs') as typeof import('fs');
      const primary = this.getPersistPath();
      const legacy = this.getLegacyPersistPath();

      if (fs.existsSync(primary)) fs.unlinkSync(primary);
      if (fs.existsSync(legacy)) fs.unlinkSync(legacy);
      logger.debug('[CompressionManager] Arquivos de persistencia removidos');
    } catch (error) {
      logger.error('[CompressionManager] Erro ao limpar persistencia:', error);
    }
  }
}
