import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import {
  createDirectorMcpService,
  type DirectorMcpService,
  type DirectorMcpServiceOptions,
} from './service';
import { withStructuredErrors } from './results';

const pathSchema = z.string()
  .min(1)
  .max(4_096)
  .describe('Absolute path, or a path relative to --root, for a Director project JSON file.');

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function createDirectorMcpProtocolServer(service: DirectorMcpService) {
  const server = new McpServer(
    {
      name: 'director-mcp',
      version: '0.1.0-alpha.0',
    },
    {
      instructions: [
        'Use describe_schema before proposing Director actions.',
        'Use load_project before get_project_state.',
        'Call validate_actions before apply_actions.',
        'All paths must stay inside the server root.',
      ].join(' '),
    },
  );

  server.registerTool(
    'describe_schema',
    {
      description: 'Describe Director actions, fields, limits, and allowed enum values.',
      annotations: readOnlyAnnotations,
    },
    withStructuredErrors(async () => service.describeSchema()),
  );

  server.registerTool(
    'load_project',
    {
      description: 'Load and validate a Director project JSON file, making it current for get_project_state.',
      inputSchema: { path: pathSchema },
      annotations: readOnlyAnnotations,
    },
    withStructuredErrors(async ({ path }) => service.loadProject(path)),
  );

  server.registerTool(
    'get_project_state',
    {
      description: 'Return a compact, token-budgeted view of the currently loaded Director project.',
      annotations: readOnlyAnnotations,
    },
    withStructuredErrors(async () => service.getProjectState()),
  );

  server.registerTool(
    'validate_actions',
    {
      description: 'Validate a bounded array of proposed Director actions without changing a project.',
      inputSchema: {
        actions: z.array(z.unknown()).describe('Director action objects to validate.'),
      },
      annotations: readOnlyAnnotations,
    },
    withStructuredErrors(async ({ actions }) => service.validateActions(actions)),
  );

  server.registerTool(
    'apply_actions',
    {
      description: 'Validate and transactionally apply Director actions to one project JSON file.',
      inputSchema: {
        path: pathSchema,
        actions: z.array(z.unknown()).describe('Director action objects to validate and apply.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withStructuredErrors(async ({ path, actions }) => service.applyActions(path, actions)),
  );

  server.registerTool(
    'compile_timeline',
    {
      description: 'Compile a project timeline and return clip timing and duration without rendering.',
      inputSchema: { path: pathSchema },
      annotations: readOnlyAnnotations,
    },
    withStructuredErrors(async ({ path }) => service.compileTimeline(path)),
  );

  server.registerTool(
    'build_render_plan',
    {
      description: 'Build the deterministic FFmpeg argument and filtergraph plan without executing it.',
      inputSchema: { path: pathSchema },
      annotations: readOnlyAnnotations,
    },
    withStructuredErrors(async ({ path }) => service.buildRenderPlan(path)),
  );

  return server;
}

export async function createDirectorMcpServer(options: DirectorMcpServiceOptions) {
  const service = await createDirectorMcpService(options);
  return createDirectorMcpProtocolServer(service);
}
