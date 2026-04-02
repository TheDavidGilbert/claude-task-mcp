import http from 'node:http';
import { URL } from 'node:url';
import MarkdownIt from 'markdown-it';
import { getDb } from './db.js';
import { ensureProject } from './project.js';
import { listTasks, getTask, getProjectStats } from './tasks.js';
import {
  WORKFLOW_STAGES, TASK_TYPES, PRIORITY_LEVELS,
  Task, WorkflowStage, TaskType, Priority,
} from './types.js';

const md = new MarkdownIt({ breaks: true, linkify: true });

// ---------------------------------------------------------------------------
// Colour maps
// ---------------------------------------------------------------------------

const STAGE_COLORS: Record<string, string> = {
  'ideation':    '#64748b',
  'design':      '#3b82f6',
  'refinement':  '#8b5cf6',
  'estimated':   '#06b6d4',
  'planned':     '#eab308',
  'in-progress': '#f97316',
  'complete':    '#22c55e',
  'deployed':    '#10b981',
};

const TYPE_COLORS: Record<string, string> = {
  'feat':     '#3b82f6',
  'fix':      '#ef4444',
  'docs':     '#0891b2',
  'refactor': '#8b5cf6',
  'test':     '#10b981',
  'chore':    '#6b7280',
  'perf':     '#f97316',
  'ci':       '#6366f1',
};

const PRIORITY_COLORS: Record<string, string> = {
  'high':   '#ef4444',
  'medium': '#f59e0b',
  'low':    '#94a3b8',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badge(text: string, color: string, extraStyle = ''): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${color};color:#fff;font-size:11px;font-weight:600;letter-spacing:.3px;${extraStyle}">${esc(text)}</span>`;
}

function renderMarkdown(text: string): string {
  return md.render(text);
}

function resolveProjectPath(url: URL): string {
  return url.searchParams.get('path')
    || process.env.CLAUDE_TASKS_CWD
    || process.cwd();
}

// Shared CSS for markdown-rendered content
const MARKDOWN_CSS = `
.md-body { font-size:14px; line-height:1.7; color:#334155; }
.md-body h1,.md-body h2,.md-body h3,.md-body h4 { margin:1em 0 .4em; font-weight:600; color:#0f172a; }
.md-body h1 { font-size:1.4em; } .md-body h2 { font-size:1.2em; } .md-body h3 { font-size:1.05em; }
.md-body p { margin:0 0 .8em; }
.md-body ul,.md-body ol { margin:.4em 0 .8em 1.4em; }
.md-body li { margin:.2em 0; }
.md-body code { background:#f1f5f9; border:1px solid #e2e8f0; border-radius:3px; padding:1px 5px; font-size:12px; font-family:ui-monospace,monospace; color:#0f172a; }
.md-body pre { background:#0f172a; color:#e2e8f0; border-radius:6px; padding:14px 16px; overflow-x:auto; margin:.6em 0 1em; }
.md-body pre code { background:none; border:none; padding:0; font-size:13px; color:inherit; }
.md-body blockquote { border-left:3px solid #e2e8f0; margin:.6em 0; padding:.2em 1em; color:#64748b; }
.md-body a { color:#3b82f6; text-decoration:underline; }
.md-body table { border-collapse:collapse; width:100%; margin:.6em 0 1em; font-size:13px; }
.md-body th { background:#f8fafc; font-weight:600; }
.md-body th,.md-body td { border:1px solid #e2e8f0; padding:6px 10px; text-align:left; }
.md-body hr { border:none; border-top:1px solid #e2e8f0; margin:1em 0; }
`;

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

interface PageData {
  projectName: string;
  projectPrefix: string;
  projectPath: string;
  stageCounts: Record<string, number>;
  total: number;
  tasks: Task[];
}

function loadData(projectPath: string): PageData {
  const db = getDb(projectPath);
  const project = ensureProject(db, projectPath);
  const stats = getProjectStats(db, project);
  const tasks = listTasks(db, project.id, {});
  return {
    projectName: project.name,
    projectPrefix: project.prefix,
    projectPath: project.path,
    stageCounts: stats.stage_counts as Record<string, number>,
    total: stats.total,
    tasks,
  };
}

// ---------------------------------------------------------------------------
// List page
// ---------------------------------------------------------------------------

function renderPage(data: PageData, filterStage: string, filterType: string, filterPriority: string): string {
  let tasks = data.tasks;
  if (filterStage)    tasks = tasks.filter(t => t.stage    === filterStage);
  if (filterType)     tasks = tasks.filter(t => t.type     === filterType);
  if (filterPriority) tasks = tasks.filter(t => t.priority === filterPriority);

  const pathParam = `path=${encodeURIComponent(data.projectPath)}`;

  function filterLink(extra: string): string {
    const parts = [pathParam];
    if (filterStage    && extra !== 'stage')    parts.push(`stage=${filterStage}`);
    if (filterType     && extra !== 'type')     parts.push(`type=${filterType}`);
    if (filterPriority && extra !== 'priority') parts.push(`priority=${filterPriority}`);
    return `/?${parts.join('&')}`;
  }

  // Stage pipeline strip in header
  const stageBar = (WORKFLOW_STAGES as readonly string[]).map(s => {
    const count = data.stageCounts[s] ?? 0;
    const color = STAGE_COLORS[s] ?? '#64748b';
    const isActive = filterStage === s;
    const href = isActive ? filterLink('stage') : `/?${pathParam}&stage=${s}${filterType ? '&type='+filterType : ''}${filterPriority ? '&priority='+filterPriority : ''}`;
    const activeStyle = isActive ? 'outline:2px solid rgba(255,255,255,.7);outline-offset:1px;' : '';
    return `<a href="${href}" style="display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:20px;background:${color};color:#fff;text-decoration:none;font-size:12px;${activeStyle}">
      <span>${s}</span>
      <span style="background:rgba(0,0,0,.22);border-radius:10px;padding:0 6px;font-weight:700">${count}</span>
    </a>`;
  }).join('');

  // Type + priority filter chips
  const typeChips = (TASK_TYPES as readonly string[]).map(t => {
    const color = TYPE_COLORS[t] ?? '#6b7280';
    const isActive = filterType === t;
    const href = isActive ? filterLink('type') : `/?${pathParam}${filterStage ? '&stage='+filterStage : ''}&type=${t}${filterPriority ? '&priority='+filterPriority : ''}`;
    return `<a href="${href}" style="padding:3px 10px;border-radius:4px;background:${isActive ? color : '#f1f5f9'};color:${isActive ? '#fff' : '#475569'};font-size:12px;text-decoration:none;font-weight:${isActive ? 600 : 400};border:1px solid ${isActive ? color : '#e2e8f0'}">${t}</a>`;
  }).join('');

  const priorChips = (PRIORITY_LEVELS as readonly string[]).map(p => {
    const color = PRIORITY_COLORS[p] ?? '#6b7280';
    const isActive = filterPriority === p;
    const href = isActive ? filterLink('priority') : `/?${pathParam}${filterStage ? '&stage='+filterStage : ''}${filterType ? '&type='+filterType : ''}&priority=${p}`;
    return `<a href="${href}" style="padding:3px 10px;border-radius:4px;background:${isActive ? color : '#f1f5f9'};color:${isActive ? '#fff' : '#475569'};font-size:12px;text-decoration:none;font-weight:${isActive ? 600 : 400};border:1px solid ${isActive ? color : '#e2e8f0'}">${p}</a>`;
  }).join('');

  const hasFilters = !!(filterStage || filterType || filterPriority);
  const clearLink = hasFilters
    ? `<a href="/?${pathParam}" style="padding:3px 10px;border-radius:4px;font-size:12px;color:#94a3b8;text-decoration:none;border:1px solid #e2e8f0;background:#fff">✕ clear</a>`
    : '';

  // Task rows
  const colGrid = 'grid-template-columns:110px 62px 70px 110px 1fr 120px 52px 52px';
  const taskHeader = `<div style="display:grid;${colGrid};align-items:center;gap:0;padding:6px 20px;background:#f8fafc;border-bottom:2px solid #e2e8f0;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:.4px;text-transform:uppercase">
    <span>Ticket</span><span>Type</span><span>Priority</span><span>Stage</span><span>Title</span><span>Assignee</span><span>Est.</span><span></span>
  </div>`;

  const taskRows = tasks.map(t => {
    const stageColor    = STAGE_COLORS[t.stage]    ?? '#64748b';
    const typeColor     = TYPE_COLORS[t.type]      ?? '#6b7280';
    const priorityColor = PRIORITY_COLORS[t.priority] ?? '#6b7280';
    const hasDesc = !!t.description;
    const detailHref = `/task/${encodeURIComponent(t.task_id)}?${pathParam}`;

    const descBlock = hasDesc
      ? `<div id="d${t.id}" style="display:none;padding:16px 20px 20px 20px;background:#f8fafc;border-top:1px solid #e2e8f0"><div class="md-body">${renderMarkdown(t.description!)}</div></div>`
      : '';

    return `<div class="row" style="border-bottom:1px solid #f1f5f9">
      <div style="display:grid;${colGrid};align-items:center;gap:0;padding:10px 20px;min-height:44px">
        <a href="${detailHref}" style="font-size:13px;font-weight:700;color:#1e293b;text-decoration:none;font-family:ui-monospace,monospace;letter-spacing:.2px" onclick="event.stopPropagation()">${esc(t.task_id)}</a>
        <span>${badge(t.type, typeColor)}</span>
        <span>${badge(t.priority, priorityColor)}</span>
        <span>${badge(t.stage, stageColor)}</span>
        <span style="font-size:14px;color:#1e293b;font-weight:500;padding-right:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</span>
        <span style="font-size:12px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.assignee ? `<span style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:2px 7px">@${esc(t.assignee)}</span>` : ''}</span>
        <span style="font-size:12px;color:#94a3b8">${t.estimate ? esc(t.estimate) : ''}</span>
        <span>${hasDesc ? `<button onclick="x(${t.id})" style="font-size:11px;color:#94a3b8;background:none;border:none;cursor:pointer;padding:2px 4px" id="a${t.id}">▼ desc</button>` : ''}</span>
      </div>
      ${descBlock}
    </div>`;
  }).join('');

  const emptyState = `<div style="padding:60px 24px;text-align:center;color:#94a3b8;font-size:15px">No tasks match the current filters.</div>`;

  const now = new Date();
  const calHref = `/calendar?${pathParam}&year=${now.getFullYear()}&month=${now.getMonth() + 1}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(data.projectName)} — Tasks</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#1e293b;min-height:100vh}
a{text-decoration:none}
.header{background:#0f172a;color:#fff;padding:16px 24px 14px;position:sticky;top:0;z-index:20;box-shadow:0 2px 12px rgba(0,0,0,.4)}
.header-top{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:11px}
.header h1{font-size:17px;font-weight:600;display:flex;align-items:baseline;gap:10px}
.header h1 small{font-size:12px;color:#64748b;font-weight:400}
.header-nav a{font-size:13px;color:#94a3b8;padding:4px 10px;border-radius:4px;border:1px solid rgba(255,255,255,.1)}
.header-nav a:hover{background:rgba(255,255,255,.05);color:#fff}
.stage-bar{display:flex;flex-wrap:wrap;gap:6px}
.filters{background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 20px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sep{color:#e2e8f0;user-select:none}
.meta{margin-left:auto;font-size:11px;color:#cbd5e1}
.summary{padding:8px 20px;font-size:12px;color:#94a3b8;background:#fff;border-bottom:1px solid #f1f5f9}
.tasks{background:#fff;border-radius:0 0 8px 8px}
.row:hover{background:#fafbfc}
.row:last-child{border-bottom:none}
${MARKDOWN_CSS}
</style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <h1>${esc(data.projectName)} <small>${esc(data.projectPrefix)} &middot; ${data.total} task${data.total !== 1 ? 's' : ''}</small></h1>
    <div class="header-nav"><a href="${calHref}">Calendar</a></div>
  </div>
  <div class="stage-bar">${stageBar}</div>
</div>

<div class="filters">
  <span style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Type</span>
  ${typeChips}
  <span class="sep">|</span>
  <span style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Priority</span>
  ${priorChips}
  ${clearLink}
  <span class="meta" id="ts">Updated ${new Date().toLocaleTimeString()}</span>
</div>

<div class="summary">${tasks.length} task${tasks.length !== 1 ? 's' : ''}${hasFilters ? ' (filtered)' : ''}</div>

<div class="tasks">
  ${tasks.length > 0 ? taskHeader + taskRows : emptyState}
</div>

<script>
function x(id){
  var d=document.getElementById('d'+id);
  var a=document.getElementById('a'+id);
  if(!d)return;
  var open=d.style.display!=='none'&&d.style.display!=='';
  d.style.display=open?'none':'block';
  if(a)a.textContent=open?'▼ desc':'▲ desc';
}
var secs=30;
var ts=document.getElementById('ts');
var iv=setInterval(function(){
  secs--;
  if(ts)ts.textContent='Refreshing in '+secs+'s\u2026';
  if(secs<=0){clearInterval(iv);location.reload();}
},1000);
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Calendar page
// ---------------------------------------------------------------------------

function renderCalendar(projectPath: string, year: number, month: number): string {
  const db = getDb(projectPath);
  const project = ensureProject(db, projectPath);
  const tasks = listTasks(db, project.id, {}).filter(t => !!t.due_date);

  const pathParam = `path=${encodeURIComponent(projectPath)}`;
  const prevMonth = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthLabel = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  // Build map: "YYYY-MM-DD" → Task[]
  const byDate = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.due_date!.slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(t);
  }

  // Calendar grid cells
  const cells: string[] = [];
  const totalCells = firstDay + daysInMonth;
  const rows = Math.ceil(totalCells / 7);

  for (let i = 0; i < rows * 7; i++) {
    const dayNum = i - firstDay + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(`<td style="background:#f8fafc;border:1px solid #e2e8f0;padding:6px;vertical-align:top;min-height:80px"></td>`);
      continue;
    }
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const dayTasks = byDate.get(dateKey) ?? [];
    const today = new Date();
    const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === dayNum;
    const dayStyle = isToday ? 'background:#eff6ff;border:1px solid #bfdbfe;' : 'background:#fff;border:1px solid #e2e8f0;';
    const chips = dayTasks.map(t => {
      const color = STAGE_COLORS[t.stage] ?? '#64748b';
      const href = `/task/${encodeURIComponent(t.task_id)}?${pathParam}`;
      return `<a href="${href}" title="${esc(t.title)}" style="display:block;margin-top:3px;padding:2px 5px;border-radius:3px;background:${color};color:#fff;font-size:11px;text-decoration:none;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(t.task_id)} ${esc(t.title)}</a>`;
    }).join('');
    cells.push(`<td style="${dayStyle}padding:6px;vertical-align:top;min-height:80px">
      <div style="font-size:12px;font-weight:${isToday ? 700 : 400};color:${isToday ? '#2563eb' : '#475569'};margin-bottom:2px">${dayNum}</div>
      ${chips}
    </td>`);
  }

  // Split into rows of 7
  const tableRows = [];
  for (let r = 0; r < rows; r++) {
    tableRows.push(`<tr>${cells.slice(r * 7, r * 7 + 7).join('')}</tr>`);
  }

  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const headerRow = DOW.map(d => `<th style="padding:8px 6px;font-size:12px;font-weight:600;color:#94a3b8;text-align:center;border:1px solid #e2e8f0;background:#f8fafc">${d}</th>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(project.name)} — Calendar</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#1e293b;min-height:100vh}
a{text-decoration:none}
.header{background:#0f172a;color:#fff;padding:16px 24px 14px;box-shadow:0 2px 12px rgba(0,0,0,.4)}
.header h1{font-size:17px;font-weight:600;margin-bottom:11px;display:flex;align-items:baseline;gap:10px}
.header h1 small{font-size:12px;color:#64748b;font-weight:400}
.nav{display:flex;align-items:center;gap:12px}
.nav a{font-size:13px;color:#94a3b8;padding:4px 10px;border-radius:4px;border:1px solid rgba(255,255,255,.1)}
.nav a:hover{background:rgba(255,255,255,.05)}
.nav a.active{color:#fff;border-color:rgba(255,255,255,.3)}
.cal-nav{display:flex;align-items:center;gap:16px;padding:16px 24px;background:#fff;border-bottom:1px solid #e2e8f0}
.cal-nav h2{font-size:16px;font-weight:600;color:#0f172a;min-width:200px;text-align:center}
.cal-nav a{font-size:13px;color:#3b82f6;padding:4px 12px;border-radius:4px;border:1px solid #e2e8f0;background:#fff}
.cal-nav a:hover{background:#f1f5f9}
.cal-wrap{padding:20px 24px 60px}
table{width:100%;border-collapse:collapse}
</style>
</head>
<body>

<div class="header">
  <h1>${esc(project.name)} <small>${esc(project.prefix)}</small></h1>
  <div class="nav">
    <a href="/?${pathParam}">Board</a>
    <a href="/calendar?${pathParam}&year=${year}&month=${month}" class="active">Calendar</a>
  </div>
</div>

<div class="cal-nav">
  <a href="/calendar?${pathParam}&year=${prevMonth.y}&month=${prevMonth.m}">← Prev</a>
  <h2>${monthLabel}</h2>
  <a href="/calendar?${pathParam}&year=${nextMonth.y}&month=${nextMonth.m}">Next →</a>
</div>

<div class="cal-wrap">
  <table>
    <thead><tr>${headerRow}</tr></thead>
    <tbody>${tableRows.join('')}</tbody>
  </table>
</div>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Task detail page
// ---------------------------------------------------------------------------

function renderTaskDetail(taskId: string, projectPath: string): string {
  const db = getDb(projectPath);
  ensureProject(db, projectPath);
  const task = getTask(db, taskId);

  if (!task) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Not found</title></head>
<body style="font-family:system-ui;padding:40px;color:#64748b">
  <p>Task <code>${esc(taskId)}</code> not found.</p>
  <a href="/?path=${encodeURIComponent(projectPath)}" style="color:#3b82f6">← Back to tasks</a>
</body></html>`;
  }

  const stageColor    = STAGE_COLORS[task.stage]    ?? '#64748b';
  const typeColor     = TYPE_COLORS[task.type]      ?? '#6b7280';
  const priorityColor = PRIORITY_COLORS[task.priority] ?? '#6b7280';
  const listHref      = `/?path=${encodeURIComponent(projectPath)}`;

  const descSection = task.description
    ? `<section class="card">
        <h2 class="section-title">Description</h2>
        <div class="md-body">${renderMarkdown(task.description)}</div>
      </section>`
    : '';

  const commentsSection = task.comments.length > 0
    ? `<section class="card">
        <h2 class="section-title">Comments <span class="count">${task.comments.length}</span></h2>
        ${task.comments.map((c, i) => `
          <div class="comment${i < task.comments.length - 1 ? ' comment-sep' : ''}">
            <div class="comment-meta">${new Date(c.created_at).toLocaleString()}</div>
            <div class="md-body">${renderMarkdown(c.body)}</div>
          </div>`).join('')}
      </section>`
    : '';

  const EVENT_ICONS: Record<string, string> = {
    created:       '✦',
    stage_changed: '⇒',
    field_changed: '✎',
    comment_added: '💬',
    link_added:    '🔗',
  };

  const historySection = task.history.length > 0
    ? `<section class="card">
        <h2 class="section-title">History <span class="count">${task.history.length}</span></h2>
        <div class="timeline">
          ${task.history.map(h => {
            const icon  = EVENT_ICONS[h.event_type] ?? '•';
            const actor = h.actor ? `<span class="h-actor">@${esc(h.actor)}</span>` : '';
            const time  = `<span class="h-time">${new Date(h.created_at).toLocaleString()}</span>`;
            let detail  = '';
            if (h.event_type === 'stage_changed') {
              const oldColor = STAGE_COLORS[h.old_value ?? ''] ?? '#64748b';
              const newColor = STAGE_COLORS[h.new_value ?? ''] ?? '#64748b';
              detail = `${badge(h.old_value ?? '', oldColor)} → ${badge(h.new_value ?? '', newColor)}`;
            } else if (h.event_type === 'field_changed') {
              detail = `<span class="h-field">${esc(h.field ?? '')}</span> <span class="h-old">${esc(h.old_value ?? '—')}</span> → <span class="h-new">${esc(h.new_value ?? '—')}</span>`;
            } else if (h.event_type === 'link_added') {
              detail = `<span class="h-field">${esc(h.field ?? '')}</span> <span class="h-new">${esc(h.new_value ?? '')}</span>`;
            }
            return `<div class="h-row">
              <span class="h-icon">${icon}</span>
              <div class="h-body">
                <span class="h-label">${h.event_type.replace('_', ' ')}</span>
                ${detail ? `<span class="h-detail">${detail}</span>` : ''}
                <span class="h-meta">${actor}${actor ? ' · ' : ''}${time}</span>
              </div>
            </div>`;
          }).join('')}
        </div>
      </section>`
    : '';

  const linksSection = task.links.length > 0
    ? `<section class="card">
        <h2 class="section-title">Links</h2>
        ${task.links.map(l => {
          const dirLabel = l.direction === 'outbound' ? l.link_type : `← ${l.link_type}`;
          const relHref  = `/task/${encodeURIComponent(l.related_task_id)}?path=${encodeURIComponent(projectPath)}`;
          return `<div class="link-row">
            <span class="link-type">${esc(dirLabel)}</span>
            <a href="${relHref}" style="color:#3b82f6;font-family:ui-monospace,monospace;font-size:13px">${esc(l.related_task_id)}</a>
            <span style="color:#64748b;font-size:13px">${esc(l.related_task_title)}</span>
          </div>`;
        }).join('')}
      </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(task.task_id)} — ${esc(task.title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#1e293b;min-height:100vh}
a{text-decoration:none}
.header{background:#0f172a;color:#fff;padding:16px 24px;box-shadow:0 2px 12px rgba(0,0,0,.4)}
.back{font-size:13px;color:#64748b;text-decoration:none;display:inline-flex;align-items:center;gap:4px;margin-bottom:10px}
.back:hover{color:#94a3b8}
.task-id{font-family:ui-monospace,monospace;font-size:13px;color:#64748b;margin-bottom:6px}
.task-title{font-size:20px;font-weight:700;color:#f8fafc;line-height:1.3;margin-bottom:12px}
.badges{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.estimate{font-size:12px;color:#64748b;margin-left:4px}
.meta-row{font-size:12px;color:#475569;margin-top:8px;display:flex;gap:16px;flex-wrap:wrap}
.content{max-width:860px;margin:28px auto;padding:0 20px 60px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin-bottom:16px}
.section-title{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.count{background:#f1f5f9;color:#64748b;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:500;text-transform:none;letter-spacing:0}
.comment{padding:12px 0}
.comment-sep{border-bottom:1px solid #f1f5f9;padding-bottom:14px;margin-bottom:2px}
.comment-meta{font-size:11px;color:#94a3b8;margin-bottom:8px}
.link-row{display:flex;align-items:baseline;gap:10px;padding:6px 0;border-bottom:1px solid #f8fafc;flex-wrap:wrap}
.link-row:last-child{border-bottom:none}
.link-type{font-size:11px;font-weight:600;color:#94a3b8;min-width:90px;text-transform:uppercase;letter-spacing:.3px}
span[style*="display:inline-block"]{display:inline-block;padding:2px 8px;border-radius:4px;color:#fff;font-size:11px;font-weight:600;letter-spacing:.3px}
.timeline{display:flex;flex-direction:column;gap:0}
.h-row{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid #f1f5f9;align-items:flex-start}
.h-row:last-child{border-bottom:none}
.h-icon{font-size:14px;width:22px;text-align:center;flex-shrink:0;margin-top:1px;color:#94a3b8}
.h-body{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;font-size:13px}
.h-label{font-weight:600;color:#475569;text-transform:capitalize}
.h-detail{color:#1e293b}
.h-field{font-family:ui-monospace,monospace;font-size:12px;color:#6366f1;background:#eef2ff;border-radius:3px;padding:1px 5px}
.h-old{color:#94a3b8;text-decoration:line-through}
.h-new{color:#22c55e;font-weight:500}
.h-meta{font-size:11px;color:#94a3b8;margin-left:auto}
.h-actor{color:#3b82f6;font-weight:500}
.h-time{color:#94a3b8}
${MARKDOWN_CSS}
</style>
</head>
<body>

<div class="header">
  <a class="back" href="${listHref}">← All tasks</a>
  <div class="task-id">${esc(task.task_id)}</div>
  <div class="task-title">${esc(task.title)}</div>
  <div class="badges">
    ${badge(task.type, typeColor)}
    ${badge(task.priority, priorityColor)}
    ${badge(task.stage, stageColor)}
    ${task.estimate ? `<span class="estimate">${esc(task.estimate)}</span>` : ''}
    ${task.assignee ? `<span style="font-size:12px;color:#94a3b8;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:2px 8px;margin-left:4px">@${esc(task.assignee)}</span>` : ''}
  </div>
  <div class="meta-row">
    <span>Created ${new Date(task.created_at).toLocaleString()}</span>
    <span>Updated ${new Date(task.updated_at).toLocaleString()}</span>
  </div>
</div>

<div class="content">
  ${descSection}
  ${commentsSection}
  ${linksSection}
  ${historySection}
  ${!task.description && task.comments.length === 0 && task.links.length === 0 && task.history.length === 0
    ? `<div style="padding:48px 0;text-align:center;color:#94a3b8;font-size:14px">No description, comments, or links yet.</div>`
    : ''}
</div>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

export function startWebUI(port = 7654): void {
  const srv = http.createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://localhost`);

      // JSON API — reserved for future use
      if (url.pathname === '/api/tasks') {
        const projectPath = resolveProjectPath(url);
        const data = loadData(projectPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      }

      // Calendar page
      if (url.pathname === '/calendar') {
        const projectPath = resolveProjectPath(url);
        const now = new Date();
        const year  = parseInt(url.searchParams.get('year')  ?? String(now.getFullYear()), 10);
        const month = parseInt(url.searchParams.get('month') ?? String(now.getMonth() + 1), 10);
        try {
          const html = renderCalendar(projectPath, year, month);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`Error loading calendar: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }

      // Task detail page: /task/:id
      const taskMatch = url.pathname.match(/^\/task\/([^/]+)$/);
      if (taskMatch) {
        const taskId = decodeURIComponent(taskMatch[1]);
        const projectPath = resolveProjectPath(url);
        try {
          const html = renderTaskDetail(taskId, projectPath);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`Error loading task: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }

      if (url.pathname === '/') {
        const projectPath = resolveProjectPath(url);
        const filterStage    = url.searchParams.get('stage')    ?? '';
        const filterType     = url.searchParams.get('type')     ?? '';
        const filterPriority = url.searchParams.get('priority') ?? '';

        let data: PageData;
        try {
          data = loadData(projectPath);
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end(`Could not load project at: ${projectPath}\n${err instanceof Error ? err.message : String(err)}`);
          return;
        }

        const html = renderPage(data, filterStage, filterType, filterPriority);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Internal error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  srv.listen(port, '127.0.0.1', () => {
    console.error(`claude-task-mcp web UI → http://localhost:${port}`);
  });

  srv.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Web UI port ${port} in use — UI disabled. Set CLAUDE_TASKS_PORT to override.`);
    } else {
      console.error('Web UI error:', err.message);
    }
  });
}
