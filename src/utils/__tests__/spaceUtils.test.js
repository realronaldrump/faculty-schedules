import { beforeEach, describe, expect, it } from 'vitest';

import { applyBuildingConfig } from '../locationService';
import {
  normalizeSpaceRecord,
  resolveOfficeLocation,
  resolveOfficeLocations,
  resolveScheduleSpaces,
  resolveSpaceDisplayName
} from '../spaceUtils';

describe('spaceUtils', () => {
  beforeEach(() => {
    applyBuildingConfig({
      version: 1,
      buildings: [
        {
          code: 'GOEBEL',
          displayName: 'Goebel',
          aliases: ['Goebel Building']
        },
        {
          code: 'JONES',
          displayName: 'Jones',
          aliases: ['Jones Hall']
        }
      ]
    });
  });

  it('normalizes space records into canonical keys', () => {
    const normalized = normalizeSpaceRecord({
      buildingCode: 'goebel',
      spaceNumber: ' 101 ',
      displayName: ''
    }, '');

    expect(normalized.spaceKey).toBe('GOEBEL:101');
    expect(normalized.buildingCode).toBe('GOEBEL');
    expect(normalized.spaceNumber).toBe('101');
    expect(normalized.displayName).toBe('Goebel 101');
  });

  it('resolves display names from spaceIds', () => {
    const space = normalizeSpaceRecord({
      buildingCode: 'GOEBEL',
      spaceNumber: '101',
      displayName: ''
    }, 'GOEBEL:101');
    const spacesByKey = new Map([[space.spaceKey, space]]);

    const schedule = {
      spaceIds: ['GOEBEL:101'],
      spaceDisplayNames: ['Old Name'],
      locationType: 'room'
    };

    const resolved = resolveScheduleSpaces(schedule, spacesByKey);
    expect(resolved.display).toBe('Goebel 101');
  });

  it('falls back to formatted names when space is missing', () => {
    const name = resolveSpaceDisplayName('GOEBEL:200', new Map());
    expect(name).toBe('Goebel 200');
  });

  it('resolves office locations from officeSpaceId', () => {
    const space = normalizeSpaceRecord({
      buildingCode: 'GOEBEL',
      spaceNumber: '201',
      displayName: ''
    }, 'GOEBEL:201');
    const spacesByKey = new Map([[space.spaceKey, space]]);
    const resolved = resolveOfficeLocation({ officeSpaceId: 'GOEBEL:201' }, spacesByKey);

    expect(resolved.spaceKey).toBe('GOEBEL:201');
    expect(resolved.displayName).toBe('Goebel 201');
  });

  // Multiple offices tests
  describe('resolveOfficeLocations', () => {
    it('returns an array of office locations from officeSpaceIds', () => {
      const space1 = normalizeSpaceRecord({ buildingCode: 'GOEBEL', spaceNumber: '101' }, 'GOEBEL:101');
      const space2 = normalizeSpaceRecord({ buildingCode: 'JONES', spaceNumber: '205' }, 'JONES:205');
      const spacesByKey = new Map([
        [space1.spaceKey, space1],
        [space2.spaceKey, space2]
      ]);

      const person = {
        officeSpaceIds: ['GOEBEL:101', 'JONES:205'],
        offices: ['Goebel 101', 'Jones 205']
      };

      const result = resolveOfficeLocations(person, spacesByKey);
      expect(result).toHaveLength(2);
      expect(result[0].spaceKey).toBe('GOEBEL:101');
      expect(result[1].spaceKey).toBe('JONES:205');
    });

    it('supports singular officeSpaceId', () => {
      const space = normalizeSpaceRecord({ buildingCode: 'GOEBEL', spaceNumber: '101' }, 'GOEBEL:101');
      const spacesByKey = new Map([[space.spaceKey, space]]);

      const person = {
        officeSpaceId: 'GOEBEL:101',
        office: 'Goebel 101'
      };

      const result = resolveOfficeLocations(person, spacesByKey);
      expect(result).toHaveLength(1);
      expect(result[0].spaceKey).toBe('GOEBEL:101');
    });

    it('returns empty array for person with no office', () => {
      const result = resolveOfficeLocations({ hasNoOffice: true }, new Map());
      expect(result).toEqual([]);
    });

    it('resolveOfficeLocation returns first office', () => {
      const space1 = normalizeSpaceRecord({ buildingCode: 'GOEBEL', spaceNumber: '101' }, 'GOEBEL:101');
      const space2 = normalizeSpaceRecord({ buildingCode: 'JONES', spaceNumber: '205' }, 'JONES:205');
      const spacesByKey = new Map([
        [space1.spaceKey, space1],
        [space2.spaceKey, space2]
      ]);

      const person = {
        officeSpaceIds: ['GOEBEL:101', 'JONES:205'],
        offices: ['Goebel 101', 'Jones 205']
      };

      const result = resolveOfficeLocation(person, spacesByKey);
      expect(result.spaceKey).toBe('GOEBEL:101');
    });
  });
});
