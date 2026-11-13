import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';
import { DomainError, type PlayerPage as PlayerPageData } from '@questkeeper/domain';
import { api, ApiError } from '../../api/client';
import { Panel, Tag } from '../../components/Panel';
import { InventoryFields } from '../characters/InventoryFields';
import { fromItemDrafts, toItemDrafts, type ItemDraft } from '../characters/inventoryDraft';
import { JournalView } from './JournalView';

type Tab = 'character' | 'journal';
const TABS: { id: Tab; label: string }[] = [
  { id: 'character', label: 'Character' },
  { id: 'journal', label: 'Journal' },
];

/** Public page opened from a share link; the token in the URL is the only credential. */
export function PlayerPage() {
  const { token = '' } = useParams();
  const [view, setView] = useState<PlayerPageData | null>(null);
  const [tab, setTab] = useState<Tab>('character');
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadedToken, setLoadedToken] = useState('');
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const draftBaseline = useRef<{ items: ItemDraft[]; notes: string } | null>(null);
  const itemsDirty = useRef(false);
  const notesDirty = useRef(false);

  const show = (v: PlayerPageData) => {
    setView(v);
    const nextItems = toItemDrafts(v.character.inventory);
    setItems(nextItems);
    setNotes(v.character.playerNotes);
    draftBaseline.current = { items: nextItems, notes: v.character.playerNotes };
    itemsDirty.current = false;
    notesDirty.current = false;
  };

  const changeItems = (next: ItemDraft[]) => {
    setItems(next);
    const baseline = draftBaseline.current;
    itemsDirty.current = !!baseline && JSON.stringify(next) !== JSON.stringify(baseline.items);
  };

  const changeNotes = (next: string) => {
    setNotes(next);
    notesDirty.current = !!draftBaseline.current && next !== draftBaseline.current.notes;
  };

  useEffect(() => {
    let cancelled = false;
    let refreshing = false;
    let hasLoaded = false;
    let revoked = false;
    let source: EventSource | null = null;
    draftBaseline.current = null;
    itemsDirty.current = false;
    notesDirty.current = false;
    const refresh = async () => {
      if (cancelled || revoked || refreshing || document.visibilityState === 'hidden') return;
      refreshing = true;
      try {
        const v = await api<PlayerPageData>('GET', `/play/${encodeURIComponent(token)}`);
        if (cancelled || revoked) return;
        const nextItems = toItemDrafts(v.character.inventory);
        setView(v);
        if (!itemsDirty.current) setItems(nextItems);
        if (!notesDirty.current) setNotes(v.character.playerNotes);
        draftBaseline.current = { items: nextItems, notes: v.character.playerNotes };
        setMissing(false);
        setLoadError('');
        setRefreshError(false);
        setLoadedToken(token);
        hasLoaded = true;
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          revoked = true;
          setMissing(true);
          setLoadedToken(token);
          source?.close();
        }
        else if (err instanceof DomainError && draftBaseline.current) setRefreshError(true);
        else if (err instanceof DomainError) {
          setLoadError(err.message);
          setLoadedToken(token);
        }
        else throw err;
      } finally {
        refreshing = false;
      }
    };
    source = new EventSource(`/api/play/${encodeURIComponent(token)}/events`);
    source.addEventListener('update', () => void refresh());
    source.addEventListener('revoked', () => {
      revoked = true;
      setMissing(true);
      setLoadedToken(token);
      source?.close();
    });
    source.onopen = () => setRefreshError(false);
    source.onerror = () => {
      if (hasLoaded) setRefreshError(true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    void refresh();
    return () => {
      cancelled = true;
      source?.close();
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
      show(await api<PlayerPageData>('PUT', `/play/${encodeURIComponent(token)}`, { inventory, playerNotes: notes }));
      setSaved(true);
    } catch (err) {
      if (err instanceof DomainError) setError(err.message);
      else throw err;
    } finally {
      setBusy(false);
    }
  };

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = TABS[(TABS.findIndex((t) => t.id === tab) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  if (loadedToken === token && missing) {
    return (
      <div className="picker">
        <h1 className="page-title">Questkeeper</h1>
        <Panel title="Link not valid">
          <p>This link is not valid or has been revoked. Ask your Dungeon Master for a new one.</p>
        </Panel>
      </div>
    );
  }
  if (loadedToken === token && loadError) {
    return (
      <div className="picker">
        <h1 className="page-title">Questkeeper</h1>
        <p className="error" role="alert">
          {loadError}
        </p>
      </div>
    );
  }
  if (loadedToken !== token || !view) {
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
      <div className="tabs" role="tablist" aria-label="Player page sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            className="tabs__tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={onTabKeyDown}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Both panels stay mounted so unsaved inventory and notes survive switching tabs. */}
      <div id="panel-character" role="tabpanel" aria-labelledby="tab-character" hidden={tab !== 'character'}>
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
            <InventoryFields value={items} onChange={changeItems} />
            <label className="field">
              Your notes
              <textarea
                className="input"
                rows={6}
                maxLength={5000}
                value={notes}
                onChange={(e) => changeNotes(e.target.value)}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {saved && <p role="status">Saved.</p>}
            {refreshError && (
              <p className="muted" role="status">
                Live updates are temporarily unavailable. Retrying…
              </p>
            )}
            <div className="form-row">
              <button className="button" type="submit" disabled={busy}>
                Save
              </button>
            </div>
          </form>
        </Panel>
      </div>
      <div id="panel-journal" role="tabpanel" aria-labelledby="tab-journal" hidden={tab !== 'journal'}>
        <JournalView quests={view.quests ?? []} npcs={view.npcs ?? []} />
      </div>
    </div>
  );
}
