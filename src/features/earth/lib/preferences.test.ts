import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPreference, savePreference } from './preferences';
import { resolveTheme } from './theme';

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

  it('keeps measurement and theme choices independent and rejects invalid systems', () => {
    savePreference('theme', 'dark');
    savePreference('measurements', 'imperial');
    expect(readPreference('theme')).toBe('dark');
    for (const key of stored.keys()) {
      if (key.includes('measurements')) stored.set(key, 'nautical');
    }
    expect(readPreference('measurements')).toBeNull();
    expect(readPreference('theme')).toBe('dark');
    stored.clear();
    expect(readPreference('measurements')).toBeNull();
  });

  it('preserves the system theme when nothing is saved', () => {
    expect(resolveTheme(readPreference('theme'), false)).toBe('light');
    expect(resolveTheme(readPreference('theme'), true)).toBe('dark');
    expect(stored.size).toBe(0);
  });

  it.each(['light', 'dark'] as const)(
    'restores the saved %s theme on a new read despite the system preference',
    (theme) => {
      savePreference('theme', theme);
      expect(resolveTheme(readPreference('theme'), false)).toBe(theme);
      expect(resolveTheme(readPreference('theme'), true)).toBe(theme);
    },
  );

  it('remembers the latest theme choice', () => {
    savePreference('theme', 'light');
    savePreference('theme', 'dark');
    expect(readPreference('theme')).toBe('dark');
  });

  it('ignores invalid saved values and uses the defaults after site data is cleared', () => {
    savePreference('theme', 'light');
    for (const key of stored.keys()) stored.set(key, 'invalid');
    expect(readPreference('theme')).toBeNull();
    stored.clear();
    expect(resolveTheme(readPreference('theme'), true)).toBe('dark');
  });

  it('falls back safely when access to storage is blocked', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('Storage disabled');
      },
    });
    expect(readPreference('theme')).toBeNull();
    expect(() => savePreference('theme', 'light')).not.toThrow();
    expect(readPreference('measurements')).toBeNull();
    expect(() => savePreference('measurements', 'imperial')).not.toThrow();
  });

  it('handles write failures without losing an existing saved preference', () => {
    savePreference('theme', 'light');
    window.localStorage.setItem = () => {
      throw new Error('Storage quota exceeded');
    };
    expect(() => savePreference('theme', 'dark')).not.toThrow();
    expect(readPreference('theme')).toBe('light');
  });
});
