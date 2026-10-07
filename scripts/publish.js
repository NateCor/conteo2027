#!/usr/bin/env node

// Publish the site (or just the results) to the public host.
//
// Usage:
//   node scripts/publish.js site   # uploads everything in dist/ (run `npm run build` first)
//   node scripts/publish.js data   # uploads public/data.json only (what live-poll does)
//
// Credentials and target come from environment variables, never from the repo:
//   CONTEO_CREDS     path to a chmod-600 file with FTP_USER=... and FTP_PASS=...
//                    (default ~/.config/conteo/ftp.env)
//   CONTEO_TRANSPORT ftp (default) or webdav (cPanel Web Disk, HTTPS port 2078)
//   CONTEO_HOST      server name (default s560.v2nets.com; must match its certificate)
//   CONTEO_DIR       folder on the server, relative to the account's home (default /)
//
// Every file is uploaded under a temporary name and then renamed into place,
// so a viewer can never download a half-uploaded data.json. The password is
// handed to curl on stdin, so it never appears in the process list.

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
const TRANSPORT = process.env.CONTEO_TRANSPORT || 'ftp';
const HOST = process.env.CONTEO_HOST || 's560.v2nets.com';
const DIR = ('/' + (process.env.CONTEO_DIR || '/')).replace(/\/+/g, '/').replace(/\/?$/, '/');
const CREDS = process.env.CONTEO_CREDS || path.join(os.homedir(), '.config', 'conteo', 'ftp.env');
const TLS = process.env.CONTEO_FTP_TLS !== '0'; // test-only escape hatch for a local plain FTP server
const PORT = process.env.CONTEO_PORT || (TRANSPORT === 'webdav' ? '2078' : '21');

if (!['site', 'data'].includes(mode)) {
  console.error('Usage: node scripts/publish.js site|data');
  process.exit(2);
}

function readCreds() {
  const out = {};
  for (const line of fs.readFileSync(CREDS, 'utf8').split('\n')) {
    const m = line.match(/^(FTP_USER|FTP_PASS)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  if (!out.FTP_USER || !out.FTP_PASS) throw new Error(`FTP_USER/FTP_PASS missing in ${CREDS}`);
  return out;
}

const creds = readCreds();
const curlUserConfig = `user = "${creds.FTP_USER.replace(/"/g, '\\"')}:${creds.FTP_PASS.replace(/"/g, '\\"')}"\n`;

function curl(args) {
  const res = spawnSync('curl', ['-sS', '--fail', '-m', '60', '-K', '-', ...args], {
    input: curlUserConfig,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    const msg = (res.stderr || '').trim().split('\n').pop();
    throw new Error(`curl exit ${res.status}: ${msg}`);
  }
  return res.stdout;
}

// Upload one local file to remote path `rel` (relative to DIR), atomically.
function upload(localFile, rel) {
  const remote = DIR + rel;
  const tmp = `${remote}.uploading`;
  if (TRANSPORT === 'ftp') {
    const base = `ftp://${HOST}:${PORT}`;
    // -Q "-CMD" runs after the transfer, in the same session. Paths in
    // RNFR/RNTO are absolute from the account's FTP root.
    curl([
      ...(TLS ? ['--ssl-reqd'] : []),
      '--ftp-create-dirs',
      '-T', localFile,
      `${base}${encodeURI(tmp)}`,
      '-Q', `-RNFR ${tmp}`,
      '-Q', `-RNTO ${remote}`,
    ]);
  } else {
    const base = `${process.env.CONTEO_DAV_SCHEME || 'https'}://${HOST}:${PORT}`;
    // Make sure parent folders exist (MKCOL on an existing folder just fails; ignore).
    const parts = remote.split('/').slice(1, -1);
    let acc = '';
    for (const p of parts) {
      acc += `/${p}`;
      try { curl(['-X', 'MKCOL', `${base}${encodeURI(acc)}/`]); } catch (e) { /* exists */ }
    }
    curl(['-T', localFile, `${base}${encodeURI(tmp)}`]);
    curl(['-X', 'MOVE', '-H', `Destination: ${base}${encodeURI(remote)}`, '-H', 'Overwrite: T', `${base}${encodeURI(tmp)}`]);
  }
}

function listFiles(dir, prefix = '') {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix + ent.name;
    if (ent.isDirectory()) out.push(...listFiles(path.join(dir, ent.name), rel + '/'));
    else out.push(rel);
  }
  return out;
}

const started = Date.now();
try {
  if (mode === 'data') {
    upload(path.join(ROOT_DIR, 'public', 'data.json'), 'data.json');
    console.log(`published data.json via ${TRANSPORT} in ${Date.now() - started} ms`);
  } else {
    const dist = path.join(ROOT_DIR, 'dist');
    if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist/ missing: run the build first');
    // Assets first, index.html last: the old page keeps working until the
    // new page (which points at the new hashed assets) is in place.
    const files = listFiles(dist).sort((a, b) => (a === 'index.html') - (b === 'index.html'));
    for (const rel of files) {
      upload(path.join(dist, rel), rel);
      console.log(`  ✓ ${rel}`);
    }
    console.log(`published ${files.length} files via ${TRANSPORT} in ${Date.now() - started} ms`);
  }
} catch (err) {
  console.error(`[publish] FAILED: ${err.message}`);
  process.exit(1);
}
