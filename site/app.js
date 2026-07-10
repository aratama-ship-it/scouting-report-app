import { decryptEnvelope } from './crypto.js';

let DATA = null;
let ENVELOPE = null;
const $ = (sel) => document.querySelector(sel);
const PASS_KEY = 'scout_pass';

// DOM生成ヘルパー。childrenの文字列はtextノードになるためエスケープ不要（XSS安全）
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === '' || c === false) continue;
    node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

export function link(url, label) {
  return url
    ? el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label)
    : '';
}

// --- ビュー（Task 8〜10 で実装を差し替える） ---
const rosterState = { q: '', base: '' };

function performerCard(p) {
  return el('div', { class: 'card' },
    el('h3', {},
      p.name, ' ',
      el('span', { class: 'tag' }, p.base || '未分類'),
      p.size && p.size !== '1' ? el('span', { class: 'tag' }, `${p.size}人`) : ''),
    el('div', { class: 'muted' }, p.skills),
    p.note ? el('div', { class: 'muted' }, `📝 ${p.note}`) : '',
    el('div', { class: 'links' },
      link(p.instagram, 'Instagram'),
      link(p.youtube, 'YouTube'),
      link(p.contact, 'Web/Contact')));
}

function renderRoster() {
  const performers = DATA.roster.performers;
  const bases = [...new Set(performers.map((p) => p.base).filter(Boolean))].sort();

  const count = el('p', { class: 'muted' });
  const list = el('div');

  const update = () => {
    const filtered = performers.filter((p) => {
      if (rosterState.base && p.base !== rosterState.base) return false;
      if (rosterState.q) {
        const hay = `${p.name} ${p.base} ${p.skills} ${p.note}`.toLowerCase();
        if (!hay.includes(rosterState.q.toLowerCase())) return false;
      }
      return true;
    });
    count.textContent = `${filtered.length} / ${performers.length} 名`;
    list.replaceChildren(...filtered.map(performerCard));
  };

  const search = el('input', {
    type: 'search', placeholder: '名前・スキル・メモで検索', value: rosterState.q });
  search.addEventListener('input', () => { rosterState.q = search.value; update(); });

  const select = el('select', {},
    el('option', { value: '' }, '全カテゴリ'),
    bases.map((b) => el('option', { value: b }, b)));
  select.value = rosterState.base;
  select.addEventListener('change', () => { rosterState.base = select.value; update(); });

  $('#view').replaceChildren(el('div', { class: 'filters' }, search, select), count, list);
  update();
}
function renderCandidates() {
  $('#view').replaceChildren(
    el('p', { class: 'muted' }, `候補 ${DATA.candidates.length}週分（実装予定）`));
}
function renderHistory() {
  $('#view').replaceChildren(
    el('p', { class: 'muted' }, `履歴 ${DATA.history.length}件（実装予定）`));
}
function renderDashboard() {
  $('#view').replaceChildren(
    el('p', { class: 'muted' }, `集計 ${DATA.stats.total}名（実装予定）`));
}
const VIEWS = { roster: renderRoster, candidates: renderCandidates,
  history: renderHistory, dashboard: renderDashboard };

function showView(name) {
  document.querySelectorAll('#tabs button').forEach(
    (b) => b.classList.toggle('active', b.dataset.view === name));
  VIEWS[name]();
}

async function unlock(pass) {
  DATA = await decryptEnvelope(pass, ENVELOPE); // 失敗時は例外
  localStorage.setItem(PASS_KEY, pass);
  $('#lock').hidden = true;
  $('#app').hidden = false;
  $('#meta').textContent =
    `${DATA.roster.date} 時点 / ${DATA.roster.performers.length}名`;
  showView('roster');
}

async function init() {
  $('#lock-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#lock-error').hidden = true;
    $('#lock-loading').hidden = false;
    if (!ENVELOPE) return; // データ読み込み前は復号中表示のまま待つ
    try {
      await unlock($('#pass').value);
    } catch {
      $('#lock-loading').hidden = true;
      $('#lock-error').hidden = false;
    }
  });

  $('#tabs').addEventListener('click', (e) => {
    if (e.target.dataset.view) showView(e.target.dataset.view);
  });

  $('#lock-btn').addEventListener('click', () => {
    localStorage.removeItem(PASS_KEY);
    location.reload();
  });

  try {
    const res = await fetch('data/data.enc');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ENVELOPE = await res.json();
  } catch {
    $('#lock-form').replaceChildren(
      el('p', { class: 'error' }, 'データを読み込めませんでした。再読み込みしてください。'));
    return;
  }

  const saved = localStorage.getItem(PASS_KEY);
  if (saved) {
    try { await unlock(saved); } catch { localStorage.removeItem(PASS_KEY); }
  }
}

init();
