import { useCampaign } from '../../store/campaignStore';
import { Panel, Tag } from '../../components/Panel';
import { npcsForSession, questsForSession } from '../../domain/selectors';

export function SessionsPage() {
  const campaign = useCampaign();
  return (
    <>
      <h1 className="page-title">Sessions</h1>
      <p className="page-sub">Placeholder list. Detail views come later.</p>
      {campaign.sessions.map((s) => (
        <Panel key={s.id} title={`#${s.number} ${s.title}`}>
          <p>{s.summary}</p>
          <p>
            {questsForSession(campaign, s).map((q) => (
              <Tag key={q.id}>{q.title}</Tag>
            ))}{' '}
            {npcsForSession(campaign, s).map((n) => (
              <Tag key={n.id} tone="cyan">
                {n.name}
              </Tag>
            ))}
          </p>
        </Panel>
      ))}
    </>
  );
}
