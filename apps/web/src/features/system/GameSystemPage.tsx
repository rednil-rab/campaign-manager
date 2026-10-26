import { countCharactersWithClass, countCharactersWithRace, countStatValues } from '@questkeeper/domain';
import { useCampaign, useCampaignStore } from '../../store/campaignStore';
import { DefinitionSection } from './DefinitionSection';

export function GameSystemPage() {
  const campaign = useCampaign();
  const upsertStatDefinition = useCampaignStore((s) => s.upsertStatDefinition);
  const deleteStatDefinition = useCampaignStore((s) => s.deleteStatDefinition);
  const upsertRace = useCampaignStore((s) => s.upsertRace);
  const deleteRace = useCampaignStore((s) => s.deleteRace);
  const upsertClass = useCampaignStore((s) => s.upsertClass);
  const deleteClass = useCampaignStore((s) => s.deleteClass);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Game System</h1>
      </div>
      <p className="page-sub">
        Define what your game uses. Stats appear on every character and NPC; races and classes become choices on the
        character form.
      </p>

      <DefinitionSection
        title="Stats"
        noun="stat"
        hint="For example Level, HP, AC, or any ability your game system uses."
        items={campaign.statDefinitions}
        onSave={upsertStatDefinition}
        onDelete={deleteStatDefinition}
        describeDelete={(d) => {
          const affected = countStatValues(campaign, d.id);
          return (
            `Delete the stat "${d.name}"?` +
            (affected ? ` Its value will be removed from ${affected} character(s) and NPC(s).` : '')
          );
        }}
      />

      <DefinitionSection
        title="Races"
        noun="race"
        hint="Characters can also use a custom race that isn't listed here."
        items={campaign.races}
        onSave={upsertRace}
        onDelete={deleteRace}
        describeDelete={(r) => {
          const affected = countCharactersWithRace(campaign, r.id);
          return (
            `Delete the race "${r.name}"?` +
            (affected ? ` ${affected} character(s) will keep "${r.name}" as a custom race.` : '')
          );
        }}
      />

      <DefinitionSection
        title="Classes"
        noun="class"
        hint="Characters can also use a custom class that isn't listed here."
        items={campaign.classes}
        onSave={upsertClass}
        onDelete={deleteClass}
        describeDelete={(o) => {
          const affected = countCharactersWithClass(campaign, o.id);
          return (
            `Delete the class "${o.name}"?` +
            (affected ? ` ${affected} character(s) will keep "${o.name}" as a custom class.` : '')
          );
        }}
      />
    </>
  );
}
