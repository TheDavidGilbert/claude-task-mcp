# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # run with tsx (no build, hot TypeScript)
npm run build     # compile TypeScript → dist/
npm run start     # run compiled output
npm run clean     # remove dist/
```

Testing with MCP Inspector (requires a prior `npm run build`):
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```
Open `http://localhost:5173` to drive all tools interactively.

There are no automated tests. Validation is done manually via MCP Inspector or by running against a real Claude Code session.

## Architecture

The server is a single-process Node.js MCP server that communicates over **stdio** and concurrently serves a **web UI** over HTTP (default port 7654, configurable via `CLAUDE_TASKS_PORT`).

### Layer structure

```
src/index.ts      — MCP server entry: registers tools, resolves project path, dispatches to handlers
src/web.ts        — Self-contained HTTP server; renders the task dashboard as server-side HTML
src/db.ts         — SQLite connection pool (keyed by resolved project path); applies schema on first open
src/project.ts    — Derives/caches the project prefix from the directory name; handles prefix collisions
src/tasks.ts      — All SQL: createTask, getTask, updateTask, listTasks, addComment, linkTasks, getProjectStats
src/types.ts      — Shared TypeScript types and const arrays (WORKFLOW_STAGES, TASK_TYPES, etc.)
src/tools/        — One file per MCP tool: each exports `schema` (Zod → JSON Schema) and `handler`
```

### Data storage

Each project stores its tasks in `<project-root>/.claude-tasks/tasks.db` (SQLite). The database is auto-created on first use. Four tables: `projects`, `tasks`, `task_comments`, `task_links`.

### Project resolution

Every tool call includes an optional `project_path` argument. Resolution order:
1. `project_path` argument on the tool call
2. `CLAUDE_TASKS_CWD` environment variable
3. `process.cwd()`

The project prefix (e.g. `CTM`, `LOT`) is derived from the repo directory name on first use and stored in the database. Multi-word names produce initials (`claude-task-mcp` → `CTM`); single-word names use up to 3 chars.

### Adding a new tool

1. Create `src/tools/<tool-name>.ts` exporting `schema` (Zod object converted to JSON Schema) and `handler(args, projectPath)`.
2. Import and register it in the `TOOLS` array in `src/index.ts`.

The handler receives raw `args` from the MCP call and a resolved `projectPath` string. It should call `getDb(projectPath)` and `ensureProject(db, projectPath)` to get a project record, then delegate to `src/tasks.ts` functions.

## MCP registration

Register globally so the server works across all repos:
```bash
claude mcp add --scope user tasks node "/absolute/path/to/dist/index.js"
```

Or per-repo with a fixed project path:
```bash
claude mcp add --scope local tasks node "/absolute/path/to/dist/index.js" \
  -e CLAUDE_TASKS_CWD="/absolute/path/to/your/repo"
```

MCP config is stored in `~/.claude.json` — **not** `~/.claude/settings.json`.
