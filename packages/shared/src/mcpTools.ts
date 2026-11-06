/** MCP tools shipped to assistants. Keep in sync with `apps/mcp/src/tools.ts`. */
export const MCP_TOOL_NAMES = [
  'search_tasks',
  'get_task',
  'get_project',
  'list_projects',
  'list_project_tasks',
  'list_my_tasks',
  'create_task',
  'create_subtask',
  'complete_subtask',
  'update_task',
  'move_task',
  'move_task_to_project',
  'add_comment',
  'add_task_link',
  'remove_task_link',
  'get_attachment',
  'add_attachment',
  'list_timesheets',
  'get_report',
  'log_time',
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];
