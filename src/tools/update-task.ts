import { getDb } from '../db.js';
import { ensureProject } from '../project.js';
import { updateTask } from '../tasks.js';
import { TASK_TYPES, WORKFLOW_STAGES, PRIORITY_LEVELS, TaskType, WorkflowStage, Priority } from '../types.js';

export const schema = {
  type: 'object',
  properties: {
    task_id:      { type: 'string', description: 'Task ID to update, e.g. CTM-0001' },
    title:        { type: 'string' },
    description:  { type: 'string' },
    type:         { type: 'string', enum: TASK_TYPES as unknown as string[] },
    priority:     { type: 'string', enum: PRIORITY_LEVELS as unknown as string[] },
    stage:        { type: 'string', enum: WORKFLOW_STAGES as unknown as string[] },
    estimate:     { type: 'string', description: "e.g. '2h', '3d', 'M'" },
    assignee:     { type: 'string', description: 'Username or display name of the person assigned to this task' },
    due_date:     { type: 'string', description: 'Due date in ISO 8601 format, e.g. 2025-12-31' },
    actor:        { type: 'string', description: 'Username of the person performing this action (recorded in history)' },
    project_path: { type: 'string', description: 'Absolute path to project root (optional)' },
  },
  required: ['task_id'],
} as const;

export async function handler(args: Record<string, unknown>, projectPath: string): Promise<string> {
  const taskId = args.task_id as string;
  const updates: Record<string, unknown> = {};

  if (args.title !== undefined)       updates.title = args.title;
  if (args.description !== undefined) updates.description = args.description;
  if (args.type !== undefined)        updates.type = args.type as TaskType;
  if (args.priority !== undefined)    updates.priority = args.priority as Priority;
  if (args.stage !== undefined)       updates.stage = args.stage as WorkflowStage;
  if (args.estimate !== undefined)    updates.estimate = args.estimate;
  if (args.assignee !== undefined)    updates.assignee = args.assignee;
  if (args.due_date !== undefined)    updates.due_date = args.due_date;
  const actor = args.actor as string | undefined;

  if (Object.keys(updates).length === 0) {
    throw new Error('No fields to update. Provide at least one of: title, description, type, priority, stage, estimate, assignee, due_date');
  }

  const db = getDb(projectPath);
  ensureProject(db, projectPath);
  const task = updateTask(db, taskId, updates, actor);

  return [
    `Updated ${task.task_id}`,
    `Title:    ${task.title}`,
    `Type:     ${task.type} | Priority: ${task.priority} | Stage: ${task.stage}`,
    task.estimate ? `Estimate: ${task.estimate}` : '',
  ].filter(Boolean).join('\n');
}
