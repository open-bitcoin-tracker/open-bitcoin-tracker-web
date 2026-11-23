// Rolling digits for the live price, matching the Android app's RollingNumber:
// each changed digit rolls along a vertical strip, up when the price rose and
// down when it fell, over 700ms with an ease-out-cubic curve and soft fading
// edges while it moves. Symbols and separators stay still.
//
// Two deliberate differences from the app:
// - Digits are matched from the right, so a price gaining a digit
//   ($99,999 → $100,000) keeps each place value on its own strip.
// - CSS transitions continue from wherever a strip is, so a tick arriving
//   mid-roll carries on smoothly instead of snapping to the previous digit.

const DURATION_MS = 700;
const EASING = 'cubic-bezier(.215, .61, .355, 1)'; // Flutter's Curves.easeOutCubic
const COPIES = 5; // 0–9 five times; a resting strip sits on the middle copy
const CELLS = COPIES * 10;
const REST = 20;

/** Signed strip steps from one digit to another, wrapping like an odometer in the given direction. */
export function rollSteps(from: number, to: number, direction: number) {
  return direction >= 0 ? (to - from + 10) % 10 : -((from - to + 10) % 10);
}

/** The text with every digit replaced, so updates that only change digits keep the same layout. */
export function numberSkeleton(text: string) {
  return text.replace(/\d/g, '0');
}

const strip = Array.from({ length: CELLS }, (_, i) => String(i % 10)).join('\n');

class RollingDigit {
  readonly el: HTMLSpanElement;
  private readonly strip: HTMLSpanElement;
  private readonly doc: Document;
  private pos = REST;
  digit = 0;

  constructor(doc: Document) {
    this.doc = doc;
    this.el = doc.createElement('span');
    this.el.className = 'roll-digit';
    this.strip = doc.createElement('span');
    this.strip.className = 'roll-strip';
    this.strip.textContent = strip;
    this.el.append(this.strip);
    this.strip.addEventListener('transitionend', (event) => {
      if (event.propertyName !== 'transform') return;
      this.el.classList.remove('rolling');
      // Settle back onto the middle copy so later rolls always have room.
      if (this.pos < REST || this.pos >= REST + 10) this.snap(this.digit);
    });
  }

  private render(animate: boolean) {
    this.strip.style.transition = animate ? `transform ${DURATION_MS}ms ${EASING}` : 'none';
    // Percentages of the strip's own height keep this independent of font size and line height.
    this.strip.style.transform = `translateY(${-this.pos * 100 / CELLS}%)`;
  }

  snap(digit: number) {
    this.digit = digit;
    this.pos = REST + digit;
    this.el.classList.remove('rolling');
    this.render(false);
  }

  roll(digit: number, direction: number) {
    const steps = rollSteps(this.digit, digit, direction);
    if (!steps) return;
    if (this.pos + steps < 0 || this.pos + steps >= CELLS) this.rebase();
    this.digit = digit;
    this.pos += steps;
    this.el.classList.add('rolling');
    this.render(true);
  }

  // Rapid ticks can chain rolls before one settles. Shift the strip by whole copies,
  // from where it is right now, so the next roll stays on the strip without a visible jump.
  private rebase() {
    const view = this.doc.defaultView;
    const height = this.strip.offsetHeight;
    if (!view || !height) { this.snap(this.digit); return; }
    const transform = view.getComputedStyle(this.strip).transform;
    const offset = transform && transform !== 'none' ? new view.DOMMatrixReadOnly(transform).m42 : 0;
    const shift = this.pos - (REST + this.digit);
    const visual = -offset / (height / CELLS) - shift;
    this.strip.style.transition = 'none';
    this.strip.style.transform = `translateY(${-visual * 100 / CELLS}%)`;
    void this.strip.offsetHeight; // Commit the shifted start before the next transition.
    this.pos -= shift;
  }
}

export interface RollingNumber {
  /** Show text; digits roll in direction (+1 up, -1 down) unless animate is false. */
  set(text: string, options?: { direction?: number; animate?: boolean }): void;
}

/**
 * Render text into layer with rolling digits. Returns undefined where the DOM cannot
 * support it, so callers keep showing plain text.
 */
export function createRollingNumber(layer: HTMLElement | null): RollingNumber | undefined {
  const doc = layer?.ownerDocument;
  if (!layer || typeof doc?.createElement !== 'function') return undefined;
  let text: string | undefined;
  let skeleton: string | undefined;
  // Indexed by place from the right: 0 is the last digit.
  let digits: RollingDigit[] = [];

  function build(next: string) {
    const count = next.replace(/\D/g, '').length;
    const reused = new Set<RollingDigit>();
    const built: RollingDigit[] = [];
    const nodes: Node[] = [];
    let seen = 0;
    for (const char of next) {
      if (char >= '0' && char <= '9') {
        const place = count - 1 - seen++;
        const digit = digits[place] ?? new RollingDigit(doc!);
        if (digits[place]) reused.add(digit);
        built[place] = digit;
        nodes.push(digit.el);
      } else nodes.push(doc!.createTextNode(char));
    }
    layer!.replaceChildren(...nodes);
    digits = built;
    return reused;
  }

  return {
    set(next, { direction = 1, animate = true } = {}) {
      if (next === text) return;
      const nextSkeleton = numberSkeleton(next);
      const rebuilt = nextSkeleton !== skeleton;
      const reused = rebuilt ? build(next) : new Set(digits);
      // Re-inserted strips need a style pass before a transition can start from their current place.
      if (rebuilt && animate && reused.size) void layer.offsetHeight;
      text = next;
      skeleton = nextSkeleton;
      const values = next.replace(/\D/g, '');
      digits.forEach((digit, place) => {
        const value = Number(values[values.length - 1 - place]);
        if (animate && reused.has(digit)) digit.roll(value, direction);
        else digit.snap(value);
      });
    },
  };
}
