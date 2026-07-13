// 候補mdをパースしてGAS経由でGoogleシートの「Candidates」タブに追記する。
// 使い方: node tools/push-candidates.mjs ../scouting-report/candidates/candidates_YYYY-MM-DD.md
import { readFileSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCandidates } from './parse-candidates.mjs';
import { GAS_URL } from '../site/favorites-config.js';

const mdPath = process.argv[2];
if (!mdPath) {
  console.error('usage: node tools/push-candidates.mjs <candidates.md>');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const passphrase = readFileSync(join(root, '.secret'), 'utf8').trim();
const md = readFileSync(mdPath, 'utf8');
const { date, items } = parseCandidates(md, basename(mdPath));
if (items.length === 0) {
  console.error('no candidates found in', mdPath);
  process.exit(1);
}

const res = await fetch(GAS_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ passphrase, action: 'addCandidates', date, candidates: items }),
});
if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  process.exit(1);
}
const body = await res.json();
if (body.error) {
  console.error('GAS error:', body.error);
  process.exit(1);
}
console.log(`追記: ${body.added}件 / スキップ(重複): ${body.skipped.length}件`);
if (body.skipped.length) console.log('スキップ:', body.skipped.join('、'));
