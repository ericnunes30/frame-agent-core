import * as fs from 'fs';
import * as path from 'path';
import { resolve } from 'path';
import { logger } from '../infrastructure/logging/logger';

export interface IProjectRules {
  content: string;
  source: 'code-dir' | 'root' | 'none';
  path: string;
}

export const loadProjectRules = {
  /**
   * Carrega o arquivo AGENTS.md do projeto.
   * Prioridade default: .code/AGENTS.md > AGENTS.md (raiz)
   */
  load(
    projectRoot: string,
    options?: { rulesFile?: string; rulesFallbackFile?: string }
  ): IProjectRules {
    const root = resolve(projectRoot);
    const primaryPath = options?.rulesFile
      ? path.isAbsolute(options.rulesFile)
        ? options.rulesFile
        : path.join(root, options.rulesFile)
      : path.join(root, '.code', 'AGENTS.md');

    const fallbackPath = options?.rulesFallbackFile
      ? path.isAbsolute(options.rulesFallbackFile)
        ? options.rulesFallbackFile
        : path.join(root, options.rulesFallbackFile)
      : path.join(root, 'AGENTS.md');

    if (fs.existsSync(primaryPath)) {
      const content = fs.readFileSync(primaryPath, 'utf-8');
      logger.info(`[loadProjectRules] Carregado rules file: ${primaryPath}`);
      return { content, source: 'code-dir', path: primaryPath };
    }

    if (fs.existsSync(fallbackPath)) {
      const content = fs.readFileSync(fallbackPath, 'utf-8');
      logger.info(`[loadProjectRules] Carregado rules fallback: ${fallbackPath}`);
      return { content, source: 'root', path: fallbackPath };
    }

    logger.debug('[loadProjectRules] AGENTS.md nao encontrado no projeto');
    return { content: '', source: 'none', path: '' };
  },

  /**
   * Carrega AGENTS.md de um diretorio especifico.
   * Fallback: CLAUDE.md.
   */
  loadFromDirectory(directoryPath: string): string {
    const agentsMdPath = path.join(directoryPath, 'AGENTS.md');
    const claudeMdPath = path.join(directoryPath, 'CLAUDE.md');

    if (fs.existsSync(agentsMdPath)) {
      const content = fs.readFileSync(agentsMdPath, 'utf-8');
      logger.debug(`[loadProjectRules] Carregado AGENTS.md de: ${agentsMdPath}`);
      return content;
    }

    if (fs.existsSync(claudeMdPath)) {
      const content = fs.readFileSync(claudeMdPath, 'utf-8');
      logger.debug(`[loadProjectRules] Carregado CLAUDE.md de: ${claudeMdPath}`);
      return content;
    }

    return '';
  },
};
