import { newItemDraft, type ItemDraft } from './inventoryDraft';

interface InventoryFieldsProps {
  value: ItemDraft[];
  onChange: (next: ItemDraft[]) => void;
}

export function InventoryFields({ value, onChange }: InventoryFieldsProps) {
  const update = (id: string, patch: Partial<ItemDraft>) =>
    onChange(value.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  return (
    <fieldset className="field inventory-fields">
      <legend>Inventory</legend>
      {value.length === 0 && <p className="muted">No items yet.</p>}
      {value.map((d, i) => (
        <div key={d.id} className="inventory-row">
          <label className="field">
            Item {i + 1} name
            <input
              className="input"
              value={d.name}
              maxLength={80}
              onChange={(e) => update(d.id, { name: e.target.value })}
            />
          </label>
          <label className="field">
            Item {i + 1} quantity
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              value={d.quantity}
              onChange={(e) => update(d.id, { quantity: e.target.value })}
            />
          </label>
          <label className="field">
            Item {i + 1} notes
            <input className="input" value={d.notes} onChange={(e) => update(d.id, { notes: e.target.value })} />
          </label>
          <button
            className="button button--danger"
            type="button"
            aria-label={`Remove item ${i + 1}`}
            onClick={() => onChange(value.filter((x) => x.id !== d.id))}
          >
            Remove
          </button>
        </div>
      ))}
      <button className="button button--ghost" type="button" onClick={() => onChange([...value, newItemDraft()])}>
        Add item
      </button>
    </fieldset>
  );
}
