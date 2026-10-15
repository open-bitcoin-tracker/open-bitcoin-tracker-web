interface Particle {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  speedX: number;
  speedY: number;
  offsetX: number;
  offsetY: number;
}

export function createLandingParticles(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return { destroy() {} };

  // Reuse one soft dot texture instead of making thousands of gradients per frame.
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 32;
  const spriteContext = sprite.getContext('2d');
  if (!spriteContext) return { destroy() {} };
  const glow = spriteContext.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, 'rgb(247 147 26 / .95)');
  glow.addColorStop(.45, 'rgb(247 147 26 / .6)');
  glow.addColorStop(1, 'rgb(247 147 26 / 0)');
  spriteContext.fillStyle = glow;
  spriteContext.fillRect(0, 0, 32, 32);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const particles: Particle[] = [];
  // Leave room for the wave displacement so wrapping stays outside the viewport.
  const padding = 160;
  let width = 0;
  let height = 0;
  let frame = 0;
  let previous: number | undefined;
  let elapsed = 0;
  let suspended = false;
  let destroyed = false;
  let pointer: { x: number; y: number } | undefined;

  function canAnimate() {
    return !destroyed && !suspended && !document.hidden && !reduced.matches && width > 0 && height > 0;
  }

  function draw(delta = 0) {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    const ease = 1 - Math.exp(-delta / .55);
    const influence = Math.min(200, width * .4);
    const waveHeight = Math.min(60, height * .085);

    for (const particle of particles) {
      particle.x = (particle.x + particle.speedX * delta + width + padding) % (width + padding);
      particle.y = (particle.y + particle.speedY * delta + height + padding) % (height + padding);
      const across = particle.x / (width + padding) * Math.PI * 2;
      const down = particle.y / (height + padding) * Math.PI * 2;
      // Shared, broad currents carry nearby particles together, rather than
      // giving each dot an unrelated oscillation. One swell takes about a minute.
      const x = particle.x - padding / 2 + Math.sin(down * .9 + elapsed * .09) * 18;
      const y = particle.y - padding / 2
        + Math.sin(across * 1.15 - elapsed * .11) * waveHeight
        + Math.sin(down * .7 + elapsed * .065) * 12;
      let targetX = 0;
      let targetY = 0;
      if (pointer && !reduced.matches) {
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < influence) {
          // A gentle local displacement, easing back after the cursor leaves.
          const force = (1 - distance / influence) ** 2 * 28;
          targetX = dx / distance * force;
          targetY = dy / distance * force;
        }
      }
      particle.offsetX += (targetX - particle.offsetX) * ease;
      particle.offsetY += (targetY - particle.offsetY) * ease;
      const px = x + particle.offsetX;
      const py = y + particle.offsetY;
      context.globalAlpha = particle.opacity;
      context.drawImage(sprite, px - particle.radius, py - particle.radius, particle.radius * 2, particle.radius * 2);
    }
    context.globalAlpha = 1;
  }

  function tick(now: number) {
    frame = 0;
    if (!canAnimate()) return;
    // Thirty draws a second are enough for this slow, decorative background.
    if (previous === undefined || now - previous >= 1000 / 30) {
      const delta = previous === undefined ? 0 : Math.min(.1, Math.max(0, (now - previous) / 1000));
      previous = now;
      elapsed += delta;
      draw(delta);
    }
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = undefined;
    if (!canAnimate()) {
      pointer = undefined;
      for (const particle of particles) particle.offsetX = particle.offsetY = 0;
      if (!document.hidden && !suspended && !destroyed) draw();
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const nextWidth = Math.max(0, bounds.width);
    const nextHeight = Math.max(0, bounds.height);
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    for (const particle of particles) {
      particle.x *= (nextWidth + padding) / (width + padding);
      particle.y *= (nextHeight + padding) / (height + padding);
    }
    width = nextWidth;
    height = nextHeight;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context!.setTransform(scale, 0, 0, scale, 0, 0);
    const count = 2 * Math.min(2_200, Math.max(320, Math.round(width * height / 650)));
    particles.length = Math.min(count, particles.length);
    while (particles.length < count) {
      const soft = particles.length % 18 === 0;
      particles.push({
        x: Math.random() * (width + padding), y: Math.random() * (height + padding),
        radius: soft ? 3.5 + Math.random() * 3 : .8 + Math.random() * 1.6,
        opacity: soft ? .18 + Math.random() * .15 : .25 + Math.random() * .4,
        speedX: 3 + Math.random() * 1.5,
        speedY: (Math.random() - .5) * .5,
        offsetX: 0, offsetY: 0,
      });
    }
    draw();
    sync();
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || !canAnimate()) return;
    const bounds = canvas.getBoundingClientRect();
    pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }
  function clearPointer() { pointer = undefined; }
  function onPointerOut(event: PointerEvent) { if (!event.relatedTarget) clearPointer(); }
  function onPageHide() { suspended = true; sync(); }
  function onPageShow() { suspended = false; resize(); }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerout', onPointerOut, { passive: true });
  window.addEventListener('blur', clearPointer);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  resize();

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      reduced.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerout', onPointerOut);
      window.removeEventListener('blur', clearPointer);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    },
  };
}
