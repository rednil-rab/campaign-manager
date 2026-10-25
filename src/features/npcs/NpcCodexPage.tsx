import { useCampaign } from '../../store/campaignStore';
import { Panel, Tag } from '../../components/Panel';
import { questsForNpc, sessionsForNpc } from '../../domain/selectors';

export function NpcCodexPage() {
  const campaign = useCampaign();
  return (
    <>
      <h1 className="page-title">NPC Codex</h1>
      <p className="page-sub">Placeholder list. Detail views come later.</p>
      {campaign.npcs.map((n) => (
        <Panel key={n.id} title={n.name}>
          <p>
            <Tag tone="cyan">{n.disposition}</Tag> {n.role} · {n.location}
          </p>
          <p>{n.description}</p>
          <p>
            Quests: {questsForNpc(campaign, n.id).map((q) => q.title).join(', ') || '—'} ·
            Sessions: {sessionsForNpc(campaign, n.id).map((s) => s.number).join(', ') || '—'}
          </p>
        </Panel>
      ))}
    </>
  );
}
