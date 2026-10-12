#!/usr/bin/env node
// UI regression check: builds the site, serves the build, loads it in a
// headless Chromium for each golden data file (test/golden, recorded by
// scripts/regression.mjs) and records what a viewer sees in every view:
// header, totals per day, every mesa, every territory, every CT territory,
// participation, escrutadas. Compares with test/ui-golden; also enforces
// invariants: no JS errors, no horizontal overflow on a 375 px phone, and
// every vote pill's text >= 4.5:1 contrast in both themes.
//
//   node scripts/ui-check.mjs            # check
//   node scripts/ui-check.mjs --update   # re-record after a deliberate UI change
//
// Needs a Chromium: CHROME=/path/to/chrome (default: Playwright's headless shell).

import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPDATE = process.argv.includes('--update');
const GOLDEN_IN = path.join(ROOT, 'test', 'golden');
const GOLDEN_UI = path.join(ROOT, 'test', 'ui-golden');
const CHROME = process.env.CHROME || (() => {
  const base = path.join(os.homedir(), '.cache', 'ms-playwright');
  const dir = fs.existsSync(base) && fs.readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell')).sort().pop();
  return dir ? path.join(base, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell') : 'chromium';
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- build into a temp dir ----
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'conteo-ui-'));
const { build } = await import(path.join(ROOT, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
await build({ root: ROOT, logLevel: 'error', build: { outDir: OUT, emptyOutDir: true } });

// ---- tiny static server; data.json swapped per case ----
let currentData = '{}';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/data.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(currentData); }
  const f = path.join(OUT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(OUT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_BASE = `http://127.0.0.1:${server.address().port}/`;

// ---- headless Chromium over CDP ----
const chrome = spawn(CHROME, ['--headless', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0',
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'conteo-chrome-'))}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\S+)/); if (m) resolve(m[1]); });
  setTimeout(() => reject(new Error('Chromium did not start: ' + CHROME)), 20000);
});
const targets = await (await fetch(wsUrl.replace(/^ws/, 'http').replace(/\/devtools\/browser\/.*/, '/json'))).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const pending = new Map();
const jsErrors = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') jsErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') jsErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
await cdp('Runtime.enable');
await cdp('Page.enable');

async function load(width, theme) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
  await cdp('Page.navigate', { url: URL_BASE });
  await sleep(300);
  await evaluate(theme === 'dark' ? "localStorage.setItem('theme','dark')" : "localStorage.removeItem('theme')");
  await cdp('Page.navigate', { url: URL_BASE });
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    if (await evaluate("(document.querySelector('#live-status')||{}).className === 'is-live'").catch(() => false)) break;
  }
  await sleep(300);
}

// Everything a viewer can see, view by view (runs in the page)
const COLLECT = `(async () => {
  const t = (s) => [...document.querySelectorAll(s)].map(e => e.innerText.replace(/\\s+/g, ' ').trim()).filter(Boolean);
  const tick = () => new Promise(r => setTimeout(r, 30));
  const pick = async (sel, value) => { const el = document.querySelector(sel); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); await tick(); };
  const day = async (name, v) => { const r = document.querySelector('input[name=' + name + '][value=' + v + ']'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); await tick(); };
  const pane = (id) => t('#' + id + ' .vote').join(' | ') + ' || ' + t('#' + id + ' .vote-counter').join(' ');
  const out = { header: t('#bind-header .party-item, #bind-second-round .bar-item'), progress: t('#bind-progress'), total: {}, mesas: {}, terris: {}, ct: {} };
  for (const d of ['dia1', 'dia2', 'total']) { await day('total-dia', d); out.total[d] = [pane('bind-total-lista'), pane('bind-total-sup')]; }
  const opts = (sel) => [...document.querySelectorAll(sel + ' option')].map(o => [o.value, o.textContent.trim()]);
  for (const [v, name] of opts('form[name=selected-mesa] select')) { await pick('form[name=selected-mesa] select', v); out.mesas[name] = [pane('bind-mesa-lista'), pane('bind-mesa-sup')]; }
  for (const [v, name] of opts('form[name=selected-terri] select')) { await pick('form[name=selected-terri] select', v); out.terris[name] = [pane('bind-terri-lista'), pane('bind-terri-sup')]; }
  if (document.querySelector('#ct-section') && getComputedStyle(document.querySelector('#ct-section')).display !== 'none') {
    for (const [v, name] of opts('form[name=selected-ct] select')) { await pick('form[name=selected-ct] select', v); out.ct[name] = t('#bind-ct .bar-item').join(' | ') + ' || ' + t('#bind-ct .vote-counter').join(' '); }
  }
  out.participacion = t('#bind-participacion .bar-item');
  out.escrutadas = t('#bind-mesas .subtitle').concat(t('#bind-mesas tr').slice(0, 200));
  out.pptoVisible = !!document.querySelector('#bind-ppto-section') && getComputedStyle(document.querySelector('#bind-ppto-section')).display !== 'none';
  return out;
})()`;

const CONTRAST = `(() => {
  const rgb = c => c.match(/[\\d.]+/g).map(Number);
  const L = ([r, g, b]) => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (fg, a, bg) => fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
  const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const bad = [];
  document.querySelectorAll('.votes .vote').forEach(v => {
    const bg = rgb(getComputedStyle(v).backgroundColor);
    for (const part of ['.label', '.percentage']) {
      const e = v.querySelector(part); if (!e) continue; const cs = getComputedStyle(e); const c = rgb(cs.color);
      const ratio = cr(blend(c, parseFloat(cs.opacity) * (c[3] ?? 1), bg), bg);
      if (ratio < 4.5) bad.push(v.className + ' ' + part + ' ' + ratio.toFixed(2));
    }
  });
  return [...new Set(bad)];
})()`;

const OVERFLOW = `(() => { const w = document.documentElement.clientWidth; const bad = [];
  document.querySelectorAll('body *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.right > w + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.table-wrap')) bad.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.right)); });
  return [...new Set(bad)].slice(0, 5); })()`;

let failed = 0;
fs.mkdirSync(GOLDEN_UI, { recursive: true });
const cases = fs.readdirSync(GOLDEN_IN).filter((f) => f.endsWith('.json')).sort();
for (const file of cases) {
  currentData = fs.readFileSync(path.join(GOLDEN_IN, file), 'utf8');
  const name = file.replace(/\.json$/, '');
  const problems = [];
  jsErrors.length = 0;
  await load(1280, 'light');
  const snap = await evaluate(COLLECT);
  for (const theme of ['light', 'dark']) {
    await load(375, theme);
    const bad = await evaluate(CONTRAST);
    if (bad.length) problems.push(`${theme} contrast < 4.5: ${bad.slice(0, 4).join('; ')}`);
    const ov = await evaluate(OVERFLOW);
    if (ov.length) problems.push(`${theme} 375px overflow: ${ov.join('; ')}`);
  }
  if (jsErrors.length) problems.push(`JS errors: ${[...new Set(jsErrors)].slice(0, 3).join(' / ')}`);
  const json = JSON.stringify(snap, null, 1);
  const gfile = path.join(GOLDEN_UI, file);
  if (UPDATE || !fs.existsSync(gfile)) {
    fs.writeFileSync(gfile, json);
    console.log(`● ${name}: UI golden recorded`);
  } else if (fs.readFileSync(gfile, 'utf8') !== json) {
    const a = JSON.parse(fs.readFileSync(gfile, 'utf8'));
    const diffs = [];
    const walk = (x, y, p) => {
      if (diffs.length > 6) return;
      if (typeof x !== 'object' || x === null || typeof y !== 'object' || y === null) { if (JSON.stringify(x) !== JSON.stringify(y)) diffs.push(`${p}\n      was: ${JSON.stringify(x)}\n      now: ${JSON.stringify(y)}`); return; }
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${p}.${k}`);
    };
    walk(a, snap, '');
    problems.push(`view differs from UI golden:\n    ${diffs.join('\n    ')}`);
  }
  if (problems.length) { failed++; console.log(`✗ ${name}\n  ${problems.join('\n  ')}`); } else console.log(`✓ ${name} (${Object.keys(snap.mesas).length} mesas, ${Object.keys(snap.terris).length} territorios, ${Object.keys(snap.ct).length} CT views)`);
}

ws.close();
chrome.kill();
server.close();
fs.rmSync(OUT, { recursive: true, force: true });
console.log(failed ? `\nFAIL: ${failed} case(s)` : '\nOK');
process.exit(failed ? 1 : 0);
