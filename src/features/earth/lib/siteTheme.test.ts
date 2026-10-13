import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSiteTheme, watchSiteTheme } from './siteTheme';

let classes: Set<string>;
let events: Map<string, () => void>;
let observerUpdate: () => void;
const disconnect = vi.fn();
const save = vi.fn();

beforeEach(() => {
  classes = new Set(); events = new Map();
  disconnect.mockClear(); save.mockReset();
  vi.stubGlobal('document', {
    documentElement: { classList: {
      contains: (name: string) => classes.has(name),
    } },
    addEventListener: (type: string, callback: () => void) => events.set(type, callback),
    removeEventListener: (type: string) => events.delete(type),
  });
  vi.stubGlobal('localStorage', { setItem: save });
  vi.stubGlobal('MutationObserver', class {
    constructor(callback: () => void) { observerUpdate = callback; }
    observe() {}
    disconnect = disconnect;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('map and shared navigation appearance', () => {
  it('uses the site class as its initial theme, including without storage', () => {
    expect(readSiteTheme()).toBe('light');
    classes.add('dark');
    expect(readSiteTheme()).toBe('dark');
    expect(save).not.toHaveBeenCalled();
  });
  it('follows menu class/event changes and removes listeners on unmount', () => {
    const update = vi.fn();
    const stop = watchSiteTheme(update);
    classes.add('dark'); observerUpdate();
    expect(update).toHaveBeenLastCalledWith('dark');
    classes.delete('dark'); events.get('themechange')?.();
    expect(update).toHaveBeenLastCalledWith('light');
    stop();
    expect(events.size).toBe(0);
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
