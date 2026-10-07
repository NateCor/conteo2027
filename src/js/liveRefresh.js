'use strict';
// Live auto-refresh: re-fetch data.json on an interval and hand new data to
// the page only when the content actually changed. Viewers never reload.
//
// - Interval comes from config/election.json `election.refreshSeconds`.
// - `cache: 'no-cache'` makes the browser revalidate with the server every
//   time (If-None-Match / If-Modified-Since). When nothing changed the host
//   answers 304 with no body, which is very light on shared hosting; the
//   .htaccess in public/ also tells the server never to cache data.json.
// - A failed or half-written response never replaces good data: the parse
//   happens before the hand-off, and the page keeps the last good numbers.
// - Polling pauses while the tab is hidden and fires immediately when it
//   becomes visible again (phones left on the lock screen catch up at once).
// - Failures back off (2x per failure, capped at 60 s) and recover alone.
import electionConfig from '../../config/election.json';

const DATA_URL = '/data.json';
const INTERVAL_MS = Math.max(5, electionConfig.election.refreshSeconds || 15) * 1000;
const MAX_BACKOFF_MS = 60000;

export function startLiveRefresh({ onData, onStatus }) {
  let lastText = null;
  let timer = null;
  let inFlight = false;
  let failures = 0;

  const schedule = () => {
    clearTimeout(timer);
    if (document.hidden) return;
    const delay = failures
      ? Math.min(INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS)
      : INTERVAL_MS;
    timer = setTimeout(check, delay);
  };

  async function check() {
    if (inFlight) return;
    inFlight = true;
    try {
      const res = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text !== lastText) {
        const data = JSON.parse(text); // throws on a truncated file -> kept old data
        onData(data);
        lastText = text;
      }
      // Time of the last successful check: "the numbers on screen were
      // current as of HH:MM:SS". (File mtimes are useless here: the poller
      // rewrites data.json on every pass, and a static host stamps deploys.)
      onStatus({ state: 'live', checkedAt: new Date() });
      failures = 0;
    } catch (err) {
      failures++;
      console.warn(`[live-refresh] check failed (${failures}):`, err);
      onStatus({ state: 'error', error: err, failures, hasData: lastText !== null });
    } finally {
      inFlight = false;
      schedule();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(timer);
    } else {
      check();
    }
  });

  check();
}
