// Googleシートをxlsxでダウンロードしたものから、各パフォーマーの写真を取り出し、
// サムネイルに縮小して researchKey(ig:ハンドル or name::カテゴリ) をキーにJSON化する。
//
// 画像は「Image列(B列)に固定されたフローティング画像」として入っている。
// xl/drawings/drawing1.xml が各画像のアンカー行を、_rels がその画像ファイルを指す。
// 行→その行のName/Base/Instagram を sheet1.xml から読み、researchKeyを組む。
//
// 出力は非公開フォルダ ../scouting-report/ のみ。実在演者の写真は個人情報につき、
// GitHub連携済みの本リポジトリ(scouting-webapp)には絶対にコミットしないこと。
//
// 事前準備: 画像縮小に sharp が必要 → `npm install sharp --no-save`
// 使い方: 1) シートを .xlsx でダウンロード → `unzip -q "Scouting reports.xlsx" -d /tmp/sr_full`
//        2) node tools/extract-photos.mjs /tmp/sr_full
//        3) npm run build（build-data.mjs が roster-photos.json を読んで data.enc に写真を埋め込む）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { researchKey } from './roster-research-key.mjs';

const srcDir = process.argv[2];
if (!srcDir) {
  console.error('usage: node tools/extract-photos.mjs <unzipped-xlsx-dir>');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const privateDir = join(root, '..', 'scouting-report');
const THUMB = 220; // サムネイル一辺(px)

const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");

// --- shared strings ---
const ssXml = readFileSync(join(srcDir, 'xl/sharedStrings.xml'), 'utf8');
const sharedStrings = [];
for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
  const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]);
  sharedStrings.push(decode(texts.join('')));
}

// --- sheet1: row -> {name, base, instagram} (col A=0, D=3, F=5) ---
const colLetterToIndex = (letters) => {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
const cellText = (cellXml, tAttr) => {
  const vm = cellXml.match(/<v>([\s\S]*?)<\/v>/);
  if (tAttr === 's' && vm) return sharedStrings[Number(vm[1])] ?? '';
  const im = cellXml.match(/<t[^>]*>([\s\S]*?)<\/t>/); // inlineStr
  if (im) return decode(im[1]);
  return vm ? decode(vm[1]) : '';
};
const sheetXml = readFileSync(join(srcDir, 'xl/worksheets/sheet1.xml'), 'utf8');
const rowData = {}; // 1-based row -> {name, base, instagram}
for (const rm of sheetXml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const rowNum = Number(rm[1]);
  const cells = {};
  // セルの属性(順不同)からr=とt=を個別に取り出す。t="s"を取りこぼすと共有文字列を引けず壊れる。
  for (const cm of rm[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    const ref = (cm[1].match(/\br="([A-Z]+)\d+"/) || [])[1];
    if (!ref) continue;
    const tAttr = (cm[1].match(/\bt="([^"]+)"/) || [])[1];
    cells[colLetterToIndex(ref)] = cellText(cm[2], tAttr);
  }
  rowData[rowNum] = { name: cells[0] || '', base: cells[3] || '', instagram: cells[5] || '' };
}

// --- drawing rels: rId -> media filename ---
const relsXml = readFileSync(join(srcDir, 'xl/drawings/_rels/drawing1.xml.rels'), 'utf8');
const rid2media = {};
for (const m of relsXml.matchAll(/<Relationship\b[^>]*Id="(rId\d+)"[^>]*Target="[^"]*\/media\/([^"]+)"/g)) {
  rid2media[m[1]] = m[2];
}

// --- drawing anchors: (fromCol, fromRow, embed rId) ---
const drawXml = readFileSync(join(srcDir, 'xl/drawings/drawing1.xml'), 'utf8');
const anchors = [];
for (const am of drawXml.matchAll(/<xdr:oneCellAnchor>([\s\S]*?)<\/xdr:oneCellAnchor>/g)) {
  const body = am[1];
  const col = Number((body.match(/<xdr:col>(\d+)<\/xdr:col>/) || [])[1]);
  const row0 = Number((body.match(/<xdr:row>(\d+)<\/xdr:row>/) || [])[1]); // 0-based
  const rid = (body.match(/r:embed="(rId\d+)"/) || [])[1];
  if (col !== 1 || rid == null || Number.isNaN(row0)) continue; // Image列のみ
  anchors.push({ sheetRow: row0 + 1, media: rid2media[rid] });
}
anchors.sort((a, b) => a.sheetRow - b.sheetRow);

// --- extract + resize + key ---
const photos = {};   // researchKey -> dataURL
const preview = [];  // {name, key, img} 表示順
const collisions = [];
let missing = 0;
for (const a of anchors) {
  const info = rowData[a.sheetRow];
  if (!info || !info.name) { missing++; continue; }
  const key = researchKey({ name: info.name, base: info.base, instagram: info.instagram });
  const buf = await sharp(join(srcDir, 'xl/media', a.media))
    .resize(THUMB, THUMB, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 76 }).toBuffer();
  const dataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
  if (photos[key]) collisions.push({ key, name: info.name, row: a.sheetRow });
  photos[key] = dataUrl;
  preview.push({ name: info.name, key, img: dataUrl });
}

writeFileSync(join(privateDir, 'roster-photos.json'), JSON.stringify(photos), 'utf8');

// 検証用プレビュー(先頭24人): 名前と写真が正しく対応しているか目視確認するため
const cards = preview.slice(0, 24).map((p) => `
  <div style="background:#1f2128;border:1px solid #33363f;border-radius:10px;padding:10px;text-align:center">
    <img src="${p.img}" style="width:120px;height:120px;object-fit:cover;border-radius:8px" alt="">
    <div style="color:#e8e6e1;font-size:13px;margin-top:6px">${p.name}</div>
    <div style="color:#5c6070;font-size:10px;word-break:break-all">${p.key}</div>
  </div>`).join('');
writeFileSync(join(privateDir, 'roster-photos-preview.html'), `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>写真対応プレビュー</title></head>
<body style="margin:0;background:#14151a;font-family:sans-serif;padding:16px">
<div style="color:#d4a24e;font-size:16px;margin-bottom:12px">写真マッピング検証（先頭24人・シート行順）／ 全${Object.keys(photos).length}枚</div>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">${cards}</div>
</body></html>`, 'utf8');

const totalBytes = Object.values(photos).reduce((s, d) => s + d.length, 0);
console.log(JSON.stringify({
  anchors: anchors.length,
  photosKeyed: Object.keys(photos).length,
  missingName: missing,
  keyCollisions: collisions,
  approxJsonMB: +(totalBytes / 1024 / 1024).toFixed(1),
}, null, 2));
