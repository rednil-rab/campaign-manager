import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { DomainError } from '@questkeeper/domain';
import type { Campaign, Id, Npc, Quest, QuestStatus } from '@questkeeper/domain';
import { NpcForm } from '../npcs/NpcForm';

const statuses: QuestStatus[] = ['active', 'dormant', 'completed', 'failed'];
const NEW_NPC = '__new__';

interface QuestFormProps {
  campaign: Campaign;
  initial?: Quest;
  onSave: (quest: Quest) => void;
  onCreateNpc: (npc: Npc) => void;
  onCancel: () => void;
}

export function QuestForm({ campaign, initial, onSave, onCreateNpc, onCancel }: QuestFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [status, setStatus] = useState<QuestStatus>(initial?.status ?? 'active');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [giverNpcId, setGiverNpcId] = useState<Id>(initial?.giverNpcId ?? '');
  const [prereqs, setPrereqs] = useState<Id[]>(initial?.prerequisiteQuestIds ?? []);
  const [creatingNpc, setCreatingNpc] = useState(false);
  const [error, setError] = useState('');

  const otherQuests = campaign.quests.filter((q) => q.id !== initial?.id);

  const togglePrereq = (id: Id) =>
    setPrereqs((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const onGiverChange = (value: string) => {
    if (value === NEW_NPC) setCreatingNpc(true);
    else setGiverNpcId(value);
  };

  const saveNewNpc = (npc: Npc) => {
    onCreateNpc(npc);
    setGiverNpcId(npc.id);
    setCreatingNpc(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      onSave({
        id: initial?.id ?? crypto.randomUUID(),
        title: title.trim(),
        status,
        description: description.trim(),
        giverNpcId: giverNpcId || undefined,
        prerequisiteQuestIds: prereqs,
      });
    } catch (err) {
      if (err instanceof DomainError) setError(err.message);
      else throw err;
    }
  };

  return (
    <>
      <form className="form" onSubmit={submit}>
        <label className="field">
          Title
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
        </label>
        <label className="field">
          Status
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as QuestStatus)}>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Quest giver
          <select className="input" value={giverNpcId} onChange={(e) => onGiverChange(e.target.value)}>
            <option value="">None</option>
            {campaign.npcs.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
            <option value={NEW_NPC}>+ Create new NPC…</option>
          </select>
        </label>
        <label className="field">
          Description
          <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <fieldset className="field checks">
          <legend>Requires</legend>
          {otherQuests.length === 0 && <span className="muted">No other quests yet.</span>}
          {otherQuests.map((q) => (
            <label key={q.id} className="check">
              <input type="checkbox" checked={prereqs.includes(q.id)} onChange={() => togglePrereq(q.id)} />
              {q.title}
            </label>
          ))}
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-row">
          <button className="button" type="submit" disabled={!title.trim()}>
            Save quest
          </button>
          <button className="button button--ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>

      {creatingNpc && (
        <Dialog title="New NPC" onClose={() => setCreatingNpc(false)}>
          <NpcForm campaign={campaign} onSave={saveNewNpc} onCancel={() => setCreatingNpc(false)} />
        </Dialog>
      )}
    </>
  );
}
