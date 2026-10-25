import { useCampaign } from '../../store/campaignStore';
import { Panel, Tag } from '../../components/Panel';
import { getNpc, sessionsForQuest } from '../../domain/selectors';

export function QuestsPage() {
  const campaign = useCampaign();
  return (
    <>
      <h1 className="page-title">Quests</h1>
      <p className="page-sub">Placeholder list. Detail views come later.</p>
      {campaign.quests.map((q) => {
        const giver = q.giverNpcId ? getNpc(campaign, q.giverNpcId) : undefined;
        return (
          <Panel key={q.id} title={q.title}>
            <p>
              <Tag tone={q.status === 'active' ? 'amber' : 'cyan'}>{q.status}</Tag>{' '}
              {giver && <>Given by {giver.name} · </>}
              Sessions: {sessionsForQuest(campaign, q.id).map((s) => s.number).join(', ') || '—'}
            </p>
            <p>{q.description}</p>
          </Panel>
        );
      })}
    </>
  );
}
