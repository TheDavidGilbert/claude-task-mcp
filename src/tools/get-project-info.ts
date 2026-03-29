import { getDb } from '../db.js';
import { ensureProject } from '../project.js';
import { getProjectStats } from '../tasks.js';
import { WORKFLOW_STAGES } from '../types.js';

export const schema = {
  type: 'object',
  properties: {
    project_path: { type: 'string', description: 'Absolute path to project root (optional)' },
  },
} as const;

export async function handler(args: Record<string, unknown>, projectPath: string): Promise<string> {
  const db = getDb(projectPath);
  const project = ensureProject(db, projectPath);
  const stats = getProjectStats(db, project);

  const lines: string[] = [
    `Project: ${project.name}`,
    `Prefix:  ${project.prefix}`,
    `Path:    ${project.path}`,
    `Created: ${project.created_at}`,
    '',
    `Total tasks: ${stats.total}`,
    '',
    'By stage:',
  ];

  for (const stage of WORKFLOW_STAGES) {
    const count = stats.stage_counts[stage];
    if (count > 0) {
      lines.push(`  ${stage.padEnd(14)} ${count}`);
    }
  }

  if (stats.total === 0) {
    lines.push('  (no tasks yet)');
  }

  return lines.join('\n');
}
