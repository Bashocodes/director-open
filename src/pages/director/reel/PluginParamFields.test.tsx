import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineEffectPlugin } from '../../../plugins/types';
import { PluginParamFields } from './PluginParamFields';

const strictPlugin = defineEffectPlugin({
  id: 'schema-control',
  kind: 'effect',
  surface: 'grade',
  stage: 'grade',
  displayName: 'Schema control',
  description: 'Schema-generated control fixture.',
  order: 1,
  params: {
    schema: z.object({ amount: z.number().min(0).max(10).default(3) }).strict(),
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

describe('PluginParamFields', () => {
  it('renders Zod defaults from UI hints and reports a typed field update', () => {
    const onChange = vi.fn();
    render(<PluginParamFields plugin={strictPlugin} onChange={onChange} />);

    const input = screen.getByRole('slider', { name: /amount/i });
    expect(input).toHaveValue('3');
    fireEvent.change(input, { target: { value: '8' } });
    expect(onChange).toHaveBeenCalledWith('amount', 8);
  });
});
