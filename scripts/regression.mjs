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
  if (!fs.existsSync(src)) { console.log(`- ${name}: fixture missing, skipped`); skipped++; continue; }
  const out = path.join(sandbox, 'public', 'data.json');
  fs.rmSync(out, { force: true });
  const res = spawnSync(process.execPath, ['scripts/fetch-data.js', '--file', src], { cwd: sandbox, encoding: 'utf8' });
  if (res.status !== 0) { console.log(`✗ ${name}: parser exited ${res.status}\n${(res.stdout + res.stderr).slice(-600)}`); failed++; continue; }
  const json = JSON.stringify(canon(JSON.parse(fs.readFileSync(out, 'utf8'))), null, 1);
  const goldenFile = path.join(GOLDEN_DIR, `${name}.json`);
  if (UPDATE || !fs.existsSync(goldenFile)) {
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
