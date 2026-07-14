// シート由来の写真が無いパフォーマーだけ、Instagramのプロフィールアイコン(og:image)を
// 自動取得して補完する。結果は非公開の roster-photos-ig.json に追記(既存キーは再取得しない)。
// build-data.mjs が sheet優先で ig を下敷きにマージする。
//
// 注意: これはInstagramのスクレイピング(規約上グレー)。IG側の仕様変更で壊れうる。
// 大量アクセスを避けるため1件ごとに間隔を空ける。写真も個人情報につき生jsonは公開リポジトリに入れない。
//
// 事前準備: `npm install sharp --no-save`
// 使い方: node tools/fetch-ig-photos.mjs [snapshot.md] [maxCount]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseSnapshot } from './parse-snapshot.mjs';
import { researchKey, isPlaceholder } from './roster-research-key.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const privateDir = join(root, '..', 'scouting-report');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const DELAY_MS = 2500;
const MAX = Number(process.argv[3] || 60);

const latestSnapshot = () => {
  const dir = join(privateDir, 'archive');
  const files = readdirSync(dir).filter((f) => /snapshot_.*\.md$/.test(f)).sort();
  return join(dir, files.at(-1));
};
const snapPath = process.argv[2] || latestSnapshot();
const { performers } = parseSnapshot(readFileSync(snapPath, 'utf8'), snapPath);

const load = (name) => {
  const p = join(privateDir, name);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
};
const sheetPhotos = load('roster-photos-sheet.json');
const igPhotos = load('roster-photos-ig.json');

// 対象: IGハンドルを持ち、シートにもIG既取得にも写真が無い人
const targets = [];
const seen = new Set();
for (const p of performers) {
  if (isPlaceholder(p.name)) continue;
  const key = researchKey(p);
  if (!key.startsWith('ig:')) continue;         // IGが無い人は取得不可
  if (sheetPhotos[key] || igPhotos[key]) continue; // 既に写真あり
  if (seen.has(key)) continue;
  seen.add(key);
  targets.push({ key, handle: key.slice(3), name: p.name });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchIcon(handle) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`https://www.instagram.com/${handle}/`, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
      });
      if (!r.ok) throw new Error(`page ${r.status}`);
      const html = await r.text();
      const m = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (!m) throw new Error('no og:image');
      const url = m[1].replace(/&amp;/g, '&');
      const ir = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!ir.ok) throw new Error(`img ${ir.status}`);
      const buf = Buffer.from(await ir.arrayBuffer());
      const jpeg = await sharp(buf)
        .resize(200, 200, { fit: 'cover', withoutEnlargement: true })
        .jpeg({ quality: 80 }).toBuffer();
      return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    } catch (e) {
      if (attempt === 1) return { error: e.message };
      await sleep(DELAY_MS);
    }
  }
}

console.log(`対象 ${targets.length}人（IGあり・写真なし）／今回最大 ${MAX}人`);
let added = 0;
const failed = [];
for (const t of targets.slice(0, MAX)) {
  const res = await fetchIcon(t.handle);
  if (typeof res === 'string') { igPhotos[t.key] = res; added++; }
  else failed.push(`${t.name}(@${t.handle}): ${res.error}`);
  await sleep(DELAY_MS);
}

writeFileSync(join(privateDir, 'roster-photos-ig.json'), JSON.stringify(igPhotos), 'utf8');
console.log(`追加 ${added}枚 / 失敗 ${failed.length}件 / IG写真の累計 ${Object.keys(igPhotos).length}枚`);
if (failed.length) console.log('失敗:', failed.slice(0, 20).join(' | '));
