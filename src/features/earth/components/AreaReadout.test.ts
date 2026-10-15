import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AreaReadout from './AreaReadout';

describe('area readout loading', () => {
  it('starts hidden until the map is ready, including on retries', () => {
    const render = (ready: boolean) => renderToStaticMarkup(createElement(
      AreaReadout,
      { km2: 75.17923809523809, measurements: 'metric', ready, readoutRef: null },
    ));
    expect(render(false)).toContain('hidden=""');
    expect(render(true)).not.toContain('hidden=""');
    expect(render(false)).toContain('hidden=""');
  });

  it.each([0, null])('keeps the readout hidden when %s has no area to draw', (km2) => {
    const markup = renderToStaticMarkup(createElement(AreaReadout, {
      km2, measurements: 'metric', ready: true, readoutRef: null,
    }));
    expect(markup).toContain('hidden=""');
  });
});
