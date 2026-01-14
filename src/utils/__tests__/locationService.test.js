import { describe, expect, it } from 'vitest';

import { LOCATION_TYPE, parseMultiRoom, splitMultiRoom } from '../locationService';

describe('locationService multi-room parsing', () => {
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
});
