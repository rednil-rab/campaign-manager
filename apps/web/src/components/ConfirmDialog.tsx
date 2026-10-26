import { useState } from 'react';
import { DomainError } from '@questkeeper/domain';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  /** May be async. If it throws a DomainError the dialog stays open and shows the message. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      if (err instanceof DomainError) setError(err.message);
      else throw err;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={title} onClose={onCancel}>
      <p>{message}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-row">
        <button className="button button--danger" type="button" disabled={busy} onClick={confirm}>
          {confirmLabel}
        </button>
        {/* Focus the safe action first in a destructive dialog. */}
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <button className="button button--ghost" type="button" autoFocus onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
