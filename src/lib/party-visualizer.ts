// Playback provides the analyser; the scene never invents audio levels.
export function createPartyVisualizer(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return {
    setPlaying(_value: boolean) {},
    setAnalyser(_value?: AnalyserNode) {},
    destroy() {},
  };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let previous: number | undefined;
  let elapsed = 0;
  let playing = false;
  let destroyed = false;
  let width = 0;
  let height = 0;
  let analyser: AnalyserNode | undefined;
  let spectrum = new Uint8Array(0);
  let decibels = new Float32Array(0);
  let waveform = new Float32Array(0);
  const levels = new Float32Array(112);
  const previousMagnitudes = new Float32Array(levels.length);
  const bandStarts = new Uint32Array(levels.length);
  const bandEnds = new Uint32Array(levels.length);
  let bassStart = 0;
  let bassEnd = 0;
  let bass = 0;
  let rms = 0;
  let previousBass = 0;
  let previousRms = 0;
  let bassBaseline = 0;
  let rmsBaseline = 0;
  let energyBaseline = 0;
  let sampled = false;
  let pulse = 0;
  let lastOnset = -Infinity;

  function canAnimate() {
    return !destroyed && !document.hidden && playing && !!analyser
      && !reduced.matches && width > 0 && height > 0;
  }

  function resetAudio() {
    levels.fill(0);
    previousMagnitudes.fill(0);
    bass = rms = previousBass = previousRms = 0;
    bassBaseline = rmsBaseline = energyBaseline = 0;
    pulse = 0;
    sampled = false;
    lastOnset = -Infinity;
  }

  function sample(delta: number) {
    if (!analyser || !canAnimate()) {
      resetAudio();
      return;
    }
    analyser.getByteFrequencyData(spectrum);
    analyser.getFloatFrequencyData(decibels);
    analyser.getFloatTimeDomainData(waveform);
    let waveformPower = 0;
    for (const value of waveform) waveformPower += value * value;
    rms = Math.sqrt(waveformPower / waveform.length);

    // FFT bytes encode a decibel display range, not linear audio power. Use
    // true amplitudes for onset detection and the bytes only for spectrum bars.
    let bassPower = 0;
    for (let bin = 0; bin < decibels.length; bin++) {
      const amplitude = Number.isFinite(decibels[bin]) ? Math.min(1, 10 ** (decibels[bin] / 20)) : 0;
      decibels[bin] = amplitude;
      if (bin >= bassStart && bin < bassEnd) bassPower += amplitude * amplitude;
    }
    bass = Math.sqrt(bassPower / Math.max(1, bassEnd - bassStart));
    let measuredEnergy = 0;
    let positiveFlux = 0;
    for (let i = 0; i < levels.length; i++) {
      let power = 0;
      let amplitudePower = 0;
      for (let bin = bandStarts[i]; bin < bandEnds[i]; bin++) {
        power += spectrum[bin] ** 2;
        amplitudePower += decibels[bin] ** 2;
      }
      const count = bandEnds[i] - bandStarts[i];
      const amplitude = Math.sqrt(amplitudePower / count);
      measuredEnergy += amplitude / levels.length;
      positiveFlux += Math.max(0, amplitude - previousMagnitudes[i]) / levels.length;
      previousMagnitudes[i] = amplitude;
      const magnitude = Math.sqrt(power / count) / 255;
      const target = Math.max(0, (magnitude - .025) / .975);
      // A quick attack follows transients while a slower release avoids jitter.
      levels[i] += (target - levels[i]) * (target > levels[i] ? .5 : .18);
    }

    pulse = Math.max(0, pulse - delta / 180);
    const bassRise = Math.max(0, bass - previousBass) / Math.max(.00005, bassBaseline);
    const rmsRise = Math.max(0, rms - previousRms) / Math.max(.001, rmsBaseline);
    const fluxRise = positiveFlux / Math.max(.00005, energyBaseline);
    const strength = Math.max((bassRise - .12) / .5, (rmsRise - .16) / .6, (fluxRise - .10) / .4);
    const audible = rms > .0008 || bass > .00003 || measuredEnergy > .00002;
    if (audible && strength > .18 && elapsed - lastOnset >= 110) {
      // Immediate attack follows a real transient. There is no tempo clock:
      // a held tone cannot retrigger without a new positive rise or FFT flux.
      pulse = Math.min(1, .55 + strength * .45);
      lastOnset = elapsed;
    }
    const adaptation = sampled ? 1 - Math.exp(-delta / 400) : 1;
    bassBaseline += (bass - bassBaseline) * adaptation;
    rmsBaseline += (rms - rmsBaseline) * adaptation;
    energyBaseline += (measuredEnergy - energyBaseline) * adaptation;
    previousBass = bass;
    previousRms = rms;
    sampled = true;
  }

  function draw(delta = 0) {
    if (!context || !width || !height) return;
    sample(delta);
    let energy = 0;
    for (let i = 0; i < levels.length; i++) {
      energy += levels[i] / levels.length;
    }
    const bassEnvelope = Math.min(1, bass / Math.max(.00005, bassBaseline));
    const rmsEnvelope = Math.min(1, rms / Math.max(.001, rmsBaseline));
    context.fillStyle = '#100905';
    context.fillRect(0, 0, width, height);
    const glow = context.createRadialGradient(width * .5, height * .65, 0, width * .5, height * .65, Math.max(width, height) * (.65 + pulse * .15));
    glow.addColorStop(0, `rgba(255, 90, 8, ${Math.min(.95, .10 + energy * .23 + rmsEnvelope * .05 + pulse * .65)})`);
    glow.addColorStop(.48, `rgba(203, 53, 0, ${.05 + energy * .10 + pulse * .3})`);
    glow.addColorStop(1, 'rgba(16, 9, 5, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    // The spatial shape has no time-driven phase. Measured audio envelopes
    // and onset punches provide every change; silence leaves flat ribbons.
    for (let ribbon = 0; ribbon < 5; ribbon++) {
      const baseline = height * (.47 + ribbon * .075);
      context.beginPath();
      for (let i = 0; i <= levels.length; i++) {
        const x = i / levels.length * width;
        const level = levels[Math.min(i, levels.length - 1)];
        const wave = Math.sin(i * .065 + ribbon * .6);
        const y = baseline + wave * height * (energy * .10 + bassEnvelope * .035 + rmsEnvelope * .025 + pulse * .18)
          - level * height * (.13 + pulse * .1);
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = `rgba(255, ${113 + ribbon * 17}, 32, ${Math.min(1, .15 + ribbon * .045 + energy * .12 + pulse * .55)})`;
      context.lineWidth = (ribbon === 2 ? 2 : 1) + pulse * 6;
      context.shadowColor = '#ff780b';
      context.shadowBlur = 10 + energy * 20 + pulse * 55;
      context.stroke();
    }
    context.shadowBlur = 0;

    const gradient = context.createLinearGradient(0, height * .55, 0, height);
    gradient.addColorStop(0, 'rgba(255, 192, 97, .9)');
    gradient.addColorStop(.45, 'rgba(255, 121, 15, .48)');
    gradient.addColorStop(1, 'rgba(255, 70, 0, .02)');
    context.fillStyle = gradient;
    const spacing = width / levels.length;
    for (let i = 0; i < levels.length; i++) {
      const column = height * levels[i] * .55;
      context.fillRect(i * spacing, height - column, Math.max(1, spacing * .5), column);
    }
  }

  function tick(now: number) {
    frame = 0;
    if (!canAnimate()) return;
    if (previous === undefined || now - previous >= 1000 / 30) {
      const delta = previous === undefined ? 0 : Math.max(0, now - previous);
      elapsed += delta;
      previous = now;
      draw(delta);
    }
    frame = requestAnimationFrame(tick);
  }

  function update() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = undefined;
    if (destroyed || document.hidden) return;
    draw();
    if (canAnimate()) frame = requestAnimationFrame(tick);
  }

  function resize() {
    if (destroyed) return;
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    update();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  document.addEventListener('visibilitychange', update);
  reduced.addEventListener('change', update);
  resize();
  return {
    setPlaying(value: boolean) { if (!destroyed) { playing = value; update(); } },
    setAnalyser(value?: AnalyserNode) {
      if (destroyed) return;
      analyser = value;
      resetAudio();
      spectrum = new Uint8Array(value?.frequencyBinCount ?? 0);
      decibels = new Float32Array(value?.frequencyBinCount ?? 0);
      waveform = new Float32Array(value?.fftSize ?? 0);
      if (value && spectrum.length) {
        const binHz = value.context.sampleRate / value.fftSize;
        bassStart = Math.min(spectrum.length - 1, Math.ceil(40 / binHz));
        bassEnd = Math.min(spectrum.length, Math.max(bassStart + 1, Math.floor(180 / binHz) + 1));
        const upperHz = Math.min(16_000, value.context.sampleRate / 2);
        const lowerHz = Math.min(32, upperHz);
        for (let i = 0; i < levels.length; i++) {
          const startHz = lowerHz * (upperHz / lowerHz) ** (i / levels.length);
          const endHz = lowerHz * (upperHz / lowerHz) ** ((i + 1) / levels.length);
          bandStarts[i] = Math.min(spectrum.length - 1, Math.floor(startHz / binHz));
          bandEnds[i] = Math.min(spectrum.length, Math.max(bandStarts[i] + 1, Math.ceil(endHz / binHz)));
        }
      }
      update();
    },
    destroy() {
      destroyed = true;
      analyser = undefined;
      cancelAnimationFrame(frame);
      frame = 0;
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      reduced.removeEventListener('change', update);
    },
  };
}
