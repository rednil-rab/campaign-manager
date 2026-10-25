import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <p>{message}</p>
      <div className="form-row">
        <button className="button button--danger" type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button className="button button--ghost" type="button" autoFocus onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
