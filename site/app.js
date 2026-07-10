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
function renderRoster() {
  $('#view').replaceChildren(
    el('p', { class: 'muted' }, `名簿 ${DATA.roster.performers.length}名（実装予定）`));
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
  const res = await fetch('data/data.enc').catch(() => null);
  if (!res || !res.ok) {
    $('#lock-form').replaceChildren(
      el('p', { class: 'error' }, 'データを読み込めませんでした。再読み込みしてください。'));
    return;
  }
  ENVELOPE = await res.json();

  $('#lock-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#lock-error').hidden = true;
    $('#lock-loading').hidden = false;
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

  const saved = localStorage.getItem(PASS_KEY);
  if (saved) {
    try { await unlock(saved); } catch { localStorage.removeItem(PASS_KEY); }
  }
}

init();
