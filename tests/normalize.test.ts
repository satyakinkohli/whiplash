import { describe, it, expect } from 'vitest';
import {
  normalizeCity,
  normalizeArtist,
  normalizeVenue,
  splitArtists,
  parseDate,
} from '../src/normalize.js';

describe('normalizeCity', () => {
  it('maps known aliases', () => {
    expect(normalizeCity('Mumbai')).toBe('mumbai');
    expect(normalizeCity('Bombay')).toBe('mumbai');
    expect(normalizeCity('New Delhi')).toBe('delhi');
    expect(normalizeCity('Bangalore')).toBe('bengaluru');
    expect(normalizeCity('Bengaluru')).toBe('bengaluru');
    expect(normalizeCity('Gurgaon')).toBe('gurugram');
  });

  it('returns null for out-of-scope cities', () => {
    expect(normalizeCity('Pune')).toBeNull();
    expect(normalizeCity('')).toBeNull();
  });
});

describe('normalizeArtist', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeArtist('BLACKSTRATBLUES')).toBe('blackstratblues');
    expect(normalizeArtist('Hari & Sukhmani')).toBe('hari sukhmani');
  });
  it('strips leading "the "', () => {
    expect(normalizeArtist('The Beatles')).toBe('beatles');
  });
  it('collapses whitespace', () => {
    expect(normalizeArtist('  Yo  Yo   Honey Singh ')).toBe('yo yo honey singh');
  });
});

describe('splitArtists', () => {
  it('splits on commas and slashes', () => {
    expect(splitArtists('Obscura, DVRK')).toEqual(['Obscura', 'DVRK']);
    expect(splitArtists('Godless / Ksetravid / Septic Isle')).toEqual([
      'Godless',
      'Ksetravid',
      'Septic Isle',
    ]);
  });
  it('does not split on "&" inside a single act name', () => {
    expect(splitArtists('Hari & Sukhmani')).toEqual(['Hari & Sukhmani']);
  });
  it('splits on feat./ft./with', () => {
    expect(splitArtists('Alemay Fernandez ft. Sharik Hasan')).toEqual([
      'Alemay Fernandez',
      'Sharik Hasan',
    ]);
  });
  it('strips parentheticals', () => {
    expect(splitArtists('Obscura, DVRK (Sun Eater Tour 2026)')).toEqual([
      'Obscura',
      'DVRK',
    ]);
  });
});

describe('normalizeVenue', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeVenue('Tata Theatre, NCPA')).toBe('tata theatre ncpa');
    expect(normalizeVenue('antiSOCIAL Lower Parel')).toBe('antisocial lower parel');
  });
  it('returns null for null input', () => {
    expect(normalizeVenue(null)).toBeNull();
  });
});

describe('parseDate', () => {
  const today = new Date('2026-04-26T00:00:00Z');

  it('passes through ISO dates', () => {
    expect(parseDate('2026-05-09', today)).toBe('2026-05-09');
  });

  it('parses "9 May 2026"', () => {
    expect(parseDate('9 May 2026', today)).toBe('2026-05-09');
  });

  it('parses "May 9, 2026"', () => {
    expect(parseDate('May 9, 2026', today)).toBe('2026-05-09');
  });

  it('strips ordinals', () => {
    expect(parseDate('9th May 2026', today)).toBe('2026-05-09');
  });

  it('returns null on garbage', () => {
    expect(parseDate('next thursday', today)).toBeNull();
  });
});
