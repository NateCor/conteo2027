#!/usr/bin/env node

// Election-night live mode: poll the online Excel and regenerate the site's
// data whenever the sheet changes. Designed for the real counting sheet —
// the team edits the online spreadsheet and this loop picks it up.
//
// Usage:
//   SHEET_URL="<sharepoint share link>" node scripts/live-poll.js [intervalSeconds]
//
// Notes:
//   - The share link can be pasted as-is (":x:/g/personal/..." viewer links
//     are rewritten to the raw-download endpoint by fetch-data.js).
//   - A sheet that fails validation is REJECTED without touching data.json,
//     so the site keeps serving the last good data mid-edit.
//   - The site picks up the new data.json on reload (auto-refresh is the
//     next step of the live-mode work).

import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT_DIR, 'public', 'data.json');

const intervalSeconds = parseInt(process.argv[2], 10) || 60;

if (!process.env.SHEET_URL) {
  console.error('Usage: SHEET_URL="<sharepoint share link>" node scripts/live-poll.js [intervalSeconds]');
  process.exit(1);
}

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const sha256 = (buf) => {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
};

let lastHash = fs.existsSync(OUTPUT_FILE)
  ? sha256(fs.readFileSync(OUTPUT_FILE))
  : null;
let polls = 0;

console.log(`[${stamp()}] live-poll started — every ${intervalSeconds}s`);
console.log(`  SHEET_URL: ${process.env.SHEET_URL.slice(0, 80)}...`);
console.log(`  initial data.json hash: ${lastHash ?? '(none)'}`);

setInterval(() => {
  polls++;
  const res = spawnSync(process.execPath, [path.join(__dirname, 'fetch-data.js')], {
    cwd: ROOT_DIR,
    env: process.env,
    encoding: 'utf8',
    timeout: (intervalSeconds - 1) * 1000 || 30000,
  });

  if (res.status !== 0) {
    // Validation rejected the sheet (mid-edit) or download failed —
    // data.json is untouched, site keeps the last good data.
    console.log(`[${stamp()}] poll ${polls}: fetch FAILED (exit ${res.status}) — data.json untouched`);
    return;
  }

  const newHash = sha256(fs.readFileSync(OUTPUT_FILE));
  if (newHash !== lastHash) {
    console.log(`[${stamp()}] poll ${polls}: CHANGE DETECTED (${lastHash ?? 'none'} → ${newHash}) — data.json regenerated`);
    lastHash = newHash;
  } else {
    console.log(`[${stamp()}] poll ${polls}: no change (${newHash})`);
  }
}, intervalSeconds * 1000);
