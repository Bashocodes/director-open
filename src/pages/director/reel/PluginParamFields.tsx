import { safePluginParams } from '../../../plugins/registry';
import type { AnyDirectorPlugin } from '../../../plugins/types';

type Props = {
  plugin: AnyDirectorPlugin | undefined;
  values?: Readonly<Record<string, unknown>>;
  disabled?: boolean;
  excludeFields?: readonly string[];
  onChange: (field: string, value: unknown) => void;
};

function boundedNumber(value: number, minimum?: number, maximum?: number) {
  if (!Number.isFinite(value)) return minimum ?? 0;
  return Math.min(maximum ?? Number.POSITIVE_INFINITY, Math.max(minimum ?? Number.NEGATIVE_INFINITY, value));
}

/** Renders plugin controls exclusively from the registered Zod defaults and UI hints. */
export function PluginParamFields({
  plugin,
  values = {},
  disabled = false,
  excludeFields = [],
  onChange,
}: Props) {
  if (!plugin) return null;
  const params = safePluginParams(plugin, values);
  return Object.entries(plugin.params.ui).map(([field, hint]) => {
    if (!hint || excludeFields.includes(field)) return null;
    const value = params[field];
    if (hint.control === 'range') {
      const numberValue = typeof value === 'number' ? value : hint.min;
      return (
        <label key={field}>
          {hint.label} <b>{numberValue}{hint.suffix || ''}</b>
          <input
            type="range"
            min={hint.min}
            max={hint.max}
            step={hint.step}
            disabled={disabled}
            value={numberValue}
            onChange={(event) => onChange(
              field,
              boundedNumber(Number(event.target.value), hint.min, hint.max),
            )}
          />
        </label>
      );
    }
    if (hint.control === 'number') {
      const numberValue = typeof value === 'number' ? value : hint.min ?? 0;
      return (
        <label key={field}>
          {hint.label}
          <input
            type="number"
            min={hint.min}
            max={hint.max}
            step={hint.step}
            disabled={disabled}
            value={numberValue}
            onChange={(event) => onChange(
              field,
              boundedNumber(Number(event.target.value), hint.min, hint.max),
            )}
          />
        </label>
      );
    }
    if (hint.control === 'select') {
      return (
        <label key={field}>
          {hint.label}
          <select
            disabled={disabled}
            value={typeof value === 'string' ? value : hint.options[0]?.value || ''}
            onChange={(event) => onChange(field, event.target.value)}
          >
            {hint.options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      );
    }
    return (
      <label key={field}>
        <input
          type="checkbox"
          disabled={disabled}
          checked={value === true}
          onChange={(event) => onChange(field, event.target.checked)}
        />
        {hint.label}
      </label>
    );
  });
}
