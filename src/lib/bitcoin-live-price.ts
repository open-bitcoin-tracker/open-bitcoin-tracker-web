import type { HistoryPoint } from './bitcoin-chart';

export type PriceFeedState = 'connecting' | 'live' | 'delayed' | 'offline';

interface PriceSubscriber {
  onPrice: (point: HistoryPoint) => void;
  onState: (state: PriceFeedState) => void;
  keepAliveWhenHidden?: boolean | (() => boolean);
}

/** A live BTC/USD subscription; background work is opt-in for tab price titles. */
export function subscribeBitcoinPrice({ onPrice, onState, keepAliveWhenHidden = false }: PriceSubscriber): () => void {
  let socket: WebSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let timers: ReturnType<typeof setInterval>[] = [];
  let attempts = 0;
  let lastMessage = 0;
  let lastStreamTick = 0;
  let streamRevision = 0;
  let lifecycle = 0;
  let stopped = false;
  let hasPrice = false;
  let polling: AbortController | undefined;
  let state: PriceFeedState = navigator.onLine ? 'connecting' : 'offline';
  onState(state);

  function setState(next: PriceFeedState) {
    if (state === next || stopped) return;
    state = next;
    onState(next);
  }

  function active() {
    return !stopped && (!document.hidden || backgroundEnabled()) && navigator.onLine;
  }

  function backgroundEnabled() {
    return typeof keepAliveWhenHidden === 'function' ? keepAliveWhenHidden() : keepAliveWhenHidden;
  }

  function streamIsLive() {
    return state === 'live';
  }

  function applyPrice(price: number) {
    if (!active() || !Number.isFinite(price) || price <= 0) return;
    hasPrice = true;
    onPrice({ time: Date.now(), price });
  }

  async function pollPrice() {
    if (polling || !active() || streamIsLive()) return;
    const controller = new AbortController();
    polling = controller;
    const requestLifecycle = lifecycle;
    const requestRevision = streamRevision;
    try {
      const response = await fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSD', {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]), cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Price API: ${response.status}`);
      const body = await response.json();
      if (!Array.isArray(body.error) || body.error.length || !body.result) throw new Error('Invalid price response');
      const ticker = Object.values(body.result)[0] as { c?: string[] } | undefined;
      const price = Number(ticker?.c?.[0]);
      if (!Number.isFinite(price) || price <= 0) throw new Error('Missing ticker price');
      // Paused pages and newer stream ticks invalidate an in-flight REST result.
      if (active() && lifecycle === requestLifecycle && streamRevision === requestRevision && !streamIsLive()) {
        setState('delayed');
        applyPrice(price);
      }
    } catch {
      // Retain the last observed price when the API is unavailable.
    } finally {
      if (polling === controller) polling = undefined;
    }
  }

  function scheduleReconnect() {
    if (!active() || reconnectTimer !== undefined) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, Math.min(1000 * 2 ** attempts++, 30_000));
  }

  function connect() {
    if (!active()) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    if (socket && socket.readyState < WebSocket.CLOSING) return;
    setState(hasPrice ? 'delayed' : 'connecting');
    let connection: WebSocket;
    try {
      connection = new WebSocket('wss://ws.kraken.com/v2');
    } catch {
      setState('delayed');
      void pollPrice();
      scheduleReconnect();
      return;
    }
    socket = connection;
    lastMessage = Date.now();
    connection.addEventListener('open', () => {
      if (socket !== connection || !active()) return;
      connection.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: ['BTC/USD'], snapshot: true } }));
    });
    connection.addEventListener('message', (event) => {
      if (socket !== connection || !active()) return;
      lastMessage = Date.now();
      try {
        const message = JSON.parse(event.data);
        if (message.method === 'subscribe' && message.success === false) { connection.close(); return; }
        if (message.channel !== 'ticker' || !['snapshot', 'update'].includes(message.type) || !Array.isArray(message.data)) return;
        const ticker = message.data.find((entry: { symbol?: string }) => entry?.symbol === 'BTC/USD');
        if (typeof ticker?.last !== 'number' || !Number.isFinite(ticker.last) || ticker.last <= 0) return;
        attempts = 0;
        lastStreamTick = Date.now();
        streamRevision++;
        setState('live');
        applyPrice(ticker.last);
      } catch { /* Ignore unrelated or malformed stream messages. */ }
    });
    connection.addEventListener('error', () => connection.close());
    connection.addEventListener('close', () => {
      if (socket !== connection) return;
      socket = undefined;
      if (!active()) return;
      setState('delayed');
      void pollPrice();
      scheduleReconnect();
    });
  }

  function checkStream() {
    if (socket && (Date.now() - lastMessage > 30_000 || (state === 'live' && Date.now() - lastStreamTick > 60_000))) {
      setState('delayed');
      socket.close();
    }
  }

  function pause() {
    lifecycle++;
    timers.forEach(clearInterval);
    timers = [];
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    polling?.abort();
    polling = undefined;
    // Detach first so its close event cannot reconnect during a pause.
    const connection = socket;
    socket = undefined;
    connection?.close();
  }

  function resume() {
    if (!active()) return;
    if (!timers.length) {
      timers = [setInterval(checkStream, 5000), setInterval(() => { void pollPrice(); }, 30_000)];
    }
    connect();
    void pollPrice();
  }

  function onOffline() {
    setState('offline');
    pause();
  }

  function onVisibilityChange() {
    if (document.hidden) {
      if (!backgroundEnabled()) pause();
    } else {
      // A suspended browser may resume before its stale-stream timer runs.
      checkStream();
      resume();
    }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    pause();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('online', resume);
    window.removeEventListener('pagehide', stop);
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('offline', onOffline);
  window.addEventListener('online', resume);
  window.addEventListener('pagehide', stop);
  resume();
  return stop;
}
