import { useState } from 'react';
import { DomainError } from '@questkeeper/domain';
import { Dialog } from '@questkeeper/theme';
import { generatedToBlob, generatePortrait, type GeneratedPortrait, type PortraitKind } from '../../api/portraits';
import { useCampaignStore } from '../../store/campaignStore';

interface PortraitDialogProps {
  campaignId: string;
  kind: PortraitKind;
  id: string;
  initialPrompt: string;
  onClose: () => void;
}

/** Generates a preview from an editable prompt. Nothing is stored until the DM keeps the result. */
export function PortraitDialog({ campaignId, kind, id, initialPrompt, onClose }: PortraitDialogProps) {
  const setPortrait = useCampaignStore((s) => s.setPortrait);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [preview, setPreview] = useState<GeneratedPortrait | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      if (err instanceof DomainError) setError(err.message);
      else throw err;
    } finally {
      setBusy(false);
    }
  };

  const generate = () =>
    run(async () => {
      setPreview(await generatePortrait(campaignId, kind, id, prompt.trim()));
    });

  const keep = () =>
    run(async () => {
      if (!preview) return;
      await setPortrait(kind, id, generatedToBlob(preview));
      onClose();
    });

  return (
    <Dialog title="Generate portrait" onClose={onClose}>
      <div className="form">
        <label className="field">
          {kind === 'npcs' ? 'Describe the NPC' : 'Describe the character'}
          <textarea
            className="input"
            rows={3}
            maxLength={1000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        {preview && (
          <img
            className="portrait"
            src={`data:${preview.contentType};base64,${preview.data}`}
            alt="Generated portrait preview"
          />
        )}
        {busy && <p role="status">Working…</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-row">
          <button className="button" type="button" onClick={generate} disabled={busy || !prompt.trim()}>
            {preview ? 'Generate again' : 'Generate'}
          </button>
          {preview && (
            <>
              <button className="button" type="button" onClick={keep} disabled={busy}>
                Keep
              </button>
              <button className="button button--ghost" type="button" onClick={() => setPreview(null)} disabled={busy}>
                Discard
              </button>
            </>
          )}
          <button className="button button--ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
}
