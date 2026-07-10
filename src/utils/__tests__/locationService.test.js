import { beforeEach, describe, expect, it } from 'vitest';

import {
  LOCATION_TYPE,
  applyBuildingConfig,
  buildSpaceKey,
  normalizeSingleSpaceKey,
  normalizeBuildingConfig,
  parseRoomLabel,
  parseMultiRoom,
  resolveBuilding,
  splitMultiRoom
} from '../locationService';
import { extractScheduleRowBaseData } from '../importScheduleRowUtils';
import { standardizeSchedule } from '../hygieneCore';
import { resolveScheduleSpaces } from '../spaceUtils';

beforeEach(() => {
  const config = normalizeBuildingConfig({
    version: 1,
    buildings: [
      { code: 'GOEBEL', displayName: 'Goebel Building', aliases: ['Goebel'] },
      { code: 'MGBJ', displayName: 'Mary Gibbs Jones', aliases: [] }
    ]
  });
  applyBuildingConfig(config);
});

describe('locationService multi-room parsing', () => {
  it('builds valid space key even if building code has spaces', () => {
    const key = buildSpaceKey('GOEBEL BUILDING', '120');
    expect(key).toBe('GOEBEL_BUILDING:120');
  });
  it('splits slash-delimited room numbers with shared prefix', () => {
    expect(splitMultiRoom('FCS 211/213')).toEqual(['FCS 211', 'FCS 213']);
  });

  it('parses multiple room separators into space keys', () => {
    const parsed = parseMultiRoom('Goebel 101; Goebel 109 and Goebel 111');
    expect(parsed.rooms.length).toBe(3);
    expect(parsed.spaceKeys.length).toBe(3);
    expect(parsed.spaceKeys[0]).toMatch(/GOEBEL:101/i);
  });

  it('flags online locations as virtual', () => {
    const parsed = parseMultiRoom('ONLINE');
    expect(parsed.locationType).toBe(LOCATION_TYPE.VIRTUAL);
    expect(parsed.rooms.length).toBe(0);
  });

  it('retains physical rooms from mixed physical and virtual labels', () => {
    const parsed = parseMultiRoom('Goebel 101; ONLINE');
    expect(parsed.locationType).toBe(LOCATION_TYPE.PHYSICAL);
    expect(parsed.spaceKeys).toEqual(['GOEBEL:101']);
    expect(parsed.displayNames).toEqual(['Goebel Building 101']);
  });

  it('preserves hybrid room links through import standardization and display', () => {
    const base = extractScheduleRowBaseData({
      Course: 'TEST 1000',
      'Section #': '01',
      Term: 'Spring 2026',
      CRN: '12345',
      Instructor: 'Doe, Jane',
      Room: 'Goebel 101; ONLINE'
    });
    const standardized = standardizeSchedule(base);
    const display = resolveScheduleSpaces(
      standardized,
      new Map([
        [
          'GOEBEL:101',
          {
            id: 'GOEBEL:101',
            spaceKey: 'GOEBEL:101',
            buildingCode: 'GOEBEL',
            buildingDisplayName: 'Goebel Building',
            spaceNumber: '101',
            displayName: 'Goebel Building 101'
          }
        ]
      ])
    );

    expect(base).toEqual(
      expect.objectContaining({
        locationType: 'room',
        isOnline: true,
        spaceIds: ['GOEBEL:101']
      })
    );
    expect(standardized.locationType).toBe('room');
    expect(standardized.spaceIds).toEqual(['GOEBEL:101']);
    expect(display.display).toBe('Goebel Building 101; Online');
  });

  it('preserves all-virtual multi-part labels as virtual', () => {
    const parsed = parseMultiRoom('ONLINE; Zoom');
    expect(parsed.locationType).toBe(LOCATION_TYPE.VIRTUAL);
    expect(parsed.locationLabel).toBe('ONLINE; Zoom');
    expect(parsed.rooms).toEqual([]);
  });

  it('does not treat semicolon-delimited labels as one physical room', () => {
    const parsed = parseRoomLabel(
      'Goebel Building 109; Goebel Building 113',
    );
    expect(parsed?.locationType).toBe(LOCATION_TYPE.UNKNOWN);
    expect(parsed?.spaceKey).toBe('');
    expect(parsed?.parseError).toMatch(/multiple rooms detected/i);
  });

  it('normalizes single-room keys/labels and rejects multi-room labels', () => {
    expect(normalizeSingleSpaceKey('GOEBEL:109')).toBe('GOEBEL:109');
    expect(normalizeSingleSpaceKey('Goebel Building 109')).toBe('GOEBEL:109');
    expect(
      normalizeSingleSpaceKey('Goebel Building 109; Goebel Building 113'),
    ).toBe('');
  });
});

describe('locationService resolveBuilding', () => {
  it('resolves buildings with department codes in parentheses', () => {
    const config = normalizeBuildingConfig({
      version: 1,
      buildings: [{ code: 'GOEBEL', displayName: 'Goebel Building', aliases: [] }]
    });
    applyBuildingConfig(config);

    const resolved = resolveBuilding('Goebel Building (HSD)');
    expect(resolved?.code).toBe('GOEBEL');
  });

  it('resolves slugified building labels', () => {
    const config = normalizeBuildingConfig({
      version: 1,
      buildings: [{ code: 'MGBJ', displayName: 'Mary Gibbs Jones', aliases: [] }]
    });
    applyBuildingConfig(config);

    const resolved = resolveBuilding('MARY_GIBBS_JONES');
    expect(resolved?.code).toBe('MGBJ');
  });
});
