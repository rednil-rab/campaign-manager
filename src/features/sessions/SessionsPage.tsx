import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { Panel, Tag } from '../../components/Panel';
import { npcsForSession, questsForSession } from '../../domain/selectors';
import type { Session } from '../../domain/types';
import { useCampaign, useCampaignStore } from '../../store/campaignStore';
import { SessionForm } from './SessionForm';

export function SessionsPage() {
  const campaign = useCampaign();
  const upsertSession = useCampaignStore((s) => s.upsertSession);
  const deleteSession = useCampaignStore((s) => s.deleteSession);
  // 'new' opens an empty form; a Session opens it for editing.
  const [editing, setEditing] = useState<Session | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Session | null>(null);

  const close = () => setEditing(null);

  const save = (session: Session) => {
    upsertSession(session);
    close();
  };

  const sessions = [...campaign.sessions].sort((a, b) => b.number - a.number);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Sessions</h1>
        <button className="button" type="button" onClick={() => setEditing('new')}>
          New session
        </button>
      </div>
      {sessions.length === 0 && <p className="page-sub">No sessions yet. Log the first one.</p>}

      {sessions.map((s) => (
        <Panel key={s.id} title={`#${s.number} ${s.title}`}>
          <p className="muted">{s.playedOn}</p>
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
          <div className="form-row">
            <button className="button" type="button" onClick={() => setEditing(s)}>
              Edit
            </button>
            <button className="button button--danger" type="button" onClick={() => setDeleting(s)}>
              Delete
            </button>
          </div>
        </Panel>
      ))}

      {editing && (
        <Dialog title={editing === 'new' ? 'New session' : 'Edit session'} onClose={close}>
          <SessionForm
            campaign={campaign}
            initial={editing === 'new' ? undefined : editing}
            onSave={save}
            onCancel={close}
          />
        </Dialog>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete session"
          message={`Delete session #${deleting.number} "${deleting.title}"? Its quests and NPCs are not affected.`}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            deleteSession(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
