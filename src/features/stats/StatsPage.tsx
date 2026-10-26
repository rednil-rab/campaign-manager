import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { Panel } from '../../components/Panel';
import { countStatValues } from '../../domain/selectors';
import type { StatDefinition } from '../../domain/types';
import { useCampaign, useCampaignStore } from '../../store/campaignStore';
import { StatForm } from './StatForm';

export function StatsPage() {
  const campaign = useCampaign();
  const upsertStatDefinition = useCampaignStore((s) => s.upsertStatDefinition);
  const deleteStatDefinition = useCampaignStore((s) => s.deleteStatDefinition);
  // 'new' opens an empty form; a definition opens it for editing.
  const [editing, setEditing] = useState<StatDefinition | 'new' | null>(null);
  const [deleting, setDeleting] = useState<StatDefinition | null>(null);

  const close = () => setEditing(null);

  const save = (def: StatDefinition) => {
    upsertStatDefinition(def);
    close();
  };

  const confirmMessage = (def: StatDefinition) => {
    const affected = countStatValues(campaign, def.id);
    return (
      `Delete the stat "${def.name}"?` +
      (affected ? ` Its value will be removed from ${affected} character(s) and NPC(s).` : '')
    );
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Stats</h1>
        <button className="button" type="button" onClick={() => setEditing('new')}>
          New stat
        </button>
      </div>
      <p className="page-sub">
        Stats you define here appear on every character and NPC in this campaign, for example Level, HP, AC or any
        ability your game system uses.
      </p>
      {campaign.statDefinitions.length === 0 && <p className="page-sub">No stats yet. Define the first one.</p>}

      {campaign.statDefinitions.length > 0 && (
        <Panel>
          <ul className="list stat-list">
            {campaign.statDefinitions.map((d) => (
              <li key={d.id} className="stat-list__item">
                <span>{d.name}</span>
                <span className="form-row">
                  <button className="button" type="button" onClick={() => setEditing(d)}>
                    Rename
                  </button>
                  <button className="button button--danger" type="button" onClick={() => setDeleting(d)}>
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {editing && (
        <Dialog title={editing === 'new' ? 'New stat' : 'Rename stat'} onClose={close}>
          <StatForm initial={editing === 'new' ? undefined : editing} onSave={save} onCancel={close} />
        </Dialog>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete stat"
          message={confirmMessage(deleting)}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            deleteStatDefinition(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
