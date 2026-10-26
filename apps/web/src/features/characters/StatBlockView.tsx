import { statsFor } from '@questkeeper/domain';
import type { Campaign, Stats } from '@questkeeper/domain';

export function StatBlockView({ campaign, stats }: { campaign: Campaign; stats: Stats | undefined }) {
  const entries = statsFor(campaign, stats);
  if (entries.length === 0) return null;

  return (
    <dl className="abilities">
      {entries.map(({ def, value }) => (
        <div key={def.id} className="abilities__item">
          <dt>{def.name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
