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
   * Carrega AMBOS: .agents/.code/AGENTS.md (rules) + AGENTS.md (raiz/fallback)
   * Os conteúdos são concatenados, com rules primeiro, depois fallback.
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
      : path.join(root, '.agents', 'AGENTS.md');

    const legacyPrimaryPath = path.join(root, '.code', 'AGENTS.md');

    const fallbackPath = options?.rulesFallbackFile
      ? path.isAbsolute(options.rulesFallbackFile)
        ? options.rulesFallbackFile
        : path.join(root, options.rulesFallbackFile)
      : path.join(root, 'AGENTS.md');

    let content = '';
    let source: IProjectRules['source'] = 'none';
    let pathFound = '';

    // Carrega rules (.agents/ ou .code/AGENTS.md) do projeto atual
    if (fs.existsSync(primaryPath)) {
      content = fs.readFileSync(primaryPath, 'utf-8');
      source = 'code-dir';
      pathFound = primaryPath;
      logger.info(`[loadProjectRules] Carregado rules file: ${primaryPath}`);
    } else if (!options?.rulesFile && fs.existsSync(legacyPrimaryPath)) {
      const legacyContent = fs.readFileSync(legacyPrimaryPath, 'utf-8');
      content = legacyContent;
      source = 'code-dir';
      pathFound = legacyPrimaryPath;
      logger.info(`[loadProjectRules] Carregado rules legacy: ${legacyPrimaryPath}`);
    }

    // Carrega fallback (AGENTS.md na raiz) e concatena
    if (fs.existsSync(fallbackPath)) {
      const fallbackContent = fs.readFileSync(fallbackPath, 'utf-8');
      if (content) {
        content += '\n\n---\n\n'; // Separa os conteúdos
      }
      content += fallbackContent;
      source = 'root';
      pathFound = fallbackPath;
      logger.info(`[loadProjectRules] Carregado rules fallback: ${fallbackPath}`);
    }

    if (!content) {
      logger.debug('[loadProjectRules] AGENTS.md nao encontrado no projeto');
    }

    return { content, source, path: pathFound };
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
