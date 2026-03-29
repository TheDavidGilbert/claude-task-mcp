# claude-task-mcp

A local task management MCP server for Claude Code. Think of it as a local Jira — no sign-up, no platform, just a SQLite file in your repo.

Tasks are scoped to the current project directory and stored in `.claude-tasks/tasks.db` (gitignored). Claude Code connects to the server via stdio and can create, update, and query tasks as you work.

## Features

- Human-readable task IDs derived from your repo name (`CTM-0001`, `LOT-0042`)
- Workflow stages: `ideation → design → refinement → estimated → planned → in-progress → complete → deployed`
- Task types aligned with conventional commits: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`
- Priority levels: `low`, `medium`, `high`
- Comments, task links (blocks / depends-on / relates-to)
- Zero config — auto-initialises on first use

## Installation

```bash
git clone https://github.com/your-org/claude-task-mcp
cd claude-task-mcp
npm install
npm run build
```

## Claude Code configuration

Add to your `~/.claude/settings.json`. Two options:

**Per-repo** (recommended — no need to pass `project_path` on each call):
```json
{
  "mcpServers": {
    "tasks": {
      "command": "node",
      "args": ["/absolute/path/to/claude-task-mcp/dist/index.js"],
      "env": {
        "CLAUDE_TASKS_CWD": "/absolute/path/to/your/repo"
      }
    }
  }
}
```

**Global** (one server, works across all repos — pass `project_path` on each call):
```json
{
  "mcpServers": {
    "tasks": {
      "command": "node",
      "args": ["/absolute/path/to/claude-task-mcp/dist/index.js"]
    }
  }
}
```

## Tools

| Tool | Required | Optional |
|------|----------|----------|
| `create_task` | `title`, `type` | `description`, `priority`, `stage`, `estimate`, `project_path` |
| `get_task` | `task_id` | `project_path` |
| `update_task` | `task_id` + ≥1 field | `title`, `description`, `type`, `priority`, `stage`, `estimate`, `project_path` |
| `list_tasks` | — | `stage`, `type`, `priority`, `project_path` |
| `add_comment` | `task_id`, `body` | `project_path` |
| `link_tasks` | `from_task_id`, `to_task_id`, `link_type` | `project_path` |
| `get_project_info` | — | `project_path` |

## Workflow stages

```
ideation → design → refinement → estimated → planned → in-progress → complete → deployed
```

## Project prefix generation

The prefix is derived from your repo's directory name on first use:

| Directory name | Prefix |
|---------------|--------|
| `claude-task-mcp` | `CTM` |
| `universal-lottery` | `UL` |
| `lotaroo` | `LOT` |

## Development

```bash
npm run dev    # run with tsx (no build step)
npm run build  # compile to dist/
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Open `http://localhost:5173` to drive all tools interactively.

## .gitignore

Add `.claude-tasks/` to your project's `.gitignore` to keep the task database local:

```
.claude-tasks/
```

## License

MIT
