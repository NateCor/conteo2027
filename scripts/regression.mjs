#!/usr/bin/env node
// Regression guard: parses every real election workbook in a throwaway copy
// of the repo and compares the resulting data.json with a stored "golden"
// snapshot. Any change in parsed numbers fails the run.
//
//   node scripts/regression.mjs            # check (exit 1 on any difference)
//   node scripts/regression.mjs --update   # re-record goldens (only after a
//                                          # deliberate, reviewed data change)
//
// Workbooks live outside the repo (they're gitignored): set CONTEO_FIXTURES
// or use the default ~/tricel_2026/legacy. Never touches public/data.json.

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = process.env.CONTEO_FIXTURES || path.join(os.homedir(), 'tricel_2026', 'legacy');
const GOLDEN_DIR = path.join(ROOT, 'test', 'golden');
const UPDATE = process.argv.includes('--update');

const CASES = [
  ['2027-primera-vuelta-final', 'Conteo FEUC 2027 primera vuelta FINAL.xlsx'],
  ['2026-primera-vuelta', 'Conteo Elecciones FEUC 2026 - Oct 2025.xlsx'],
  ['2026-segunda-vuelta', 'Conteo Elecciones FEUC 2026 - Oct 2025 2da vuelta.xlsx'],
  ['2025-primera-vuelta', 'Conteo Elecciones FEUC 2025 (Puclitico).xlsx'],
];

// Invariant independent of any golden: for every list column, the parsed
// total must equal the sheet's own TOTAL row (when the file has cached values).
const xlsx = (await import(path.join(ROOT, 'node_modules', 'xlsx', 'xlsx.js'))).default;
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'election.json'), 'utf8'));
function checkSheetTotals(file, data) {
  const wb = xlsx.readFile(file);
  const errs = [];
  for (const [sheet, type] of [['Directiva FEUC', 'lista'], ['Consejería Superior', 'sup']]) {
    const ws = wb.Sheets[sheet];
    if (!ws) continue;
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true });
    const total = rows.find((r) => r.slice(0, 3).some((c) => typeof c === 'string' && /^\s*total\s*$/i.test(c)));
    if (!total) continue;
    const keyOf = {};
    for (const p of config.parties[type]) for (const n of p.excelNames) keyOf[n.replace(/^>>/, '').trim()] = p.key;
    keyOf.Blancos = 'b'; keyOf.Nulos = 'n';
    rows[0].forEach((h, i) => {
      const k = keyOf[String(h || '').replace(/^>>/, '').trim()];
      if (k && typeof total[i] === 'number' && data.total[type].total[k] !== total[i]) {
        errs.push(`${type} ${h}: sheet ${total[i]} vs parsed ${data.total[type].total[k]}`);
      }
    });
  }
  return errs;
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'conteo-reg-'));
for (const d of ['scripts', 'config']) fs.cpSync(path.join(ROOT, d), path.join(sandbox, d), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(sandbox, 'package.json'));
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(sandbox, 'node_modules'));
fs.mkdirSync(path.join(sandbox, 'public'));
fs.mkdirSync(GOLDEN_DIR, { recursive: true });

// Canonical form: sorted keys, so harmless key-order changes don't fail.
const canon = (v) => (Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);

let failed = 0;
let skipped = 0;
for (const [name, file] of CASES) {
  const src = path.join(FIXTURES, file);
  if (!fs.existsSync(src)) { console.log(`✗ ${name}: fixture missing: ${src}`); failed++; skipped++; continue; }
  const out = path.join(sandbox, 'public', 'data.json');
  fs.rmSync(out, { force: true });
  const res = spawnSync(process.execPath, ['scripts/fetch-data.js', '--file', src], { cwd: sandbox, encoding: 'utf8' });
  if (res.status !== 0) { console.log(`✗ ${name}: parser exited ${res.status}\n${(res.stdout + res.stderr).slice(-600)}`); failed++; continue; }
  const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
  const totalErr = checkSheetTotals(src, parsed);
  if (totalErr.length) { console.log(`✗ ${name}: parsed totals != sheet TOTAL row\n  ${totalErr.join('\n  ')}`); failed++; continue; }
  const json = JSON.stringify(canon(parsed), null, 1);
  const goldenFile = path.join(GOLDEN_DIR, `${name}.json`);
  if (!UPDATE && !fs.existsSync(goldenFile)) {
    console.log(`✗ ${name}: no golden to compare against. Record goldens with --update from a known-good commit first.`);
    failed++;
    continue;
  }
  if (UPDATE) {
    fs.writeFileSync(goldenFile, json);
    console.log(`● ${name}: golden recorded`);
    continue;
  }
  const golden = fs.readFileSync(goldenFile, 'utf8');
  if (golden === json) { console.log(`✓ ${name}`); continue; }
  failed++;
  const a = JSON.parse(golden), b = JSON.parse(json);
  const diffs = [];
  const walk = (x, y, p) => {
    if (diffs.length > 8) return;
    if (typeof x !== 'object' || x === null || typeof y !== 'object' || y === null) {
      if (JSON.stringify(x) !== JSON.stringify(y)) diffs.push(`${p}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`);
      return;
    }
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${p}.${k}`);
  };
  walk(a, b, '');
  console.log(`✗ ${name}: output differs from golden\n  ${diffs.join('\n  ')}`);
}
fs.rmSync(sandbox, { recursive: true, force: true });
console.log(failed ? `\nFAIL: ${failed} case(s)` : `\nOK (${CASES.length - skipped} cases${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(failed ? 1 : 0);
