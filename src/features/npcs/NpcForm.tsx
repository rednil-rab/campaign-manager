import { useState, type FormEvent } from 'react';
import type { Npc, NpcDisposition } from '../../domain/types';

const dispositions: NpcDisposition[] = ['ally', 'neutral', 'hostile', 'unknown'];

interface NpcFormProps {
  initial?: Npc;
  onSave: (npc: Npc) => void;
  onCancel: () => void;
}

export function NpcForm({ initial, onSave, onCancel }: NpcFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState(initial?.role ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [disposition, setDisposition] = useState<NpcDisposition>(initial?.disposition ?? 'unknown');
  const [description, setDescription] = useState(initial?.description ?? '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      role: role.trim(),
      location: location.trim(),
      disposition,
      description: description.trim(),
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        Name
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      </label>
      <label className="field">
        Role
        <input className="input" value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} />
      </label>
      <label className="field">
        Location
        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={80} />
      </label>
      <label className="field">
        Disposition
        <select
          className="input"
          value={disposition}
          onChange={(e) => setDisposition(e.target.value as NpcDisposition)}
        >
          {dispositions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Description
        <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="form-row">
        <button className="button" type="submit" disabled={!name.trim()}>
          Save NPC
        </button>
        <button className="button button--ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
