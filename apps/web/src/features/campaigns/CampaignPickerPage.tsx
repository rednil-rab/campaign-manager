import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Panel } from '../../components/Panel';
import { useCampaignStore } from '../../store/campaignStore';
import { DomainError } from '@questkeeper/domain';
import { useAuthStore } from '../../store/authStore';

export function CampaignPickerPage() {
  const navigate = useNavigate();
  const order = useCampaignStore((s) => s.order);
  const campaigns = useCampaignStore((s) => s.campaigns);
  const createCampaign = useCampaignStore((s) => s.createCampaign);
  const createSampleCampaign = useCampaignStore((s) => s.createSampleCampaign);
  const deleteCampaign = useCampaignStore((s) => s.deleteCampaign);
  const logout = useAuthStore((s) => s.logout);
  const email = useAuthStore((s) => s.user?.email);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleting = deletingId ? campaigns[deletingId] : undefined;

  // Runs a create action, then opens the new campaign; shows the message if it fails.
  const create = async (make: () => Promise<string>) => {
    setError('');
    setBusy(true);
    try {
      const id = await make();
      setName('');
      navigate(`/c/${id}`);
    } catch (err) {
      if (err instanceof DomainError) setError(err.message);
      else throw err;
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    void create(() => createCampaign(trimmed));
  };

  return (
    <div className="picker">
      <h1 className="page-title">Questkeeper</h1>
      <p className="page-sub">
        Signed in as {email}.{' '}
        <button className="button button--ghost" type="button" onClick={() => void logout()}>
          Sign out
        </button>
      </p>
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
          <button className="button" type="submit" disabled={!name.trim() || busy}>
            Create
          </button>
          <button
            className="button button--ghost"
            type="button"
            disabled={busy}
            onClick={() => void create(createSampleCampaign)}
          >
            Add sample campaign
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </Panel>

      {order.length === 0 && <p className="page-sub">No campaigns yet. Create your first one above.</p>}

      {order.map((id) => {
        const c = campaigns[id];
        return (
          <Panel key={id} title={c.name}>
            <p>
              {c.sessions.length} sessions · {c.quests.length} quests · {c.npcs.length} NPCs · {c.characters.length} characters
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
          onConfirm={async () => {
            await deleteCampaign(deletingId);
            setDeletingId(null);
          }}
        />
      )}
    </div>
  );
}
