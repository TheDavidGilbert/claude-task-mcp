# claude-task-mcp

A local task management MCP server for Claude Code. Think of it as a local Jira — no sign-up, no platform, just a SQLite file in your repo.

Tasks are scoped to the current project directory and stored in `.claude-tasks/tasks.db` (gitignored). Claude Code connects to the server via stdio and can create, update, and query tasks as you work.

## Why?

Claude Code starts every session cold. On a real project that means you either burn context re-explaining where you are, what's been tried, and what's blocked — or you don't bother, and lose continuity between sessions.

claude-task-mcp gives Claude a structured store it can query at the start of a session: what's in progress, what blocks what, why decisions were made. Instead of reconstructing state from git history and memory, Claude can ask the task server and get back structured facts.

The audit history is particularly useful. Every stage change, field update, and comment is recorded with who made it and when. You can ask Claude "why did we change approach on this task?" and get a real answer from the recorded context rather than a guess.

The web UI makes it tangible — most MCP tools are invisible, but having a dashboard you can actually look at encourages you to keep task state accurate, which is what makes the whole thing work.

The main caveat: it only delivers value if task state is kept up to date. In practice, Claude does most of this automatically as it works — creating tasks, updating stages, adding comments — so the overhead is low.

## Features

- Human-readable task IDs derived from your repo name (`CTM-0001`, `LOT-0042`)
- Workflow stages: `ideation → design → refinement → estimated → planned → in-progress → complete → deployed`
- Task types aligned with conventional commits: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`
- Priority levels: `low`, `medium`, `high`
- Assignee and due date fields
- Comments, task links (blocks / depends-on / relates-to)
- Full audit history — every change is recorded with who made it and when
- Web UI dashboard with board view and calendar view
- Zero config — auto-initialises on first use

## Installation

```bash
git clone https://github.com/TheDavidGilbert/claude-task-mcp
cd claude-task-mcp
npm install
npm run build
```

## Claude Code configuration

Use the `claude mcp add` CLI to register the server. MCP servers are stored in `~/.claude.json` — do **not** add `mcpServers` to `~/.claude/settings.json`, it is not a valid field there.

**Global** (one server, works across all repos — pass `project_path` on each call):
```bash
claude mcp add --scope user tasks node "/absolute/path/to/claude-task-mcp/dist/index.js"
```

**Per-repo** (no need to pass `project_path` on each call — run from inside the repo):
```bash
claude mcp add --scope local tasks node "/absolute/path/to/claude-task-mcp/dist/index.js" \
  -e CLAUDE_TASKS_CWD="/absolute/path/to/your/repo"
```

> **Note:** The default scope for `claude mcp add` is `local` (project-level). Always specify `--scope user` for global registration, otherwise it will only apply to the current project.

After adding, restart Claude Code and run `/mcp` to confirm the `tasks` server is connected.

## CLAUDE.md conventions

The server only delivers full value if Claude follows consistent task hygiene. Add the following to your project's `CLAUDE.md` to establish those conventions:

~~~markdown
## Task management

This project uses claude-task-mcp for task tracking. Follow these conventions on every session and every piece of work.

### Session start

Call `list_tasks` filtered to `stage: in-progress` before doing anything else. Use the results to understand what is currently in flight and whether any prior context is relevant to the current request.

### Working on a task

- When you begin work on a task, update its stage to `in-progress`
- Reference the task ID in commit messages: `feat: add login page [CTM-0012]`
- When work is complete, update the stage to `complete`
- If the work has been deployed or merged to main, update to `deployed`

### When to add a comment

Add a comment to the task whenever:
- Significant progress has been made — summarise what changed and why
- A non-obvious decision was made — record the reasoning so future sessions have context
- The approach changed — explain why the original plan was abandoned
- You hit a blocker — describe what is blocking and link any related tasks

Comments are the primary way context survives across sessions. Prefer a brief comment over none.

### Linking tasks

Use `link_tasks` to record relationships:
- `blocks` / `blocked-by` — one task cannot proceed until another is resolved
- `relates-to` — tasks share context or affect the same area of the codebase
~~~

The session-start query is the most important habit — it is what allows Claude to resume work coherently without you having to re-explain current state.

## Web UI

The server automatically starts a local web dashboard alongside the MCP server:

```
http://localhost:7654
```

The port defaults to `7654` and can be overridden with the `CLAUDE_TASKS_PORT` environment variable.

### Board view

The default view at `/` shows all tasks in a filterable list. You can filter by stage, type, and priority using the controls at the top. Click a task ID to open the detail page, which shows the description, comments, linked tasks, and full audit history.

### Calendar view

The calendar view at `/calendar` plots tasks by due date in a monthly grid. Navigate between months with the Prev/Next controls. Tasks appear as colour-coded chips (by stage) on their due date, each linking to the task detail page.

```
http://localhost:7654/calendar?path=/your/repo&year=2025&month=12
```

## Tools

| Tool | Required | Optional |
|------|----------|----------|
| `create_task` | `title`, `type` | `description`, `priority`, `stage`, `estimate`, `assignee`, `due_date`, `actor`, `project_path` |
| `get_task` | `task_id` | `project_path` |
| `update_task` | `task_id` + ≥1 field | `title`, `description`, `type`, `priority`, `stage`, `estimate`, `assignee`, `due_date`, `actor`, `project_path` |
| `list_tasks` | — | `stage`, `type`, `priority`, `project_path` |
| `add_comment` | `task_id`, `body` | `actor`, `project_path` |
| `link_tasks` | `from_task_id`, `to_task_id`, `link_type` | `actor`, `project_path` |
| `get_project_info` | — | `project_path` |

### Task fields

| Field | Type | Description |
|-------|------|-------------|
| `assignee` | string | Free-text username or display name of the person responsible |
| `due_date` | string | ISO 8601 date, e.g. `2025-12-31` — used to plot tasks in the calendar view |
| `actor` | string | Username to attribute the action to in the audit history |

## Task history

Every mutation is recorded in an audit log attached to the task:

| Event | Recorded when |
|-------|--------------|
| `created` | Task is first created |
| `stage_changed` | The `stage` field is updated — shows old and new stage |
| `field_changed` | Any other field is updated — shows field name, old value, new value |
| `comment_added` | A comment is appended |
| `link_added` | A link is created between two tasks |

Pass the optional `actor` argument to any mutating tool to attribute the change to a specific user. History is visible on the task detail page in the web UI.

## Workflow stages

```
ideation → design → refinement → estimated → planned → in-progress → complete → deployed
```

## Project prefix generation

The prefix is derived from your repo's directory name on first use:

| Directory name | Prefix |
|----------------|--------|
| `claude-task-mcp` | `CTM` |
| `language-server` | `LS` |
| `my-awesome-project` | `MAP` |

## Development

```bash
npm run dev    # run with tsx (no build step)
npm run build  # compile to dist/
npm run clean  # remove dist/
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Open `http://localhost:5173` to drive all tools interactively.

## .gitignore

Add `.claude-tasks/` to **every project** that uses this server. The SQLite database is held open by the MCP server process, which means:

- Git operations on a locked `.db` file will fail or behave unpredictably on Windows
- SQLite also writes `-wal` and `-shm` journal files alongside the database while it's open — committing those mid-session will corrupt the snapshot
- The database is local state (task IDs, history) that has no meaning outside your machine

```
.claude-tasks/
```

This repo's own `.gitignore` already includes this entry as an example. If you forget and accidentally stage the file, run:

```bash
git rm --cached .claude-tasks/tasks.db
echo '.claude-tasks/' >> .gitignore
```

## License

MIT
