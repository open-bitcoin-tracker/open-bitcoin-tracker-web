const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;
const reveals = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add('is-revealed');
    observer.unobserve(entry.target);
  }
}, { rootMargin: '0px 0px -24px 0px', threshold: 0.08 });

if (!reduceMotion.matches) {
  // Content may already have painted before this deferred script runs. Keep
  // everything at or above the viewport in place; reveal only content below it.
  reveals.forEach((element) => {
    if (element.getBoundingClientRect().top < window.innerHeight) {
      element.classList.add('is-revealed');
    }
  });
  document.querySelectorAll<HTMLElement>('[data-reveal-stagger]').forEach((group) => {
    const delay = Number(group.dataset.revealStagger) || 90;
    [...group.children].forEach((child, i) => {
      if (child instanceof HTMLElement && child.hasAttribute('data-reveal')) child.style.transitionDelay = `${i * delay}ms`;
    });
  });
  root.classList.add('motion-ready');
  reveals.forEach((element) => {
    if (!element.classList.contains('is-revealed')) observer.observe(element);
  });
}

// Scroll work is limited to visible scenes and one animation frame per update.
const scenes = new Set<HTMLElement>();
const sceneObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) scenes.add(entry.target as HTMLElement);
    else scenes.delete(entry.target as HTMLElement);
  });
  schedule();
}, { rootMargin: '100px' });
document.querySelectorAll<HTMLElement>('[data-scene]').forEach((scene) => sceneObserver.observe(scene));
let frame = 0;
function update() {
  frame = 0;
  if (reduceMotion.matches) return;
  scenes.forEach((scene) => {
    const bounds = scene.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (window.innerHeight - bounds.top) / (window.innerHeight + bounds.height)));
    scene.style.setProperty('--scene-progress', progress.toFixed(4));
  });
}
function schedule() { if (!frame) frame = requestAnimationFrame(update); }
window.addEventListener('scroll', schedule, { passive: true });
window.addEventListener('resize', schedule, { passive: true });
schedule();
reduceMotion.addEventListener('change', () => {
  if (reduceMotion.matches) {
    observer.disconnect();
    reveals.forEach((element) => element.classList.add('is-revealed'));
    document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((phone) => {
      phone.style.removeProperty('--rx'); phone.style.removeProperty('--ry');
    });
  }
  schedule();
});

// Small pointer-driven movement lends the hardware depth without continuous loops.
document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((phone) => {
  phone.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || reduceMotion.matches) return;
    const bounds = phone.getBoundingClientRect();
    phone.style.setProperty('--rx', `${(0.5 - (event.clientY - bounds.top) / bounds.height) * 6}deg`);
    phone.style.setProperty('--ry', `${((event.clientX - bounds.left) / bounds.width - 0.5) * 8}deg`);
  });
  phone.addEventListener('pointerleave', () => {
    phone.style.setProperty('--rx', '0deg'); phone.style.setProperty('--ry', '0deg');
  });
});
