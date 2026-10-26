import type { Id, RuleOption } from '@questkeeper/domain';

const OTHER = '__other__';

/** A dropdown choice: an option id, nothing, or OTHER with free text alongside. */
export interface Pick {
  choice: string;
  other: string;
}

export const toPick = (id: Id | undefined, text: string): Pick => ({
  choice: id ?? (text ? OTHER : ''),
  other: text,
});

export const fromPick = (pick: Pick): { id: Id | undefined; text: string } =>
  pick.choice === OTHER ? { id: undefined, text: pick.other.trim() } : { id: pick.choice || undefined, text: '' };

interface OptionPickerProps {
  label: string;
  options: RuleOption[];
  value: Pick;
  onChange: (next: Pick) => void;
}

export function OptionPicker({ label, options, value, onChange }: OptionPickerProps) {
  return (
    <>
      <label className="field">
        {label}
        <select className="input" value={value.choice} onChange={(e) => onChange({ ...value, choice: e.target.value })}>
          <option value="">None</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </select>
      </label>
      {value.choice === OTHER && (
        <label className="field">
          {`${label} (custom)`}
          <input
            className="input"
            value={value.other}
            onChange={(e) => onChange({ ...value, other: e.target.value })}
            maxLength={80}
          />
        </label>
      )}
    </>
  );
}
