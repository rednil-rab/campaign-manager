import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { DomainError, type PlayerView } from '@questkeeper/domain';
import { api, ApiError } from '../../api/client';
import { Panel, Tag } from '../../components/Panel';
import { InventoryFields } from '../characters/InventoryFields';
import { fromItemDrafts, toItemDrafts, type ItemDraft } from '../characters/inventoryDraft';

/** Public page opened from a share link; the token in the URL is the only credential. */
export function PlayerPage() {
  const { token = '' } = useParams();
  const [view, setView] = useState<PlayerView | null>(null);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const show = (v: PlayerView) => {
    setView(v);
    setItems(toItemDrafts(v.character.inventory));
    setNotes(v.character.playerNotes);
  };

  useEffect(() => {
    let cancelled = false;
    api<PlayerView>('GET', `/play/${encodeURIComponent(token)}`)
      .then((v) => {
        if (!cancelled) show(v);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setMissing(true);
        else if (err instanceof DomainError) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaved(false);
    setBusy(true);
    try {
      const inventory = fromItemDrafts(items);
      if (inventory.some((i) => !Number.isFinite(i.quantity) || i.quantity < 0)) {
        throw new DomainError('Quantities must be numbers of 0 or more');
      }
      show(await api<PlayerView>('PUT', `/play/${encodeURIComponent(token)}`, { inventory, playerNotes: notes }));
      setSaved(true);
    } catch (err) {
      if (err instanceof DomainError) setError(err.message);
      else throw err;
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <div className="picker">
        <h1 className="page-title">Questkeeper</h1>
        <Panel title="Link not valid">
          <p>This link is not valid or has been revoked. Ask your Dungeon Master for a new one.</p>
        </Panel>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="picker">
        <h1 className="page-title">Questkeeper</h1>
        <p className="error" role="alert">
          {loadError}
        </p>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="picker">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const { character } = view;
  return (
    <div className="picker">
      <h1 className="page-title">{character.name}</h1>
      <p className="page-sub">
        {view.campaignName}
        {character.player && <> · Played by {character.player}</>}
      </p>
      <Panel title="Character">
        <p>
          <Tag tone="cyan">{[character.race, character.characterClass].filter(Boolean).join(' ') || 'Adventurer'}</Tag>
        </p>
        {character.stats.length > 0 && (
          <dl className="abilities">
            {character.stats.map((s) => (
              <div key={s.id} className="abilities__item">
                <dt>{s.name}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Panel>
      <Panel title="Your inventory and notes">
        <form className="form" onSubmit={submit}>
          <InventoryFields value={items} onChange={setItems} />
          <label className="field">
            Your notes
            <textarea
              className="input"
              rows={6}
              maxLength={5000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {saved && <p role="status">Saved.</p>}
          <div className="form-row">
            <button className="button" type="submit" disabled={busy}>
              Save
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
