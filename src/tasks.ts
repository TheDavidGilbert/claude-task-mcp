import Database from 'better-sqlite3';
import {
  Task, TaskComment, TaskLink, TaskWithDetails, TaskHistoryEntry, ProjectStats, Project,
  WorkflowStage, TaskType, Priority, LinkType, WORKFLOW_STAGES,
} from './types.js';

function insertHistory(
  db: Database.Database,
  taskRowId: number,
  event_type: TaskHistoryEntry['event_type'],
  opts: { actor?: string; field?: string; old_value?: string; new_value?: string } = {}
): void {
  db.prepare(`
    INSERT INTO task_history (task_id, actor, event_type, field, old_value, new_value)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(taskRowId, opts.actor ?? null, event_type, opts.field ?? null, opts.old_value ?? null, opts.new_value ?? null);
}

export function createTask(
  db: Database.Database,
  projectId: number,
  prefix: string,
  params: {
    title: string;
    description?: string;
    type: TaskType;
    priority?: Priority;
    stage?: WorkflowStage;
    estimate?: string;
    assignee?: string;
    due_date?: string;
    actor?: string;
  }
): Task {
  const createFn = db.transaction(() => {
    const row = db.prepare(
      'SELECT MAX(task_number) as max_num FROM tasks WHERE project_id = ?'
    ).get(projectId) as { max_num: number | null };

    const taskNumber = (row.max_num ?? 0) + 1;
    const taskId = `${prefix}-${String(taskNumber).padStart(4, '0')}`;

    const task = db.prepare(`
      INSERT INTO tasks (project_id, task_number, task_id, title, description, type, priority, stage, estimate, assignee, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).get(
      projectId,
      taskNumber,
      taskId,
      params.title,
      params.description ?? null,
      params.type,
      params.priority ?? 'medium',
      params.stage ?? 'ideation',
      params.estimate ?? null,
      params.assignee ?? null,
      params.due_date ?? null,
    ) as Task;

    insertHistory(db, task.id, 'created', { actor: params.actor });
    return task;
  });

  return createFn();
}

export function getTask(db: Database.Database, taskId: string): TaskWithDetails | null {
  const task = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Task | undefined;
  if (!task) return null;

  const comments = db.prepare(
    'SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC'
  ).all(task.id) as TaskComment[];

  const outbound = db.prepare(`
    SELECT tl.link_type, t.task_id as related_task_id, t.title as related_task_title
    FROM task_links tl
    JOIN tasks t ON t.id = tl.to_task_id
    WHERE tl.from_task_id = ?
  `).all(task.id) as Array<{ link_type: LinkType; related_task_id: string; related_task_title: string }>;

  const inbound = db.prepare(`
    SELECT tl.link_type, t.task_id as related_task_id, t.title as related_task_title
    FROM task_links tl
    JOIN tasks t ON t.id = tl.from_task_id
    WHERE tl.to_task_id = ?
  `).all(task.id) as Array<{ link_type: LinkType; related_task_id: string; related_task_title: string }>;

  const history = db.prepare(
    'SELECT * FROM task_history WHERE task_id = ? ORDER BY created_at ASC'
  ).all(task.id) as TaskHistoryEntry[];

  return {
    ...task,
    comments,
    links: [
      ...outbound.map(l => ({ ...l, direction: 'outbound' as const })),
      ...inbound.map(l => ({ ...l, direction: 'inbound' as const })),
    ],
    history,
  };
}

export function updateTask(
  db: Database.Database,
  taskId: string,
  updates: Partial<Pick<Task, 'title' | 'description' | 'type' | 'priority' | 'stage' | 'estimate' | 'assignee' | 'due_date'>>,
  actor?: string
): Task {
  const task = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Task | undefined;
  if (!task) throw new Error(`Task ${taskId} not found`);

  const allowed: Array<keyof typeof updates> = ['title', 'description', 'type', 'priority', 'stage', 'estimate', 'assignee', 'due_date'];
  const fields = allowed.filter(k => k in updates);
  if (fields.length === 0) throw new Error('No valid fields to update');

  const setClauses = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f] ?? null);

  const updateFn = db.transaction(() => {
    const updated = db.prepare(`
      UPDATE tasks SET ${setClauses}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE task_id = ?
      RETURNING *
    `).get(...values, taskId) as Task;

    for (const field of fields) {
      const oldVal = String(task[field] ?? '');
      const newVal = String(updates[field] ?? '');
      if (field === 'stage') {
        insertHistory(db, task.id, 'stage_changed', { actor, field, old_value: oldVal, new_value: newVal });
      } else {
        insertHistory(db, task.id, 'field_changed', { actor, field, old_value: oldVal, new_value: newVal });
      }
    }

    return updated;
  });

  return updateFn();
}

export function listTasks(
  db: Database.Database,
  projectId: number,
  filters: { stage?: WorkflowStage; type?: TaskType; priority?: Priority }
): Task[] {
  const conditions = ['project_id = ?'];
  const values: unknown[] = [projectId];

  if (filters.stage) { conditions.push('stage = ?'); values.push(filters.stage); }
  if (filters.type) { conditions.push('type = ?'); values.push(filters.type); }
  if (filters.priority) { conditions.push('priority = ?'); values.push(filters.priority); }

  return db.prepare(
    `SELECT * FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY task_number ASC`
  ).all(...values) as Task[];
}

export function addComment(
  db: Database.Database,
  taskId: string,
  body: string,
  actor?: string
): TaskComment {
  const task = db.prepare('SELECT id FROM tasks WHERE task_id = ?').get(taskId) as { id: number } | undefined;
  if (!task) throw new Error(`Task ${taskId} not found`);

  const addFn = db.transaction(() => {
    const comment = db.prepare(
      'INSERT INTO task_comments (task_id, body) VALUES (?, ?) RETURNING *'
    ).get(task.id, body) as TaskComment;
    insertHistory(db, task.id, 'comment_added', { actor });
    return comment;
  });

  return addFn();
}

export function linkTasks(
  db: Database.Database,
  fromTaskId: string,
  toTaskId: string,
  linkType: LinkType,
  actor?: string
): TaskLink {
  const from = db.prepare('SELECT id FROM tasks WHERE task_id = ?').get(fromTaskId) as { id: number } | undefined;
  if (!from) throw new Error(`Task ${fromTaskId} not found`);

  const to = db.prepare('SELECT id FROM tasks WHERE task_id = ?').get(toTaskId) as { id: number } | undefined;
  if (!to) throw new Error(`Task ${toTaskId} not found`);

  const linkFn = db.transaction(() => {
    const link = db.prepare(
      'INSERT INTO task_links (from_task_id, to_task_id, link_type) VALUES (?, ?, ?) RETURNING *'
    ).get(from.id, to.id, linkType) as TaskLink;
    insertHistory(db, from.id, 'link_added', { actor, field: linkType, new_value: toTaskId });
    insertHistory(db, to.id,   'link_added', { actor, field: linkType, new_value: fromTaskId });
    return link;
  });

  return linkFn();
}

export function getProjectStats(db: Database.Database, project: Project): ProjectStats {
  const rows = db.prepare(
    'SELECT stage, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY stage'
  ).all(project.id) as Array<{ stage: WorkflowStage; count: number }>;

  const stage_counts = Object.fromEntries(
    WORKFLOW_STAGES.map(s => [s, 0])
  ) as Record<WorkflowStage, number>;

  let total = 0;
  for (const row of rows) {
    stage_counts[row.stage] = row.count;
    total += row.count;
  }

  return { project, stage_counts, total };
}
