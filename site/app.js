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

// 候補mdの推薦理由・スキルにある **強調** を<strong>に変換する（elはtextノード化するのでXSS安全）
export function mdBold(text) {
  return String(text ?? '').split(/\*\*(.+?)\*\*/g).map((part, i) => (
    i % 2 === 1 ? el('strong', {}, part) : part));
}

export function link(url, label) {
  return url
    ? el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label)
    : '';
}

// --- ビュー ---
const rosterState = { q: '', base: '', selected: null };

function performerCard(p, { clickable = false, onClick, extraClass = '', favMarked = false } = {}) {
  const classes = ['card', extraClass, clickable ? 'card-clickable' : ''].filter(Boolean).join(' ');
  const info = el('div', { class: 'card-info' },
    el('h3', {},
      favMarked ? el('span', { class: 'fav-mark' }, '★') : '',
      p.name, ' ',
      el('span', { class: 'tag' }, p.base || 'Uncategorized'),
      p.size && p.size !== '1' ? el('span', { class: 'tag' }, `${p.size} members`) : '',
      p.pendingAdoption
        ? el('span', { class: 'tag diff-added', title: 'Adopted from Candidates. Becomes a permanent roster row at the next weekly snapshot.' }, 'Adopted (pending snapshot)')
        : ''),
    el('div', { class: 'muted' }, mdBold(p.skills)),
    p.note ? el('div', { class: 'muted' }, '📝 ', mdBold(p.note)) : '',
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

function formatTimestamp(ts) {
  return ts ? new Date(ts).toLocaleString('en-US') : '';
}

function openDetail(name) {
  rosterState.selected = name;
  renderRoster();
}

// 候補カテゴリ文字列（例: "Musician（Whistling / 口笛）"）から名簿Base列相当の短い区分を取り出す。
// tools/write-snapshot.mjs の shortCategory と同じロジック（Node/ブラウザで別ファイルのため重複させている）。
function shortCategory(category) {
  const m = /^(.*?)[（(]/.exec(category || '');
  return (m ? m[1] : category || '').trim() || 'Other';
}

function candidateAsPerformer(c) {
  return {
    name: c.name, size: c.size || '1', base: shortCategory(c.category), skills: c.skills,
    instagram: '', youtube: '', contact: c.url || '', note: c.reason || '', pendingAdoption: true,
  };
}

// 名簿本体 ＋ ステータスが「採用」になった候補（まだ週次スナップショットに昇格していないもの）を
// 合わせた表示用の一覧。次回の週次実行(tools/promote-candidates.mjs)を待たずに名簿へ出す
// （2026-09-24、ユーザー指示: 「昇格させた時点で出る」の待ちを省く）。
function effectiveRoster() {
  const existingNames = new Set(DATA.roster.performers.map((p) => p.name));
  const seen = new Set();
  const adopted = [];
  // DATA.candidatesは新しい週が先頭（build-data.mjs）。tools/promote-candidates.mjsは
  // 初出週（古い方）のデータを採用するため、ここも古い週から辿って揃える。
  for (const week of [...DATA.candidates].reverse()) {
    for (const c of week.items) {
      if (seen.has(c.name) || existingNames.has(c.name)) { seen.add(c.name); continue; }
      seen.add(c.name);
      if (DATA.candidateStatuses[c.name]?.status === '採用') adopted.push(candidateAsPerformer(c));
    }
  }
  return adopted.length ? [...DATA.roster.performers, ...adopted] : DATA.roster.performers;
}

function renderRoster() {
  if (rosterState.selected) {
    renderDetail(rosterState.selected);
    return;
  }
  const performers = effectiveRoster();
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
    const favoritedNames = new Set(DATA.favorites.map((f) => f.artist));
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

// ☆お気に入り・💬コメントは読み取り専用（2026-09-24〜、CSVが正本）。
// 誰が付けたかの一覧をtitle属性に出す。追加・削除はCSVを直接編集するか、AIに伝えて週次反映してもらう。
function favDisplay(artistName) {
  const favs = DATA.favorites.filter((f) => f.artist === artistName);
  const names = favs.map((f) => f.name).filter(Boolean).join(', ');
  return el('span', { class: 'fav-count', title: names ? `Favorited by: ${names}` : '' },
    `${favs.length ? '★' : '☆'} ${favs.length}`);
}

function commentListFor(artistName) {
  const list = DATA.comments.filter((c) => c.artist === artistName);
  return el('div', {},
    list.length === 0
      ? el('p', { class: 'muted' }, 'No comments yet')
      : list.map((c) => el('div', { class: 'comment' },
          el('div', { class: 'muted' }, `${c.name || 'Anonymous'} · ${formatTimestamp(c.timestamp)}`),
          el('div', {}, c.text))));
}

function renderDetail(name) {
  const target = effectiveRoster().find((p) => p.name === name);
  if (!target) {
    rosterState.selected = null;
    renderRoster();
    return;
  }

  const back = el('button', { type: 'button', class: 'back-btn' }, '← Back to roster');
  back.addEventListener('click', () => {
    rosterState.selected = null;
    renderRoster();
  });

  // Web調査で確認済みの紹介文(出典・確度つき)。ビルド時にdata.encへ埋め込まれる
  const CONF_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
  const aboutCard = target.bio
    ? el('div', { class: 'card' },
        el('h3', {}, 'About'),
        el('p', { class: 'bio-text' }, target.bio.fact),
        el('div', { class: 'bio-meta' },
          el('span', { class: `tag conf-${target.bio.confidence}` },
            `Confidence: ${CONF_LABEL[target.bio.confidence] || target.bio.confidence}`),
          link(target.bio.source, `Source: ${target.bio.sourceLabel || 'link'}`)),
        target.bio.caveat ? el('p', { class: 'bio-caveat' }, `⚠ ${target.bio.caveat}`) : '')
    : '';

  const favCommentCard = el('div', { class: 'card' },
    el('h3', {}, 'Favorites & Comments'),
    el('div', { class: 'fav-row' }, favDisplay(target.name)),
    commentListFor(target.name));

  const related = findRelated(target, DATA.roster.performers, { maxResults: 10 });
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
    aboutCard,
    favCommentCard,
    relatedSection);
}

const candidatesState = { origin: '' };
const STATUS_SLUG = {
  '未確認': 'unconfirmed', '検討中': 'considering', '連絡済み': 'contacted',
  '採用': 'adopted', '保留': 'hold', '見送り': 'declined',
};

function candidateCard(c, rosterNames) {
  const currentStatus = DATA.candidateStatuses[c.name]?.status || '未確認';
  const statusTag = el('span',
    { class: `tag status-tag status-${STATUS_SLUG[currentStatus] || 'unconfirmed'}` }, currentStatus);

  return el('div', { class: 'card' },
    el('h3', {},
      c.name, ' ',
      el('span', { class: 'tag' }, c.category),
      el('span', { class: 'tag' }, c.origin || '国内'),
      rosterNames.has(c.name)
        ? el('span', { class: 'tag diff-added' }, 'Added to roster')
        : el('span', { class: 'tag' }, 'Not yet added')),
    el('div', { class: 'muted' }, mdBold(c.skills), c.size ? ` / Size: ${c.size}` : ''),
    c.reason ? el('div', { class: 'muted' }, '💡 ', mdBold(c.reason)) : '',
    c.status ? el('div', { class: 'muted' }, '✔️ ', mdBold(c.status)) : '',
    el('div', { class: 'links' }, link(c.url, 'Official site')),
    el('div', { class: 'fav-row' }, statusTag, favDisplay(c.name),
      el('span', { class: 'muted' }, `💬 ${DATA.comments.filter((cm) => cm.artist === c.name).length}`)));
}

function renderCandidates() {
  if (DATA.candidates.length === 0) {
    $('#view').replaceChildren(el('p', { class: 'muted' }, 'No candidate data yet'));
    return;
  }
  const rosterNames = new Set(DATA.roster.performers.map((p) => p.name));

  const origins = ['', '国内', '海外'];
  const toggle = el('div', { class: 'origin-toggle' },
    origins.map((o) => {
      const btn = el('button', {
        type: 'button',
        class: 'origin-pill' + (candidatesState.origin === o ? ' active' : ''),
      }, o === '' ? 'All' : o);
      btn.addEventListener('click', () => {
        candidatesState.origin = o;
        renderCandidates();
      });
      return btn;
    }));

  const sections = DATA.candidates.flatMap((week) => {
    const items = week.items.filter(
      (c) => !candidatesState.origin || (c.origin || '国内') === candidatesState.origin);
    if (items.length === 0) return [];
    return [
      el('h2', { class: 'muted' }, `New candidates as of ${week.date} (${items.length})`),
      ...items.map((c) => candidateCard(c, rosterNames)),
    ];
  });

  $('#view').replaceChildren(toggle,
    ...(sections.length ? sections : [el('p', { class: 'muted' }, 'No candidates for this filter')]));
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
  localStorage.setItem(PASS_KEY, pass);
  $('#lock').hidden = true;
  $('#app').hidden = false;
  $('#meta').textContent =
    `As of ${DATA.roster.date} / ${DATA.roster.performers.length} artists`;
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
    $('#pass-toggle').setAttribute('aria-label', showing ? 'Show passphrase' : 'Hide passphrase');
  });

  $('#tabs').addEventListener('click', (e) => {
    if (e.target.dataset.view) showView(e.target.dataset.view);
  });

  $('#lock-btn').addEventListener('click', () => {
    localStorage.removeItem(PASS_KEY);
    location.reload();
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
