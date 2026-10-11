import { BITCOIN_MAX, equalShare, formatDate, formatNumber, interpolate, projectMoney, projectPopulation, annualRate, type SupplySnapshot } from '../features/supply/model';
import type { SupplyCopy } from '../i18n/supply';

type ClientCopy = Pick<SupplyCopy, 'projected' | 'recorded' | 'paused' | 'pause' | 'resume' | 'stale' | 'reduced' | 'unavailable' | 'populationEstimate' | 'populationRecorded' | 'populationFallback' | 'populationUnavailable' | 'bitcoinShareBasis'>;
const root = document.querySelector<HTMLElement>('[data-supply]');
const json = document.getElementById('supply-data');
if (root && json) {
  const { snapshot, locale, copy } = JSON.parse(json.textContent ?? '{}') as { snapshot: SupplySnapshot; locale: string; copy: ClientCopy };
  const panels = snapshot.fiat.map((money) => {
    const panel = root.querySelector<HTMLElement>(`[data-currency="${money.id}"]`);
    return { money, panel,
      total: panel?.querySelector<HTMLElement>('[data-money-total]') ?? null,
      share: panel?.querySelector<HTMLElement>('[data-money-share]') ?? null,
      label: panel?.querySelector<HTMLElement>('[data-total-label]') ?? null,
      status: root.querySelector<HTMLElement>(`[data-projection-status="${money.id}"]`),
    };
  });
  const motionStatus = root.querySelector<HTMLElement>('[data-motion-status]');
  const populationTotal = root.querySelector<HTMLElement>('[data-population]');
  const populationLabel = root.querySelector<HTMLElement>('[data-population-label]');
  const populationStatus = root.querySelector<HTMLElement>('[data-population-status]');
  const bitcoinShare = root.querySelector<HTMLElement>('[data-btc-share]');
  const bitcoinBasis = root.querySelector<HTMLElement>('[data-btc-basis]');
  const button = root.querySelector<HTMLButtonElement>('[data-pause]');
  const buttonLabel = root.querySelector<HTMLElement>('[data-pause-label]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  let frozenAt = Date.now();
  let timer: number | undefined;
  const setText = (element: HTMLElement | null, text: string) => {
    if (element && element.textContent !== text) element.textContent = text;
  };
  // A one-time visit snapshot keeps Bitcoin's share fixed while fiat and
  // population follow one shared model time. No persisted demographic clock.
  const visitPopulation = projectPopulation(snapshot, frozenAt).persons ?? snapshot.population.persons;
  const visitBitcoinShare = equalShare(BITCOIN_MAX, visitPopulation);
  setText(bitcoinShare, formatNumber(visitBitcoinShare, locale, 8));
  setText(bitcoinBasis, interpolate(copy.bitcoinShareBasis, { population: formatNumber(visitPopulation, locale) }));
  const render = () => {
    const now = Date.now();
    // Expiry checks use wall time even while the displayed model time is frozen.
    const shownAt = paused || reduce.matches ? frozenAt : now;
    const currentPopulation = projectPopulation(snapshot, now);
    const shownPopulation = currentPopulation.state === 'estimated' ? projectPopulation(snapshot, shownAt) : currentPopulation;
    const people = shownPopulation.persons ?? snapshot.population.persons;
    setText(populationTotal, formatNumber(people, locale));
    setText(populationLabel, shownPopulation.state === 'estimated' ? copy.populationEstimate : copy.populationRecorded);
    setText(populationStatus, shownPopulation.state === 'snapshot'
      ? interpolate(copy.populationFallback, { date: formatDate(shownPopulation.date!, locale) })
      : shownPopulation.state === 'unavailable' ? copy.populationUnavailable : '');
    setText(motionStatus, reduce.matches ? copy.reduced : paused ? copy.paused : '');
    const motion = !reduce.matches && !document.hidden ? paused ? 'paused' : 'running' : 'still';
    let canMove = currentPopulation.state === 'estimated' && currentPopulation.rate !== 0;
    for (const { money, panel, total, share, label, status } of panels) {
      const current = projectMoney(money, now);
      const shown = current.state === 'projected' ? projectMoney(money, shownAt) : current;
      const projected = shown.state === 'projected';
      const amount = shown.amount ?? money.latest.amount;
      setText(total, formatNumber(amount, locale));
      setText(share, formatNumber(equalShare(amount, people), locale));
      setText(label, interpolate(projected ? copy.projected : copy.recorded, { aggregate: money.aggregate }));
      setText(status, current.state === 'stale' ? copy.stale : current.state === 'unavailable' ? copy.unavailable : '');
      const moneyCanMove = projected && annualRate(money) !== 0;
      canMove ||= moneyCanMove;
      // Only this currency's model controls its bills. Population and another
      // currency cannot restart a flat, expired or unavailable series.
      if (panel) panel.dataset.moneyMotion = moneyCanMove ? motion : 'still';
    }
    root.dataset.motion = canMove ? motion : 'still';
    if (button) {
      button.hidden = !canMove || reduce.matches;
      button.setAttribute('aria-pressed', String(paused));
    }
    setText(buttonLabel, paused ? copy.resume : copy.pause);
  };
  const schedule = () => {
    window.clearInterval(timer);
    render();
    // Quiet counters, no animation frame loop; continue bounded-range checks.
    if (!document.hidden) timer = window.setInterval(render, paused || reduce.matches || button?.hidden ? 30_000 : 100);
  };
  button?.addEventListener('click', () => {
    paused = !paused;
    if (paused) frozenAt = Date.now();
    schedule();
  });
  reduce.addEventListener('change', () => { frozenAt = Date.now(); schedule(); });
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pagehide', () => { window.clearInterval(timer); });
  window.addEventListener('pageshow', schedule);
  schedule();
}
