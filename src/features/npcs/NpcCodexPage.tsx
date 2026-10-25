import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { Panel, Tag } from '../../components/Panel';
import { questsForNpc, sessionsForNpc } from '../../domain/selectors';
import type { Npc } from '../../domain/types';
import { useCampaign, useCampaignStore } from '../../store/campaignStore';
import { NpcForm } from './NpcForm';

export function NpcCodexPage() {
  const campaign = useCampaign();
  const upsertNpc = useCampaignStore((s) => s.upsertNpc);
  const deleteNpc = useCampaignStore((s) => s.deleteNpc);
  // 'new' opens an empty form; an Npc opens it for editing.
  const [editing, setEditing] = useState<Npc | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Npc | null>(null);

  const close = () => setEditing(null);

  const save = (npc: Npc) => {
    upsertNpc(npc);
    close();
  };

  const confirmMessage = (npc: Npc) => {
    const sessions = sessionsForNpc(campaign, npc.id).length;
    const quests = questsForNpc(campaign, npc.id).length;
    return (
      `Delete "${npc.name}"?` +
      (sessions || quests
        ? ` They will be removed from ${sessions} session(s) and will no longer be the giver of ${quests} quest(s).`
        : '')
    );
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">NPC Codex</h1>
        <button className="button" type="button" onClick={() => setEditing('new')}>
          New NPC
        </button>
      </div>
      {campaign.npcs.length === 0 && <p className="page-sub">No NPCs yet. Create the first one.</p>}

      {campaign.npcs.map((n) => (
        <Panel key={n.id} title={n.name}>
          <p>
            <Tag tone="cyan">{n.disposition}</Tag> {n.role}
            {n.role && n.location && ' · '}
            {n.location}
          </p>
          <p>{n.description}</p>
          <p>
            Quests: {questsForNpc(campaign, n.id).map((q) => q.title).join(', ') || '—'} · Sessions:{' '}
            {sessionsForNpc(campaign, n.id).map((s) => s.number).join(', ') || '—'}
          </p>
          <div className="form-row">
            <button className="button" type="button" onClick={() => setEditing(n)}>
              Edit
            </button>
            <button className="button button--danger" type="button" onClick={() => setDeleting(n)}>
              Delete
            </button>
          </div>
        </Panel>
      ))}

      {editing && (
        <Dialog title={editing === 'new' ? 'New NPC' : 'Edit NPC'} onClose={close}>
          <NpcForm initial={editing === 'new' ? undefined : editing} onSave={save} onCancel={close} />
        </Dialog>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete NPC"
          message={confirmMessage(deleting)}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            deleteNpc(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
