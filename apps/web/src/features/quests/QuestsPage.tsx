import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { Panel, Tag } from '../../components/Panel';
import { dependentQuests, getNpc, sessionsForQuest } from '@questkeeper/domain';
import type { Quest } from '@questkeeper/domain';
import { useCampaign, useCampaignStore } from '../../store/campaignStore';
import { QuestForm } from './QuestForm';

export function QuestsPage() {
  const campaign = useCampaign();
  const upsertQuest = useCampaignStore((s) => s.upsertQuest);
  const upsertNpc = useCampaignStore((s) => s.upsertNpc);
  const deleteQuest = useCampaignStore((s) => s.deleteQuest);
  // 'new' opens an empty form; a Quest opens it for editing.
  const [editing, setEditing] = useState<Quest | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Quest | null>(null);

  const close = () => setEditing(null);

  const save = (quest: Quest) => {
    upsertQuest(quest);
    close();
  };

  const confirmMessage = (quest: Quest) => {
    const sessions = sessionsForQuest(campaign, quest.id).length;
    const dependents = dependentQuests(campaign, quest.id).length;
    return (
      `Delete "${quest.title}"?` +
      (sessions || dependents
        ? ` It will be removed from ${sessions} session(s) and from the prerequisites of ${dependents} quest(s).`
        : '')
    );
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Quests</h1>
        <button className="button" type="button" onClick={() => setEditing('new')}>
          New quest
        </button>
      </div>
      {campaign.quests.length === 0 && <p className="page-sub">No quests yet. Create the first one.</p>}

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
            <div className="form-row">
              <button className="button" type="button" onClick={() => setEditing(q)}>
                Edit
              </button>
              <button className="button button--danger" type="button" onClick={() => setDeleting(q)}>
                Delete
              </button>
            </div>
          </Panel>
        );
      })}

      {editing && (
        <Dialog title={editing === 'new' ? 'New quest' : 'Edit quest'} onClose={close}>
          <QuestForm
            campaign={campaign}
            initial={editing === 'new' ? undefined : editing}
            onSave={save}
            onCreateNpc={upsertNpc}
            onCancel={close}
          />
        </Dialog>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete quest"
          message={confirmMessage(deleting)}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            deleteQuest(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
