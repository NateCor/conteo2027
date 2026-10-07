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
//   - Open pages pick up the new data.json by themselves within
//     election.refreshSeconds (src/js/liveRefresh.js); nobody reloads.
//   - PUBLISH=1 also uploads data.json to the public host (scripts/publish.js)
//     whenever the published copy differs from the local one. A failed upload
//     is retried on the next poll, so a short host outage heals by itself.

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
const PUBLISH = process.env.PUBLISH === '1';
let publishedHash = null; // hash of the copy currently on the public host
let publishFailures = 0;
// A rejected login must NOT be retried every poll: cPanel locks the account
// after a few failures. On a login rejection publishing pauses until the
// credentials file changes (someone saved a corrected password).
const CREDS_FILE = process.env.CONTEO_CREDS || path.join(process.env.HOME || '', '.config', 'conteo', 'ftp.env');
const credsStamp = () => { try { return fs.statSync(CREDS_FILE).mtimeMs; } catch (e) { return 0; } };
let authBlockedAt = null;

function publishIfNeeded(hash) {
  if (!PUBLISH || hash === publishedHash) return;
  if (authBlockedAt !== null) {
    if (credsStamp() === authBlockedAt) return; // still the rejected credentials
    console.log(`[${stamp()}]   credentials file changed — resuming publishing`);
    authBlockedAt = null;
  }
  const res = spawnSync(process.execPath, [path.join(__dirname, 'publish.js'), 'data'], {
    cwd: ROOT_DIR,
    env: process.env,
    encoding: 'utf8',
    timeout: 90000,
  });
  if (res.status === 0) {
    publishedHash = hash;
    publishFailures = 0;
    console.log(`[${stamp()}]   published (${hash}) ${String(res.stdout).trim()}`);
  } else {
    publishFailures++;
    const why = res.signal ? `signal ${res.signal}` : `exit ${res.status}`;
    const detail = String(res.stderr || res.stdout || '').trim().split('\n').slice(-2).join(' | ');
    if (/\b(530|401|403)\b|Access denied|Login/i.test(detail)) {
      authBlockedAt = credsStamp();
      console.log(`[${stamp()}]   PUBLISH LOGIN REJECTED — paused until ${CREDS_FILE} changes: ${detail.slice(0, 200)}`);
      return;
    }
    console.log(`[${stamp()}]   PUBLISH FAILED #${publishFailures} (${why}) — retry next poll: ${detail.slice(0, 300)}`);
  }
}

console.log(`[${stamp()}] live-poll started — every ${intervalSeconds}s`);
console.log(`  SHEET_URL: ${process.env.SHEET_URL.slice(0, 80)}...`);
console.log(`  initial data.json hash: ${lastHash ?? '(none)'}`);
console.log(`  publishing to host: ${PUBLISH ? 'ON' : 'off'}`);

setInterval(() => {
  polls++;
  const res = spawnSync(process.execPath, [path.join(__dirname, 'fetch-data.js')], {
    cwd: ROOT_DIR,
    env: process.env,
    encoding: 'utf8',
    timeout: 30000,
  });

  if (res.status !== 0) {
    // Validation rejected the sheet (mid-edit) or download failed —
    // data.json is untouched, site keeps the last good data.
    const why = res.signal ? `signal ${res.signal}` : `exit ${res.status}`;
    console.log(`[${stamp()}] poll ${polls}: fetch FAILED (${why}) — data.json untouched`);
    // Surface the reason: without this, a string of failures on the night
    // is undiagnosable (network stall vs validation reject look identical).
    const detail = String(res.stderr || res.stdout || '').trim().split('\n').slice(-3).join(' | ');
    if (detail) console.log(`  ${detail.slice(0, 300)}`);
    return;
  }

  const newHash = sha256(fs.readFileSync(OUTPUT_FILE));
  if (newHash !== lastHash) {
    console.log(`[${stamp()}] poll ${polls}: CHANGE DETECTED (${lastHash ?? 'none'} → ${newHash}) — data.json regenerated`);
    lastHash = newHash;
  } else {
    console.log(`[${stamp()}] poll ${polls}: no change (${newHash})`);
  }
  publishIfNeeded(newHash);
}, intervalSeconds * 1000);
