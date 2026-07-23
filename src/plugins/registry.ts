import { legacyPlugins } from './legacyAdapter';
import type {
  AnyDirectorPlugin,
  AnyEffectPlugin,
  AnyMotionPlugin,
  AnyTransitionPlugin,
  EffectSurface,
  PluginKind,
} from './types';

const PLUGIN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function comparePlugins(left: AnyDirectorPlugin, right: AnyDirectorPlugin) {
  return left.order - right.order || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

function assertPluginContract(plugin: AnyDirectorPlugin) {
  if (plugin.id.length > 160 || !PLUGIN_ID.test(plugin.id)) {
    throw new Error(`Invalid plugin id “${plugin.id}”. Use lowercase kebab-case.`);
  }
  if (!plugin.displayName.trim() || !plugin.description.trim()) {
    throw new Error(`Plugin “${plugin.id}” needs a display name and description.`);
  }
  if (!Number.isFinite(plugin.order)) {
    throw new Error(`Plugin “${plugin.id}” needs a finite order.`);
  }
  const defaults = plugin.params.schema.safeParse({});
  if (!defaults.success) {
    throw new Error(`Plugin “${plugin.id}” must provide defaults for every parameter.`);
  }
  const schemaFields = new Set(Object.keys(plugin.params.schema.shape));
  for (const field of Object.keys(plugin.params.ui)) {
    if (!schemaFields.has(field)) {
      throw new Error(`Plugin “${plugin.id}” has a UI hint for unknown parameter “${field}”.`);
    }
  }
  if (plugin.kind === 'effect') {
    const effectId = plugin.id;
    if (plugin.surface === 'grade') {
      if (
        plugin.stage !== 'grade'
        || !plugin.previewCssFilter
        || !plugin.ffmpegGradeFilter
        || plugin.frameTransform
        || plugin.ffmpegFiltergraph
      ) {
        throw new Error(
          `Grade effect “${effectId}” needs previewCssFilter + ffmpegGradeFilter only.`,
        );
      }
      return;
    }
    if (plugin.stage === 'pre-motion') {
      const validNoOp = plugin.id === 'none' && plugin.noOp === true;
      if ((!plugin.frameTransform && !validNoOp) || plugin.ffmpegFiltergraph) {
        throw new Error(
          `Pre-motion effect “${effectId}” needs one frameTransform (only “none” may be no-op).`,
        );
      }
      return;
    }
    const hasPreview = Boolean(plugin.frameTransform)
      || Boolean(plugin.deprecated && plugin.legacyPreviewCanvas);
    if (plugin.stage !== 'post-motion' || !plugin.ffmpegFiltergraph || !hasPreview) {
      throw new Error(
        `Post-motion effect “${effectId}” needs frameTransform preview + ffmpegFiltergraph export hooks.`,
      );
    }
    return;
  }
  if (
    plugin.kind === 'motion'
    && (typeof plugin.cameraPose !== 'function' || typeof plugin.ffmpegExpressions !== 'function')
  ) {
    throw new Error(
      `Motion “${plugin.id}” needs cameraPose + ffmpegExpressions hooks.`,
    );
  }
  if (
    plugin.kind === 'transition'
    && (typeof plugin.preview !== 'function' || typeof plugin.ffmpegTransition !== 'function')
  ) {
    throw new Error(
      `Transition “${plugin.id}” needs preview + ffmpegTransition hooks.`,
    );
  }
}

export class PluginRegistry {
  private readonly plugins = new Map<string, AnyDirectorPlugin>();

  constructor(initialPlugins: readonly AnyDirectorPlugin[] = []) {
    this.registerAll(initialPlugins);
  }

  register(plugin: AnyDirectorPlugin) {
    assertPluginContract(plugin);
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin id collision: “${plugin.id}” is already registered.`);
    }
    this.plugins.set(plugin.id, plugin);
    return this;
  }

  registerAll(plugins: readonly AnyDirectorPlugin[]) {
    for (const plugin of plugins) this.register(plugin);
    return this;
  }

  get(id: string) {
    return this.plugins.get(id);
  }

  getEffect(id: string, surface?: EffectSurface) {
    const plugin = this.plugins.get(id);
    if (plugin?.kind !== 'effect' || (surface && plugin.surface !== surface)) return undefined;
    return plugin as AnyEffectPlugin;
  }

  getMotion(id: string) {
    const plugin = this.plugins.get(id);
    return plugin?.kind === 'motion' ? plugin as AnyMotionPlugin : undefined;
  }

  getTransition(id: string) {
    const plugin = this.plugins.get(id);
    return plugin?.kind === 'transition' ? plugin as AnyTransitionPlugin : undefined;
  }

  list(kind?: PluginKind) {
    return [...this.plugins.values()]
      .filter((plugin) => !kind || plugin.kind === kind)
      .sort(comparePlugins);
  }

  listEffects(surface: EffectSurface, options: { includeHidden?: boolean } = {}) {
    return this.list('effect')
      .filter((plugin): plugin is AnyEffectPlugin => (
        plugin.kind === 'effect'
        && plugin.surface === surface
        && (options.includeHidden || !plugin.hidden)
      ));
  }
}

export function pluginParams(
  plugin: AnyDirectorPlugin,
  values: Readonly<Record<string, unknown>> = {},
) {
  return plugin.params.schema.parse(values) as Record<string, unknown>;
}

export function safePluginParams(
  plugin: AnyDirectorPlugin,
  values: Readonly<Record<string, unknown>> = {},
) {
  const shape = plugin.params.schema.shape;
  const knownValues = Object.fromEntries(
    Object.keys(shape)
      .filter((field) => Object.hasOwn(values, field))
      .map((field) => [field, values[field]]),
  );
  const parsed = plugin.params.schema.safeParse(knownValues);
  return parsed.success
    ? parsed.data as Record<string, unknown>
    : plugin.params.schema.parse({}) as Record<string, unknown>;
}

/**
 * Merge old shared clip fields only when a plugin explicitly declares the
 * matching parameter. This keeps strict contributor schemas fully supported.
 */
export function resolvedPluginParams(
  plugin: AnyDirectorPlugin,
  stored: Readonly<Record<string, unknown>> = {},
  legacyValues: Readonly<Record<string, unknown>> = {},
) {
  const declared = plugin.params.schema.shape;
  const compatibleLegacy = Object.fromEntries(
    Object.entries(legacyValues).filter(([field]) => Object.hasOwn(declared, field)),
  );
  return safePluginParams(plugin, { ...stored, ...compatibleLegacy });
}

// Vite eagerly discovers contribution modules. Adding a *.plugin.ts file below
// src/plugins is sufficient; no central import list needs editing.
const discoveredModules = import.meta.glob('./**/*.plugin.ts', {
  eager: true,
  import: 'default',
}) as Record<string, AnyDirectorPlugin>;

export const pluginRegistry = new PluginRegistry([
  ...Object.values(discoveredModules),
  ...legacyPlugins,
]);

export function pluginOptions(kind: PluginKind, surface?: EffectSurface) {
  const plugins = kind === 'effect' && surface
    ? pluginRegistry.listEffects(surface)
    : pluginRegistry.list(kind).filter((plugin) => !plugin.hidden);
  return plugins.map((plugin) => ({
    id: plugin.id,
    label: plugin.displayName,
    description: plugin.description,
  }));
}

export function pluginDisplayName(id: string) {
  return pluginRegistry.get(id)?.displayName ?? id;
}
