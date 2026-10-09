import type { ChartScale, ChartViewport, HistoryPoint } from './bitcoin-chart';

export interface ChartScene {
  points: HistoryPoint[];
  viewport: ChartViewport;
  scale: ChartScale;
  rangeKey: string;
}

// Flutter's Curves.easeInOutCubic and Curves.easeInOut, respectively.
function bezier(progress: number, x1: number, y1: number, x2: number, y2: number) {
  if (progress <= 0 || progress >= 1) return Math.max(0, Math.min(1, progress));
  const coordinate = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 16; i++) {
    const t = (low + high) / 2;
    if (coordinate(t, x1, x2) < progress) low = t;
    else high = t;
  }
  return coordinate((low + high) / 2, y1, y2);
}

export class ChartMotion {
  private target?: ChartScene;
  private scene?: ChartScene;
  private zoom?: { start: number; from: ChartViewport; points: HistoryPoint[]; hold: boolean };
  private fade?: { start: number; from: number; out: boolean };
  opacity = 1;

  get animating() { return Boolean(this.zoom || this.fade); }

  update(target: ChartScene, now: number, immediate = false) {
    this.sample(now);
    const previous = this.target;
    this.target = target;
    if (!this.scene || immediate) { this.finish(); return; }
    if (previous?.scale !== target.scale) {
      this.zoom = undefined;
      this.fade = { start: now, from: this.opacity, out: this.scene.scale !== target.scale };
    } else if (previous?.rangeKey !== target.rangeKey && !this.fade) {
      const from = this.scene.viewport;
      this.zoom = {
        start: now, from, points: this.scene.points,
        hold: target.viewport.end - target.viewport.start < from.end - from.start,
      };
    }
    this.sample(now);
  }

  finish() {
    this.zoom = undefined;
    this.fade = undefined;
    this.opacity = 1;
    this.scene = this.target;
  }

  clear() {
    this.target = undefined;
    this.finish();
  }

  sample(now: number): ChartScene | undefined {
    if (!this.target || !this.scene) return this.scene;
    if (this.fade) {
      let elapsed = now - this.fade.start;
      const duration = 150 * (this.fade.out ? this.fade.from : 1 - this.fade.from);
      if (elapsed >= duration && this.fade.out) {
        this.scene = this.target;
        this.fade = { start: this.fade.start + duration, from: 0, out: false };
        elapsed -= duration;
        if (elapsed >= 150) { this.finish(); return this.scene; }
      } else if (elapsed >= duration) {
        this.finish();
        return this.scene;
      }
      const fadeDuration = 150 * (this.fade.out ? this.fade.from : 1 - this.fade.from);
      const t = bezier(fadeDuration ? elapsed / fadeDuration : 1, .42, 0, .58, 1);
      this.opacity = this.fade.from + ((this.fade.out ? 0 : 1) - this.fade.from) * t;
      if (!this.fade.out) this.scene = this.target;
    } else if (this.zoom) {
      const progress = Math.min(1, (now - this.zoom.start) / 450);
      if (progress >= 1) { this.finish(); return this.scene; }
      const t = bezier(progress, .645, .045, .355, 1);
      const from = this.zoom.from;
      const to = this.target.viewport;
      this.scene = {
        ...this.target,
        points: this.zoom.hold ? this.zoom.points : this.target.points,
        viewport: {
          start: from.start + (to.start - from.start) * t,
          end: from.end + (to.end - from.end) * t,
          bottom: from.bottom + (to.bottom - from.bottom) * t,
          top: from.top + (to.top - from.top) * t,
        },
      };
    } else {
      this.scene = this.target;
    }
    return this.scene;
  }
}
