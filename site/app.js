import { decryptEnvelope } from './crypto.js';
import { findRelated } from './related.js';

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
const rosterState = { q: '', base: '', selected: null };

function performerCard(p, { clickable = false, onClick, extraClass = '', favMarked = false } = {}) {
  const classes = ['card', extraClass, clickable ? 'card-clickable' : ''].filter(Boolean).join(' ');
  const card = el('div', { class: classes },
    el('h3', {},
      favMarked ? el('span', { class: 'fav-mark' }, '★') : '',
      p.name, ' ',
      el('span', { class: 'tag' }, p.base || '未分類'),
      p.size && p.size !== '1' ? el('span', { class: 'tag' }, `${p.size}人`) : ''),
    el('div', { class: 'muted' }, p.skills),
    p.note ? el('div', { class: 'muted' }, `📝 ${p.note}`) : '',
    el('div', { class: 'links' },
      link(p.instagram, 'Instagram'),
      link(p.youtube, 'YouTube'),
      link(p.contact, 'Web/Contact')));
  if (clickable) {
    card.addEventListener('click', (e) => {
      if (e.target.closest('a')) return; // SNSリンククリックは詳細遷移させない
      onClick(p.name);
    });
  }
  return card;
}

function openDetail(name) {
  rosterState.selected = name;
  renderRoster();
}

function renderRoster() {
  if (rosterState.selected) {
    renderDetail(rosterState.selected);
    return;
  }
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
    list.replaceChildren(...filtered.map((p) => performerCard(p, {
      clickable: true, onClick: openDetail,
    })));
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
function renderDetail(name) {
  const target = DATA.roster.performers.find((p) => p.name === name);
  if (!target) {
    rosterState.selected = null;
    renderRoster();
    return;
  }

  const back = el('button', { type: 'button', class: 'back-btn' }, '← 一覧に戻る');
  back.addEventListener('click', () => {
    rosterState.selected = null;
    renderRoster();
  });

  const related = findRelated(target, DATA.roster.performers);
  const relatedSection = el('div', { class: 'card' },
    el('h3', {}, '関連アーティスト'),
    related.length === 0
      ? el('p', { class: 'muted' }, '関連アーティストは見つかりませんでした')
      : el('div', { class: 'related-grid' },
          related.map(({ performer }) => performerCard(performer, {
            clickable: true, onClick: openDetail,
          }))));

  $('#view').replaceChildren(
    back,
    performerCard(target, { clickable: false, extraClass: 'detail-main' }),
    relatedSection);
}

function renderCandidates() {
  if (DATA.candidates.length === 0) {
    $('#view').replaceChildren(el('p', { class: 'muted' }, '候補データはまだありません'));
    return;
  }
  const rosterNames = new Set(DATA.roster.performers.map((p) => p.name));
  $('#view').replaceChildren(...DATA.candidates.flatMap((week) => [
    el('h2', { class: 'muted' }, `${week.date} の新規候補（${week.items.length}件）`),
    ...week.items.map((c) => el('div', { class: 'card' },
      el('h3', {},
        c.name, ' ',
        el('span', { class: 'tag' }, c.category),
        rosterNames.has(c.name)
          ? el('span', { class: 'tag diff-added' }, 'シート追記済み')
          : el('span', { class: 'tag' }, '未追記')),
      el('div', { class: 'muted' }, c.skills + (c.size ? ` ／ 人数: ${c.size}` : '')),
      c.reason ? el('div', { class: 'muted' }, `💡 ${c.reason}`) : '',
      c.status ? el('div', { class: 'muted' }, `✔️ ${c.status}`) : '',
      el('div', { class: 'links' }, link(c.url, '公式サイト')))),
  ]));
}
function renderHistory() {
  if (DATA.history.length === 0) {
    $('#view').replaceChildren(el('p', { class: 'muted' },
      '履歴はまだありません（スナップショットが2週分たまると表示されます）'));
    return;
  }
  $('#view').replaceChildren(...DATA.history.map((w) => el('div', { class: 'card' },
    el('h3', {}, `${w.prevDate} → ${w.date}`),
    w.added.length ? el('div', { class: 'diff-added' },
      `＋ 追加 (${w.added.length}): ${w.added.map((p) => p.name).join('、')}`) : '',
    w.removed.length ? el('div', { class: 'diff-removed' },
      `− 削除 (${w.removed.length}): ${w.removed.map((p) => p.name).join('、')}`) : '',
    w.changed.length ? [
      el('div', { class: 'muted' }, `✎ 変更 (${w.changed.length}):`),
      w.changed.map((c) => el('div', { class: 'muted' },
        `・${c.name}: ` + c.fields.map((f) =>
          `${f.field}「${f.from}」→「${f.to}」`).join(' / '))),
    ] : '',
    !w.added.length && !w.removed.length && !w.changed.length
      ? el('div', { class: 'muted' }, '変更なし') : '')));
}
function renderDashboard() {
  const entries = Object.entries(DATA.stats.byBase);
  const max = Math.max(...entries.map(([, n]) => n), 1);
  $('#view').replaceChildren(
    el('div', { class: 'card' },
      el('h3', {}, '登録数'),
      el('p', { class: 'big-number' },
        String(DATA.stats.total),
        el('span', { class: 'muted' }, ` 組（${DATA.roster.date} 時点）`))),
    el('div', { class: 'card' },
      el('h3', {}, 'カテゴリ別'),
      entries.map(([base, n]) => el('div', { class: 'bar-row' },
        el('span', {}, base),
        el('div', {},
          el('div', { class: 'bar', style: `width:${Math.round((n / max) * 100)}%` })),
        el('span', { class: 'muted' }, String(n))))),
    el('div', { class: 'card' },
      el('h3', {}, '手薄ジャンル（要スカウト）'),
      el('p', { class: 'muted' },
        'マジック／ファイアー／台系アクロバット／バブル／スティルト／腹話術／MC・ホスト など。最新の候補は「候補」タブへ。')));
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

  $('#pass-toggle').addEventListener('click', () => {
    const pass = $('#pass');
    const showing = pass.type === 'text';
    pass.type = showing ? 'password' : 'text';
    $('#pass-toggle').textContent = showing ? '👁' : '🙈';
    $('#pass-toggle').setAttribute('aria-label', showing ? '合言葉を表示' : '合言葉を隠す');
  });

  $('#tabs').addEventListener('click', (e) => {
    if (e.target.dataset.view) showView(e.target.dataset.view);
  });

  $('#lock-btn').addEventListener('click', () => {
    localStorage.removeItem(PASS_KEY);
    location.reload();
  });

  try {
    const res = await fetch('data/data.enc', { cache: 'no-store' });
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
