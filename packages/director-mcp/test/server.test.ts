import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DirectorProjectFile } from '../../../src/shared/directorProject';
import {
  MAX_DIRECTOR_ACTIONS,
  type DirectorReelAction,
} from '../../../src/shared/directorSchemas';
import {
  createDirectorMcpProtocolServer,
} from '../src/server';
import { createDirectorMcpService } from '../src/service';

const temporaryDirectories: string[] = [];

const EXPECTED_TOOLS = [
  'describe_schema',
  'load_project',
  'get_project_state',
  'validate_actions',
  'apply_actions',
  'compile_timeline',
  'build_render_plan',
] as const;

const EMPTY_REEL_ACTION: Omit<DirectorReelAction, 'type'> = {
  objectIds: [],
  clipIds: [],
  aspectRatio: null,
  fps: null,
  quality: null,
  effect: null,
  visualEffect: null,
  transition: null,
  motion: null,
  duration: null,
  intensity: null,
  layerId: null,
  content: null,
  textX: null,
  textY: null,
  fontId: null,
  sizePreset: null,
  textColor: null,
  align: null,
  inSec: null,
  outSec: null,
};

function reelAction(
  type: DirectorReelAction['type'],
  values: Partial<DirectorReelAction> = {},
): DirectorReelAction {
  return { ...EMPTY_REEL_ACTION, type, ...values } as DirectorReelAction;
}

function fixtureProject(): DirectorProjectFile {
  return {
    version: 2,
    sessionId: 'test-session-0001',
    updatedAt: '2026-01-02T03:04:05.000Z',
    title: 'Fixture reel',
    objects: [],
    selectedIds: [],
    mode: 'animate',
    goal: 'Make a concise launch reel.',
    exclusions: [],
    contract: null,
    sequence: null,
    continuity: null,
    reelProject: {
      id: 'reel-1',
      title: 'Fixture reel',
      aspectRatio: '9:16',
      fps: 24,
      quality: 'balanced',
      clips: [{
        id: 'clip-1',
        objectId: null,
        title: 'Opening frame',
        imageUrl: 'local-media:clip:clip-1',
        duration: 3,
        effect: 'clean',
        visualEffect: 'none',
        transition: 'cut',
        transitionDuration: 0,
        motion: 'still',
        intensity: 50,
        textLayers: [],
      }],
      selectedClipIds: ['clip-1'],
      audio: null,
      renderRequested: false,
    },
    reelOpen: true,
    visibleSearch: null,
    messages: [],
    model: 'gpt-5.4',
    localMediaOmitted: 1,
  };
}

async function makeFixtureRoot() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'director-mcp-test-'));
  temporaryDirectories.push(workspace);
  const root = path.join(workspace, 'projects');
  await mkdir(root);
  const projectPath = path.join(root, 'fixture.director.json');
  await writeFile(projectPath, `${JSON.stringify(fixtureProject(), null, 2)}\n`, 'utf8');
  return { workspace, root, projectPath };
}

async function makeHarness(root: string) {
  let nextId = 0;
  const service = await createDirectorMcpService({
    root,
    createId: (prefix) => `${prefix}-test-${++nextId}`,
    now: () => '2026-02-03T04:05:06.000Z',
  });
  const server = createDirectorMcpProtocolServer(service);
  const client = new Client({
    name: 'director-mcp-test',
    version: '0.0.0',
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

function structured(result: unknown) {
  const toolResult = result as { structuredContent?: unknown };
  expect(toolResult.structuredContent).toBeDefined();
  return toolResult.structuredContent as Record<string, unknown>;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('Director MCP protocol server', () => {
  it('lists exactly the seven v1 tools in stable order', async () => {
    const { root } = await makeFixtureRoot();
    const { client } = await makeHarness(root);

    const listed = await client.listTools();

    expect(listed.tools.map((tool) => tool.name)).toEqual(EXPECTED_TOOLS);
    await client.close();
  });

  it('returns a stable action-schema description sourced from the shared schema', async () => {
    const { root } = await makeFixtureRoot();
    const { client } = await makeHarness(root);

    const result = await client.callTool({
      name: 'describe_schema',
      arguments: {},
    });
    const payload = structured(result);

    expect(payload).toEqual({
      ok: true,
      schema: {
        format: 'director-actions-v1',
        maxActions: 8,
        envelope: 'strict-flat',
        actionTypes: {
          canvas: [
            'search_and_add',
            'select_objects',
            'set_inheritance',
            'remove_objects',
            'set_goal',
            'set_exclusions',
          ],
          reel: [
            'open_reel_studio',
            'add_clips',
            'remove_clips',
            'reorder_clips',
            'style_clips',
            'set_project',
            'request_render',
            'add_text_layer',
            'update_text_layer',
            'move_text_layer',
            'remove_text_layer',
          ],
        },
        fields: {
          canvas: [
            'type',
            'query',
            'count',
            'objectIds',
            'objectId',
            'channels',
            'goal',
            'exclusions',
          ],
          reel: [
            'type',
            'objectIds',
            'clipIds',
            'aspectRatio',
            'fps',
            'quality',
            'effect',
            'visualEffect',
            'transition',
            'motion',
            'duration',
            'intensity',
            'layerId',
            'content',
            'textX',
            'textY',
            'fontId',
            'sizePreset',
            'textColor',
            'align',
            'inSec',
            'outSec',
          ],
        },
        enums: {
          inheritanceChannels: [
            'emotion',
            'material',
            'world',
            'framing',
            'palette',
            'identity',
            'silhouette',
            'lighting',
          ],
          aspectRatios: ['9:16', '1:1', '16:9'],
          fps: [24, 30],
          qualities: ['draft', 'balanced', 'high', 'maximum'],
          effects: [
            'clean',
            'cinematic',
            'hdr',
            'warm',
            'cool',
            'mono',
            'dream',
            'vignette',
            'blur',
            'punch',
            'teal-orange',
            'vintage-film',
            'glow',
            'bleach-bypass',
          ],
          visualEffects: [
            'none',
            'pixel-sort',
            'glitch-burst',
            'crt-scan',
            'halftone-reveal',
            'ripple-drift',
            'motion-echo',
            'threshold-melt',
            'rgb-split',
            'film-grain',
            'scanlines',
            'glow',
            'dream',
            'vignette',
            'blur',
            'loop',
            'halation',
            'anamorphic-bloom',
          ],
          transitions: [
            'cut',
            'crossfade',
            'dip-black',
            'slide-left',
            'slide-right',
            'zoom',
            'soft-dissolve',
          ],
          motions: [
            'still',
            'push-in',
            'pull-out',
            'pan-left',
            'pan-right',
            'pan-up',
            'pan-down',
            'drift-up-left',
            'drift-down-right',
            'pulse',
            'hero-push',
            'arc-left',
            'arc-right',
            'float',
          ],
          textFonts: ['inter', 'space-grotesk', 'playfair-display', 'bebas-neue', 'jetbrains-mono'],
          textSizePresets: ['S', 'M', 'L', 'XL', 'custom'],
          textAligns: ['left', 'center', 'right'],
        },
        limits: {
          identifierCharacters: 160,
          canvasObjectIds: 12,
          reelObjectIds: 16,
          reelClipIds: 16,
          inheritanceChannels: 8,
          exclusions: 24,
          queryCharacters: 160,
          searchCount: [1, 6],
          goalCharacters: 1_000,
          durationSeconds: [1, 12],
          intensity: [0, 100],
          textContentCharacters: 400,
          textLayersPerClip: 8,
        },
        unavailableActions: {
          search_and_add: 'Unavailable in the local-only project; upload media instead.',
        },
        fieldRule: 'Every strict flat-schema field is required; use null or [] when it does not apply.',
      },
    });
    await client.close();
  });

  it('loads compact state and validates valid and malformed actions', async () => {
    const { root } = await makeFixtureRoot();
    const { client } = await makeHarness(root);
    const loadResult = await client.callTool({
      name: 'load_project',
      arguments: { path: 'fixture.director.json' },
    });
    expect(structured(loadResult)).toMatchObject({
      ok: true,
      path: 'fixture.director.json',
      title: 'Fixture reel',
      clipCount: 1,
    });

    const stateResult = await client.callTool({
      name: 'get_project_state',
      arguments: {},
    });
    expect(structured(stateResult)).toMatchObject({
      ok: true,
      path: 'fixture.director.json',
      state: {
        format: 'director-canvas-context-v1',
        goal: 'Make a concise launch reel.',
      },
    });

    const validation = await client.callTool({
      name: 'validate_actions',
      arguments: {
        actions: [
          reelAction('set_project', { fps: 30 }),
          { type: 'set_project', fps: 60 },
        ],
      },
    });
    expect(structured(validation)).toMatchObject({
      ok: true,
      valid: false,
      maximumActions: MAX_DIRECTOR_ACTIONS,
      results: [
        { index: 0, valid: true },
        { index: 1, valid: false },
      ],
    });
    await client.close();
  });

  it('applies a valid action and reports invalid and stale actions without corrupting the file', async () => {
    const { root, projectPath } = await makeFixtureRoot();
    const { client } = await makeHarness(root);

    const applied = await client.callTool({
      name: 'apply_actions',
      arguments: {
        path: 'fixture.director.json',
        actions: [reelAction('set_project', { fps: 30 })],
      },
    });
    expect(structured(applied)).toMatchObject({
      ok: true,
      wroteFile: true,
      appliedCount: 1,
      rejectedCount: 0,
      receipts: [{ index: 0, status: 'applied' }],
    });
    expect(JSON.parse(await readFile(projectPath, 'utf8'))).toMatchObject({
      updatedAt: '2026-02-03T04:05:06.000Z',
      reelProject: { fps: 30 },
    });

    const beforeInvalid = await readFile(projectPath, 'utf8');
    const invalid = await client.callTool({
      name: 'apply_actions',
      arguments: {
        path: 'fixture.director.json',
        actions: [{ type: 'set_project', fps: 60 }],
      },
    });
    expect(structured(invalid)).toMatchObject({
      ok: true,
      wroteFile: false,
      appliedCount: 0,
      rejectedCount: 1,
      receipts: [{ index: 0, status: 'rejected', code: 'schema_invalid' }],
    });
    expect(await readFile(projectPath, 'utf8')).toBe(beforeInvalid);

    const stale = await client.callTool({
      name: 'apply_actions',
      arguments: {
        path: 'fixture.director.json',
        actions: [reelAction('style_clips', {
          clipIds: ['missing-clip'],
          motion: 'push-in',
        })],
      },
    });
    expect(structured(stale)).toMatchObject({
      ok: true,
      wroteFile: false,
      appliedCount: 0,
      rejectedCount: 1,
      receipts: [{ index: 0, status: 'rejected', code: 'stale_target' }],
    });
    expect(await readFile(projectPath, 'utf8')).toBe(beforeInvalid);
    await client.close();
  });

  it('round-trips a text-layer action through validate and apply', async () => {
    const { root, projectPath } = await makeFixtureRoot();
    const { client } = await makeHarness(root);

    const validated = await client.callTool({
      name: 'validate_actions',
      arguments: {
        actions: [reelAction('add_text_layer', {
          clipIds: ['clip-1'],
          content: 'HELLO WORLD',
          textX: 0.5,
          textY: 0.2,
          sizePreset: 'L',
          textColor: '#ffcc00',
        })],
      },
    });
    expect(structured(validated)).toMatchObject({ ok: true, valid: true, results: [{ index: 0, valid: true }] });

    const applied = await client.callTool({
      name: 'apply_actions',
      arguments: {
        path: 'fixture.director.json',
        actions: [reelAction('add_text_layer', {
          clipIds: ['clip-1'],
          content: 'HELLO WORLD',
          textX: 0.5,
          textY: 0.2,
          sizePreset: 'L',
          textColor: '#ffcc00',
        })],
      },
    });
    expect(structured(applied)).toMatchObject({
      ok: true,
      wroteFile: true,
      appliedCount: 1,
      rejectedCount: 0,
      receipts: [{ index: 0, status: 'applied' }],
    });

    const saved = JSON.parse(await readFile(projectPath, 'utf8')) as {
      reelProject: { clips: Array<{ textLayers: Array<{ content: string; style: { sizePreset: string; color: string } }> }> };
    };
    const layers = saved.reelProject.clips[0].textLayers;
    expect(layers).toHaveLength(1);
    expect(layers[0]).toMatchObject({
      content: 'HELLO WORLD',
      style: { sizePreset: 'L', color: '#ffcc00' },
    });
    await client.close();
  });

  it('rejects lexical and symlink root escapes with structured errors', async () => {
    const { workspace, root } = await makeFixtureRoot();
    const outsidePath = path.join(workspace, 'outside.director.json');
    await writeFile(outsidePath, JSON.stringify(fixtureProject()), 'utf8');
    await symlink(outsidePath, path.join(root, 'outside-link.director.json'));
    const { client } = await makeHarness(root);

    for (const escapedPath of ['../outside.director.json', 'outside-link.director.json']) {
      const result = await client.callTool({
        name: 'load_project',
        arguments: { path: escapedPath },
      });
      expect(result.isError).toBe(true);
      expect(structured(result)).toMatchObject({
        ok: false,
        error: { code: 'PATH_OUTSIDE_ROOT' },
      });
    }
    await client.close();
  });

  it('rejects action batches above the shared cap before reading or writing', async () => {
    const { root } = await makeFixtureRoot();
    const { client } = await makeHarness(root);
    const actions = Array.from(
      { length: MAX_DIRECTOR_ACTIONS + 1 },
      () => reelAction('set_project', { fps: 30 }),
    );

    for (const [name, argumentsValue] of [
      ['validate_actions', { actions }],
      ['apply_actions', { path: 'fixture.director.json', actions }],
    ] as const) {
      const result = await client.callTool({
        name,
        arguments: argumentsValue,
      });
      expect(result.isError).toBe(true);
      expect(structured(result)).toMatchObject({
        ok: false,
        error: {
          code: 'ACTION_LIMIT_EXCEEDED',
          details: {
            maximum: MAX_DIRECTOR_ACTIONS,
            received: MAX_DIRECTOR_ACTIONS + 1,
          },
        },
      });
    }
    await client.close();
  });

  it('compiles and plans without making network calls', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('Network access is forbidden in Director MCP.');
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { root } = await makeFixtureRoot();
    const { client } = await makeHarness(root);

    const compiled = await client.callTool({
      name: 'compile_timeline',
      arguments: { path: 'fixture.director.json' },
    });
    expect(structured(compiled)).toMatchObject({
      ok: true,
      timeline: {
        clipCount: 1,
        totalDuration: 3,
        clips: [{ clipId: 'clip-1', start: 0, duration: 3 }],
      },
    });

    const planned = await client.callTool({
      name: 'build_render_plan',
      arguments: { path: 'fixture.director.json' },
    });
    expect(structured(planned)).toMatchObject({
      ok: true,
      plan: {
        outputName: 'director-open-reel.mp4',
        duration: 3,
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    await client.close();
  });
});
