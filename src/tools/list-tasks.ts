import { getDb } from '../db.js';
import { ensureProject } from '../project.js';
import { listTasks } from '../tasks.js';
import { TASK_TYPES, WORKFLOW_STAGES, PRIORITY_LEVELS, TaskType, WorkflowStage, Priority } from '../types.js';

export const schema = {
  type: 'object',
  properties: {
    stage:        { type: 'string', enum: WORKFLOW_STAGES as unknown as string[], description: 'Filter by stage' },
    type:         { type: 'string', enum: TASK_TYPES as unknown as string[], description: 'Filter by type' },
    priority:     { type: 'string', enum: PRIORITY_LEVELS as unknown as string[], description: 'Filter by priority' },
    project_path: { type: 'string', description: 'Absolute path to project root (optional)' },
  },
} as const;

export async function handler(args: Record<string, unknown>, projectPath: string): Promise<string> {
  const db = getDb(projectPath);
  const project = ensureProject(db, projectPath);

  const tasks = listTasks(db, project.id, {
    stage: args.stage as WorkflowStage | undefined,
    type: args.type as TaskType | undefined,
    priority: args.priority as Priority | undefined,
  });

  if (tasks.length === 0) return 'No tasks found.';

  const lines = tasks.map(t => {
    const id = t.task_id.padEnd(10);
    const type = `[${t.type}]`.padEnd(12);
    const priority = `[${t.priority}]`.padEnd(10);
    const stage = `[${t.stage}]`.padEnd(16);
    return `${id} ${type} ${priority} ${stage} ${t.title}`;
  });

  return [`${tasks.length} task(s):`, ...lines].join('\n');
}
