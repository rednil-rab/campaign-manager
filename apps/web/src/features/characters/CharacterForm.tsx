import { useState, type FormEvent } from 'react';
import { DomainError } from '@questkeeper/domain';
import type { Campaign, PlayerCharacter } from '@questkeeper/domain';
import { OptionPicker, fromPick, toPick } from './OptionPicker';
import { StatsFields } from './StatsFields';
import { fromDraft, toDraft } from './statsDraft';
import { InventoryFields } from './InventoryFields';
import { fromItemDrafts, toItemDrafts } from './inventoryDraft';

interface CharacterFormProps {
  campaign: Campaign;
  initial?: PlayerCharacter;
  onSave: (character: PlayerCharacter) => void | Promise<void>;
  onCancel: () => void;
}

export function CharacterForm({ campaign, initial, onSave, onCancel }: CharacterFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [player, setPlayer] = useState(initial?.player ?? '');
  const [race, setRace] = useState(() => toPick(initial?.raceId, initial?.race ?? ''));
  const [klass, setKlass] = useState(() => toPick(initial?.classId, initial?.characterClass ?? ''));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [stats, setStats] = useState(() => toDraft(initial?.stats));
  const [items, setItems] = useState(() => toItemDrafts(initial?.inventory));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setError('');
    setBusy(true);
    try {
      const r = fromPick(race);
      const k = fromPick(klass);
      await onSave({
        id: initial?.id ?? crypto.randomUUID(),
        name: name.trim(),
        player: player.trim(),
        raceId: r.id,
        race: r.text,
        classId: k.id,
        characterClass: k.text,
        notes: notes.trim(),
        playerNotes: initial?.playerNotes,
        stats: fromDraft(campaign.statDefinitions, stats),
        inventory: fromItemDrafts(items),
      });
    } catch (err) {
      if (err instanceof DomainError) setError(err.message);
      else throw err;
    } finally {
      setBusy(false);
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
      <InventoryFields value={items} onChange={setItems} />
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
        <button className="button" type="submit" disabled={!name.trim() || busy}>
          Save character
        </button>
        <button className="button button--ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
