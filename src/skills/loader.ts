import * as fs from 'fs';
import * as path from 'path';
import { resolve } from 'path';

export interface ISkillMetadata {
  name: string;
  description: string;
  keywords: string[];
  path: string;
}

export class SkillLoader {
  private readonly skillsDirs: string[];

  constructor(args: { projectRoot: string; skillsDir?: string; skillsDirs?: string[] }) {
    const root = resolve(args.projectRoot);
    if (args.skillsDirs && args.skillsDirs.length > 0) {
      this.skillsDirs = args.skillsDirs.map((dir) => (path.isAbsolute(dir) ? dir : resolve(root, dir)));
    } else if (args.skillsDir) {
      this.skillsDirs = [path.isAbsolute(args.skillsDir) ? args.skillsDir : resolve(root, args.skillsDir)];
    } else {
      // Default: prefer .agents/skills, fallback .code/skills (legacy), then workspace roots.
      this.skillsDirs = [
        path.join(root, '.agents', 'skills'),
        path.join(root, '.code', 'skills'),
        path.join(root, '.agents'),
        path.join(root, '.code'),
      ];
    }
  }

  private parseSkillFile(filePath: string): ISkillMetadata | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Frontmatter simples.
      if (lines[0].trim() !== '---') return null;

      const frontmatter: any = {};
      let i = 1;
      for (; i < lines.length; i++) {
        if (lines[i].trim() === '---') break;
        const [key, ...valueParts] = lines[i].split(':');
        if (key && valueParts.length > 0) {
          const value = valueParts.join(':').trim();
          const cleanValue = value.replace(/^['"]|['"]$/g, '');

          if (value.startsWith('[') && value.endsWith(']')) {
            frontmatter[key.trim()] = value
              .slice(1, -1)
              .split(',')
              .map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
          } else {
            frontmatter[key.trim()] = cleanValue;
          }
        }
      }

      if (!frontmatter.name) return null;

      return {
        name: frontmatter.name,
        description: frontmatter.description || '',
        keywords: frontmatter.keywords || [],
        path: filePath.replace(/\\/g, '/'),
      };
    } catch {
      return null;
    }
  }

  public loadAllSkills(): ISkillMetadata[] {
    const skills: ISkillMetadata[] = [];
    for (const dir of this.skillsDirs) {
      if (!fs.existsSync(dir)) continue;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(dir, entry.name, 'SKILL.md');
          if (fs.existsSync(skillPath)) {
            const skill = this.parseSkillFile(skillPath);
            if (skill) skills.push(skill);
          }
        } else if (entry.name.endsWith('.md')) {
          const skillPath = path.join(dir, entry.name);
          const skill = this.parseSkillFile(skillPath);
          if (skill) skills.push(skill);
        }
      }
    }

    return skills;
  }
}
