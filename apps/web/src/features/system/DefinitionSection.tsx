import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { Panel } from '../../components/Panel';
import type { RuleOption } from '@questkeeper/domain';
import { NameForm } from './NameForm';

interface DefinitionSectionProps {
  title: string;
  /** Singular lowercase name used in buttons and dialogs, e.g. "race". */
  noun: string;
  hint: string;
  items: RuleOption[];
  onSave: (item: RuleOption) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  describeDelete: (item: RuleOption) => string;
}

export function DefinitionSection({
  title,
  noun,
  hint,
  items,
  onSave,
  onDelete,
  describeDelete,
}: DefinitionSectionProps) {
  // 'new' opens an empty form; an item opens it for renaming.
  const [editing, setEditing] = useState<RuleOption | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RuleOption | null>(null);

  const close = () => setEditing(null);

  return (
    <Panel title={title}>
      <p className="muted">{hint}</p>
      {items.length === 0 ? (
        <p>{`No ${noun}s yet.`}</p>
      ) : (
        <ul className="list stat-list">
          {items.map((item) => (
            <li key={item.id} className="stat-list__item">
              <span>{item.name}</span>
              <span className="form-row">
                <button
                  className="button"
                  type="button"
                  aria-label={`Rename ${item.name}`}
                  onClick={() => setEditing(item)}
                >
                  Rename
                </button>
                <button
                  className="button button--danger"
                  type="button"
                  aria-label={`Delete ${item.name}`}
                  onClick={() => setDeleting(item)}
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="form-row">
        <button className="button" type="button" onClick={() => setEditing('new')}>
          {`New ${noun}`}
        </button>
      </div>

      {editing && (
        <Dialog title={editing === 'new' ? `New ${noun}` : `Rename ${noun}`} onClose={close}>
          <NameForm
            noun={noun}
            initial={editing === 'new' ? undefined : editing}
            onSave={async (item) => {
              await onSave(item);
              close();
            }}
            onCancel={close}
          />
        </Dialog>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${noun}`}
          message={describeDelete(deleting)}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await onDelete(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </Panel>
  );
}
