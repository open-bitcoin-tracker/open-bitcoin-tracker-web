import { afterEach, describe, expect, it, vi } from 'vitest';
import { hideWelcomeOnFutureVisits, shouldShowWelcome } from './welcomePreference';

afterEach(() => vi.unstubAllGlobals());

describe('Earth welcome preference', () => {
  it('shows the introduction until the visitor opts out, including on a later visit', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    expect(shouldShowWelcome()).toBe(true);
    expect(data.size).toBe(0);
    hideWelcomeOnFutureVisits();
    expect(shouldShowWelcome()).toBe(false);
    expect(data.size).toBe(1);
  });

  it('requires an explicit opt-out value', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'false' });
    expect(shouldShowWelcome()).toBe(true);
  });

  it('still shows and dismisses the introduction when browser storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage blocked'); },
      setItem: () => { throw new Error('Storage blocked'); },
    });
    expect(shouldShowWelcome()).toBe(true);
    expect(() => hideWelcomeOnFutureVisits()).not.toThrow();
  });
});
