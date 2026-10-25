import { useCampaign } from '../../app/CampaignContext';
import { Panel, Tag } from '../../components/Panel';
import { activeQuests, latestSession } from '../../domain/selectors';

export function DashboardPage() {
  const campaign = useCampaign();
  const latest = latestSession(campaign);
  const active = activeQuests(campaign);

  return (
    <>
      <h1 className="page-title">{campaign.name}</h1>
      <p className="page-sub">{campaign.tagline}</p>

      <div className="grid">
        <Panel title="Latest Session">
          {latest ? (
            <>
              <p>
                <Tag>Session {latest.number}</Tag> {latest.title}
              </p>
              <p>{latest.summary}</p>
            </>
          ) : (
            <p>No sessions yet.</p>
          )}
        </Panel>
        <Panel title="Active Quests">
          <ul className="list">
            {active.map((q) => (
              <li key={q.id}>{q.title}</li>
            ))}
          </ul>
        </Panel>
        <Panel title="Campaign at a Glance">
          <p>
            <Tag tone="cyan">{campaign.sessions.length}</Tag> sessions ·{' '}
            <Tag tone="cyan">{campaign.quests.length}</Tag> quests ·{' '}
            <Tag tone="cyan">{campaign.npcs.length}</Tag> NPCs
          </p>
        </Panel>
      </div>
    </>
  );
}
