import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { serializeDirectorProjectContext } from '../../../src/lib/ai/directorContext';
import {
  DirectorProjectFileError,
  parseDirectorProjectJson,
  stringifyDirectorProjectFile,
  type DirectorProjectFile,
} from '../../../src/shared/directorProject';
import {
  applyDirectorProjectActions,
} from '../../../src/shared/directorProjectActions';
import {
  buildHeadlessRenderPlan,
  HeadlessRenderPlanError,
} from '../../../src/shared/directorRenderPlan';
import {
  describeDirectorActionSchema,
  DirectorActionSchema,
  MAX_DIRECTOR_ACTIONS,
} from '../../../src/shared/directorSchemas';
import { compileReelTimeline } from '../../../src/pages/director/reel/project';
import { DirectorMcpError } from './errors';
import { RootPathSandbox } from './pathSandbox';

export type DirectorMcpServiceOptions = {
  root: string;
  createId?: (prefix: string) => string;
  now?: () => string;
  contextTokenBudget?: number;
};

type LoadedProject = {
  canonicalPath: string;
  displayPath: string;
  project: DirectorProjectFile;
};

function compactIssues(error: DirectorProjectFileError) {
  return error.issues?.slice(0, 20).map((issue) => ({
    code: issue.code,
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

function projectFileError(error: DirectorProjectFileError) {
  if (error.code === 'json_too_large') {
    return new DirectorMcpError('PROJECT_TOO_LARGE', error.message);
  }
  return new DirectorMcpError('PROJECT_INVALID', error.message, {
    format: error.code,
    issues: compactIssues(error),
  });
}

function compactActionIssues(error: { issues: readonly {
  code: string;
  path: PropertyKey[];
  message: string;
}[] }) {
  return error.issues.slice(0, 20).map((issue) => ({
    code: issue.code,
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function assertActionLimit(actions: readonly unknown[]) {
  if (actions.length > MAX_DIRECTOR_ACTIONS) {
    throw new DirectorMcpError(
      'ACTION_LIMIT_EXCEEDED',
      `At most ${MAX_DIRECTOR_ACTIONS} Director actions may be submitted per call.`,
      { maximum: MAX_DIRECTOR_ACTIONS, received: actions.length },
    );
  }
}

function jsonObject(value: string) {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DirectorMcpError('INTERNAL_ERROR', 'The compact project serializer returned an invalid payload.');
  }
  return parsed as Record<string, unknown>;
}

export class DirectorMcpService {
  private loadedProject: LoadedProject | null = null;

  private constructor(
    private readonly sandbox: RootPathSandbox,
    private readonly createId: (prefix: string) => string,
    private readonly now: () => string,
    private readonly contextTokenBudget: number,
  ) {}

  static async create(options: DirectorMcpServiceOptions) {
    const sandbox = await RootPathSandbox.create(options.root);
    return new DirectorMcpService(
      sandbox,
      options.createId ?? ((prefix) => `${prefix}-${randomUUID()}`),
      options.now ?? (() => new Date().toISOString()),
      options.contextTokenBudget ?? 2_500,
    );
  }

  private displayPath(canonicalPath: string) {
    const relative = path.relative(this.sandbox.root, canonicalPath);
    return relative.split(path.sep).join('/');
  }

  private async readProject(projectPath: string): Promise<LoadedProject> {
    const file = await this.sandbox.readProjectText(projectPath);
    let project: DirectorProjectFile;
    try {
      project = parseDirectorProjectJson(file.text);
    } catch (error) {
      if (error instanceof DirectorProjectFileError) throw projectFileError(error);
      throw error;
    }
    return {
      canonicalPath: file.path,
      displayPath: this.displayPath(file.path),
      project,
    };
  }

  describeSchema() {
    return {
      ok: true,
      schema: describeDirectorActionSchema(),
    };
  }

  async loadProject(projectPath: string) {
    const loaded = await this.readProject(projectPath);
    this.loadedProject = loaded;
    const timeline = loaded.project.reelProject
      ? compileReelTimeline(loaded.project.reelProject)
      : null;
    return {
      ok: true,
      path: loaded.displayPath,
      title: loaded.project.title,
      version: loaded.project.version,
      canvasObjectCount: loaded.project.objects.length,
      clipCount: loaded.project.reelProject?.clips.length ?? 0,
      timelineDuration: timeline?.totalDuration ?? 0,
      localMediaOmitted: loaded.project.localMediaOmitted,
    };
  }

  getProjectState() {
    if (!this.loadedProject) {
      throw new DirectorMcpError(
        'PROJECT_NOT_LOADED',
        'No project is loaded. Call load_project first.',
      );
    }
    return {
      ok: true,
      path: this.loadedProject.displayPath,
      state: jsonObject(serializeDirectorProjectContext(
        this.loadedProject.project,
        this.contextTokenBudget,
      )),
    };
  }

  validateActions(actions: readonly unknown[]) {
    assertActionLimit(actions);
    const results = actions.map((action, index) => {
      const parsed = DirectorActionSchema.safeParse(action);
      return parsed.success ? {
        index,
        valid: true,
        action: parsed.data,
      } : {
        index,
        valid: false,
        issues: compactActionIssues(parsed.error),
      };
    });
    return {
      ok: true,
      valid: results.every((result) => result.valid),
      maximumActions: MAX_DIRECTOR_ACTIONS,
      results,
    };
  }

  async applyActions(projectPath: string, actions: readonly unknown[]) {
    assertActionLimit(actions);
    const loaded = await this.readProject(projectPath);
    const transaction = applyDirectorProjectActions(
      loaded.project,
      actions,
      {
        createId: this.createId,
        now: this.now,
      },
    );

    let wroteFile = false;
    if (transaction.appliedCount > 0) {
      const json = stringifyDirectorProjectFile(transaction.project);
      await this.sandbox.writeProjectText(loaded.canonicalPath, json);
      wroteFile = true;
    }

    if (
      this.loadedProject?.canonicalPath === loaded.canonicalPath
      && transaction.appliedCount > 0
    ) {
      this.loadedProject = {
        ...loaded,
        project: transaction.project,
      };
    }

    return {
      ok: true,
      path: loaded.displayPath,
      wroteFile,
      appliedCount: transaction.appliedCount,
      rejectedCount: transaction.rejectedCount,
      receipts: transaction.receipts,
      notices: transaction.notices,
    };
  }

  async compileTimeline(projectPath: string) {
    const loaded = await this.readProject(projectPath);
    if (!loaded.project.reelProject) {
      throw new DirectorMcpError(
        'PROJECT_INVALID',
        'The project does not contain a reel timeline.',
      );
    }
    const timeline = compileReelTimeline(loaded.project.reelProject);
    return {
      ok: true,
      path: loaded.displayPath,
      title: loaded.project.title,
      timeline: {
        clipCount: loaded.project.reelProject.clips.length,
        aspectRatio: loaded.project.reelProject.aspectRatio,
        fps: loaded.project.reelProject.fps,
        quality: loaded.project.reelProject.quality,
        totalDuration: timeline.totalDuration,
        clips: timeline.clips.map((clipTiming) => {
          const clip = loaded.project.reelProject?.clips[clipTiming.index];
          return {
            ...clipTiming,
            duration: clip?.duration ?? 0,
            transition: clip?.transition ?? 'cut',
          };
        }),
      },
    };
  }

  async buildRenderPlan(projectPath: string) {
    const loaded = await this.readProject(projectPath);
    try {
      return {
        ok: true,
        path: loaded.displayPath,
        title: loaded.project.title,
        plan: buildHeadlessRenderPlan(loaded.project),
      };
    } catch (error) {
      if (!(error instanceof HeadlessRenderPlanError)) throw error;
      throw new DirectorMcpError(
        'PROJECT_INVALID',
        'A render plan could not be built for this project.',
        { reason: error.code },
      );
    }
  }
}

export function createDirectorMcpService(options: DirectorMcpServiceOptions) {
  return DirectorMcpService.create(options);
}
