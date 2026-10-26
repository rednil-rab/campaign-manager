import type { InventoryItem } from '@questkeeper/domain';

/** Form state for an item: quantity is a string so the number input can be edited freely. */
export interface ItemDraft {
  id: string;
  name: string;
  quantity: string;
  notes: string;
}

export const toItemDrafts = (items: InventoryItem[] = []): ItemDraft[] =>
  items.map((i) => ({ ...i, quantity: String(i.quantity) }));

export const newItemDraft = (): ItemDraft => ({ id: crypto.randomUUID(), name: '', quantity: '1', notes: '' });

/** Rows with no name are dropped; an unparsable quantity becomes NaN so validation rejects it. */
export const fromItemDrafts = (drafts: ItemDraft[]): InventoryItem[] =>
  drafts
    .filter((d) => d.name.trim())
    .map((d) => ({
      id: d.id,
      name: d.name.trim(),
      quantity: d.quantity.trim() === '' ? NaN : Number(d.quantity),
      notes: d.notes.trim(),
    }));
