import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { Panel, Tag } from '../../components/Panel';
import { classLabel, raceLabel, sessionsForCharacter } from '../../domain/selectors';
import type { PlayerCharacter } from '../../domain/types';
import { useCampaign, useCampaignStore } from '../../store/campaignStore';
import { CharacterForm } from './CharacterForm';
import { StatBlockView } from './StatBlockView';

export function CharactersPage() {
  const campaign = useCampaign();
  const upsertCharacter = useCampaignStore((s) => s.upsertCharacter);
  const deleteCharacter = useCampaignStore((s) => s.deleteCharacter);
  // 'new' opens an empty form; a character opens it for editing.
  const [editing, setEditing] = useState<PlayerCharacter | 'new' | null>(null);
  const [deleting, setDeleting] = useState<PlayerCharacter | null>(null);

  const close = () => setEditing(null);

  const save = (character: PlayerCharacter) => {
    upsertCharacter(character);
    close();
  };

  const confirmMessage = (p: PlayerCharacter) => {
    const sessions = sessionsForCharacter(campaign, p.id).length;
    return (
      `Delete "${p.name}"?` +
      (sessions ? ` They will be removed from the attendance of ${sessions} session(s).` : '')
    );
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Characters</h1>
        <button className="button" type="button" onClick={() => setEditing('new')}>
          New character
        </button>
      </div>
      {campaign.characters.length === 0 && <p className="page-sub">No characters yet. Add the first one.</p>}

      {campaign.characters.map((p) => (
        <Panel key={p.id} title={p.name}>
          <p>
            <Tag tone="cyan">
              {[raceLabel(campaign, p), classLabel(campaign, p)].filter(Boolean).join(' ') || 'Adventurer'}
            </Tag>
            {p.player && <> Played by {p.player}</>}
          </p>
          <StatBlockView campaign={campaign} stats={p.stats} />
          {p.notes && <p>{p.notes}</p>}
          <p>Sessions: {sessionsForCharacter(campaign, p.id).map((s) => s.number).join(', ') || '—'}</p>
          <div className="form-row">
            <button className="button" type="button" onClick={() => setEditing(p)}>
              Edit
            </button>
            <button className="button button--danger" type="button" onClick={() => setDeleting(p)}>
              Delete
            </button>
          </div>
        </Panel>
      ))}

      {editing && (
        <Dialog title={editing === 'new' ? 'New character' : 'Edit character'} onClose={close}>
          <CharacterForm
            campaign={campaign}
            initial={editing === 'new' ? undefined : editing}
            onSave={save}
            onCancel={close}
          />
        </Dialog>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete character"
          message={confirmMessage(deleting)}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            deleteCharacter(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
