// 名簿の既存データ（カテゴリ・スキル・人数・メモ）だけから簡易紹介文を生成し、
// 「候補」タブと同じカード見た目のレビュー用HTMLを書き出す。
// 新しい事実は一切創作しない（シートにある情報の言い換えのみ）。
//
// 出力先は ../scouting-report/（非公開フォルダ）。生の名簿データや実在の演者に関する
// 調査結果を、GitHub連携済みの本リポジトリ(scouting-webapp)に絶対にコミットしないこと。
//
// 使い方: node tools/generate-roster-intros.mjs ../scouting-report/archive/snapshot_YYYY-MM-DD.md
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from './parse-snapshot.mjs';
import { researchKey, isPlaceholder } from './roster-research-key.mjs';

const mdPath = process.argv[2];
if (!mdPath) {
  console.error('usage: node tools/generate-roster-intros.mjs <snapshot.md>');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const privateDir = join(root, '..', 'scouting-report');
const md = readFileSync(mdPath, 'utf8');
const { date, performers: allPerformers } = parseSnapshot(md, basename(mdPath));
// 「(未入力)」等の空プレースホルダー行は紹介文の対象外(書ける情報が何もないため)
const performers = allPerformers.filter((p) => !isPlaceholder(p.name));
const skippedCount = allPerformers.length - performers.length;

const researchPath = join(privateDir, 'roster-research.json');
const research = existsSync(researchPath)
  ? JSON.parse(readFileSync(researchPath, 'utf8')) : {};

// status:"no_info_found" は「調査済みだが載せられる事実がなかった」印。紹介文には出さない。
const hasFact = (p) => Boolean(research[researchKey(p)]?.fact);
const researchedCount = performers.filter(hasFact).length;

const CONFIDENCE_LABEL = { high: '確度: 高', medium: '確度: 中', low: '確度: 低' };

const ROLE_NOUN = {
  'Physical Circus': 'パフォーマー',
  Dancer: 'ダンサー',
  Musician: 'ミュージシャン',
  Clown: 'クラウン',
  Other: 'パフォーマー',
};
const roleNoun = (base) => ROLE_NOUN[base] || 'パフォーマー';

const UNIT_NOUN = { 2: 'デュオ', 3: 'トリオ' };
function sizePhrase(size) {
  const s = (size || '').trim();
  if (!s || s === '1') return '';
  if (UNIT_NOUN[s]) return `${s}人${UNIT_NOUN[s]}として活動。`;
  return `${s}人編成のグループとして活動。`;
}

// name文字列から決定的にテンプレートを選ぶ(実行のたびに結果が変わらないように)
function pickIndex(name, mod) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 997;
  return h % mod;
}

function introText(p) {
  const role = roleNoun(p.base);
  const skills = (p.skills || '').trim();
  const size = sizePhrase(p.size);
  let base;
  if (!skills) {
    base = `${p.name}は、${p.base || 'パフォーマンス'}分野で活動する${role}。`;
  } else {
    const templates = [
      `${p.name}は、${skills}を得意とする${role}。`,
      `${skills}を軸に活動する${role}、${p.name}。`,
      `${p.name}は${role}として、${skills}を中心にパフォーマンスを行う。`,
    ];
    base = templates[pickIndex(p.name, templates.length)];
  }
  return [base, size].filter(Boolean).join('');
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function linkTag(url, label) {
  return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '';
}

function researchBlock(p) {
  const r = research[researchKey(p)];
  if (!r || !r.fact) return '';
  const confidence = CONFIDENCE_LABEL[r.confidence] || r.confidence || '';
  return `<div class="research">
      <div class="research-fact">🔎 ${esc(r.fact)}</div>
      <div class="research-meta">
        出典: <a href="${esc(r.source)}" target="_blank" rel="noopener noreferrer">${esc(r.sourceLabel || r.source)}</a>
        ／ ${esc(confidence)}
        ／ 本人確認: ${esc(r.identityCheck || '')}
      </div>
      ${r.caveat ? `<div class="research-caveat">※ ${esc(r.caveat)}</div>` : ''}
    </div>`;
}

const cards = performers.map((p) => {
  const tags = [`<span class="tag">${esc(p.base || '未分類')}</span>`];
  if (p.size && p.size !== '1') tags.push(`<span class="tag">${esc(p.size)}人</span>`);
  if (hasFact(p)) tags.push(`<span class="tag tag-researched">Web調査済み</span>`);
  const links = [linkTag(p.instagram, 'Instagram'), linkTag(p.youtube, 'YouTube'),
    linkTag(p.contact, 'Web/Contact')].filter(Boolean).join('');
  return `<div class="card" data-hay="${esc(`${p.name} ${p.base} ${p.skills}`.toLowerCase())}" data-researched="${hasFact(p) ? '1' : '0'}">
    <h3>${esc(p.name)} ${tags.join('')}</h3>
    <div class="muted">${esc(p.skills)}</div>
    <div class="intro">✨ ${esc(introText(p))}</div>
    ${p.note ? `<div class="muted">📝 ${esc(p.note)}</div>` : ''}
    ${researchBlock(p)}
    <div class="links">${links}</div>
  </div>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>名簿アーティスト紹介文（レビュー用ドラフト）</title>
<style>
  :root { --bg:#14151a; --card:#1f2128; --text:#e8e6e1; --muted:#9a9790; --accent:#d4a24e; --line:#33363f; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:"Hiragino Sans","Noto Sans JP",sans-serif; }
  header { padding:16px; border-bottom:1px solid var(--line); }
  header h1 { margin:0 0 6px; font-size:18px; color:var(--accent); }
  .notice { background:#2a2210; border:1px solid #5a4a1e; color:#e8d9a8; border-radius:8px;
    padding:10px 14px; font-size:13px; margin:10px 16px 0; }
  main { padding:16px; max-width:1100px; margin:0 auto; }
  .filters { margin-bottom:14px; }
  .filters input { width:100%; padding:10px 12px; border-radius:8px; font-size:14px;
    border:1px solid var(--line); background:var(--card); color:var(--text); }
  #count { color:var(--muted); font-size:13px; margin-bottom:10px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px;
    padding:14px 16px; margin-bottom:10px; }
  .card h3 { margin:0 0 4px; font-size:15px; }
  .tag { display:inline-block; background:var(--bg); border:1px solid var(--line); color:var(--muted);
    border-radius:999px; padding:1px 10px; font-size:12px; margin-left:6px; }
  .muted { color:var(--muted); font-size:13px; }
  .intro { font-size:13.5px; margin:6px 0; }
  .links a { color:var(--accent); font-size:13px; margin-right:10px; text-decoration:none; }
  .tag-researched { border-color:#5b8fd4; color:#8fb4e8; }
  .research { border-left:3px solid #5b8fd4; background:#182233; border-radius:0 6px 6px 0;
    padding:8px 12px; margin:8px 0; }
  .research-fact { font-size:13.5px; }
  .research-meta { font-size:11.5px; color:var(--muted); margin-top:4px; }
  .research-meta a { color:#8fb4e8; }
  .research-caveat { font-size:11.5px; color:#c9a25a; margin-top:4px; }
  .filters { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .filters label { font-size:13px; color:var(--muted); display:flex; align-items:center; gap:4px; white-space:nowrap; }
</style>
</head>
<body>
<header>
  <h1>名簿アーティスト 紹介文ドラフト</h1>
  <div class="muted">スナップショット ${esc(date || '')} 時点 / 全${performers.length}組（うちWeb調査済み ${researchedCount}組）</div>
</header>
<div class="notice">
  ⚠️ 「✨」の紹介文は名簿の既存データ（カテゴリ・スキル・人数・メモ）だけから機械的に生成した文章です。新しい事実の創作はしていません。<br>
  「🔎」はWeb検索・公式サイト等で追加確認した事実です。出典と本人確認の方法（InstagramやYouTubeのハンドル一致など）を併記しています。確度が「低」のものは同姓同名等の混同リスクが残る旨を明記しています。<br>
  いずれもレビュー用ドラフトで、まだWebアプリ本体には反映していません。
</div>
<main>
  <div class="filters">
    <input id="q" type="search" placeholder="名前・スキルで絞り込み">
    <label><input type="checkbox" id="only-researched"> Web調査済みのみ表示</label>
  </div>
  <div id="count"></div>
  <div id="list">
${cards}
  </div>
</main>
<script>
  const q = document.getElementById('q');
  const onlyResearched = document.getElementById('only-researched');
  const cards = [...document.querySelectorAll('#list .card')];
  const count = document.getElementById('count');
  function update() {
    const v = q.value.trim().toLowerCase();
    let shown = 0;
    for (const c of cards) {
      const hit = (!v || c.dataset.hay.includes(v)) && (!onlyResearched.checked || c.dataset.researched === '1');
      c.hidden = !hit;
      if (hit) shown++;
    }
    count.textContent = shown + ' / ' + cards.length + ' 組';
  }
  q.addEventListener('input', update);
  onlyResearched.addEventListener('change', update);
  update();
</script>
</body>
</html>
`;

const outPath = join(privateDir, 'roster-intros.html');
writeFileSync(outPath, html, 'utf8');
console.log(`書き出し: ${outPath}（${performers.length}組、空プレースホルダー${skippedCount}件除外）`);
