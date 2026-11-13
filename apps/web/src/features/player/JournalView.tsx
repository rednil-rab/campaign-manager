import type { PlayerPage } from '@questkeeper/domain';
import { Panel, Tag } from '../../components/Panel';

interface Props {
  quests: PlayerPage['quests'];
  npcs: PlayerPage['npcs'];
}

/** Read-only list of what the DM has revealed to players. */
export function JournalView({ quests, npcs }: Props) {
  return (
    <>
      <Panel title="Quests">
        {quests.length === 0 ? (
          <p className="muted">No quests revealed yet.</p>
        ) : (
          <ul className="journal">
            {quests.map((q) => (
              <li key={q.id} className="journal__entry">
                <h3 className="journal__name">{q.title}</h3>
                <p>
                  <Tag tone="amber">{q.status}</Tag>
                </p>
                {q.description && <p>{q.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="NPCs">
        {npcs.length === 0 ? (
          <p className="muted">No NPCs revealed yet.</p>
        ) : (
          <ul className="journal">
            {npcs.map((n) => (
              <li key={n.id} className="journal__entry">
                <h3 className="journal__name">{n.name}</h3>
                <p>
                  <Tag tone="cyan">{n.disposition}</Tag>
                  {[n.role, n.location].filter(Boolean).map((text) => (
                    <span key={text} className="muted">
                      {' · '}
                      {text}
                    </span>
                  ))}
                </p>
                {n.description && <p>{n.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
