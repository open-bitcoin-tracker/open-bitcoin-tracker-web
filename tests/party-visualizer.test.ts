import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const script = ts.transpileModule(readFileSync(new URL('../src/lib/party-visualizer.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(options: { reduced?: boolean; hidden?: boolean; context?: boolean } = {}) {
  class Listeners extends EventTarget {
    listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
      if (callback) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type)!.add(callback);
      }
      super.addEventListener(type, callback, options);
    }
    override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
      if (callback) this.listeners.get(type)?.delete(callback);
      super.removeEventListener(type, callback, options);
    }
    count(type: string) { return this.listeners.get(type)?.size ?? 0; }
  }

  const media = Object.assign(new Listeners(), { matches: options.reduced ?? false });
  const document = Object.assign(new Listeners(), { hidden: options.hidden ?? false });
  const frames = new Map<number, (now: number) => void>();
  const observers: Observer[] = [];
  let nextId = 1;
  let drawCount = 0;
  let paths: number[][] = [];
  let rectangles: number[][] = [];
  let glowStops: [number, string][] = [];
  let lineWidths: number[] = [];
  let samples = 0;
  const transforms: number[][] = [];
  const bins = new Uint8Array(1_024);
  const waveform = new Float32Array(2_048);
  const analyser = {
    context: { sampleRate: 48_000 },
    fftSize: 2_048,
    frequencyBinCount: bins.length,
    gain: 1,
    getByteFrequencyData(data: Uint8Array) { samples++; data.set(bins); },
    getFloatFrequencyData(data: Float32Array) {
      for (let i = 0; i < bins.length; i++) data[i] = bins[i] ? -85 + bins[i] / 255 * 80 + 20 * Math.log10(this.gain) : -Infinity;
    },
    getFloatTimeDomainData(data: Float32Array) {
      for (let i = 0; i < waveform.length; i++) data[i] = waveform[i] * this.gain;
    },
  };
  const context = {
    lineWidth: 1,
    fillRect(...values: number[]) { rectangles.push(values); },
    createRadialGradient() {
      drawCount++;
      paths = [];
      rectangles = [];
      glowStops = [];
      lineWidths = [];
      return { addColorStop(offset: number, color: string) { glowStops.push([offset, color]); } };
    },
    createLinearGradient() { return { addColorStop() {} }; },
    beginPath() {},
    moveTo(x: number, y: number) { paths.push([x, y]); },
    lineTo(x: number, y: number) { paths.push([x, y]); },
    stroke() { lineWidths.push(this.lineWidth); },
    setTransform(...values: number[]) { transforms.push(values); },
  };
  const bounds = { width: 800, height: 600 };
  const canvas = {
    width: 0, height: 0,
    getContext: () => options.context === false ? null : context,
    getBoundingClientRect: () => bounds,
  };
  class Observer {
    disconnected = false;
    observed: unknown[] = [];
    callback: () => void;
    constructor(callback: () => void) { this.callback = callback; observers.push(this); }
    observe(target: unknown) { this.observed.push(target); }
    disconnect() { this.disconnected = true; }
  }
  const exports: { createPartyVisualizer?: (canvas: unknown) => {
    setPlaying(value: boolean): void;
    setAnalyser(value?: unknown): void;
    destroy(): void;
  } } = {};
  runInNewContext(script, {
    exports, document,
    window: { matchMedia: () => media, devicePixelRatio: 3 },
    ResizeObserver: Observer,
    requestAnimationFrame: (callback: (now: number) => void) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  const visualizer = exports.createPartyVisualizer!(canvas);
  const advance = (now: number) => {
    const pending = [...frames];
    frames.clear();
    for (const [, callback] of pending) callback(now);
  };
  const visibility = (hidden: boolean) => {
    document.hidden = hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  };
  const reduced = (matches: boolean) => {
    media.matches = matches;
    media.dispatchEvent(new Event('change'));
  };
  return {
    visualizer, document, media, canvas, bounds, observers, frames, transforms,
    advance, visibility, reduced, analyser, bins, waveform,
    start() { visualizer.setAnalyser(analyser); visualizer.setPlaying(true); },
    setRms(amplitude: number) {
      for (let i = 0; i < waveform.length; i++) waveform[i] = i % 2 ? amplitude : -amplitude;
    },
    drawCount: () => drawCount,
    paths: () => paths.map(point => [...point]),
    columns: () => rectangles.slice(-112).map(rectangle => rectangle[3]),
    glow: () => glowStops[0]?.[1],
    pulse: () => (lineWidths[2] - 2) / 6,
    samples: () => samples,
  };
}

test('idle scenes stay static and only attached, playing audio starts animation', () => {
  const h = harness();
  assert.equal(h.drawCount(), 1);
  assert.equal(h.frames.size, 0);
  assert.ok(h.columns().every(height => height === 0));
  h.visualizer.setPlaying(true);
  assert.equal(h.frames.size, 0, 'playback alone cannot invent an analyser');
  h.visualizer.setAnalyser(h.analyser);
  assert.equal(h.frames.size, 1);
  h.visualizer.setPlaying(false);
  assert.equal(h.frames.size, 0);
  assert.ok(h.columns().every(height => height === 0));
  h.visualizer.setPlaying(true);
  assert.equal(h.frames.size, 1);
  h.visualizer.setAnalyser();
  assert.equal(h.frames.size, 0);
  h.visualizer.destroy();
});

test('real low and high frequency bins move their corresponding logarithmic spectrum bands', () => {
  const low = harness();
  const high = harness();
  low.bins[2] = 255;
  high.bins[400] = 255;
  low.start();
  high.start();
  const lowColumns = low.columns();
  const highColumns = high.columns();
  assert.ok(Math.max(...lowColumns.slice(0, 30)) > 0);
  assert.equal(Math.max(...lowColumns.slice(40)), 0, 'bass does not fabricate upper-frequency peaks');
  assert.ok(Math.max(...highColumns.slice(90)) > 0);
  assert.equal(Math.max(...highColumns.slice(0, 80)), 0, 'treble does not fabricate bass peaks');
  assert.notDeepEqual(low.paths(), high.paths(), 'measured audio changes the ribbon shape');
  assert.equal(low.paths()[0][0], 0);
  assert.equal(low.paths()[112][0], low.bounds.width, 'ribbons span the entire canvas width');
  low.visualizer.destroy();
  high.visualizer.destroy();
});

test('measured energy controls spectrum height and glow, with attack and release smoothing', () => {
  const quiet = harness();
  const loud = harness();
  quiet.bins.fill(64);
  loud.bins.fill(255);
  quiet.start();
  loud.start();
  const initial = loud.columns()[0];
  assert.ok(initial > quiet.columns()[0]);
  const alpha = (color: string | undefined) => Number(color?.match(/, ([\d.]+)\)$/)?.[1]);
  assert.ok(alpha(loud.glow()) > alpha(quiet.glow()));
  loud.advance(40);
  const attack = loud.columns()[0];
  assert.ok(attack > initial && attack < loud.bounds.height * .55);
  loud.bins.fill(0);
  loud.advance(80);
  const release = loud.columns()[0];
  assert.ok(release > 0 && release < attack, 'silence releases the measured peak gradually');
  for (let now = 120; now < 5_000; now += 40) loud.advance(now);
  assert.ok(loud.columns().every(height => height < .000001));
  quiet.visualizer.destroy();
  loud.visualizer.destroy();
});

test('silent playback has no fabricated spectrum, wave excursion, or beats over time', () => {
  const h = harness();
  h.start();
  const staticPaths = h.paths();
  const staticGlow = h.glow();
  for (const now of [40, 80, 120, 160, 200, 1_000, 60_000]) {
    h.advance(now);
    assert.ok(h.columns().every(height => height === 0));
    assert.deepEqual(h.paths(), staticPaths);
    assert.equal(h.glow(), staticGlow);
    assert.equal(h.pulse(), 0);
  }
  assert.ok(h.samples() > 1, 'silence is measured from the analyser');
  h.visualizer.destroy();
});

test('actual bass and RMS bursts punch immediately, decay within 180 ms, and repeat without a tempo clock', () => {
  const h = harness();
  h.bins.fill(48);
  h.setRms(.03);
  h.start();
  h.advance(0);
  for (let now = 40; now <= 400; now += 40) h.advance(now);
  assert.equal(h.pulse(), 0, 'a held backing signal does not repeatedly trigger');
  const restingGlow = h.glow();
  const restingPaths = h.paths();

  for (const onset of [440, 960, 1_280]) {
    h.bins.fill(235, 2, 8); // Real 47–164 Hz bins, rather than the first display bands.
    h.setRms(.25);
    h.advance(onset);
    assert.equal(h.pulse(), 1, `the ${onset} ms transient attacks on its first measured frame`);
    assert.notEqual(h.glow(), restingGlow);
    assert.notDeepEqual(h.paths(), restingPaths);
    h.bins.fill(48);
    h.setRms(.03);
    h.advance(onset + 40);
    assert.ok(h.pulse() > 0 && h.pulse() < 1);
    for (let now = onset + 80; now <= onset + 200; now += 40) h.advance(now);
    assert.equal(h.pulse(), 0, 'the transient pulse ends without another audio rise');
    for (let now = onset + 240; now < (onset === 440 ? 960 : 1_280); now += 40) h.advance(now);
  }
  h.visualizer.destroy();
});

test('a broadband transient triggers a punch even without a bass kick or louder time-domain RMS', () => {
  const h = harness();
  h.bins.fill(90);
  h.setRms(.03);
  h.start();
  h.advance(0);
  for (let now = 40; now <= 400; now += 40) h.advance(now);
  assert.equal(h.pulse(), 0);
  h.bins.fill(220, 70, 500);
  h.advance(440);
  assert.equal(h.pulse(), 1, 'positive spectral flux follows a snare-like upper-frequency attack');
  h.visualizer.destroy();
});

test('RMS transients can trigger a punch before a slowly changing FFT catches up', () => {
  const h = harness();
  h.bins.fill(100);
  h.setRms(.02);
  h.start();
  h.advance(0);
  for (let now = 40; now <= 400; now += 40) h.advance(now);
  h.setRms(.12);
  h.advance(440);
  assert.equal(h.pulse(), 1);
  h.visualizer.destroy();
});

test('onset detection normalizes to recent track levels so quiet and loud tracks both punch', () => {
  const loud = harness();
  const quiet = harness();
  quiet.analyser.gain = .025;
  for (const h of [loud, quiet]) {
    h.bins.fill(80);
    h.setRms(.08);
    h.start();
    h.advance(0);
    for (let now = 40; now <= 400; now += 40) h.advance(now);
    assert.equal(h.pulse(), 0);
    h.bins.fill(220, 2, 8);
    h.setRms(.28);
    h.advance(440);
    assert.equal(h.pulse(), 1);
    h.visualizer.destroy();
  }
});

test('the short onset refractory window suppresses jitter without imposing a musical tempo', () => {
  const h = harness();
  h.start();
  h.advance(0);
  h.bins.fill(220, 2, 8);
  h.setRms(.2);
  h.advance(40);
  assert.equal(h.pulse(), 1);
  h.bins.fill(0);
  h.setRms(0);
  h.advance(80);
  h.bins.fill(220, 2, 8);
  h.setRms(.2);
  h.advance(120);
  assert.ok(h.pulse() < .6, 'a rise only 80 ms after the first onset cannot restart its punch');
  h.bins.fill(0);
  h.setRms(0);
  h.advance(160);
  h.bins.fill(220, 2, 8);
  h.setRms(.2);
  h.advance(200);
  assert.equal(h.pulse(), 1, 'a distinct onset after the refractory window punches immediately');
  h.visualizer.destroy();
});

test('pulse decay follows elapsed audio-frame milliseconds rather than the number of rendered frames', () => {
  const frequent = harness();
  const delayed = harness();
  for (const h of [frequent, delayed]) {
    h.start();
    h.advance(0);
    h.bins.fill(220, 2, 8);
    h.setRms(.2);
    h.advance(40);
    assert.equal(h.pulse(), 1);
    h.bins.fill(0);
    h.setRms(0);
  }
  frequent.advance(80);
  frequent.advance(120);
  frequent.advance(160);
  delayed.advance(160);
  assert.ok(Math.abs(frequent.pulse() - delayed.pulse()) < .000001);
  frequent.advance(240);
  delayed.advance(240);
  assert.equal(frequent.pulse(), 0);
  assert.equal(delayed.pulse(), 0, 'a delayed frame does not stretch the punch past its short decay');
  frequent.visualizer.destroy();
  delayed.visualizer.destroy();
});

test('sustained audio settles to a steady shape with no time-driven drift or periodic pulses', () => {
  const h = harness();
  h.bins.fill(150);
  h.setRms(.1);
  h.start();
  h.advance(0);
  for (let now = 40; now <= 2_000; now += 40) h.advance(now);
  const paths = h.paths();
  const glow = h.glow();
  assert.equal(h.pulse(), 0);
  for (let now = 2_040; now <= 5_000; now += 40) {
    h.advance(now);
    assert.equal(h.pulse(), 0);
    assert.deepEqual(h.paths(), paths);
    assert.equal(h.glow(), glow);
  }
  h.visualizer.destroy();
});

test('window-phase RMS variation in sustained 40, 50, and 100 Hz sine tones does not invent beats', () => {
  for (const frequency of [40, 50, 100]) {
    const h = harness();
    h.bins[Math.round(frequency / (48_000 / 2_048))] = 180;
    const wave = (now: number) => {
      for (let i = 0; i < h.waveform.length; i++) {
        h.waveform[i] = .1 * Math.sin(2 * Math.PI * frequency * (i / 48_000 + now / 1_000));
      }
    };
    wave(0);
    h.start();
    h.advance(0);
    for (let now = 37; now <= 5_000; now += 37) {
      wave(now);
      h.advance(now);
      if (now >= 200) assert.equal(h.pulse(), 0, `${frequency} Hz tone at ${now} ms has no new onset`);
    }
    h.visualizer.destroy();
  }
});

test('rendering is throttled to at most thirty draws per second', () => {
  const h = harness();
  h.start();
  h.advance(0);
  const first = h.drawCount();
  h.advance(16);
  h.advance(32);
  assert.equal(h.drawCount(), first);
  h.advance(34);
  assert.equal(h.drawCount(), first + 1);
  h.visualizer.destroy();
});

test('reduced motion draws a static scene and responds to preference changes without extra animation loops', () => {
  const h = harness({ reduced: true });
  assert.equal(h.drawCount(), 1);
  assert.equal(h.frames.size, 0);
  h.bins.fill(255);
  h.start();
  assert.equal(h.frames.size, 0);
  assert.ok(h.columns().every(height => height === 0));
  assert.equal(h.samples(), 0);
  const initial = h.drawCount();
  h.advance(100);
  assert.equal(h.drawCount(), initial);

  h.reduced(false);
  assert.equal(h.frames.size, 1);
  h.advance(100);
  assert.equal(h.frames.size, 1);
  h.advance(140);
  assert.equal(h.frames.size, 1);
  h.reduced(true);
  assert.equal(h.frames.size, 0);
  const stopped = h.drawCount();
  h.advance(5_000);
  assert.equal(h.drawCount(), stopped);
  h.visualizer.destroy();
});

test('pausing playback stops animation frames and remains paused when reduced-motion preferences change', () => {
  const h = harness();
  h.start();
  assert.equal(h.frames.size, 1);
  h.visualizer.setPlaying(false);
  assert.equal(h.frames.size, 0);
  const stopped = h.drawCount();
  const stoppedSamples = h.samples();
  assert.ok(h.columns().every(height => height === 0));
  h.advance(100);
  assert.equal(h.drawCount(), stopped);
  assert.equal(h.samples(), stoppedSamples);
  h.reduced(true);
  h.reduced(false);
  assert.equal(h.frames.size, 0);

  h.visualizer.setPlaying(true);
  assert.equal(h.frames.size, 1);
  h.visualizer.setPlaying(true);
  assert.equal(h.frames.size, 1, 'repeated resume replaces the existing frame');
  h.visualizer.destroy();
});

test('hidden tabs release animation frames and resume without jumping forward through hidden time', () => {
  const short = harness();
  const long = harness();
  for (const h of [short, long]) {
    h.bins.fill(200);
    h.start();
    h.advance(40);
    h.advance(80);
    h.visibility(true);
    assert.equal(h.frames.size, 0);
    const stopped = h.drawCount();
    const stoppedSamples = h.samples();
    h.advance(60_000);
    assert.equal(h.drawCount(), stopped);
    assert.equal(h.samples(), stoppedSamples);
    h.visibility(false);
    assert.equal(h.frames.size, 1);
  }
  short.advance(120);
  long.advance(600_000);
  assert.deepEqual(long.paths(), short.paths(), 'the first resumed frame retains the same scene time');
  short.advance(160);
  long.advance(600_040);
  assert.deepEqual(long.paths(), short.paths(), 'only visible animation time advances');
  for (const h of [short, long]) h.visualizer.destroy();
});

test('a page opened in the background starts animation only after becoming visible', () => {
  const h = harness({ hidden: true });
  h.start();
  assert.equal(h.frames.size, 0);
  assert.equal(h.drawCount(), 0);
  h.visibility(false);
  assert.equal(h.drawCount(), 1);
  assert.equal(h.frames.size, 1);
  h.visualizer.destroy();
});

test('resize keeps a paused scene static and caps canvas resolution', () => {
  const h = harness();
  h.start();
  assert.equal(h.canvas.width, 1_600);
  assert.equal(h.canvas.height, 1_200);
  assert.deepEqual(h.transforms.at(-1), [2, 0, 0, 2, 0, 0]);
  h.visualizer.setPlaying(false);
  const previous = h.drawCount();
  h.bounds.width = 400;
  h.bounds.height = 300;
  h.observers[0].callback();
  assert.equal(h.canvas.width, 800);
  assert.equal(h.canvas.height, 600);
  assert.equal(h.drawCount(), previous + 1);
  assert.equal(h.frames.size, 0);
  h.visualizer.destroy();
});

test('destroy disconnects observers, removes listeners, and prevents late frames or events from drawing', () => {
  const h = harness();
  h.start();
  assert.equal(h.observers.length, 1);
  assert.equal(h.observers[0].observed[0], h.canvas);
  assert.equal(h.document.count('visibilitychange'), 1);
  assert.equal(h.media.count('change'), 1);
  const late = [...h.frames.values()][0];
  const previous = h.drawCount();
  h.visualizer.destroy();
  assert.equal(h.observers[0].disconnected, true);
  assert.equal(h.document.count('visibilitychange'), 0);
  assert.equal(h.media.count('change'), 0);
  assert.equal(h.frames.size, 0);
  late(1_000);
  h.visibility(true);
  h.visibility(false);
  h.reduced(true);
  h.reduced(false);
  h.visualizer.setPlaying(false);
  h.visualizer.setPlaying(true);
  h.visualizer.setAnalyser(h.analyser);
  h.observers[0].callback();
  h.visualizer.destroy();
  assert.equal(h.drawCount(), previous);
  assert.equal(h.frames.size, 0);
});

test('unavailable canvas rendering does not start an animation loop', () => {
  const h = harness({ context: false });
  assert.equal(h.drawCount(), 0);
  assert.equal(h.frames.size, 0);
  h.visualizer.setPlaying(false);
  h.visualizer.setPlaying(true);
  h.visualizer.setAnalyser(h.analyser);
  h.visibility(true);
  h.visibility(false);
  h.reduced(true);
  h.reduced(false);
  assert.equal(h.frames.size, 0);
  assert.equal(h.observers.length, 0);
  assert.equal(h.document.count('visibilitychange'), 0);
  assert.equal(h.media.count('change'), 0);
  h.visualizer.destroy();
});
