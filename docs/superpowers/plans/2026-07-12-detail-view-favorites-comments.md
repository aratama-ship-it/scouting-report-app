# アーティスト詳細ビュー＋関連アーティスト＋お気に入り・コメント Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 4 is a human checkpoint, not a coding task — do not dispatch it to a coding subagent. The controller must pause and interact with the user directly.**

**Goal:** 名簿カードをクリックすると詳細ビューに切り替わり、スキル共通ワードで繋がる関連アーティストが見られるようにする。さらに、チームメンバーがアーティストに☆お気に入り・コメントを付けられ、Google Apps Script経由で即座に全員へ反映されるようにする。

**Architecture:** 詳細ビューは既存の `renderRoster` の状態遷移として実装（URL変更なし、`site/related.js` の純粋関数でスキル共通ワードから関連アーティストを算出）。お気に入り・コメントは名簿本体の週次ビルドパイプラインとは完全に独立し、ブラウザが `site/favorites.js` 経由でGoogle Apps Script（Webアプリとして公開、専用シートに追記）に直接読み書きする。GASは合言葉をスクリプトプロパティで検証してから応答する（コードそのものには合言葉もシートIDも書かない）。

**Tech Stack:** 既存踏襲（Node組み込み `node --test`、vanilla JS/HTML/CSS、`el()`/`replaceChildren` のみでDOM構築）。新規に Google Apps Script（GASエディタ上で動作、リポジトリにはコードと手順書のみ）。

## Global Constraints

- DOMへの描画は `innerHTML` を使わず、`el()` ヘルパーと `replaceChildren` で行う（既存 `site/app.js` の `el(tag, attrs, ...children)` を再利用）。
- フレームワーク・npmパッケージなし。UI文言は日本語。スマホ幅（375px）で崩れないこと。
- **合言葉・GoogleシートID・APIキーの類を、コミットするどのファイルにも書かない**（`scouting-webapp` は公開リポジトリ）。GASの合言葉は Apps Script の「スクリプト プロパティ」に手動設定し、コードには含めない。GASはスプレッドシートに紐づく形（`SpreadsheetApp.getActiveSpreadsheet()`）で作成し、シートIDをハードコードしない。
- お気に入り・コメントのデータは平文でよい（AES暗号化不要、合言葉ゲート＋HTTPSで十分と設計承認済み）。ただし `data.enc`・週次ビルドパイプラインには一切混ぜない。
- テストはNode組み込みの `node --test`（`npm test` = `node --test 'tests/**/*.mjs'`）。
- 作業ディレクトリ: `/Users/arataurawa/Library/Mobile Documents/com~apple~CloudDocs/claude code files/app-dev/scouting-webapp`（以下、パスはここからの相対）。
- 現在の合言葉（`.secret` の内容、GASのスクリプトプロパティに設定する値と同一にする）: `aratareport34bankingisart`。
- 参照設計書: `docs/superpowers/specs/2026-07-11-related-artists-design.md`、`docs/superpowers/specs/2026-07-12-favorites-comments-design.md`。

## File Structure

```
scouting-webapp/
├── site/
│   ├── related.js            … 新規: 関連アーティスト算出（純粋関数、node --testで検証可）
│   ├── favorites.js          … 新規: GAS通信＋ニックネーム管理
│   ├── favorites-config.js   … 新規: GASの公開URLを1つだけ持つ設定ファイル（デプロイ後に手で書く）
│   ├── app.js                … 変更: 詳細ビュー・お気に入り/コメントUIを統合
│   ├── index.html            … 変更: ヘッダーにニックネーム表示ボタンを追加
│   └── style.css             … 変更: 詳細ビュー・関連カード・お気に入り/コメントのスタイル追加
├── gas/
│   ├── Code.gs                … 新規: Google Apps Script本体（doGet一本、list/toggleFavorite/addComment）
│   └── DEPLOY.md              … 新規: デプロイ手順書（ユーザーがGoogle側で行う操作）
└── tests/
    ├── related.test.mjs       … 新規
    └── favorites.test.mjs     … 新規
```

---

### Task 1: 関連アーティスト算出ロジック

**Files:**
- Create: `site/related.js`
- Test: `tests/related.test.mjs`

**Interfaces:**
- Produces: `findRelated(target: Performer, allPerformers: Performer[], opts?: {maxResults?: number}) => {performer: Performer, commonWords: string[]}[]`。`Performer = {name, size, base, skills, instagram, youtube, contact, note}`（既存のroster payload形状と同一）。共通スキル数（`commonWords.length`）の多い順、`maxResults`（デフォルト6）で切り詰め、対象自身は除外。Task 2・6が使用。

- [ ] **Step 1: 失敗するテストを書く**

`tests/related.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRelated } from '../site/related.js';

const p = (name, base, skills) => ({
  name, size: '1', base, skills,
  instagram: '', youtube: '', contact: '', note: '',
});

test('共通語が一つもなければ空配列を返す', () => {
  const target = p('カイ', 'Physical Circus', 'Handstand / Cyr wheel');
  const dancer = p('ネオン', 'Dancer', 'Contemporary Dance / Rhythmic Gymnast');
  const nomatch = p('サックス', 'Musician', 'Saxophone');
  const result = findRelated(target, [target, dancer, nomatch]);
  assert.deepEqual(result, []);
});

test('部分文字列一致で共通語を検出する（表記ゆれにも強い）', () => {
  const target = p('A', 'Physical Circus', 'Aerial Silk');
  const near = p('B', 'Dancer', 'Aeriel Strap');
  const result = findRelated(target, [target, near]);
  assert.equal(result.length, 1);
  assert.equal(result[0].performer.name, 'B');
});

test('共通スキル数の多い順にソートする', () => {
  const target = p('A', 'Physical Circus', 'Juggling / Acrobatics / Handstand');
  const two = p('B', 'Dancer', 'Juggling / Acrobatics');
  const one = p('C', 'Dancer', 'Juggling');
  const result = findRelated(target, [target, one, two]);
  assert.deepEqual(result.map((r) => r.performer.name), ['B', 'C']);
});

test('自分自身は結果に含めない', () => {
  const target = p('A', 'Physical Circus', 'Juggling');
  const result = findRelated(target, [target]);
  assert.deepEqual(result, []);
});

test('maxResultsで件数を絞る（デフォルト6）', () => {
  const target = p('A', 'Physical Circus', 'Dance');
  const others = Array.from({ length: 10 }, (_, i) => p(`P${i}`, 'Dancer', 'Dance'));
  const result = findRelated(target, [target, ...others]);
  assert.equal(result.length, 6);
});

test('2文字以下の単語はノイズとして無視する', () => {
  const target = p('A', 'Physical Circus', 'MC');
  const other = p('B', 'Other', 'MC');
  const result = findRelated(target, [target, other]);
  assert.deepEqual(result, []);
});

test('skillsが空文字なら結果も空', () => {
  const target = p('A', 'Physical Circus', '');
  const other = p('B', 'Dancer', 'Dance');
  const result = findRelated(target, [target, other]);
  assert.deepEqual(result, []);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`Cannot find module ... site/related.js`）

- [ ] **Step 3: 実装**

`site/related.js`:
```js
function splitSkillWords(skills) {
  return [...new Set(
    skills.split(/[/,、・]/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 3))];
}

function wordsOverlap(a, b) {
  return a.includes(b) || b.includes(a);
}

export function findRelated(target, allPerformers, { maxResults = 6 } = {}) {
  const targetWords = splitSkillWords(target.skills);
  if (targetWords.length === 0) return [];

  const scored = [];
  for (const p of allPerformers) {
    if (p === target) continue;
    const candidateWords = splitSkillWords(p.skills);
    const commonWords = targetWords.filter(
      (tw) => candidateWords.some((cw) => wordsOverlap(tw, cw)));
    if (commonWords.length > 0) scored.push({ performer: p, commonWords });
  }
  scored.sort((a, b) => b.commonWords.length - a.commonWords.length);
  return scored.slice(0, maxResults);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS（既存13件＋新規7件＝20件）

- [ ] **Step 5: 実データで動作確認**

Run:
```bash
node -e "
import('./site/related.js').then(async ({ findRelated }) => {
  const { parseSnapshot } = await import('./tools/parse-snapshot.mjs');
  const { readFileSync } = await import('node:fs');
  const md = readFileSync('../scouting-report/archive/snapshot_2026-07-06.md', 'utf8');
  const { performers } = parseSnapshot(md, 'snapshot_2026-07-06.md');
  const target = performers.find((p) => p.name === 'Kai Taniguchi');
  const related = findRelated(target, performers);
  console.log(target.name, '→', related.map((r) => \`\${r.performer.name}(\${r.commonWords.length})\`));
});"
```
Expected: エラーなく実行され、`Kai Taniguchi`（Handstand / Cyr wheel）と共通語を持つ人（Cyr wheel を含む人など）が1件以上表示される。0件でもエラーではないが、実データで一致例があるか目視確認する。

- [ ] **Step 6: Commit**

```bash
git add site/related.js tests/related.test.mjs
git commit -m "feat: related-artist matching by shared skill words"
```

---

### Task 2: 名簿詳細ビュー（クリック遷移・関連アーティスト・戻るボタン）

**Files:**
- Modify: `site/app.js`
- Modify: `site/style.css`

**Interfaces:**
- Consumes: `findRelated`（Task 1）
- Produces: `performerCard(p, {clickable=false, onClick, extraClass='', favMarked=false}={})`（既存シグネチャを拡張。`favMarked` はTask 6まで未使用で常にfalse）、`openDetail(name)`、`rosterState.selected`（新規フィールド）。Task 6が `favMarked` を実際に使う。

- [ ] **Step 1: `performerCard` を拡張し、クリックで詳細に遷移できるようにする**

`site/app.js` の既存 `performerCard` 関数を丸ごと以下に置き換え:
```js
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
```

- [ ] **Step 2: `rosterState` に `selected` を追加し、`renderRoster` を詳細ビューへの分岐に対応させる**

既存の `const rosterState = { q: '', base: '' };` を以下に置き換え:
```js
const rosterState = { q: '', base: '', selected: null };
```

既存の `renderRoster` 関数冒頭（`function renderRoster() {` の直後）に以下を追加:
```js
function renderRoster() {
  if (rosterState.selected) {
    renderDetail(rosterState.selected);
    return;
  }
  const performers = DATA.roster.performers;
  // ...（既存のコードはそのまま）
```

同関数内の `list.replaceChildren(...filtered.map(performerCard));` を以下に置き換え:
```js
    list.replaceChildren(...filtered.map((p) => performerCard(p, {
      clickable: true, onClick: openDetail,
    })));
```

- [ ] **Step 3: `renderDetail` を新規追加**

`renderCandidates` 関数の直前に以下を追加:
```js
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
```

- [ ] **Step 4: `findRelated` をインポート**

`site/app.js` 冒頭の `import { decryptEnvelope } from './crypto.js';` の直後に追加:
```js
import { findRelated } from './related.js';
```

- [ ] **Step 5: CSSを追加**

`site/style.css` の末尾に追加:
```css
.card-clickable { cursor: pointer; transition: border-color .15s; }
.card-clickable:hover { border-color: var(--accent); }
.back-btn { background: none; border: 1px solid var(--line); color: var(--text);
  border-radius: 8px; padding: 8px 14px; margin-bottom: 12px; cursor: pointer; font-size: 14px; }
.detail-main h3 { font-size: 20px; }
.related-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
.fav-mark { color: var(--accent); margin-right: 4px; }
```
（`.fav-mark` はTask 6で使うがCSS変更は1回にまとめてここで追加してよい）

- [ ] **Step 6: 構文チェックとNodeテストを確認**

Run: `node -c site/app.js && npm test`
Expected: 構文エラーなし。`npm test` は既存20件がそのままPASS（`site/app.js` はNodeテスト対象外）。

- [ ] **Step 7: ブラウザで動作確認**

`.claude/launch.json` の `scouting-webapp` 設定でプレビューを起動し、合言葉でロック解除後:
1. 名簿タブでカードをクリック→詳細ビューに切り替わる（SNSリンクではない部分をクリック）
2. 詳細ビューに対象の情報が大きめに表示される
3. 「← 一覧に戻る」で一覧に戻り、直前の検索・カテゴリ絞り込みが保持されている
4. 関連アーティストのカードが表示される場合はクリックでそのアーティストの詳細に切り替わる
5. スキルが共通しない/存在しないアーティストでは「関連アーティストは見つかりませんでした」が出る
6. SNSリンク（Instagram等）をクリックしても詳細ビューに遷移しない（新しいタブでリンクが開く）
7. スマホ幅（375px）でカードやボタンが崩れない
8. コンソールにエラーが出ない

- [ ] **Step 8: Commit**

```bash
git add site/app.js site/style.css
git commit -m "feat: artist detail view with related-artist cards"
```

---

### Task 3: GAS Webアプリのコードと手順書

**Files:**
- Create: `gas/Code.gs`
- Create: `gas/DEPLOY.md`

**Interfaces:**
- Produces: GAS Webアプリの `doGet(e)` エンドポイント仕様（Task 4でデプロイ、Task 5がクライアントから呼ぶ）:
  - `?action=list&passphrase=X` → `{favorites: [{timestamp,name,artist}], comments: [{timestamp,name,artist,text}]}`
  - `?action=toggleFavorite&passphrase=X&name=N&artist=A` → `{ok:true}`（既存なら削除、なければ追加のトグル）
  - `?action=addComment&passphrase=X&name=N&artist=A&text=T` → `{ok:true}`
  - 合言葉不一致・未設定時は `{error:'invalid passphrase'}`

- [ ] **Step 1: `gas/Code.gs` を作成**

```javascript
const SHEET_NAME = 'Favorites';

function getPassphrase_() {
  return PropertiesService.getScriptProperties().getProperty('PASSPHRASE');
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['timestamp', 'name', 'artist', 'type', 'text']);
  }
  return sheet;
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const expected = getPassphrase_();
  if (!expected || p.passphrase !== expected) {
    return jsonOutput_({ error: 'invalid passphrase' });
  }

  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues().slice(1);

  if (p.action === 'toggleFavorite') {
    if (!p.name || !p.artist) return jsonOutput_({ error: 'name and artist are required' });
    const existingRowIndex = rows.findIndex(
      (r) => r[1] === p.name && r[2] === p.artist && r[3] === 'fav');
    if (existingRowIndex >= 0) {
      sheet.deleteRow(existingRowIndex + 2); // +1 ヘッダー行 +1 1-indexed
    } else {
      sheet.appendRow([new Date().toISOString(), p.name, p.artist, 'fav', '']);
    }
    return jsonOutput_({ ok: true });
  }

  if (p.action === 'addComment') {
    if (!p.name || !p.artist || !p.text) {
      return jsonOutput_({ error: 'name, artist and text are required' });
    }
    sheet.appendRow([new Date().toISOString(), p.name, p.artist, 'comment', p.text]);
    return jsonOutput_({ ok: true });
  }

  const favorites = rows.filter((r) => r[3] === 'fav')
    .map((r) => ({ timestamp: r[0], name: r[1], artist: r[2] }));
  const comments = rows.filter((r) => r[3] === 'comment')
    .map((r) => ({ timestamp: r[0], name: r[1], artist: r[2], text: r[4] }));
  return jsonOutput_({ favorites, comments });
}
```

- [ ] **Step 2: `gas/DEPLOY.md` を作成**

```markdown
# GAS Webアプリ デプロイ手順

お気に入り・コメント機能のバックエンド（Google Apps Script）をデプロイする手順。
Googleアカウントでの操作が必要（この手順はAIエージェントが自動実行できない）。

## 1. スクリプトを作成する

1. 対象のGoogle Sheets「Scouting report」を開く（普段の週次更新で使っているシート）
2. メニュー「拡張機能」→「Apps Script」を開く（新しいタブでエディタが開く）
3. デフォルトの `Code.gs` の中身を全部消し、このリポジトリの `gas/Code.gs` の内容を貼り付ける
4. 上部の「保存」（フロッピーアイコン）を押す

## 2. 合言葉をスクリプトプロパティに設定する（コードには書かない）

1. 左メニューの歯車アイコン「プロジェクトの設定」を開く
2. 「スクリプト プロパティ」→「スクリプト プロパティを追加」
3. プロパティ: `PASSPHRASE`　値: アプリの合言葉（`.secret` と同じ文字列）を入力して保存

## 3. Webアプリとして公開する

1. 右上「デプロイ」→「新しいデプロイ」
2. 種類の選択（歯車アイコン）→「ウェブアプリ」
3. 「次のユーザーとして実行」: 自分（Google アカウント）
4. 「アクセスできるユーザー」: **全員**（匿名を含む。GitHub Pages上の静的サイトから
   認証なしで呼び出すために必要。アクセス制御はコード内の合言葉検証で行う）
5. 「デプロイ」→ 初回は権限の許可画面が出るので許可する
6. 発行された「ウェブアプリ」のURL（`https://script.google.com/macros/s/.../exec`）をコピーする

## 4. アプリ側にURLを設定する

コピーしたURLを `site/favorites-config.js` の `GAS_URL` に設定する（このリポジトリの
別タスクで作成されるファイル）。設定後、`git add site/favorites-config.js && git commit
&& git push` するだけで反映される（`npm run build` は不要。このファイルは週次ビルドの
対象外で、GitHub Pagesが直接配信する）。

## 5. 動作確認

ブラウザで以下のURLを開き、`{"favorites":[],"comments":[]}` のようなJSONが返れば成功
（`YOUR_URL` と `YOUR_PASSPHRASE` を実際の値に置き換える）:
```
YOUR_URL?action=list&passphrase=YOUR_PASSPHRASE
```
合言葉を間違えると `{"error":"invalid passphrase"}` が返ることも確認する。

## 6. コードを更新したいとき

`gas/Code.gs` を編集したら、Apps Scriptエディタ側にも同じ内容を貼り直し、
「デプロイ」→「デプロイを管理」→ 該当デプロイの鉛筆アイコン→「バージョン」を
「新バージョン」にして「デプロイ」を押すと、同じURLのまま更新される。
```

- [ ] **Step 3: Commit**

```bash
git add gas/Code.gs gas/DEPLOY.md
git commit -m "feat: Google Apps Script backend for favorites and comments"
```

---

### Task 4: 【人間チェックポイント】GASデプロイと疎通確認

**この task はコーディングタスクではありません。** サブエージェントに委譲せず、
コントローラー（あなた）がユーザーと直接やり取りして進めること。

**Files:**
- Create: `site/favorites-config.js`

**手順:**

- [ ] **Step 1: ユーザーにデプロイを依頼する**

ユーザーに `gas/DEPLOY.md` の手順1〜5を実行してもらい、発行されたWebアプリURL
（`https://script.google.com/macros/s/.../exec` 形式）を教えてもらう。

- [ ] **Step 2: `site/favorites-config.js` を作成**

```js
// gas/DEPLOY.md の手順でデプロイしたGAS WebアプリのURLをここに設定する。
export const GAS_URL = 'ユーザーから受け取ったURLをここに貼る';
```

- [ ] **Step 3: 疎通確認**

Run（`YOUR_URL` を実際のURL、合言葉を `.secret` の内容に置き換える）:
```bash
curl -s "YOUR_URL?action=list&passphrase=$(cat .secret)"
```
Expected: `{"favorites":[],"comments":[]}`（初回は空配列）

Run（誤った合言葉で拒否されることも確認）:
```bash
curl -s "YOUR_URL?action=list&passphrase=wrong"
```
Expected: `{"error":"invalid passphrase"}`

- [ ] **Step 4: Commit**

```bash
git add site/favorites-config.js
git commit -m "chore: configure GAS web app URL for favorites and comments"
```

- [ ] **Step 5: 次のタスクに進む前に**

疎通確認が失敗する場合は `gas/DEPLOY.md` の手順（特に「アクセスできるユーザー: 全員」
の設定漏れ、スクリプトプロパティの `PASSPHRASE` 未設定）を再確認し、解決してから
Task 5 に進む。

---

### Task 5: フロント側お気に入り・コメント通信モジュール

**Files:**
- Create: `site/favorites.js`
- Test: `tests/favorites.test.mjs`

**Interfaces:**
- Produces:
  - `fetchFavorites(gasUrl: string, passphrase: string) => Promise<{favorites: {timestamp,name,artist}[], comments: {timestamp,name,artist,text}[]}>`
  - `toggleFavorite(gasUrl: string, passphrase: string, name: string, artist: string) => Promise<void>`
  - `addComment(gasUrl: string, passphrase: string, name: string, artist: string, text: string) => Promise<void>`
  - `getNickname() => string`（`localStorage` 経由、空なら `''`）
  - `setNickname(name: string) => void`
  - すべてTask 6が使用。

- [ ] **Step 1: 失敗するテストを書く**

`tests/favorites.test.mjs`:
```js
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFavorites, toggleFavorite, addComment } from '../site/favorites.js';

afterEach(() => { delete globalThis.fetch; });

test('fetchFavorites は action=list と passphrase を送り、結果を整形して返す', async () => {
  let capturedUrl;
  globalThis.fetch = async (url) => {
    capturedUrl = url.toString();
    return {
      ok: true, status: 200,
      json: async () => ({ favorites: [{ name: 'A', artist: 'X' }], comments: [] }),
    };
  };
  const result = await fetchFavorites('https://example.com/exec', 'pass1');
  assert.deepEqual(result, { favorites: [{ name: 'A', artist: 'X' }], comments: [] });
  assert.match(capturedUrl, /action=list/);
  assert.match(capturedUrl, /passphrase=pass1/);
});

test('fetchFavorites はGASからのerrorフィールドで例外を投げる', async () => {
  globalThis.fetch = async () => ({
    ok: true, status: 200, json: async () => ({ error: 'invalid passphrase' }),
  });
  await assert.rejects(
    () => fetchFavorites('https://example.com/exec', 'wrong'),
    /invalid passphrase/);
});

test('fetchFavorites はHTTPエラーで例外を投げる', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await assert.rejects(() => fetchFavorites('https://example.com/exec', 'pass1'));
});

test('toggleFavorite は action=toggleFavorite と name/artist を送る', async () => {
  let capturedUrl;
  globalThis.fetch = async (url) => {
    capturedUrl = url.toString();
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  await toggleFavorite('https://example.com/exec', 'pass1', 'アラタ', 'Zeroko');
  assert.match(capturedUrl, /action=toggleFavorite/);
  assert.match(capturedUrl, new RegExp(`name=${encodeURIComponent('アラタ')}`));
  assert.match(capturedUrl, new RegExp(`artist=${encodeURIComponent('Zeroko')}`));
});

test('addComment は action=addComment と text を送る', async () => {
  let capturedUrl;
  globalThis.fetch = async (url) => {
    capturedUrl = url.toString();
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  await addComment('https://example.com/exec', 'pass1', 'アラタ', 'Zeroko', 'いいね');
  assert.match(capturedUrl, /action=addComment/);
  assert.match(capturedUrl, new RegExp(`text=${encodeURIComponent('いいね')}`));
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`Cannot find module ... site/favorites.js`）

- [ ] **Step 3: 実装**

`site/favorites.js`:
```js
async function callGas(gasUrl, action, params) {
  const url = new URL(gasUrl);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body;
}

export async function fetchFavorites(gasUrl, passphrase) {
  const body = await callGas(gasUrl, 'list', { passphrase });
  return { favorites: body.favorites || [], comments: body.comments || [] };
}

export async function toggleFavorite(gasUrl, passphrase, name, artist) {
  await callGas(gasUrl, 'toggleFavorite', { passphrase, name, artist });
}

export async function addComment(gasUrl, passphrase, name, artist, text) {
  await callGas(gasUrl, 'addComment', { passphrase, name, artist, text });
}

const NICK_KEY = 'scout_nickname';

export function getNickname() {
  return localStorage.getItem(NICK_KEY) || '';
}

export function setNickname(name) {
  localStorage.setItem(NICK_KEY, name);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS（既存20件＋新規5件＝25件）

- [ ] **Step 5: 実際にデプロイ済みのGASへ疎通確認（Task 4で設定したURLを使用）**

Run:
```bash
node -e "
import('./site/favorites.js').then(async ({ fetchFavorites }) => {
  const { GAS_URL } = await import('./site/favorites-config.js');
  const { readFileSync } = await import('node:fs');
  const pass = readFileSync('.secret', 'utf8').trim();
  const result = await fetchFavorites(GAS_URL, pass);
  console.log(result);
});"
```
Expected: `{ favorites: [], comments: [] }`（Task 4での初回確認時と同じ、まだ何も登録していないため）

- [ ] **Step 6: Commit**

```bash
git add site/favorites.js tests/favorites.test.mjs
git commit -m "feat: GAS communication module for favorites and comments"
```

---

### Task 6: 詳細ビューへの☆・コメントUI統合とニックネーム管理

**Files:**
- Modify: `site/app.js`
- Modify: `site/index.html`
- Modify: `site/style.css`

**Interfaces:**
- Consumes: `fetchFavorites`, `toggleFavorite`, `addComment`, `getNickname`, `setNickname`（Task 5）、`GAS_URL`（Task 4の `site/favorites-config.js`）、`performerCard` の `favMarked` オプション（Task 2で定義済み）

- [ ] **Step 1: `index.html` にニックネーム表示ボタンを追加**

`site/index.html` の以下の行:
```html
    <span id="meta"></span>
    <button id="lock-btn" type="button">ロック</button>
```
を以下に置き換え:
```html
    <span id="meta"></span>
    <button id="nickname-btn" type="button"></button>
    <button id="lock-btn" type="button">ロック</button>
```

- [ ] **Step 2: `site/app.js` にインポートと状態を追加**

`import { findRelated } from './related.js';` の直後に追加:
```js
import { fetchFavorites, toggleFavorite, addComment, getNickname, setNickname } from './favorites.js';
import { GAS_URL } from './favorites-config.js';
```

`let ENVELOPE = null;` の直後に追加:
```js
let PASSPHRASE = null;
let FAVORITES = { favorites: [], comments: [] };
let favError = null;
```

- [ ] **Step 3: ニックネーム管理のヘルパーを追加**

`function openDetail(name) {` の直前に追加:
```js
function ensureNickname() {
  let name = getNickname();
  if (!name) {
    name = (prompt('お名前を入力してください（チーム内に表示されます）') || '').trim();
    if (name) setNickname(name);
  }
  return name;
}

function updateNicknameDisplay() {
  const name = getNickname();
  $('#nickname-btn').textContent = name ? `👤 ${name}` : '👤 名前未設定';
}

async function loadFavorites() {
  try {
    FAVORITES = await fetchFavorites(GAS_URL, PASSPHRASE);
    favError = null;
  } catch {
    favError = 'お気に入り・コメントを読み込めませんでした';
  }
}

function formatTimestamp(ts) {
  return ts ? new Date(ts).toLocaleString('ja-JP') : '';
}
```

- [ ] **Step 4: `renderDetail` をお気に入り・コメント対応に拡張**

Task 2で作った `renderDetail` 関数を丸ごと以下に置き換え（`async` になり、
`favCommentCard` が追加される）:
```js
async function renderDetail(name) {
  const target = DATA.roster.performers.find((p) => p.name === name);
  if (!target) {
    rosterState.selected = null;
    renderRoster();
    return;
  }

  $('#view').replaceChildren(el('p', { class: 'muted' }, '読み込み中…'));
  await loadFavorites();
  if (rosterState.selected !== name) return; // その間に別のカードが選ばれていたら描画しない

  const back = el('button', { type: 'button', class: 'back-btn' }, '← 一覧に戻る');
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
  }, `${iAmFavorited ? '★' : '☆'} ${favCount}人`);
  favBtn.addEventListener('click', async () => {
    favBtn.disabled = true;
    try {
      await toggleFavorite(GAS_URL, PASSPHRASE, ensureNickname(), target.name);
      renderDetail(target.name);
    } catch {
      favBtn.disabled = false;
    }
  });

  const refreshBtn = el('button', { type: 'button' }, '更新');
  refreshBtn.addEventListener('click', () => renderDetail(target.name));

  const commentsForTarget = FAVORITES.comments.filter((c) => c.artist === target.name);
  const commentForm = el('form', { class: 'comment-form' },
    el('textarea', { placeholder: 'コメントを入力', rows: '2' }),
    el('button', { type: 'submit' }, '投稿'));
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
      ? el('p', { class: 'muted' }, 'コメントはまだありません')
      : commentsForTarget.map((c) => el('div', { class: 'comment' },
          el('div', { class: 'muted' }, `${c.name} ・ ${formatTimestamp(c.timestamp)}`),
          el('div', {}, c.text))));

  const favCommentCard = el('div', { class: 'card' },
    el('h3', {}, 'お気に入り・コメント'),
    favError ? el('p', { class: 'error' }, favError) : '',
    el('div', { class: 'fav-row' }, favBtn, refreshBtn),
    commentForm,
    commentList);

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
    favCommentCard,
    relatedSection);
}
```

- [ ] **Step 5: `renderRoster` の一覧表示に★マークを反映**

Task 2で追加した `list.replaceChildren(...)` の行を含む部分を以下に置き換え:
```js
    const favoritedNames = new Set(FAVORITES.favorites.map((f) => f.artist));
    list.replaceChildren(...filtered.map((p) => performerCard(p, {
      clickable: true, onClick: openDetail, favMarked: favoritedNames.has(p.name),
    })));
```

- [ ] **Step 6: `unlock` にニックネーム初期化とお気に入りの初回読み込みを追加**

既存の `unlock` 関数を丸ごと以下に置き換え:
```js
async function unlock(pass) {
  DATA = await decryptEnvelope(pass, ENVELOPE); // 失敗時は例外
  PASSPHRASE = pass;
  localStorage.setItem(PASS_KEY, pass);
  $('#lock').hidden = true;
  $('#app').hidden = false;
  $('#meta').textContent =
    `${DATA.roster.date} 時点 / ${DATA.roster.performers.length}名`;
  ensureNickname();
  updateNicknameDisplay();
  showView('roster');
  loadFavorites().then(() => {
    if (!rosterState.selected) renderRoster();
  });
}
```

- [ ] **Step 7: ニックネームボタンのクリックハンドラを `init` に追加**

`init` 関数内、`$('#lock-btn').addEventListener(...)` ブロックの直後に追加:
```js
  $('#nickname-btn').addEventListener('click', () => {
    const current = getNickname();
    const name = (prompt('お名前を入力してください', current) || '').trim();
    if (name) {
      setNickname(name);
      updateNicknameDisplay();
    }
  });
```

- [ ] **Step 8: CSSを追加**

`site/style.css` の末尾に追加:
```css
.fav-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.fav-btn { background: none; border: 1px solid var(--line); color: var(--text);
  border-radius: 8px; padding: 8px 14px; cursor: pointer; font-size: 14px; }
.fav-btn.fav-active { border-color: var(--accent); color: var(--accent); }
.fav-btn:disabled, #nickname-btn:disabled { opacity: .5; cursor: default; }
#nickname-btn { background: none; border: 1px solid var(--line); color: var(--muted);
  border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
.comment-form { display: flex; gap: 8px; margin-bottom: 12px; }
.comment-form textarea { flex: 1; padding: 8px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--bg); color: var(--text); font-family: inherit; font-size: 14px; resize: vertical; }
.comment-form button { border: none; border-radius: 8px; background: var(--accent);
  color: #14151a; font-weight: 700; padding: 0 16px; cursor: pointer; }
.comment { border-top: 1px solid var(--line); padding: 8px 0; font-size: 14px; }
header { flex-wrap: wrap; row-gap: 6px; }
```

- [ ] **Step 9: 構文チェックとNodeテストを確認**

Run: `node -c site/app.js && npm test`
Expected: 構文エラーなし。既存25件がそのままPASS。

- [ ] **Step 10: ブラウザで実際のGAS（Task 4でデプロイ済み）を使ってエンドツーエンド確認**

プレビューを起動し、合言葉でロック解除:
1. 初回、ニックネーム入力のポップアップが出る→入力するとヘッダーに「👤 名前」が表示
2. 名簿タブに（初回はお気に入りなしのため）★マークが付いていないことを確認
3. カードをクリックして詳細ビューへ→「☆ 0人」ボタンが見える
4. ☆ボタンをクリック→「★ 1人」に変わり色が変わる（トグルON）
5. 「← 一覧に戻る」→ 名簿一覧の該当カードに★マークが付いている
6. 再度そのアーティストの詳細を開き☆ボタンをクリック→「☆ 0人」に戻る（トグルOFF）
7. コメント欄に入力して投稿→一覧に反映される（ニックネーム・日時・本文）
8. 「更新」ボタンでもう一度読み込み直せる
9. ヘッダーの「👤 名前」をクリックしてニックネームを変更できる
10. GASのURLを一時的に壊す（`site/favorites-config.js` の値を書き換えて試す等）と
    「お気に入り・コメントを読み込めませんでした」が出て、名簿閲覧自体はブロックされない
    ことを確認したら元のURLに戻す
11. スマホ幅（375px）でヘッダー・詳細ビュー・コメント欄が崩れない
12. コンソールにエラーが出ない

- [ ] **Step 11: Commit**

```bash
git add site/app.js site/index.html site/style.css
git commit -m "feat: integrate favorites and comments into detail view"
```

---

### Task 7: ドキュメント更新

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: なし

- [ ] **Step 1: `README.md` に機能説明を追記**

既存の「## 更新手順（週次）」セクションの直前に以下を追加:
```markdown
## お気に入り・コメント機能

名簿の詳細ビューから☆お気に入り・コメントを付けられる。データはGoogle Apps Script
経由で専用シート（Scouting reportスプレッドシート内の「Favorites」タブ）に即時反映
される。週次ビルド（data.enc）とは独立しており、`npm run build` は不要。

- 初期設定・URLの再発行: `gas/DEPLOY.md` を参照
- GASのURLは `site/favorites-config.js` の `GAS_URL` で管理（公開リポジトリに
  含まれるが、合言葉の検証はGAS側で行うため問題ない）
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document favorites and comments feature"
```
