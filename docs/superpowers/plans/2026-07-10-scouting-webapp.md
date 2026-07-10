# スカウティングレポート Webアプリ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 週次スカウティング名簿（ローカルmd）を暗号化データ付き静的サイトに変換し、GitHub Pagesで合言葉付きチーム共有できるようにする。

**Architecture:** Nodeスクリプトが `../scouting-report/` のスナップショットmd・候補mdをJSON化し、PBKDF2+AES-256-GCMで単一の `site/data/data.enc` に暗号化。`site/` はvanilla JSのSPA（ロック画面→名簿/候補/履歴/ダッシュボード）で、ブラウザ内でWebCrypto復号。GitHub ActionsのPagesワークフローで `site/` のみを公開。

**Tech Stack:** Node >= 18（`node:crypto` webcrypto、`node --test`）、vanilla JS/HTML/CSS、GitHub Pages（Actionsデプロイ）。npm依存ゼロ。

## Global Constraints

- リポジトリは公開になるため、**生の名簿データ・候補データ・GoogleシートIDをコミットしない**。データは `site/data/data.enc`（暗号化済み）のみ。
- 合言葉はコードに書かない。環境変数 `SCOUT_PASSPHRASE` またはリポジトリ直下の `.secret`（.gitignore対象）で渡す。
- 暗号: AES-256-GCM、鍵導出 PBKDF2-SHA256 / 600,000 iterations / 16byteランダムsalt / 12byte IV。封筒形式は `{v:1, kdf:"PBKDF2-SHA256", iter, salt, iv, ct}`（各バイナリはbase64）。Node側とブラウザ側で完全に同一形式。
- npmパッケージは追加しない。テストはNode組み込みの `node --test`。
- **DOMへの描画は `innerHTML` を使わず**、`el()` ヘルパー（createElement＋textノード）と `replaceChildren` で行う（XSS対策）。
- UI文言は日本語。スマホ幅（375px）で崩れないこと。
- 入力データの場所: `../scouting-report/archive/snapshot_YYYY-MM-DD.md`（markdownテーブル、列: 名前|Size|Base|Skills|Instagram|Youtube|Contact|Note）と `../scouting-report/candidates/candidates_YYYY-MM-DD.md`（`## N. 名前` 見出し＋`- カテゴリ:` 等の箇条書き）。
- 作業ディレクトリ: `/Users/arataurawa/Library/Mobile Documents/com~apple~CloudDocs/claude code files/app-dev/scouting-webapp`（以下、パスはここからの相対）。gitリポジトリ初期化済み。

## File Structure

```
scouting-webapp/
├── package.json              … type:module、test/buildスクリプト
├── .gitignore                … .secret, node_modules, .DS_Store
├── tools/
│   ├── crypto.mjs            … encrypt/decrypt（Node、webcrypto）
│   ├── parse-snapshot.mjs    … スナップショットmd → {date, performers[]}
│   ├── parse-candidates.mjs  … 候補md → {date, items[]}
│   ├── diff-snapshots.mjs    … 2スナップショットの差分
│   ├── stats.mjs             … カテゴリ別集計
│   └── build-data.mjs        … CLI: 全部束ねて data.enc を出力
├── tests/                    … 上記各モジュールの node --test テスト
├── site/                     … GitHub Pages 配信対象
│   ├── index.html
│   ├── style.css
│   ├── crypto.js             … ブラウザ側復号（WebCrypto）
│   ├── app.js                … SPA本体（ロック画面＋4ビュー）
│   └── data/data.enc         … 暗号化データ（build-data.mjsが生成）
└── .github/workflows/pages.yml … site/ のみをPagesへデプロイ
```

---

### Task 1: プロジェクト土台＋暗号モジュール

**Files:**
- Create: `package.json`, `.gitignore`, `tools/crypto.mjs`
- Test: `tests/crypto.test.mjs`

**Interfaces:**
- Produces: `encrypt(passphrase: string, plaintext: string) => Promise<Envelope>`、`decrypt(passphrase: string, envelope: Envelope) => Promise<string>`。`Envelope = {v:1, kdf:'PBKDF2-SHA256', iter:number, salt:string(b64), iv:string(b64), ct:string(b64)}`。Task 6・7が使用。

- [ ] **Step 1: 土台ファイルを作成**

`package.json`:
```json
{
  "name": "scouting-webapp",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/",
    "build": "node tools/build-data.mjs"
  }
}
```

`.gitignore`:
```
.secret
node_modules/
.DS_Store
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/crypto.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt } from '../tools/crypto.mjs';

test('暗号化→復号のラウンドトリップ', async () => {
  const envelope = await encrypt('correct horse battery', '{"hello":"世界"}');
  assert.equal(envelope.v, 1);
  assert.equal(envelope.kdf, 'PBKDF2-SHA256');
  assert.ok(envelope.iter >= 600000);
  const plain = await decrypt('correct horse battery', envelope);
  assert.equal(plain, '{"hello":"世界"}');
});

test('間違った合言葉では復号に失敗する', async () => {
  const envelope = await encrypt('correct horse battery', 'secret data');
  await assert.rejects(() => decrypt('wrong pass', envelope));
});

test('saltとIVは毎回ランダム', async () => {
  const a = await encrypt('p', 'x');
  const b = await encrypt('p', 'x');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`Cannot find module ... tools/crypto.mjs`）

- [ ] **Step 4: 実装**

`tools/crypto.mjs`:
```js
import { webcrypto as crypto } from 'node:crypto';

const ITER = 600000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => Buffer.from(buf).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

async function deriveKey(passphrase, salt, iter) {
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(passphrase, plaintext) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITER);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

export async function decrypt(passphrase, envelope) {
  const key = await deriveKey(passphrase, unb64(envelope.salt), envelope.iter);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(envelope.iv) }, key, unb64(envelope.ct));
  return dec.decode(pt);
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test`
Expected: PASS（3件）

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore tools/crypto.mjs tests/crypto.test.mjs
git commit -m "feat: project scaffold and AES-GCM crypto module"
```

---

### Task 2: スナップショットパーサー

**Files:**
- Create: `tools/parse-snapshot.mjs`
- Test: `tests/parse-snapshot.test.mjs`

**Interfaces:**
- Produces: `parseSnapshot(mdText: string, fileName?: string) => {date: string|null, performers: Performer[]}`。`Performer = {name, size, base, skills, instagram, youtube, contact, note}`（すべてstring、空欄は`''`）。Task 4・5・6が使用。

- [ ] **Step 1: 失敗するテストを書く**

`tests/parse-snapshot.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapshot } from '../tools/parse-snapshot.mjs';

const SAMPLE = `# スカウティング名簿 スナップショット 2026-07-06

列: 名前(z) / Image / Size / Base / Skills / Instagram / Youtube / Contact / Note

| 名前 | Size | Base | Skills | Instagram | Youtube | Contact | Note |
|---|---|---|---|---|---|---|---|
| Hoshizora Piero | 2 | Clown | comedy / clowning | https://instagram.com/hoshizora_piero/ | https://youtube.com/hoshizora_piero | | |
| Tsukikage Duo | 1 | Musician | Shamisen | https://instagram.com/tsukikage_duo/ | | https://example.com/tsukikage | |
`;

test('テーブル行をPerformerとして抽出する', () => {
  const { date, performers } = parseSnapshot(SAMPLE, 'snapshot_2026-07-06.md');
  assert.equal(date, '2026-07-06');
  assert.equal(performers.length, 2);
  assert.deepEqual(performers[0], {
    name: 'Hoshizora Piero', size: '2', base: 'Clown', skills: 'comedy / clowning',
    instagram: 'https://instagram.com/hoshizora_piero/',
    youtube: 'https://youtube.com/hoshizora_piero', contact: '', note: '',
  });
});

test('ヘッダ行と区切り行はスキップされる', () => {
  const { performers } = parseSnapshot(SAMPLE);
  assert.ok(!performers.some((p) => p.name === '名前' || /^-+$/.test(p.name)));
});

test('ファイル名がなくても本文から日付を取る', () => {
  assert.equal(parseSnapshot(SAMPLE).date, '2026-07-06');
});

test('テーブルがない場合はperformers空配列', () => {
  assert.deepEqual(parseSnapshot('# 空です').performers, []);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`Cannot find module ... parse-snapshot.mjs`）

- [ ] **Step 3: 実装**

`tools/parse-snapshot.mjs`:
```js
export function parseSnapshot(mdText, fileName = '') {
  const dateMatch = (fileName + '\n' + mdText).match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : null;
  const performers = [];
  for (const line of mdText.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 8) continue;
    if (cells[0] === '名前' || /^:?-+:?$/.test(cells[0])) continue;
    const [name, size, base, skills, instagram, youtube, contact, note] = cells;
    if (!name) continue;
    performers.push({ name, size, base, skills, instagram, youtube, contact, note });
  }
  return { date, performers };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS(crypto 3件＋snapshot 4件）

- [ ] **Step 5: 実データで件数を検証**

Run:
```bash
node -e "
import('./tools/parse-snapshot.mjs').then(async ({ parseSnapshot }) => {
  const { readFileSync } = await import('node:fs');
  const md = readFileSync('../scouting-report/archive/snapshot_2026-07-06.md', 'utf8');
  const r = parseSnapshot(md, 'snapshot_2026-07-06.md');
  console.log(r.date, r.performers.length + '名');
});"
```
Expected: `2026-07-06 210名前後`（実スナップショットの登録数と一致すること。ゼロや数名なら実装バグ）

- [ ] **Step 6: Commit**

```bash
git add tools/parse-snapshot.mjs tests/parse-snapshot.test.mjs
git commit -m "feat: snapshot markdown table parser"
```

---

### Task 3: 候補リストパーサー

**Files:**
- Create: `tools/parse-candidates.mjs`
- Test: `tests/parse-candidates.test.mjs`

**Interfaces:**
- Produces: `parseCandidates(mdText: string, fileName?: string) => {date: string|null, items: Candidate[]}`。`Candidate = {name, category, size, skills, url, reason, status}`（欠けたフィールドは`''`）。Task 6が使用。

- [ ] **Step 1: 失敗するテストを書く**

`tests/parse-candidates.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCandidates } from '../tools/parse-candidates.mjs';

const SAMPLE = `# 新規候補リスト 2026-07-06（週次スカウティング）

前置きの文章。

---

## 1. カゲロウ（Kagerou）
- カテゴリ: Other（Magician / Illusionist）
- 人数: 1
- スキル: イリュージョン、大道具マジック
- URL: https://example.com/kagerou
- 推薦理由: AGT出演実績あり。
- 確認状況: 公式サイトあり（**要確認**）。

## 2. 月光サーカス団（Gekko Circus）
- カテゴリ: Physical Circus（Fire / Juggling group）
- 人数: 5+（推定、要確認）
- スキル: 炎と光のジャグリング
- URL: https://example.com/gekko
- 推薦理由: 屋外火・屋内LED両対応。
- 確認状況: 公式サイトあり。
`;

test('見出しごとに候補を抽出する', () => {
  const { date, items } = parseCandidates(SAMPLE, 'candidates_2026-07-06.md');
  assert.equal(date, '2026-07-06');
  assert.equal(items.length, 2);
  assert.equal(items[0].name, 'カゲロウ（Kagerou）');
  assert.equal(items[0].category, 'Other（Magician / Illusionist）');
  assert.equal(items[0].url, 'https://example.com/kagerou');
  assert.equal(items[1].size, '5+（推定、要確認）');
});

test('番号なし見出しでも名前が取れる', () => {
  const { items } = parseCandidates('## Team Awa.\n- カテゴリ: Other\n');
  assert.equal(items[0].name, 'Team Awa.');
  assert.equal(items[0].skills, '');
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`Cannot find module ... parse-candidates.mjs`）

- [ ] **Step 3: 実装**

`tools/parse-candidates.mjs`:
```js
const FIELD_MAP = {
  'カテゴリ': 'category',
  '人数': 'size',
  'スキル': 'skills',
  'URL': 'url',
  '推薦理由': 'reason',
  '確認状況': 'status',
};
const EMPTY = { category: '', size: '', skills: '', url: '', reason: '', status: '' };

export function parseCandidates(mdText, fileName = '') {
  const dateMatch = (fileName + '\n' + mdText).match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : null;
  const items = [];
  let current = null;
  for (const line of mdText.split('\n')) {
    const heading = line.match(/^##\s+(?:\d+\.\s*)?(.+?)\s*$/);
    if (heading) {
      current = { name: heading[1], ...EMPTY };
      items.push(current);
      continue;
    }
    if (!current) continue;
    const field = line.match(/^-\s*([^:：]+?)\s*[:：]\s*(.*)$/);
    if (field && FIELD_MAP[field[1]]) current[FIELD_MAP[field[1]]] = field[2].trim();
  }
  return { date, items };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS（累計9件）

- [ ] **Step 5: 実データで件数を検証**

Run:
```bash
node -e "
import('./tools/parse-candidates.mjs').then(async ({ parseCandidates }) => {
  const { readFileSync } = await import('node:fs');
  const md = readFileSync('../scouting-report/candidates/candidates_2026-07-06.md', 'utf8');
  const r = parseCandidates(md, 'candidates_2026-07-06.md');
  console.log(r.date, r.items.length + '件', r.items.map((i) => i.name).join(' / '));
});"
```
Expected: `2026-07-06 10件`（実ファイルの候補数と一致。名前一覧が見出し通り）

- [ ] **Step 6: Commit**

```bash
git add tools/parse-candidates.mjs tests/parse-candidates.test.mjs
git commit -m "feat: weekly candidates markdown parser"
```

---

### Task 4: スナップショット差分

**Files:**
- Create: `tools/diff-snapshots.mjs`
- Test: `tests/diff-snapshots.test.mjs`

**Interfaces:**
- Consumes: `Performer`（Task 2の形）
- Produces: `diffSnapshots(oldPerformers: Performer[], newPerformers: Performer[]) => {added: Performer[], removed: Performer[], changed: {name: string, fields: {field: string, from: string, to: string}[]}[]}`。Task 6が使用。

- [ ] **Step 1: 失敗するテストを書く**

`tests/diff-snapshots.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffSnapshots } from '../tools/diff-snapshots.mjs';

const p = (name, extra = {}) => ({
  name, size: '1', base: 'Physical Circus', skills: 'Juggling',
  instagram: '', youtube: '', contact: '', note: '', ...extra,
});

test('追加・削除・変更を検出する', () => {
  const before = [p('A'), p('B'), p('C', { skills: 'Diabolo' })];
  const after = [p('A'), p('C', { skills: 'Diabolo / Cyr wheel' }), p('D')];
  const diff = diffSnapshots(before, after);
  assert.deepEqual(diff.added.map((x) => x.name), ['D']);
  assert.deepEqual(diff.removed.map((x) => x.name), ['B']);
  assert.deepEqual(diff.changed, [{
    name: 'C',
    fields: [{ field: 'skills', from: 'Diabolo', to: 'Diabolo / Cyr wheel' }],
  }]);
});

test('変化がなければすべて空', () => {
  const list = [p('A'), p('B')];
  const diff = diffSnapshots(list, list);
  assert.deepEqual(diff, { added: [], removed: [], changed: [] });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`Cannot find module ... diff-snapshots.mjs`）

- [ ] **Step 3: 実装**

`tools/diff-snapshots.mjs`:
```js
const FIELDS = ['size', 'base', 'skills', 'instagram', 'youtube', 'contact', 'note'];

export function diffSnapshots(oldPerformers, newPerformers) {
  const oldMap = new Map(oldPerformers.map((x) => [x.name, x]));
  const newMap = new Map(newPerformers.map((x) => [x.name, x]));
  const added = newPerformers.filter((x) => !oldMap.has(x.name));
  const removed = oldPerformers.filter((x) => !newMap.has(x.name));
  const changed = [];
  for (const [name, np] of newMap) {
    const op = oldMap.get(name);
    if (!op) continue;
    const fields = FIELDS
      .filter((f) => (op[f] || '') !== (np[f] || ''))
      .map((f) => ({ field: f, from: op[f] || '', to: np[f] || '' }));
    if (fields.length) changed.push({ name, fields });
  }
  return { added, removed, changed };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS（累計11件）

- [ ] **Step 5: Commit**

```bash
git add tools/diff-snapshots.mjs tests/diff-snapshots.test.mjs
git commit -m "feat: weekly snapshot diff"
```

---

### Task 5: 集計

**Files:**
- Create: `tools/stats.mjs`
- Test: `tests/stats.test.mjs`

**Interfaces:**
- Consumes: `Performer`（Task 2の形）
- Produces: `computeStats(performers: Performer[]) => {total: number, byBase: {[base: string]: number}}`。`byBase`は件数の多い順のキー順。Task 6が使用。

- [ ] **Step 1: 失敗するテストを書く**

`tests/stats.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../tools/stats.mjs';

const p = (base) => ({
  name: 'x', size: '1', base, skills: '',
  instagram: '', youtube: '', contact: '', note: '',
});

test('カテゴリ別に件数の多い順で集計する', () => {
  const stats = computeStats([p('Dancer'), p('Physical Circus'), p('Physical Circus'), p('')]);
  assert.equal(stats.total, 4);
  assert.deepEqual(Object.entries(stats.byBase), [
    ['Physical Circus', 2],
    ['Dancer', 1],
    ['(未分類)', 1],
  ]);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`Cannot find module ... stats.mjs`）

- [ ] **Step 3: 実装**

`tools/stats.mjs`:
```js
export function computeStats(performers) {
  const counts = {};
  for (const x of performers) {
    const base = x.base || '(未分類)';
    counts[base] = (counts[base] || 0) + 1;
  }
  const byBase = Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1]));
  return { total: performers.length, byBase };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS（累計12件）

- [ ] **Step 5: Commit**

```bash
git add tools/stats.mjs tests/stats.test.mjs
git commit -m "feat: category stats"
```

---

### Task 6: ビルドCLI（data.enc生成）

**Files:**
- Create: `tools/build-data.mjs`
- Test: 実データでの実行＋復号検証（下記Step 3）

**Interfaces:**
- Consumes: Task 1〜5の全エクスポート
- Produces: `site/data/data.enc`。復号後のpayload形式（Task 7以降のフロントエンドはこれを前提とする）:
```
{
  generatedAt: ISO文字列,
  roster: { date, performers: Performer[] },          // 最新スナップショット
  candidates: [{ date, items: Candidate[] }],          // 新しい週順
  history: [{ date, prevDate, added, removed, changed }], // 新しい週順（週が1つだけなら空）
  stats: { total, byBase }
}
```

- [ ] **Step 1: 実装**

`tools/build-data.mjs`:
```js
#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from './parse-snapshot.mjs';
import { parseCandidates } from './parse-candidates.mjs';
import { diffSnapshots } from './diff-snapshots.mjs';
import { computeStats } from './stats.mjs';
import { encrypt } from './crypto.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE = process.env.SCOUT_SOURCE || join(ROOT, '..', 'scouting-report');

function passphrase() {
  if (process.env.SCOUT_PASSPHRASE) return process.env.SCOUT_PASSPHRASE;
  const secretFile = join(ROOT, '.secret');
  if (existsSync(secretFile)) return readFileSync(secretFile, 'utf8').trim();
  console.error('合言葉が未設定です。SCOUT_PASSPHRASE 環境変数か .secret ファイルで指定してください。');
  process.exit(1);
}

function readMdFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => ({ file: f, text: readFileSync(join(dir, f), 'utf8') }));
}

const snapshots = readMdFiles(join(SOURCE, 'archive'))
  .map(({ file, text }) => parseSnapshot(text, file))
  .filter((s) => s.date && s.performers.length > 0);
if (snapshots.length === 0) {
  console.error(`スナップショットが読めませんでした（${join(SOURCE, 'archive')}）。data.enc は更新しません。`);
  process.exit(1);
}

const candidates = readMdFiles(join(SOURCE, 'candidates'))
  .map(({ file, text }) => parseCandidates(text, file))
  .filter((c) => c.date && c.items.length > 0)
  .reverse();

const history = [];
for (let i = 1; i < snapshots.length; i++) {
  history.push({
    date: snapshots[i].date,
    prevDate: snapshots[i - 1].date,
    ...diffSnapshots(snapshots[i - 1].performers, snapshots[i].performers),
  });
}
history.reverse();

const latest = snapshots.at(-1);
const payload = {
  generatedAt: new Date().toISOString(),
  roster: latest,
  candidates,
  history,
  stats: computeStats(latest.performers),
};

const envelope = await encrypt(passphrase(), JSON.stringify(payload));
const outDir = join(ROOT, 'site', 'data');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'data.enc'), JSON.stringify(envelope));
console.log(`OK: 名簿${latest.performers.length}名(${latest.date}) / 候補${candidates.length}週分 / 履歴${history.length}件 → site/data/data.enc`);
```

- [ ] **Step 2: 実データでビルド実行**

Run: `SCOUT_PASSPHRASE='test-pass-for-build' npm run build`
Expected: `OK: 名簿210名前後(2026-07-06) / 候補1週分 / 履歴0件 → site/data/data.enc`（履歴はスナップショットが1つしかないため0件で正しい）

- [ ] **Step 3: 生成物が復号できること・平文が漏れていないことを検証**

Run:
```bash
node -e "
import('./tools/crypto.mjs').then(async ({ decrypt }) => {
  const { readFileSync } = await import('node:fs');
  const env = JSON.parse(readFileSync('site/data/data.enc', 'utf8'));
  const payload = JSON.parse(await decrypt('test-pass-for-build', env));
  console.log('roster:', payload.roster.performers.length, 'candidates:', payload.candidates.length);
});"
grep -c 'Hoshizora Piero' site/data/data.enc || echo '平文リークなし OK'
```
Expected: 件数がStep 2と一致し、grepは0件（`平文リークなし OK`）

- [ ] **Step 4: 既存テストが全部通ることを確認**

Run: `npm test`
Expected: PASS（12件）

- [ ] **Step 5: Commit**

```bash
git add tools/build-data.mjs site/data/data.enc
git commit -m "feat: build CLI producing encrypted data.enc"
```

---

### Task 7: フロントエンド骨格（ロック画面＋復号＋タブ）

**Files:**
- Create: `site/index.html`, `site/style.css`, `site/crypto.js`, `site/app.js`
- Create: `.claude/launch.json`（プレビュー用）

**Interfaces:**
- Consumes: `site/data/data.enc`（Task 6のpayload形式）
- Produces: `app.js` 内のグローバル状態 `DATA`（復号済みpayload）、DOM生成ヘルパー `el(tag, attrs, ...children)`（childrenの文字列はtextノード化されるためXSS安全）と `link(url, label)`、各ビュー描画関数 `renderRoster() / renderCandidates() / renderHistory() / renderDashboard()`（`$('#view')` へ `replaceChildren` で描画。Task 8〜10で実装を差し替え）。

- [ ] **Step 1: ブラウザ側復号モジュール**

`site/crypto.js`:
```js
const enc = new TextEncoder();
const dec = new TextDecoder();
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function decryptEnvelope(passphrase, envelope) {
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(envelope.salt), iterations: envelope.iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(envelope.iv) }, key, unb64(envelope.ct));
  return JSON.parse(dec.decode(pt));
}
```

- [ ] **Step 2: HTMLシェル**

`site/index.html`:
```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Scouting Report</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div id="lock" class="lock">
  <form id="lock-form" class="lock-card">
    <h1>Scouting Report</h1>
    <p>チームの合言葉を入力してください</p>
    <input id="pass" type="password" autocomplete="current-password" autofocus>
    <button type="submit">開く</button>
    <p id="lock-error" class="error" hidden>合言葉が違います</p>
    <p id="lock-loading" hidden>復号中…</p>
  </form>
</div>
<div id="app" hidden>
  <header>
    <h1>Scouting Report</h1>
    <span id="meta"></span>
    <button id="lock-btn" type="button">ロック</button>
  </header>
  <nav id="tabs">
    <button data-view="roster" class="active">名簿</button>
    <button data-view="candidates">候補</button>
    <button data-view="history">履歴</button>
    <button data-view="dashboard">集計</button>
  </nav>
  <main id="view"></main>
</div>
<script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: スタイル**

`site/style.css`:
```css
:root {
  --bg: #14151a; --card: #1f2128; --text: #e8e6e1; --muted: #9a9790;
  --accent: #d4a24e; --line: #33363f; --danger: #d46a5f; --ok: #7fb069;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; }
.lock { min-height: 100vh; display: grid; place-items: center; padding: 16px; }
.lock-card { background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: 32px; width: 100%; max-width: 360px; text-align: center; }
.lock-card h1 { margin: 0 0 8px; font-size: 20px; color: var(--accent); }
.lock-card p { color: var(--muted); font-size: 13px; }
.lock-card input { width: 100%; padding: 10px; margin: 12px 0; border-radius: 8px;
  border: 1px solid var(--line); background: var(--bg); color: var(--text); font-size: 16px; }
.lock-card button { width: 100%; padding: 10px; border: none; border-radius: 8px;
  background: var(--accent); color: #14151a; font-weight: 700; font-size: 15px; cursor: pointer; }
.error { color: var(--danger); }
header { display: flex; align-items: center; gap: 12px; padding: 12px 16px;
  border-bottom: 1px solid var(--line); }
header h1 { font-size: 16px; margin: 0; color: var(--accent); }
#meta { color: var(--muted); font-size: 12px; margin-left: auto; }
#lock-btn { background: none; border: 1px solid var(--line); color: var(--muted);
  border-radius: 6px; padding: 4px 10px; cursor: pointer; }
#tabs { display: flex; gap: 4px; padding: 8px 16px; border-bottom: 1px solid var(--line);
  overflow-x: auto; }
#tabs button { background: none; border: none; color: var(--muted); padding: 8px 12px;
  font-size: 14px; cursor: pointer; border-radius: 6px; white-space: nowrap; }
#tabs button.active { color: var(--text); background: var(--card); font-weight: 700; }
main { padding: 16px; max-width: 1100px; margin: 0 auto; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px;
  padding: 14px 16px; margin-bottom: 10px; }
.card h3 { margin: 0 0 4px; font-size: 15px; }
.tag { display: inline-block; background: var(--bg); border: 1px solid var(--line);
  color: var(--muted); border-radius: 999px; padding: 1px 10px; font-size: 12px; margin-right: 6px; }
.links a { color: var(--accent); font-size: 13px; margin-right: 10px; text-decoration: none; }
.muted { color: var(--muted); font-size: 13px; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.filters input, .filters select { padding: 8px 10px; border-radius: 8px; font-size: 14px;
  border: 1px solid var(--line); background: var(--card); color: var(--text); }
.filters input { flex: 1; min-width: 180px; }
.diff-added { color: var(--ok); }
.diff-removed { color: var(--danger); }
.big-number { font-size: 32px; margin: 4px 0; }
.bar { background: var(--accent); height: 18px; border-radius: 4px; }
.bar-row { display: grid; grid-template-columns: 160px 1fr 40px; gap: 8px;
  align-items: center; margin-bottom: 6px; font-size: 13px; }
@media (max-width: 480px) { .bar-row { grid-template-columns: 110px 1fr 34px; } }
```

- [ ] **Step 4: アプリ本体（ロック→復号→タブ切替。ビューはこの時点では件数のみの仮表示）**

`site/app.js`:
```js
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
```

- [ ] **Step 5: ブラウザで検証**

`.claude/launch.json` を作成（なければ）:
```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "scouting-webapp",
      "runtimeExecutable": "python3",
      "runtimeArgs": ["-m", "http.server", "8931", "-d", "site"],
      "port": 8931
    }
  ]
}
```
preview_start でサーバー起動し、以下を確認:
1. ロック画面が表示される
2. 間違った合言葉 → 「合言葉が違います」
3. `test-pass-for-build`（Task 6で使ったもの）→ 復号成功、ヘッダに「2026-07-06 時点 / ○○名」
4. 4タブすべて切替でき、各仮表示の件数がTask 6のビルドログと一致
5. リロード → 合言葉入力なしで開く（localStorage）
6. 「ロック」ボタン → ロック画面に戻る
7. preview_console_logs にエラーなし

- [ ] **Step 6: Commit**

```bash
git add site/index.html site/style.css site/crypto.js site/app.js .claude/launch.json
git commit -m "feat: SPA shell with lock screen and in-browser decryption"
```

---

### Task 8: 名簿ビュー（検索・絞り込み）

**Files:**
- Modify: `site/app.js`（仮の `renderRoster` を差し替え、`performerCard` を追加）

**Interfaces:**
- Consumes: `DATA.roster.performers`、ヘルパー `el` / `link`（Task 7）
- Produces: なし（画面のみ）

- [ ] **Step 1: renderRoster を実装**

`site/app.js` の仮 `renderRoster` を以下に置き換え:
```js
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
```
（検索入力・セレクトは再生成せず、リスト部分だけ `update()` で差し替えるためフォーカスが維持される）

- [ ] **Step 2: ブラウザで検証**

preview で確認:
1. 名簿タブに全員がカード表示され、件数表示が合っている
2. 検索欄に「juggling」→ ジャグラーだけに絞られ、入力フォーカスが維持される
3. カテゴリを「Dancer」に → ダンサーのみ。検索と同時併用できる
4. Instagram/YouTubeリンクが新しいタブで開く
5. preview_resize でモバイル幅（375px）→ カードが崩れない
6. preview_console_logs にエラーなし

- [ ] **Step 3: Commit**

```bash
git add site/app.js
git commit -m "feat: roster view with search and category filter"
```

---

### Task 9: 候補ビューと履歴ビュー

**Files:**
- Modify: `site/app.js`（仮の `renderCandidates` と `renderHistory` を差し替え）

**Interfaces:**
- Consumes: `DATA.candidates`（週の新しい順）、`DATA.history`（週の新しい順、`{date, prevDate, added, removed, changed}`）、ヘルパー `el` / `link`

- [ ] **Step 1: renderCandidates を実装**

仮実装を以下に置き換え:
```js
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
```

- [ ] **Step 2: renderHistory を実装**

仮実装を以下に置き換え:
```js
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
```

- [ ] **Step 3: ブラウザで検証**

preview で確認:
1. 候補タブ: 2026-07-06の10件がカード表示、各カードに公式サイトリンク・「未追記」タグ
2. 履歴タブ: 現時点はスナップショット1週分なので「履歴はまだありません…」の案内が出る
3. preview_console_logs にエラーなし

履歴の実表示も確認するため、一時データで差分を作って表示テストし、終わったら実データに戻す:
```bash
TMP=$(mktemp -d) && mkdir -p "$TMP/archive" "$TMP/candidates"
cp ../scouting-report/archive/snapshot_2026-07-06.md "$TMP/archive/"
sed 's/| Hoshizora Piero |/| Hoshizora Piero TEST |/' ../scouting-report/archive/snapshot_2026-07-06.md \
  > "$TMP/archive/snapshot_2026-07-07.md"
SCOUT_SOURCE="$TMP" SCOUT_PASSPHRASE='test-pass-for-build' npm run build
# → ブラウザリロード: 履歴タブに「＋追加: Hoshizora Piero TEST / −削除: Hoshizora Piero」が出ること
SCOUT_PASSPHRASE='test-pass-for-build' npm run build   # 実データで再ビルドして戻す
rm -rf "$TMP"
```

- [ ] **Step 4: Commit**

```bash
git add site/app.js
git commit -m "feat: candidates and history views"
```

---

### Task 10: ダッシュボード

**Files:**
- Modify: `site/app.js`（仮の `renderDashboard` を差し替え）

**Interfaces:**
- Consumes: `DATA.stats`（`{total, byBase}`、byBaseは多い順）、`DATA.roster.date`、ヘルパー `el`

- [ ] **Step 1: renderDashboard を実装**

仮実装を以下に置き換え:
```js
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
```

- [ ] **Step 2: ブラウザで検証**

preview で確認:
1. 集計タブ: 合計組数、カテゴリ別の横棒グラフ（多い順、Physical Circusが最長のはず）
2. モバイル幅（375px）でもバーとラベルが読める
3. preview_console_logs にエラーなし

- [ ] **Step 3: 全体テスト＋スクリーンショット**

Run: `npm test` → PASS（12件）
preview_screenshot で名簿・集計の2画面を撮ってユーザーへの報告に添付。

- [ ] **Step 4: Commit**

```bash
git add site/app.js
git commit -m "feat: dashboard view"
```

---

### Task 11: GitHub Pages 公開＋週次運用への組み込み

**Files:**
- Create: `.github/workflows/pages.yml`, `README.md`
- Modify: 週次定期タスクの指示文（scheduled task）、`../scouting-report/PROJECT_NOTES.md`、メモリ `project_scouting_report.md`

**Interfaces:**
- Consumes: これまでの全成果物

- [ ] **Step 1: 本番用の合言葉をユーザーに決めてもらう**

ユーザーに長めのフレーズ（20文字以上推奨）を確認し、`.secret` に保存。`git status` で `.secret` が untracked に出ないこと（.gitignore が効いていること）を確認。`npm run build` で data.enc を本番合言葉で再生成:
```bash
npm run build
git add site/data/data.enc
git commit -m "chore: rebuild data with production passphrase"
```

- [ ] **Step 2: Pagesデプロイワークフローを作成**

`.github/workflows/pages.yml`:
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site
      - id: deployment
        uses: actions/deploy-pages@v4
```
（`site/` のみを公開するため、docs/ の設計書や tools/ は Pages に載らない）

`README.md`:
```markdown
# Scouting Report Webapp

パフォーマー・スカウティング名簿のチーム共有ビューア。
データは合言葉で暗号化された site/data/data.enc のみを含む（生データ非収録）。

## 更新手順（週次）
1. ../scouting-report/ に週次スナップショットと候補mdが保存される（既存の定期タスク）
2. `npm run build`（合言葉は .secret から読まれる）
3. `git add site/data/data.enc && git commit -m "data: YYYY-MM-DD" && git push`
4. GitHub Actions が自動で Pages に反映

## 開発
- `npm test` … パーサー・暗号のテスト
```

```bash
git add .github/workflows/pages.yml README.md
git commit -m "feat: GitHub Pages deploy workflow and README"
```

- [ ] **Step 3: GitHubリポジトリ作成＆push＆Pages有効化**

```bash
git branch -M main
gh repo create scouting-report-app --public --source=. --push
gh api -X POST repos/{owner}/scouting-report-app/pages -f build_type=workflow \
  || gh api -X PUT repos/{owner}/scouting-report-app/pages -f build_type=workflow
gh run watch   # Pagesワークフローの完了を待つ
```
Expected: workflow成功。`https://<owner>.github.io/scouting-report-app/` が公開される。

- [ ] **Step 4: 本番URLで最終検証**

公開URLをブラウザで開き、Task 7 Step 5 の1〜7を本番合言葉で再確認（特に: 間違い合言葉が弾かれる、正しい合言葉で210名前後表示、モバイル幅OK）。
また `https://<owner>.github.io/scouting-report-app/data/data.enc` を直接開き、暗号化JSONしか見えないことを確認。

- [ ] **Step 5: 週次定期タスクとドキュメントを更新**

1. 週次定期タスク `monthly-scouting-report-expansion` の指示文に手順を追記:
   「4. `app-dev/scouting-webapp` で `npm run build` を実行（合言葉は .secret から自動で読まれる）、5. `git add site/data/data.enc && git commit -m "data: <日付>" && git push`（GitHub Pagesに自動反映）」
2. `../scouting-report/PROJECT_NOTES.md` にWebアプリ節を追記（公開URL・更新手順・リポジトリ名）。
3. メモリ `project_scouting_report.md` にWebアプリの存在（リポジトリ名・公開URL・合言葉は.secret管理・週次ビルド手順）を追記。

- [ ] **Step 6: Commit＆完了報告**

```bash
git add -A && git commit -m "docs: weekly operation notes" && git push
```
ユーザーに公開URL・合言葉の共有方法（URLとは別チャネルで口頭/DM推奨）・週次の自動反映フローを報告して完了。
