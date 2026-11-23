import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRollingNumber, numberSkeleton, rollSteps } from '../src/lib/rolling-number.ts';

test('digits roll the odometer way in the price direction', () => {
  assert.equal(rollSteps(1, 2, 1), 1);
  assert.equal(rollSteps(9, 1, 1), 2, 'up wraps 9 → 0 → 1');
  assert.equal(rollSteps(2, 1, -1), -1);
  assert.equal(rollSteps(1, 9, -1), -2, 'down wraps 1 → 0 → 9');
  assert.equal(rollSteps(4, 4, 1), 0);
  assert.equal(numberSkeleton('$62,719'), '$00,000');
});

class FakeNode {
  className = '';
  textContent = '';
  children: FakeNode[] = [];
  style: Record<string, string> = {};
  offsetHeight = 500;
  listeners = new Map<string, (event: { propertyName: string }) => void>();
  classes = new Set<string>();
  classList = { add: (name: string) => this.classes.add(name), remove: (name: string) => this.classes.delete(name) };
  readonly ownerDocument: unknown;
  constructor(ownerDocument: unknown) { this.ownerDocument = ownerDocument; }
  append(...nodes: FakeNode[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]) { this.children = nodes; }
  addEventListener(type: string, listener: (event: { propertyName: string }) => void) { this.listeners.set(type, listener); }
}

function layer() {
  const doc = {
    defaultView: undefined,
    createElement: () => new FakeNode(doc),
    createTextNode: (text: string) => Object.assign(new FakeNode(doc), { textContent: text }),
  };
  return new FakeNode(doc);
}
// Each digit's strip offset in cells; a resting digit d sits at cell 20 + d.
const cells = (root: FakeNode) => root.children.filter(node => node.className === 'roll-digit')
  .map(node => Number(node.children[0].style.transform.match(/-?[\d.]+/)![0]) / -2);

test('the first price snaps; later ticks roll only the changed digits in the given direction', () => {
  const root = layer();
  const roller = createRollingNumber(root as unknown as HTMLElement)!;
  roller.set('$62,719', { animate: true });
  assert.deepEqual(cells(root), [26, 22, 27, 21, 29], 'the first digits have nothing to roll from');
  roller.set('$62,721', { direction: 1 });
  assert.deepEqual(cells(root), [26, 22, 27, 22, 31], 'the last digit rolls up through 0 to 1');
  const rolling = root.children.filter(node => node.classes.has('rolling'));
  assert.equal(rolling.length, 2);
  assert.match(rolling[0].children[0].style.transition, /700ms/);
  roller.set('$62,719', { direction: -1 });
  assert.deepEqual(cells(root), [26, 22, 27, 21, 29], 'falling prices roll back down');
  roller.set('$62,700', { animate: false });
  assert.deepEqual(cells(root), [26, 22, 27, 20, 20]);
  assert.equal(root.children.filter(node => node.classes.has('rolling')).length, 0);
});

test('settled strips return to the middle copy and new digits keep their place from the right', () => {
  const root = layer();
  const roller = createRollingNumber(root as unknown as HTMLElement)!;
  roller.set('$99,999');
  roller.set('$99,991', { direction: 1 });
  const last = root.children.at(-1)!;
  assert.equal(cells(root).at(-1), 31);
  last.children[0].listeners.get('transitionend')!({ propertyName: 'transform' });
  assert.equal(cells(root).at(-1), 21, 'a settled 1 rests on the middle copy');
  roller.set('$100,001', { direction: 1 });
  assert.equal(root.children.at(-1), last, 'the units digit keeps its strip when the price gains a digit');
  assert.equal(root.children.map(node => node.className === 'roll-digit' ? 'd' : node.textContent).join(''), '$ddd,ddd');
  // The new leading 1 snaps in; each 9 rolls up one step to 0 (cell 30, settling to 20); the units 1 stays.
  assert.deepEqual(cells(root), [21, 30, 30, 30, 30, 21]);
  assert.equal(createRollingNumber(null), undefined);
});
