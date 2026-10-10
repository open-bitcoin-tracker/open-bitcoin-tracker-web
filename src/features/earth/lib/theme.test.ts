import { afterEach, describe, expect, it, vi } from 'vitest';
import { DARK_MODE_QUERY, resolveTheme, watchSystemTheme } from './theme';

afterEach(() => vi.unstubAllGlobals());

describe('appearance detection', () => {
  it.each([
    [false, 'light'],
    [true, 'dark'],
  ] as const)(
    'detects the system preference on a fresh load (dark: %s)',
    (systemDark, expected) => {
      expect(resolveTheme(null, systemDark)).toBe(expected);
    },
  );

  it('keeps manual choices regardless of the system preference', () => {
    for (const systemDark of [false, true]) {
      expect(resolveTheme('light', systemDark)).toBe('light');
      expect(resolveTheme('dark', systemDark)).toBe('dark');
      expect(resolveTheme(null, systemDark)).toBe(
        systemDark ? 'dark' : 'light',
      );
    }
  });

  it('follows system changes without accessing browser storage and removes its listener on cleanup', () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const media = {
      matches: false,
      addEventListener: vi.fn((_event, handler) => {
        listener = handler;
      }),
      removeEventListener: vi.fn(),
    };
    const matchMedia = vi.fn(() => media);
    vi.stubGlobal('window', {
      matchMedia,
      get localStorage() {
        throw new Error('Appearance must not use storage');
      },
    });
    const change = vi.fn();
    const stop = watchSystemTheme(change);
    expect(matchMedia).toHaveBeenCalledWith(DARK_MODE_QUERY);
    expect(resolveTheme(null, change.mock.lastCall![0])).toBe('light');
    listener!({ matches: true } as MediaQueryListEvent);
    expect(resolveTheme(null, change.mock.lastCall![0])).toBe('dark');
    listener!({ matches: false } as MediaQueryListEvent);
    expect(resolveTheme(null, change.mock.lastCall![0])).toBe('light');
    stop();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', listener);
  });
});
