import { useState, type FormEvent } from 'react';
import { DomainError } from '../../domain/actions';
import type { Campaign, Id, Session } from '../../domain/types';

interface SessionFormProps {
  campaign: Campaign;
  initial?: Session;
  onSave: (session: Session) => void;
  onCancel: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

const nextNumber = (c: Campaign) => Math.max(0, ...c.sessions.map((s) => s.number)) + 1;

export function SessionForm({ campaign, initial, onSave, onCancel }: SessionFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [playedOn, setPlayedOn] = useState(initial?.playedOn ?? today());
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [questIds, setQuestIds] = useState<Id[]>(initial?.questIds ?? []);
  const [npcIds, setNpcIds] = useState<Id[]>(initial?.npcIds ?? []);
  const [characterIds, setCharacterIds] = useState<Id[]>(initial?.characterIds ?? []);
  const [error, setError] = useState('');

  const toggle = (setter: (fn: (cur: Id[]) => Id[]) => void, id: Id) =>
    setter((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      onSave({
        id: initial?.id ?? crypto.randomUUID(),
        number: initial?.number ?? nextNumber(campaign),
        title: title.trim(),
        playedOn,
        summary: summary.trim(),
        questIds,
        npcIds,
        characterIds,
      });
    } catch (err) {
      if (err instanceof DomainError) setError(err.message);
      else throw err;
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        Title
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
      </label>
      <label className="field">
        Date played
        <input className="input" type="date" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} required />
      </label>
      <label className="field">
        Summary
        <textarea className="input" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
      <fieldset className="field checks">
        <legend>Characters present</legend>
        {campaign.characters.length === 0 && <span className="muted">No characters in this campaign yet.</span>}
        {campaign.characters.map((p) => (
          <label key={p.id} className="check">
            <input
              type="checkbox"
              checked={characterIds.includes(p.id)}
              onChange={() => toggle(setCharacterIds, p.id)}
            />
            {p.name}
          </label>
        ))}
      </fieldset>
      <fieldset className="field checks">
        <legend>Quests</legend>
        {campaign.quests.length === 0 && <span className="muted">No quests in this campaign yet.</span>}
        {campaign.quests.map((q) => (
          <label key={q.id} className="check">
            <input type="checkbox" checked={questIds.includes(q.id)} onChange={() => toggle(setQuestIds, q.id)} />
            {q.title}
          </label>
        ))}
      </fieldset>
      <fieldset className="field checks">
        <legend>NPCs</legend>
        {campaign.npcs.length === 0 && <span className="muted">No NPCs in this campaign yet.</span>}
        {campaign.npcs.map((n) => (
          <label key={n.id} className="check">
            <input type="checkbox" checked={npcIds.includes(n.id)} onChange={() => toggle(setNpcIds, n.id)} />
            {n.name}
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
          Save session
        </button>
        <button className="button button--ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
