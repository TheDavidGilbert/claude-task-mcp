import { getDb } from '../db.js';
import { ensureProject } from '../project.js';
import { createTask } from '../tasks.js';
import { TASK_TYPES, WORKFLOW_STAGES, PRIORITY_LEVELS, TaskType, WorkflowStage, Priority } from '../types.js';

export const schema = {
  type: 'object',
  properties: {
    title:        { type: 'string', description: 'Short title for the task' },
    description:  { type: 'string', description: 'Longer description (optional)' },
    type:         { type: 'string', enum: TASK_TYPES as unknown as string[], description: 'Task type (conventional commit aligned)' },
    priority:     { type: 'string', enum: PRIORITY_LEVELS as unknown as string[], description: 'Priority level (default: medium)' },
    stage:        { type: 'string', enum: WORKFLOW_STAGES as unknown as string[], description: 'Initial stage (default: ideation)' },
    estimate:     { type: 'string', description: "Free-form estimate, e.g. '2h', '3d', 'M'" },
    assignee:     { type: 'string', description: 'Username or display name of the person assigned to this task' },
    due_date:     { type: 'string', description: 'Due date in ISO 8601 format, e.g. 2025-12-31' },
    actor:        { type: 'string', description: 'Username of the person performing this action (recorded in history)' },
    project_path: { type: 'string', description: 'Absolute path to project root (optional, defaults to cwd)' },
  },
  required: ['title', 'type'],
} as const;

export async function handler(args: Record<string, unknown>, projectPath: string): Promise<string> {
  const title = args.title as string;
  const type = args.type as TaskType;
  const description = args.description as string | undefined;
  const priority = args.priority as Priority | undefined;
  const stage = args.stage as WorkflowStage | undefined;
  const estimate = args.estimate as string | undefined;
  const assignee  = args.assignee as string | undefined;
  const due_date  = args.due_date as string | undefined;
  const actor     = args.actor as string | undefined;

  if (!TASK_TYPES.includes(type as TaskType)) {
    throw new Error(`Invalid type "${type}". Must be one of: ${TASK_TYPES.join(', ')}`);
  }

  const db = getDb(projectPath);
  const project = ensureProject(db, projectPath);
  const task = createTask(db, project.id, project.prefix, { title, description, type, priority, stage, estimate, assignee, due_date, actor });

  return [
    `Created task ${task.task_id}`,
    `Title:    ${task.title}`,
    `Type:     ${task.type} | Priority: ${task.priority} | Stage: ${task.stage}`,
    estimate ? `Estimate: ${task.estimate}` : '',
    description ? `\n${task.description}` : '',
  ].filter(Boolean).join('\n');
}
