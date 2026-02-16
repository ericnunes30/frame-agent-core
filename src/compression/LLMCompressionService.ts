import type { AgentLLMConfig } from '@ericnunes/frame-agent-sdk';
import { logger } from '../infrastructure/logging/logger';
import { loadConfigSync } from '../infrastructure/config/config';

export class LLMCompressionService {
  private readonly llmConfig: AgentLLMConfig;
  private readonly modelName: string;
  private readonly projectRoot: string;

  constructor(args: { projectRoot: string; llmConfig?: AgentLLMConfig }) {
    this.projectRoot = args.projectRoot;

    if (args.llmConfig) {
      this.llmConfig = args.llmConfig;
      this.modelName = args.llmConfig.model;
      return;
    }

    const config = loadConfigSync(this.projectRoot);
    this.llmConfig = {
      model: config.defaults?.model || 'gpt-4o-mini',
      provider: config.provider,
      apiKey: config.apiKey,
      baseUrl: config.baseURL,
      defaults: {
        maxTokens: config.defaults?.maxTokens,
        temperature: config.defaults?.temperature,
      },
    };
    this.modelName = this.llmConfig.model;
  }

  async compressInitial(context: string): Promise<string> {
    const prompt = this.buildInitialCompressionPrompt(context);
    logger.info('[LLMCompressionService] compressInitial start');
    try {
      return await this.callLLM(prompt);
    } catch (error) {
      logger.error('[LLMCompressionService] compressInitial error:', error);
      throw new Error(`Falha na compressao inicial: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  async compressIncremental(compressoes: string[], newContext: string): Promise<string> {
    const compressionCount = compressoes.length + 1;
    const prompt = this.buildIncrementalCompressionPrompt(compressoes, newContext, compressionCount);
    logger.info(`[LLMCompressionService] compressIncremental #${compressionCount} start`);
    try {
      return await this.callLLM(prompt);
    } catch (error) {
      logger.error(`[LLMCompressionService] compressIncremental #${compressionCount} error:`, error);
      throw new Error(`Falha na compressao incremental: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  async mergeCompressions(comp1: string, comp2: string): Promise<string> {
    const prompt = this.buildMergeCompressionPrompt(comp1, comp2);
    logger.info('[LLMCompressionService] mergeCompressions start');
    try {
      return await this.callLLM(prompt);
    } catch (error) {
      logger.error('[LLMCompressionService] mergeCompressions error:', error);
      throw new Error(`Falha na mesclagem de compressao: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  private buildInitialCompressionPrompt(context: string): string {
    return `Voce e um especialista em sumarizar conversas de desenvolvimento.

Comprima este contexto completo em uma sumarizacao concisa:
${context}

Formato obrigatorio: "COMPRESSAO 1: [sua sumarizacao]"

Preserve:
- Objetivos principais do projeto/sessao
- Contexto tecnico essencial
- Decisoes ou requisitos
- Arquivos ou tecnologias mencionadas

Responda APENAS com a compressao no formato especificado.`;
  }

  private buildIncrementalCompressionPrompt(compressoes: string[], newContext: string, compressionNumber: number): string {
    const compressoesText = compressoes.map((comp, index) => `COMPRESSAO ${index + 1}: ${comp}`).join('\n');

    return `Voce esta gerenciando o contexto acumulado de uma longa conversa de desenvolvimento.

Compressoes anteriores:
${compressoesText}

Novo contexto recente:
${newContext}

Crie uma nova compressao que integre tudo.

Formato obrigatorio: "COMPRESSAO ${compressionNumber}: [sumarizacao integrada]"

Responda APENAS com a compressao no formato especificado.`;
  }

  private buildMergeCompressionPrompt(comp1: string, comp2: string): string {
    return `Mescle estas duas compressoes antigas em uma unica sumarizacao coesa:

COMPRESSAO A: ${comp1}
COMPRESSAO B: ${comp2}

Crie uma nova compressao combinada (max 400 tokens).
Formato: "COMPRESSAO COMBINADA: [sumarizacao unificada]"

Responda APENAS com a compressao combinada.`;
  }

  private async callLLM(prompt: string): Promise<string> {
    // Dynamic import to avoid eager dependency cost.
    const mod: any = await import('openai');
    const OpenAI = mod?.OpenAI ?? mod?.default;
    if (!OpenAI) {
      throw new Error('OpenAI client export not found in "openai" package');
    }

    const openai = new OpenAI({
      apiKey: this.llmConfig.apiKey,
      baseURL: this.llmConfig.baseUrl,
    });

    const config = loadConfigSync(this.projectRoot);
    const maxTokens = config.compression?.maxTokens || 500;

    const response = await openai.chat.completions.create({
      model: this.modelName,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) throw new Error('Resposta vazia do LLM');
    return content;
  }

  isConfigured(): boolean {
    return Boolean(this.llmConfig.apiKey && this.llmConfig.model);
  }

  getConfigInfo(): Record<string, unknown> {
    return {
      model: this.modelName,
      provider: this.llmConfig.provider,
      hasApiKey: Boolean(this.llmConfig.apiKey),
      hasBaseUrl: Boolean(this.llmConfig.baseUrl),
      maxTokens: this.llmConfig.defaults?.maxTokens,
      temperature: this.llmConfig.defaults?.temperature,
    };
  }
}
