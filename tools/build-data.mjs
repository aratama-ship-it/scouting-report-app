#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from './parse-snapshot.mjs';
import { parseCandidates } from './parse-candidates.mjs';
import { diffSnapshots } from './diff-snapshots.mjs';
import { computeStats } from './stats.mjs';
import { encrypt } from './crypto.mjs';
import { researchKey } from './roster-research-key.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE = process.env.SCOUT_SOURCE || join(ROOT, '..', 'scouting-report');

function passphrase() {
  if (process.env.SCOUT_PASSPHRASE) return process.env.SCOUT_PASSPHRASE;
  const secretFile = join(ROOT, '.secret');
  if (existsSync(secretFile)) return readFileSync(secretFile, 'utf8').trim();
  console.error('合言葉が未設定です。SCOUT_PASSPHRASE 環境変数か .secret ファイルで指定してください。');
  process.exit(1);
}

function readMdFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => ({ file: f, text: readFileSync(join(dir, f), 'utf8') }));
}

const snapshots = readMdFiles(join(SOURCE, 'archive'))
  .map(({ file, text }) => parseSnapshot(text, file))
  .map((s) => ({ ...s, performers: s.performers.filter((p) => p.name !== '(未入力)') }))
  .filter((s) => s.date && s.performers.length > 0);
if (snapshots.length === 0) {
  console.error(`スナップショットが読めませんでした（${join(SOURCE, 'archive')}）。data.enc は更新しません。`);
  process.exit(1);
}

const candidates = readMdFiles(join(SOURCE, 'candidates'))
  .map(({ file, text }) => parseCandidates(text, file))
  .filter((c) => c.date && c.items.length > 0)
  .reverse();

const history = [];
for (let i = 1; i < snapshots.length; i++) {
  history.push({
    date: snapshots[i].date,
    prevDate: snapshots[i - 1].date,
    ...diffSnapshots(snapshots[i - 1].performers, snapshots[i].performers),
  });
}
history.reverse();

const latest = snapshots.at(-1);

// 写真をresearchKey(ig:ハンドル等)で各パフォーマーに添付。2ソースを統合し、シート由来の
// 高画質写真を優先、無い人はIGアイコンで補完する。どちらも非公開のSOURCEフォルダにあり、
// payloadに入って暗号化される(公開リポジトリには平文で出ない)。
const loadPhotos = (name) => {
  const p = join(SOURCE, name);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
};
const igPhotos = loadPhotos('roster-photos-ig.json');
const sheetPhotos = loadPhotos('roster-photos-sheet.json');
const photos = { ...igPhotos, ...sheetPhotos }; // シートが優先
let photoCount = 0;
for (const p of latest.performers) {
  const img = photos[researchKey(p)];
  if (img) { p.photo = img; photoCount++; }
}

const payload = {
  generatedAt: new Date().toISOString(),
  roster: latest,
  candidates,
  history,
  stats: computeStats(latest.performers),
};

const envelope = await encrypt(passphrase(), JSON.stringify(payload));
const outDir = join(ROOT, 'site', 'data');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'data.enc'), JSON.stringify(envelope));
console.log(`OK: 名簿${latest.performers.length}名(${latest.date}) / 写真${photoCount}枚 / 候補${candidates.length}週分 / 履歴${history.length}件 → site/data/data.enc`);
