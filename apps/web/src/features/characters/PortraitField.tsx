import { useState, type ChangeEvent } from 'react';
import { DomainError } from '@questkeeper/domain';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { MAX_PORTRAIT_BYTES, PORTRAIT_TYPES, portraitUrl, type PortraitKind } from '../../api/portraits';
import { useCampaign, useCampaignStore } from '../../store/campaignStore';
import { PortraitDialog } from './PortraitDialog';

interface PortraitFieldProps {
  kind: PortraitKind;
  id: string;
  name: string;
  suggestedPrompt: string;
}

/** DM controls for one saved character's or NPC's portrait: generate, upload, replace and remove. */
export function PortraitField({ kind, id, name, suggestedPrompt }: PortraitFieldProps) {
  const campaign = useCampaign();
  const setPortrait = useCampaignStore((s) => s.setPortrait);
  const removePortrait = useCampaignStore((s) => s.removePortrait);
  const version = (kind === 'npcs' ? campaign.npcs : campaign.characters).find((x) => x.id === id)?.portraitVersion;
  const [generating, setGenerating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setError('');
    if (!PORTRAIT_TYPES.includes(file.type)) return setError('Choose a JPEG, PNG or WebP image');
    if (file.size > MAX_PORTRAIT_BYTES) return setError('The image must be 500 KB or smaller');
    setBusy(true);
    try {
      await setPortrait(kind, id, file);
    } catch (err) {
      if (err instanceof DomainError) setError(err.message);
      else throw err;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <span>Portrait</span>
      {version !== undefined && (
        <img className="portrait" src={portraitUrl(campaign.id, kind, id, version)} alt={`Portrait of ${name}`} />
      )}
      <div className="form-row">
        <button className="button" type="button" onClick={() => setGenerating(true)} disabled={busy}>
          Generate
        </button>
        {version !== undefined && (
          <button className="button button--danger" type="button" onClick={() => setRemoving(true)} disabled={busy}>
            Remove
          </button>
        )}
      </div>
      <label className="field">
        Upload your own image (JPEG, PNG or WebP, up to 500 KB)
        <input type="file" accept={PORTRAIT_TYPES.join(',')} onChange={upload} disabled={busy} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {generating && (
        <PortraitDialog
          campaignId={campaign.id}
          kind={kind}
          id={id}
          initialPrompt={suggestedPrompt}
          onClose={() => setGenerating(false)}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Remove portrait"
          message={`Remove the portrait of "${name}"?`}
          confirmLabel="Remove"
          onCancel={() => setRemoving(false)}
          onConfirm={async () => {
            await removePortrait(kind, id);
            setRemoving(false);
          }}
        />
      )}
    </div>
  );
}
