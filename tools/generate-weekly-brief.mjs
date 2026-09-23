#!/usr/bin/env node
// 週次スカウティングの「本人が読む」ダイジェストHTMLを生成する。
// PROJECT_NOTES.mdのE節（AI向けの詳細ログ）とは別に、判断が必要な点だけを短く見せる。
// 2026-09-23設計（WEEKLY_REPORT_REDESIGN_2026-09-23.html 案E）。
// 使い方: node tools/generate-weekly-brief.mjs YYYY-MM-DD
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from './parse-snapshot.mjs';
import { parseCandidates } from './parse-candidates.mjs';
import { diffSnapshots } from './diff-snapshots.mjs';
import { GAS_URL } from '../site/favorites-config.js';

const today = process.argv[2];
if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  console.error('usage: node tools/generate-weekly-brief.mjs YYYY-MM-DD');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = process.env.SCOUT_SOURCE || join(root, '..', 'scouting-report');
const archiveDir = join(SOURCE, 'archive');
const candidatesDir = join(SOURCE, 'candidates');

const archiveFiles = readdirSync(archiveDir).filter((f) => f.endsWith('.md')).sort();
const snapshots = archiveFiles.map((f) => parseSnapshot(readFileSync(join(archiveDir, f), 'utf8'), f));
const latest = snapshots.at(-1);
const prev = snapshots.at(-2);
const promoted = prev ? diffSnapshots(prev.performers, latest.performers).added : [];

const candidatesFile = join(candidatesDir, `candidates_${today}.md`);
const thisWeek = existsSync(candidatesFile)
  ? parseCandidates(readFileSync(candidatesFile, 'utf8'), `candidates_${today}.md`)
  : { date: today, items: [] };

const openDecisionsFile = join(SOURCE, 'open-decisions.md');
const openDecisions = existsSync(openDecisionsFile)
  ? readFileSync(openDecisionsFile, 'utf8').split('\n')
      .map((l) => l.trim()).filter((l) => l.startsWith('- ')).map((l) => l.slice(2))
  : [];

let candidateStatuses = {};
let gasNote = '取得できず';
try {
  const passphrase = readFileSync(join(root, '.secret'), 'utf8').trim();
  const url = new URL(GAS_URL);
  url.searchParams.set('action', 'list');
  url.searchParams.set('passphrase', passphrase);
  const res = await fetch(url);
  if (res.ok) {
    const body = await res.json();
    if (!body.error) { candidateStatuses = body.candidateStatuses || {}; gasNote = 'OK'; }
    else gasNote = `GAS error: ${body.error}`;
  } else {
    gasNote = `HTTP ${res.status}`;
  }
} catch (err) {
  gasNote = `例外: ${err.message}`;
}

// 停滞中: 今回以外の週に出た候補で、ステータスが未設定 or 「未確認」のまま止まっているもの
const allWeekFiles = readdirSync(candidatesDir).filter((f) => f.endsWith('.md')).sort();
const stale = [];
const seenNames = new Set();
for (const f of allWeekFiles) {
  if (f === `candidates_${today}.md`) continue;
  const week = parseCandidates(readFileSync(join(candidatesDir, f), 'utf8'), f);
  for (const c of week.items) {
    if (seenNames.has(c.name)) continue;
    seenNames.add(c.name);
    const status = candidateStatuses[c.name]?.status;
    if (!status || status === '未確認') stale.push({ ...c, firstSeen: week.date });
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 候補mdの推薦理由・確認状況にある **強調** をHTMLの<strong>に変換して表示する（生の**を残さない）
const mdBold = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

const candidateCardHtml = (c) => `
  <div class="c-card">
    <h4>${esc(c.name)} <span class="pill">${esc(c.category)}</span> <span class="pill origin">${esc(c.origin || '国内')}</span></h4>
    <div class="muted">${mdBold(c.skills)}${c.size ? ` / Size: ${esc(c.size)}` : ''}</div>
    ${c.reason ? `<div class="muted">💡 ${mdBold(c.reason)}</div>` : ''}
    ${c.url ? `<div class="links"><a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">Official site</a></div>` : ''}
  </div>`;

const staleRowHtml = (c) => `
  <tr>
    <td>${esc(c.name)}</td><td class="muted">${esc(c.category)}</td>
    <td class="muted">${esc(c.firstSeen)}</td>
    <td>${esc(candidateStatuses[c.name]?.status || '未確認')}</td>
  </tr>`;

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>週次スカウティングブリーフ ${today}</title>
<style>
  :root { --bg:#f7f7f5; --card:#fff; --ink:#1c1c1c; --sub:#6b6b6b; --line:#e4e4e0; --accent:#2f6f4f; --hold:#fff4e0; --hold-ink:#9a6400; }
  * { box-sizing: border-box; }
  body { margin:0; padding:36px 22px 70px; background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif; line-height:1.7; font-size:15px; }
  .wrap { max-width: 900px; margin:0 auto; }
  h1 { font-size:20px; margin:0 0 4px; }
  .meta { color:var(--sub); font-size:12.5px; margin-bottom:24px; }
  .ask { background:var(--card); border:1px solid var(--line); border-left:4px solid var(--accent);
    border-radius:8px; padding:16px 18px; margin-bottom:26px; }
  .ask h2 { font-size:13px; margin:0 0 8px; color:var(--accent); }
  .ask ul { margin:0; padding-left:20px; font-size:14px; }
  .ask li { margin-bottom:6px; }
  .ask .none { color:var(--sub); font-size:14px; }
  h2.section { font-size:15px; margin:32px 0 12px; padding-bottom:6px; border-bottom:1px solid var(--line); }
  .grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
  @media (max-width:680px) { .grid { grid-template-columns:1fr; } }
  .c-card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:12px 14px; }
  .c-card h4 { margin:0 0 4px; font-size:13.5px; }
  .muted { color:var(--sub); font-size:12.5px; }
  .pill { display:inline-block; font-size:10.5px; padding:2px 8px; border-radius:999px; border:1px solid var(--line); color:var(--sub); }
  .pill.origin { background:var(--hold); color:var(--hold-ink); border-color:var(--hold-ink); }
  .links a { color:var(--accent); font-size:12px; text-decoration:none; }
  table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  th, td { text-align:left; padding:8px 10px; font-size:12.5px; border-bottom:1px solid var(--line); }
  th { background:#fafaf8; color:var(--sub); font-size:11px; }
  tr:last-child td { border-bottom:none; }
  .foot { margin-top:28px; font-size:11.5px; color:var(--sub); }
</style>
</head>
<body>
<div class="wrap">
  <h1>週次スカウティングブリーフ ${today}</h1>
  <div class="meta">新規候補${thisWeek.items.length}件／今回の昇格${promoted.length}件／候補ステータス取得: ${esc(gasNote)}</div>

  <div class="ask">
    <h2>判断してほしいこと</h2>
    ${openDecisions.length
      ? `<ul>${openDecisions.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`
      : '<p class="none">現在、判断待ちの項目はありません。</p>'}
  </div>

  ${promoted.length ? `
  <h2 class="section">今回、候補から名簿へ昇格</h2>
  <div class="grid">${promoted.map((p) => `<div class="c-card"><h4>${esc(p.name)} <span class="pill">${esc(p.base)}</span></h4><div class="muted">${esc(p.skills)}</div></div>`).join('')}</div>` : ''}

  <h2 class="section">今回の新規候補（${thisWeek.items.length}件）</h2>
  ${thisWeek.items.length
    ? `<div class="grid">${thisWeek.items.map(candidateCardHtml).join('')}</div>`
    : '<p class="muted">今回の新規候補はありません。</p>'}

  ${stale.length ? `
  <h2 class="section">ステータス未確認のまま止まっている候補（${stale.length}件）</h2>
  <table>
    <tr><th>名前</th><th>ジャンル</th><th>初出週</th><th>現在の状態</th></tr>
    ${stale.map(staleRowHtml).join('')}
  </table>` : ''}

  <div class="foot">自動生成: tools/generate-weekly-brief.mjs ／ 候補ステータスの変更はアプリの「Candidates」タブから。</div>
</div>
</body>
</html>
`;

const outDir = join(SOURCE, 'weekly-brief');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${today}.html`);
writeFileSync(outPath, html);
console.log(`OK: ${outPath} を作成`);
