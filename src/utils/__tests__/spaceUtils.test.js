import { beforeEach, describe, expect, it } from 'vitest';

import { setBuildingConfig } from '../buildingUtils';
import {
  normalizeSpaceRecord,
  resolveOfficeLocation,
  resolveScheduleSpaces,
  resolveSpaceDisplayName
} from '../spaceUtils';

describe('spaceUtils', () => {
  beforeEach(() => {
    setBuildingConfig({
      version: 1,
      buildings: [
        {
          code: 'GOEBEL',
          displayName: 'Goebel',
          aliases: ['Goebel Building']
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
});
