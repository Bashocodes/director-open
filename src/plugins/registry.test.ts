import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  PluginRegistry,
  pluginParams,
  resolvedPluginParams,
} from './registry';
import {
  defineEffectPlugin,
  defineMotionPlugin,
  type AnyDirectorPlugin,
} from './types';

function gradePlugin(id: string, order: number, defaultAmount = 42) {
  return defineEffectPlugin({
    id,
    kind: 'effect',
    surface: 'grade',
    stage: 'grade',
    displayName: id,
    description: `${id} test plugin`,
    order,
    params: {
      schema: z.object({
        amount: z.number().min(0).max(100).default(defaultAmount),
      }),
      ui: {
        amount: {
          control: 'range',
          label: 'Amount',
          min: 0,
          max: 100,
          step: 1,
        },
      },
    },
    previewCssFilter: () => 'none',
    ffmpegGradeFilter: () => 'null',
  });
}

describe('PluginRegistry', () => {
  it('registers, looks up, filters, and lists with stable order/id sorting', () => {
    const registry = new PluginRegistry();
    registry.register(gradePlugin('zebra-grade', 20));
    registry.register(gradePlugin('amber-grade', 10));
    registry.register(gradePlugin('aqua-grade', 20));

    expect(registry.getEffect('amber-grade', 'grade')?.displayName).toBe('amber-grade');
    expect(registry.list('effect').map((plugin) => plugin.id)).toEqual([
      'amber-grade',
      'aqua-grade',
      'zebra-grade',
    ]);
    expect(registry.listEffects('visual')).toEqual([]);
  });

  it('rejects id collisions instead of silently replacing a plugin', () => {
    const registry = new PluginRegistry([gradePlugin('same-id', 1)]);
    const collidingMotion = defineMotionPlugin({
      id: 'same-id',
      kind: 'motion',
      displayName: 'Same id',
      description: 'Cross-kind collision fixture.',
      order: 2,
      params: { schema: z.object({}), ui: {} },
      cameraPose: () => ({ zoom: 1, focusX: 0.5, focusY: 0.5 }),
      ffmpegExpressions: () => ({ zoom: '1', focusX: '0.5', focusY: '0.5' }),
    });
    expect(() => registry.register(collidingMotion)).toThrow(
      'Plugin id collision: “same-id” is already registered.',
    );
  });

  it('derives parameter defaults from the Zod schema', () => {
    const plugin = gradePlugin('default-grade', 1, 67);
    expect(pluginParams(plugin)).toEqual({ amount: 67 });
    expect(pluginParams(plugin, { amount: 12 })).toEqual({ amount: 12 });
  });

  it('keeps strict contributor schemas intact when legacy fields are present', () => {
    const plugin = defineEffectPlugin({
      id: 'strict-grade',
      kind: 'effect',
      surface: 'grade',
      stage: 'grade',
      displayName: 'Strict grade',
      description: 'Uses no legacy intensity field.',
      order: 1,
      params: {
        schema: z.object({ amount: z.number().default(7) }).strict(),
        ui: {
          amount: {
            control: 'range',
            label: 'Amount',
            min: 0,
            max: 10,
            step: 1,
          },
        },
      },
      previewCssFilter: () => 'none',
      ffmpegGradeFilter: () => 'null',
    });

    expect(resolvedPluginParams(plugin, { amount: 4 }, { intensity: 99 })).toEqual({
      amount: 4,
    });
  });

  it('rejects an unsupported effect hook matrix at runtime', () => {
    const invalid = {
      ...gradePlugin('invalid-effect', 1),
      surface: 'visual',
      stage: 'post-motion',
      previewCssFilter: undefined,
      ffmpegGradeFilter: undefined,
    } as unknown as AnyDirectorPlugin;
    expect(() => new PluginRegistry([invalid])).toThrow(
      'Post-motion effect “invalid-effect” needs frameTransform preview + ffmpegFiltergraph export hooks.',
    );
  });

  it('rejects incomplete motion hooks at runtime', () => {
    const incompleteMotion = {
      id: 'incomplete-motion',
      kind: 'motion',
      displayName: 'Incomplete motion',
      description: 'Missing its export counterpart.',
      order: 1,
      params: { schema: z.object({}), ui: {} },
      cameraPose: () => ({ zoom: 1, focusX: 0.5, focusY: 0.5 }),
    } as unknown as AnyDirectorPlugin;

    expect(() => new PluginRegistry([incompleteMotion])).toThrow(
      'Motion “incomplete-motion” needs cameraPose + ffmpegExpressions hooks.',
    );
  });
});
