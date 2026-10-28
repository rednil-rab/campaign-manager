import { useEffect, useState } from 'react';
import { DomainError } from '@questkeeper/domain';
import type { PlayerCharacter } from '@questkeeper/domain';
import { createShare, playerLink, revokeShare, listShares } from '../../api/shares';
import { Dialog } from '../../components/Dialog';

interface ShareDialogProps {
  campaignId: string;
  character: PlayerCharacter;
  onClose: () => void;
}

export function ShareDialog({ campaignId, character, onClose }: ShareDialogProps) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const run = async (action: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (err) {
      if (err instanceof DomainError) setError(err.message);
      else throw err;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    listShares(campaignId)
      .then((shares) => {
        if (!cancelled) setToken(shares.find((s) => s.characterId === character.id)?.token ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled && err instanceof DomainError) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, character.id]);

  const create = () =>
    run(async () => {
      setToken((await createShare(campaignId, character.id)).token);
      setCopied(false);
    });

  const revoke = () =>
    run(async () => {
      await revokeShare(campaignId, character.id);
      setToken(null);
    });

  const copy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(playerLink(token));
      setCopied(true);
    } catch {
      setError('Could not copy automatically. Select the link and copy it.');
    }
  };

  return (
    <Dialog title={`Player link for ${character.name}`} onClose={onClose}>
      <div className="form">
        <p className="muted">
          Anyone with this link can view this character&apos;s sheet and edit its inventory and player notes, without
          signing in. They never see your private notes or the rest of the campaign.
        </p>
        {loading && <p className="muted">Loading…</p>}
        {!loading && token && (
          <label className="field">
            Link
            <input className="input" readOnly value={playerLink(token)} onFocus={(e) => e.currentTarget.select()} />
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-row">
          {!loading && !token && (
            <button className="button" type="button" disabled={busy} onClick={create}>
              Create link
            </button>
          )}
          {token && (
            <>
              <button className="button" type="button" onClick={copy}>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button className="button button--ghost" type="button" disabled={busy} onClick={create}>
                Regenerate
              </button>
              <button className="button button--danger" type="button" disabled={busy} onClick={revoke}>
                Revoke
              </button>
            </>
          )}
          <button className="button button--ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {token && <p className="muted">Regenerating or revoking makes the old link stop working immediately.</p>}
      </div>
    </Dialog>
  );
}
