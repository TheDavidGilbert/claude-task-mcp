import { getDb } from '../db.js';
import { ensureProject } from '../project.js';
import { linkTasks } from '../tasks.js';
import { LINK_TYPES, LinkType } from '../types.js';

export const schema = {
  type: 'object',
  properties: {
    from_task_id: { type: 'string', description: 'Source task ID, e.g. CTM-0001' },
    to_task_id:   { type: 'string', description: 'Target task ID, e.g. CTM-0002' },
    link_type:    { type: 'string', enum: LINK_TYPES as unknown as string[], description: 'Relationship type' },
    project_path: { type: 'string', description: 'Absolute path to project root (optional)' },
  },
  required: ['from_task_id', 'to_task_id', 'link_type'],
} as const;

export async function handler(args: Record<string, unknown>, projectPath: string): Promise<string> {
  const fromTaskId = args.from_task_id as string;
  const toTaskId = args.to_task_id as string;
  const linkType = args.link_type as LinkType;

  if (!LINK_TYPES.includes(linkType)) {
    throw new Error(`Invalid link_type "${linkType}". Must be one of: ${LINK_TYPES.join(', ')}`);
  }

  const db = getDb(projectPath);
  ensureProject(db, projectPath);
  linkTasks(db, fromTaskId, toTaskId, linkType);

  return `Linked: ${fromTaskId} ${linkType} ${toTaskId}`;
}
