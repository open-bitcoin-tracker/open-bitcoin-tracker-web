import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

/** Run extracted browser modules against the same DOM and service fakes as their consumers. */
export function browserModule(name: string, globals: Record<string, unknown>, dependencies: object = {}) {
  const source = readFileSync(new URL(`../../src/${name}.ts`, import.meta.url), 'utf8');
  const script = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(script, { ...globals, exports, require: () => dependencies });
  return exports;
}

export function videoCardTemplate(Element: new () => any) {
  return { content: { firstElementChild: { cloneNode() {
    const button = new Element();
    button.className = 'video-card video-recent-load';
    button.type = 'button';
    button.disabled = false;
    const image = button.querySelector('img');
    Object.assign(image, { width: 480, height: 360, alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer' });
    const badge = button.querySelector('[data-video-live]');
    badge.textContent = 'Live';
    const noSound = button.querySelector('[data-video-no-sound]');
    noSound.textContent = 'No sound';
    button.append(image, button.querySelector('.video-card-title'), badge, noSound);
    return button;
  } } } };
}
