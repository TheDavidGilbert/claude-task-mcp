import { getDb } from '../db.js';
import { ensureProject } from '../project.js';
import { addComment } from '../tasks.js';

export const schema = {
  type: 'object',
  properties: {
    task_id:      { type: 'string', description: 'Task ID, e.g. CTM-0001' },
    body:         { type: 'string', description: 'Comment text' },
    project_path: { type: 'string', description: 'Absolute path to project root (optional)' },
  },
  required: ['task_id', 'body'],
} as const;

export async function handler(args: Record<string, unknown>, projectPath: string): Promise<string> {
  const taskId = args.task_id as string;
  const body = args.body as string;

  const db = getDb(projectPath);
  ensureProject(db, projectPath);
  const comment = addComment(db, taskId, body);

  return `Comment added to ${taskId} at ${comment.created_at}`;
}
