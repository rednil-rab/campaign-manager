import { useState, type FormEvent } from 'react';
import { DomainError } from '../../domain/actions';
import type { Campaign, PlayerCharacter } from '../../domain/types';
import { OptionPicker, fromPick, toPick } from './OptionPicker';
import { StatsFields } from './StatsFields';
import { fromDraft, toDraft } from './statsDraft';

interface CharacterFormProps {
  campaign: Campaign;
  initial?: PlayerCharacter;
  onSave: (character: PlayerCharacter) => void;
  onCancel: () => void;
}

export function CharacterForm({ campaign, initial, onSave, onCancel }: CharacterFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [player, setPlayer] = useState(initial?.player ?? '');
  const [race, setRace] = useState(() => toPick(initial?.raceId, initial?.race ?? ''));
  const [klass, setKlass] = useState(() => toPick(initial?.classId, initial?.characterClass ?? ''));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [stats, setStats] = useState(() => toDraft(initial?.stats));
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const r = fromPick(race);
      const k = fromPick(klass);
      onSave({
        id: initial?.id ?? crypto.randomUUID(),
        name: name.trim(),
        player: player.trim(),
        raceId: r.id,
        race: r.text,
        classId: k.id,
        characterClass: k.text,
        notes: notes.trim(),
        stats: fromDraft(campaign.statDefinitions, stats),
      });
    } catch (err) {
      if (err instanceof DomainError) setError(err.message);
      else throw err;
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        Character name
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      </label>
      <label className="field">
        Player
        <input className="input" value={player} onChange={(e) => setPlayer(e.target.value)} maxLength={80} />
      </label>
      <OptionPicker label="Race" options={campaign.races} value={race} onChange={setRace} />
      <OptionPicker label="Class" options={campaign.classes} value={klass} onChange={setKlass} />
      <StatsFields definitions={campaign.statDefinitions} value={stats} onChange={setStats} />
      <label className="field">
        Notes
        <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-row">
        <button className="button" type="submit" disabled={!name.trim()}>
          Save character
        </button>
        <button className="button button--ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
