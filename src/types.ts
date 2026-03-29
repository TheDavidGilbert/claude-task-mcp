export const WORKFLOW_STAGES = [
  'ideation',
  'design',
  'refinement',
  'estimated',
  'planned',
  'in-progress',
  'complete',
  'deployed',
] as const;

export type WorkflowStage = typeof WORKFLOW_STAGES[number];

export const TASK_TYPES = [
  'feat', 'fix', 'docs', 'refactor', 'test', 'chore', 'perf', 'ci',
] as const;

export type TaskType = typeof TASK_TYPES[number];

export const PRIORITY_LEVELS = ['low', 'medium', 'high'] as const;
export type Priority = typeof PRIORITY_LEVELS[number];

export const LINK_TYPES = ['blocks', 'depends-on', 'relates-to'] as const;
export type LinkType = typeof LINK_TYPES[number];

export interface Project {
  id: number;
  name: string;
  prefix: string;
  path: string;
  created_at: string;
}

export interface Task {
  id: number;
  project_id: number;
  task_number: number;
  task_id: string;
  title: string;
  description: string | null;
  type: TaskType;
  priority: Priority;
  stage: WorkflowStage;
  estimate: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: number;
  task_id: number;
  body: string;
  created_at: string;
}

export interface TaskLink {
  id: number;
  from_task_id: number;
  to_task_id: number;
  link_type: LinkType;
}

export interface TaskWithDetails extends Task {
  comments: TaskComment[];
  links: Array<{
    link_type: LinkType;
    direction: 'outbound' | 'inbound';
    related_task_id: string;
    related_task_title: string;
  }>;
}

export interface ProjectStats {
  project: Project;
  stage_counts: Record<WorkflowStage, number>;
  total: number;
}
