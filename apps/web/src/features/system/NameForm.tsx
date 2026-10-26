import { useState, type FormEvent } from 'react';
import { DomainError } from '@questkeeper/domain';
import type { RuleOption } from '@questkeeper/domain';

interface NameFormProps {
  noun: string;
  initial?: RuleOption;
  onSave: (option: RuleOption) => void | Promise<void>;
  onCancel: () => void;
}

export function NameForm({ noun, initial, onSave, onCancel }: NameFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setError('');
    setBusy(true);
    try {
      await onSave({ id: initial?.id ?? crypto.randomUUID(), name: name.trim() });
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
        {`Name of the ${noun}`}
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-row">
        <button className="button" type="submit" disabled={!name.trim() || busy}>
          {`Save ${noun}`}
        </button>
        <button className="button button--ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
