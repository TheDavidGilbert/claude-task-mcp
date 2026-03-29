#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import * as createTask from './tools/create-task.js';
import * as getTask from './tools/get-task.js';
import * as updateTask from './tools/update-task.js';
import * as listTasks from './tools/list-tasks.js';
import * as addComment from './tools/add-comment.js';
import * as linkTasks from './tools/link-tasks.js';
import * as getProjectInfo from './tools/get-project-info.js';

const TOOLS = [
  {
    name: 'create_task',
    description: 'Create a new task in the current project',
    inputSchema: createTask.schema,
    handler: createTask.handler,
  },
  {
    name: 'get_task',
    description: 'Get full details of a task by ID (e.g. CTM-0001)',
    inputSchema: getTask.schema,
    handler: getTask.handler,
  },
  {
    name: 'update_task',
    description: 'Update a task — change stage, priority, type, title, description, or estimate',
    inputSchema: updateTask.schema,
    handler: updateTask.handler,
  },
  {
    name: 'list_tasks',
    description: 'List tasks, optionally filtered by stage, type, or priority',
    inputSchema: listTasks.schema,
    handler: listTasks.handler,
  },
  {
    name: 'add_comment',
    description: 'Append a comment or note to a task',
    inputSchema: addComment.schema,
    handler: addComment.handler,
  },
  {
    name: 'link_tasks',
    description: 'Create a relationship between two tasks (blocks, depends-on, relates-to)',
    inputSchema: linkTasks.schema,
    handler: linkTasks.handler,
  },
  {
    name: 'get_project_info',
    description: 'Get project name, prefix, and task counts by stage',
    inputSchema: getProjectInfo.schema,
    handler: getProjectInfo.handler,
  },
];

function resolveProjectPath(args: Record<string, unknown>): string {
  if (typeof args.project_path === 'string' && args.project_path) {
    return args.project_path;
  }
  if (process.env.CLAUDE_TASKS_CWD) {
    return process.env.CLAUDE_TASKS_CWD;
  }
  return process.cwd();
}

const server = new Server(
  { name: 'claude-task-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const tool = TOOLS.find(t => t.name === name);

  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    const projectPath = resolveProjectPath(args as Record<string, unknown>);
    const result = await tool.handler(args as Record<string, unknown>, projectPath);
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
  }
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
