import { describe, expect, it } from 'vitest';
import { ashenCrown } from './ashenCrown';
import {
  addCampaign,
  emptyCampaign,
  libraryOf,
  parseStoredLibrary,
  removeCampaign,
  renameCampaign,
  setActiveCampaign,
} from './library';

describe('library', () => {
  const lib = libraryOf(ashenCrown);

  it('adds an empty campaign and makes it active', () => {
    const next = addCampaign(lib, emptyCampaign('c2', 'Second'));
    expect(next.order).toEqual(['ashen-crown', 'c2']);
    expect(next.activeCampaignId).toBe('c2');
    expect(next.campaigns.c2.quests).toEqual([]);
    expect(next.campaigns.c2.sessions).toEqual([]);
    expect(next.campaigns.c2.npcs).toEqual([]);
  });

  it('renames without touching other campaigns', () => {
    const next = renameCampaign(addCampaign(lib, emptyCampaign('c2', 'Second')), 'c2', 'Renamed');
    expect(next.campaigns.c2.name).toBe('Renamed');
    expect(next.campaigns['ashen-crown']).toBe(ashenCrown);
  });

  it('falls back to another campaign when the active one is removed', () => {
    const two = addCampaign(lib, emptyCampaign('c2', 'Second'));
    const next = removeCampaign(two, 'c2');
    expect(next.activeCampaignId).toBe('ashen-crown');
    expect(next.campaigns.c2).toBeUndefined();
  });

  it('allows removing the last campaign', () => {
    const next = removeCampaign(lib, 'ashen-crown');
    expect(next.order).toEqual([]);
    expect(next.activeCampaignId).toBeNull();
  });

  it('ignores unknown ids', () => {
    expect(setActiveCampaign(lib, 'nope')).toBe(lib);
    expect(removeCampaign(lib, 'nope')).toBe(lib);
  });
});

describe('parseStoredLibrary', () => {
  it('migrates v1 single-campaign data', () => {
    const parsed = parseStoredLibrary({ campaign: ashenCrown });
    expect(parsed?.order).toEqual(['ashen-crown']);
    expect(parsed?.activeCampaignId).toBe('ashen-crown');
  });

  it('repairs a v2 library with a bad active id and missing order entries', () => {
    const parsed = parseStoredLibrary({
      campaigns: { 'ashen-crown': ashenCrown, junk: { id: 'junk' } },
      order: ['ghost'],
      activeCampaignId: 'ghost',
    });
    expect(parsed?.order).toEqual(['ashen-crown']);
    expect(parsed?.activeCampaignId).toBe('ashen-crown');
    expect(parsed?.campaigns.junk).toBeUndefined();
  });

  it('rejects unusable data', () => {
    expect(parseStoredLibrary(null)).toBeNull();
    expect(parseStoredLibrary({ foo: 1 })).toBeNull();
  });
});
