import { beforeEach, describe, expect, it } from 'vitest';

import {
  getBuildingFromRoom,
  getCanonicalBuildingList,
  normalizeBuildingName,
  setBuildingConfig
} from '../buildingUtils';

describe('buildingUtils', () => {
  beforeEach(() => {
    setBuildingConfig({
      version: 1,
      buildings: [
        {
          code: 'GOEBEL',
          displayName: 'Goebel',
          aliases: ['Goebel Building', 'GOEBEL BUILDING']
        },
        {
          code: 'MARY',
          displayName: 'Mary Gibbs Jones',
          aliases: ['Mary Gibbs Jones (FCS)', 'FCS']
        }
      ]
    });
  });

  it('normalizes building names using aliases', () => {
    expect(normalizeBuildingName('Goebel Building')).toBe('Goebel');
  });

  it('extracts buildings from room strings', () => {
    expect(getBuildingFromRoom('GOEBEL 101')).toBe('Goebel');
    expect(getBuildingFromRoom('Mary Gibbs Jones (FCS) 213')).toBe('Mary Gibbs Jones');
  });

  it('returns sorted canonical building list', () => {
    expect(getCanonicalBuildingList()).toEqual(['Goebel', 'Mary Gibbs Jones']);
  });
});
