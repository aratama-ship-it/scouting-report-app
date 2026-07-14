import { decryptEnvelope } from './crypto.js';
import { findRelated } from './related.js';
import { fetchFavorites, toggleFavorite, addComment, getNickname, setNickname } from './favorites.js';
import { GAS_URL } from './favorites-config.js';

let DATA = null;
let ENVELOPE = null;
let PASSPHRASE = null;
let FAVORITES = { favorites: [], comments: [] };
let favError = null;
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
  const info = el('div', { class: 'card-info' },
    el('h3', {},
      favMarked ? el('span', { class: 'fav-mark' }, '★') : '',
      p.name, ' ',
      el('span', { class: 'tag' }, p.base || 'Uncategorized'),
      p.size && p.size !== '1' ? el('span', { class: 'tag' }, `${p.size} members`) : ''),
    el('div', { class: 'muted' }, p.skills),
    p.note ? el('div', { class: 'muted' }, `📝 ${p.note}`) : '',
    el('div', { class: 'links' },
      link(p.instagram, 'Instagram'),
      link(p.youtube, 'YouTube'),
      link(p.contact, 'Web/Contact')));
  const body = p.photo
    ? el('div', { class: 'card-row' },
        el('img', { class: 'card-photo', src: p.photo, alt: '', loading: 'lazy' }), info)
    : info;
  const card = el('div', { class: classes }, body);
  if (clickable) {
    card.addEventListener('click', (e) => {
      if (e.target.closest('a')) return; // SNSリンククリックは詳細遷移させない
      onClick(p.name);
    });
  }
  return card;
}

function ensureNickname() {
  let name = getNickname();
  if (!name) {
    name = (prompt('Enter your name (shown to the team)') || '').trim();
    if (name) setNickname(name);
  }
  return name;
}

function updateNicknameDisplay() {
  const name = getNickname();
  $('#nickname-btn').textContent = name ? `👤 ${name}` : '👤 No name set';
}

async function loadFavorites() {
  try {
    FAVORITES = await fetchFavorites(GAS_URL, PASSPHRASE);
    favError = null;
  } catch {
    favError = "Couldn't load favorites/comments";
  }
}

function formatTimestamp(ts) {
  return ts ? new Date(ts).toLocaleString('en-US') : '';
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
  const list = el('div', { class: 'roster-list' });

  const update = () => {
    const filtered = performers.filter((p) => {
      if (rosterState.base && p.base !== rosterState.base) return false;
      if (rosterState.q) {
        const hay = `${p.name} ${p.base} ${p.skills} ${p.note}`.toLowerCase();
        if (!hay.includes(rosterState.q.toLowerCase())) return false;
      }
      return true;
    });
    count.textContent = `${filtered.length} / ${performers.length} artists`;
    const favoritedNames = new Set(FAVORITES.favorites.map((f) => f.artist));
    list.replaceChildren(...filtered.map((p) => performerCard(p, {
      clickable: true, onClick: openDetail, favMarked: favoritedNames.has(p.name),
    })));
  };

  const search = el('input', {
    type: 'search', placeholder: 'Search by name, skill, or note', value: rosterState.q });
  search.addEventListener('input', () => { rosterState.q = search.value; update(); });

  const select = el('select', {},
    el('option', { value: '' }, 'All categories'),
    bases.map((b) => el('option', { value: b }, b)));
  select.value = rosterState.base;
  select.addEventListener('change', () => { rosterState.base = select.value; update(); });

  $('#view').replaceChildren(el('div', { class: 'filters' }, search, select), count, list);
  update();
}
async function renderDetail(name) {
  const target = DATA.roster.performers.find((p) => p.name === name);
  if (!target) {
    rosterState.selected = null;
    renderRoster();
    return;
  }

  $('#view').replaceChildren(el('p', { class: 'muted' }, 'Loading…'));
  await loadFavorites();
  if (rosterState.selected !== name) return; // don't render if another card was selected meanwhile

  const back = el('button', { type: 'button', class: 'back-btn' }, '← Back to roster');
  back.addEventListener('click', () => {
    rosterState.selected = null;
    renderRoster();
  });

  const myName = getNickname();
  const favCount = FAVORITES.favorites.filter((f) => f.artist === target.name).length;
  const iAmFavorited = FAVORITES.favorites.some(
    (f) => f.artist === target.name && f.name === myName);

  const favBtn = el('button', {
    type: 'button', class: 'fav-btn' + (iAmFavorited ? ' fav-active' : ''),
  }, `${iAmFavorited ? '★' : '☆'} ${favCount}`);
  favBtn.addEventListener('click', async () => {
    favBtn.disabled = true;
    try {
      await toggleFavorite(GAS_URL, PASSPHRASE, ensureNickname(), target.name);
      renderDetail(target.name);
    } catch {
      favBtn.disabled = false;
    }
  });

  const refreshBtn = el('button', { type: 'button' }, 'Refresh');
  refreshBtn.addEventListener('click', () => renderDetail(target.name));

  const commentsForTarget = FAVORITES.comments.filter((c) => c.artist === target.name);
  const commentForm = el('form', { class: 'comment-form' },
    el('textarea', { placeholder: 'Write a comment…', rows: '2' }),
    el('button', { type: 'submit' }, 'Post'));
  commentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const textarea = commentForm.querySelector('textarea');
    const text = textarea.value.trim();
    if (!text) return;
    const submitBtn = commentForm.querySelector('button');
    submitBtn.disabled = true;
    try {
      await addComment(GAS_URL, PASSPHRASE, ensureNickname(), target.name, text);
      renderDetail(target.name);
    } catch {
      submitBtn.disabled = false;
    }
  });

  const commentList = el('div', {},
    commentsForTarget.length === 0
      ? el('p', { class: 'muted' }, 'No comments yet')
      : commentsForTarget.map((c) => el('div', { class: 'comment' },
          el('div', { class: 'muted' }, `${c.name} · ${formatTimestamp(c.timestamp)}`),
          el('div', {}, c.text))));

  const favCommentCard = el('div', { class: 'card' },
    el('h3', {}, 'Favorites & Comments'),
    favError ? el('p', { class: 'error' }, favError) : '',
    el('div', { class: 'fav-row' }, favBtn, refreshBtn),
    commentForm,
    commentList);

  const related = findRelated(target, DATA.roster.performers);
  const relatedSection = el('div', { class: 'card' },
    el('h3', {}, 'Related Artists'),
    related.length === 0
      ? el('p', { class: 'muted' }, 'No related artists found')
      : el('div', { class: 'related-grid' },
          related.map(({ performer }) => performerCard(performer, {
            clickable: true, onClick: openDetail,
          }))));

  $('#view').replaceChildren(
    back,
    performerCard(target, { clickable: false, extraClass: 'detail-main' }),
    favCommentCard,
    relatedSection);
}

function renderCandidates() {
  if (DATA.candidates.length === 0) {
    $('#view').replaceChildren(el('p', { class: 'muted' }, 'No candidate data yet'));
    return;
  }
  const rosterNames = new Set(DATA.roster.performers.map((p) => p.name));
  $('#view').replaceChildren(...DATA.candidates.flatMap((week) => [
    el('h2', { class: 'muted' }, `New candidates as of ${week.date} (${week.items.length})`),
    ...week.items.map((c) => el('div', { class: 'card' },
      el('h3', {},
        c.name, ' ',
        el('span', { class: 'tag' }, c.category),
        rosterNames.has(c.name)
          ? el('span', { class: 'tag diff-added' }, 'Added to sheet')
          : el('span', { class: 'tag' }, 'Not yet added')),
      el('div', { class: 'muted' }, c.skills + (c.size ? ` / Size: ${c.size}` : '')),
      c.reason ? el('div', { class: 'muted' }, `💡 ${c.reason}`) : '',
      c.status ? el('div', { class: 'muted' }, `✔️ ${c.status}`) : '',
      el('div', { class: 'links' }, link(c.url, 'Official site')))),
  ]));
}
function renderHistory() {
  if (DATA.history.length === 0) {
    $('#view').replaceChildren(el('p', { class: 'muted' },
      'No history yet (this appears once two weekly snapshots have been recorded)'));
    return;
  }
  $('#view').replaceChildren(...DATA.history.map((w) => el('div', { class: 'card' },
    el('h3', {}, `${w.prevDate} → ${w.date}`),
    w.added.length ? el('div', { class: 'diff-added' },
      `+ Added (${w.added.length}): ${w.added.map((p) => p.name).join(', ')}`) : '',
    w.removed.length ? el('div', { class: 'diff-removed' },
      `− Removed (${w.removed.length}): ${w.removed.map((p) => p.name).join(', ')}`) : '',
    w.changed.length ? [
      el('div', { class: 'muted' }, `✎ Changed (${w.changed.length}):`),
      w.changed.map((c) => el('div', { class: 'muted' },
        `· ${c.name}: ` + c.fields.map((f) =>
          `${f.field} "${f.from}" → "${f.to}"`).join(' / '))),
    ] : '',
    !w.added.length && !w.removed.length && !w.changed.length
      ? el('div', { class: 'muted' }, 'No changes') : '')));
}
function renderDashboard() {
  const entries = Object.entries(DATA.stats.byBase);
  const max = Math.max(...entries.map(([, n]) => n), 1);
  $('#view').replaceChildren(
    el('div', { class: 'card' },
      el('h3', {}, 'Total Registered'),
      el('p', { class: 'big-number' },
        String(DATA.stats.total),
        el('span', { class: 'muted' }, ` artists (as of ${DATA.roster.date})`))),
    el('div', { class: 'card' },
      el('h3', {}, 'By Category'),
      entries.map(([base, n]) => el('div', { class: 'bar-row' },
        el('span', {}, base),
        el('div', {},
          el('div', { class: 'bar', style: `width:${Math.round((n / max) * 100)}%` })),
        el('span', { class: 'muted' }, String(n))))),
    el('div', { class: 'card' },
      el('h3', {}, 'Underrepresented Genres (Scouting Needed)'),
      el('p', { class: 'muted' },
        'Magic, fire performance, banquine/pole acrobatics, bubble shows, stilts, ventriloquism, MC/hosting, and more. See the "Candidates" tab for the latest picks.')));
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
  PASSPHRASE = pass;
  localStorage.setItem(PASS_KEY, pass);
  $('#lock').hidden = true;
  $('#app').hidden = false;
  $('#meta').textContent =
    `As of ${DATA.roster.date} / ${DATA.roster.performers.length} artists`;
  ensureNickname();
  updateNicknameDisplay();
  showView('roster');
  loadFavorites().then(() => {
    if (!rosterState.selected) renderRoster();
  });
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
    $('#pass-toggle').setAttribute('aria-label', showing ? 'Show passphrase' : 'Hide passphrase');
  });

  $('#tabs').addEventListener('click', (e) => {
    if (e.target.dataset.view) showView(e.target.dataset.view);
  });

  $('#lock-btn').addEventListener('click', () => {
    localStorage.removeItem(PASS_KEY);
    location.reload();
  });

  $('#nickname-btn').addEventListener('click', () => {
    const current = getNickname();
    const name = (prompt('Enter your name', current) || '').trim();
    if (name) {
      setNickname(name);
      updateNicknameDisplay();
    }
  });

  try {
    // no-cache: 毎回ETagで再検証するが、変更が無ければ304で本体(3MB)を再DLしない。
    // no-storeだと毎回3MBを落とすため重かった。常に最新かつ再訪問は軽い。
    const res = await fetch('data/data.enc', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ENVELOPE = await res.json();
  } catch {
    $('#lock-form').replaceChildren(
      el('p', { class: 'error' }, "Couldn't load data. Please reload the page."));
    return;
  }

  const saved = localStorage.getItem(PASS_KEY);
  if (saved) {
    try { await unlock(saved); } catch { localStorage.removeItem(PASS_KEY); }
  }
}

init();
