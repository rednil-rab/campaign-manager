import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Panel } from '../../components/Panel';
import { useCampaignStore } from '../../store/campaignStore';

export function CampaignPickerPage() {
  const navigate = useNavigate();
  const order = useCampaignStore((s) => s.order);
  const campaigns = useCampaignStore((s) => s.campaigns);
  const createCampaign = useCampaignStore((s) => s.createCampaign);
  const deleteCampaign = useCampaignStore((s) => s.deleteCampaign);
  const [name, setName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleting = deletingId ? campaigns[deletingId] : undefined;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = createCampaign(trimmed);
    setName('');
    navigate(`/c/${id}`);
  };

  return (
    <div className="picker">
      <h1 className="page-title">Questkeeper</h1>
      <p className="page-sub">Choose a campaign or start a new one.</p>

      <Panel title="New Campaign">
        <form className="form-row" onSubmit={onSubmit}>
          <label className="visually-hidden" htmlFor="campaign-name">
            Campaign name
          </label>
          <input
            id="campaign-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Campaign name"
            maxLength={80}
          />
          <button className="button" type="submit" disabled={!name.trim()}>
            Create
          </button>
        </form>
      </Panel>

      {order.length === 0 && <p className="page-sub">No campaigns yet. Create your first one above.</p>}

      {order.map((id) => {
        const c = campaigns[id];
        return (
          <Panel key={id} title={c.name}>
            <p>
              {c.sessions.length} sessions · {c.quests.length} quests · {c.npcs.length} NPCs
            </p>
            <div className="form-row">
              <Link className="button" to={`/c/${id}`}>
                Open
              </Link>
              <button className="button button--danger" type="button" onClick={() => setDeletingId(id)}>
                Delete
              </button>
            </div>
          </Panel>
        );
      })}

      {deleting && deletingId && (
        <ConfirmDialog
          title="Delete campaign"
          message={`Delete "${deleting.name}" and all its sessions, quests and NPCs? This cannot be undone.`}
          onCancel={() => setDeletingId(null)}
          onConfirm={() => {
            deleteCampaign(deletingId);
            setDeletingId(null);
          }}
        />
      )}
    </div>
  );
}
