// GASのlistから更新リクエストを取得し、前回チェック時から増えた新規リクエストを表示する。
// Mac側の定期タスクがこれを実行し、新規があればArataに通知する（GASからメール送信すると
// スプレッドシート権限と競合して壊れるため、通知はこのポーリング方式で行う）。
//
// 前回チェックの基準(最後に見たtimestamp)は非公開フォルダの request-seen.json に保存する。
// 使い方: node tools/check-requests.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAS_URL } from '../site/favorites-config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const privateDir = join(root, '..', 'scouting-report');
const seenPath = join(privateDir, 'request-seen.json');
const passphrase = readFileSync(join(root, '.secret'), 'utf8').trim();

const url = new URL(GAS_URL);
url.searchParams.set('action', 'list');
url.searchParams.set('passphrase', passphrase);
const res = await fetch(url);
if (!res.ok) { console.error(`HTTP ${res.status}`); process.exit(1); }
const body = await res.json();
if (body.error) { console.error(`GAS error: ${body.error}`); process.exit(1); }

const requests = (body.requests || []).slice().sort((a, b) =>
  String(a.timestamp).localeCompare(String(b.timestamp)));

const seen = existsSync(seenPath)
  ? JSON.parse(readFileSync(seenPath, 'utf8')) : { lastTimestamp: '' };
const lastTs = seen.lastTimestamp || '';

const fresh = requests.filter((r) => String(r.timestamp) > lastTs);

// 基準を最新のtimestampに更新（新規が無くても現状維持）
const newest = requests.length ? String(requests.at(-1).timestamp) : lastTs;
writeFileSync(seenPath, JSON.stringify({ lastTimestamp: newest }), 'utf8');

console.log(JSON.stringify({
  totalRequests: requests.length,
  newCount: fresh.length,
  newRequests: fresh.map((r) => ({
    who: r.name || '(名前なし)',
    artist: r.artist,
    note: r.text || '',
    at: r.timestamp,
  })),
}, null, 2));
