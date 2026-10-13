import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPreference, savePreference } from './preferences';

let stored: Map<string, string>;

beforeEach(() => {
  stored = new Map();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('saved browser preferences', () => {
  it('defaults to metric and restores either saved measurement system', () => {
    expect(readPreference('measurements') ?? 'metric').toBe('metric');
    for (const system of ['imperial', 'metric'] as const) {
      savePreference('measurements', system);
      expect(readPreference('measurements')).toBe(system);
    }
  });

  it('rejects invalid measurement systems', () => {
    savePreference('measurements', 'imperial');
    for (const key of stored.keys()) {
      if (key.includes('measurements')) stored.set(key, 'nautical');
    }
    expect(readPreference('measurements')).toBeNull();
    stored.clear();
    expect(readPreference('measurements')).toBeNull();
  });

  it('falls back safely when access to storage is blocked', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('Storage disabled');
      },
    });
    expect(readPreference('measurements')).toBeNull();
    expect(() => savePreference('measurements', 'imperial')).not.toThrow();
  });

  it('handles write failures without losing an existing saved preference', () => {
    savePreference('measurements', 'metric');
    window.localStorage.setItem = () => {
      throw new Error('Storage quota exceeded');
    };
    expect(() => savePreference('measurements', 'imperial')).not.toThrow();
    expect(readPreference('measurements')).toBe('metric');
  });
});
