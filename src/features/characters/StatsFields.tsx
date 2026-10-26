import type { StatDefinition } from '../../domain/types';
import type { StatsDraft } from './statsDraft';

interface StatsFieldsProps {
  definitions: StatDefinition[];
  value: StatsDraft;
  onChange: (next: StatsDraft) => void;
}

export function StatsFields({ definitions, value, onChange }: StatsFieldsProps) {
  if (definitions.length === 0) {
    return <p className="muted">No stats defined for this campaign yet. Add some on the Stats page.</p>;
  }

  return (
    <fieldset className="field stats-fields">
      <legend>Stats</legend>
      <div className="stats-grid">
        {definitions.map((d) => (
          <label key={d.id} className="field">
            {d.name}
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={value[d.id] ?? ''}
              onChange={(e) => onChange({ ...value, [d.id]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
