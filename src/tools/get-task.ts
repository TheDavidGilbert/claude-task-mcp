import { getDb } from '../db.js';
import { ensureProject } from '../project.js';
import { getTask } from '../tasks.js';

export const schema = {
  type: 'object',
  properties: {
    task_id:      { type: 'string', description: 'Task ID, e.g. CTM-0001' },
    project_path: { type: 'string', description: 'Absolute path to project root (optional)' },
  },
  required: ['task_id'],
} as const;

export async function handler(args: Record<string, unknown>, projectPath: string): Promise<string> {
  const taskId = args.task_id as string;

  const db = getDb(projectPath);
  ensureProject(db, projectPath);
  const task = getTask(db, taskId);

  if (!task) return `Task ${taskId} not found.`;

  const lines: string[] = [
    `${task.task_id} — ${task.title}`,
    `${'─'.repeat(50)}`,
    `Type:     ${task.type}`,
    `Priority: ${task.priority}`,
    `Stage:    ${task.stage}`,
    task.estimate ? `Estimate: ${task.estimate}` : '',
    `Created:  ${task.created_at}`,
    `Updated:  ${task.updated_at}`,
  ].filter(Boolean);

  if (task.description) {
    lines.push('', 'Description:', task.description);
  }

  if (task.links.length > 0) {
    lines.push('', 'Links:');
    for (const link of task.links) {
      const dir = link.direction === 'outbound' ? '→' : '←';
      lines.push(`  ${dir} ${link.link_type} ${link.related_task_id} (${link.related_task_title})`);
    }
  }

  if (task.comments.length > 0) {
    lines.push('', 'Comments:');
    for (const c of task.comments) {
      lines.push(`  [${c.created_at}]`, `  ${c.body}`);
    }
  }

  return lines.join('\n');
}
