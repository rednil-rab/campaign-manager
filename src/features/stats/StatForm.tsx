import { useState, type FormEvent } from 'react';
import { DomainError } from '../../domain/actions';
import type { StatDefinition } from '../../domain/types';

interface StatFormProps {
  initial?: StatDefinition;
  onSave: (def: StatDefinition) => void;
  onCancel: () => void;
}

export function StatForm({ initial, onSave, onCancel }: StatFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      onSave({ id: initial?.id ?? crypto.randomUUID(), name: name.trim() });
    } catch (err) {
      if (err instanceof DomainError) setError(err.message);
      else throw err;
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        Stat name
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-row">
        <button className="button" type="submit" disabled={!name.trim()}>
          Save stat
        </button>
        <button className="button button--ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
