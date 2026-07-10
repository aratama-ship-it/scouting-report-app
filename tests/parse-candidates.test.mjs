import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCandidates } from '../tools/parse-candidates.mjs';

const SAMPLE = `# 新規候補リスト 2026-07-06（週次スカウティング）

前置きの文章。

---

## 1. HARA（原寛樹）
- カテゴリ: Other（Magician / Illusionist）
- 人数: 1
- スキル: イリュージョン、大道具マジック
- URL: https://www.hirokihara.com/
- 推薦理由: AGT出演実績あり。
- 確認状況: 公式サイトあり（**要確認**）。

## 2. 火付盗賊（Hitsuketouzoku）
- カテゴリ: Physical Circus（Fire / Juggling group）
- 人数: 5+（推定、要確認）
- スキル: 炎と光のジャグリング
- URL: https://fireshowjapan.com/firebandit/
- 推薦理由: 屋外火・屋内LED両対応。
- 確認状況: 公式サイトあり。
`;

test('見出しごとに候補を抽出する', () => {
  const { date, items } = parseCandidates(SAMPLE, 'candidates_2026-07-06.md');
  assert.equal(date, '2026-07-06');
  assert.equal(items.length, 2);
  assert.equal(items[0].name, 'HARA（原寛樹）');
  assert.equal(items[0].category, 'Other（Magician / Illusionist）');
  assert.equal(items[0].url, 'https://www.hirokihara.com/');
  assert.equal(items[1].size, '5+（推定、要確認）');
});

test('番号なし見出しでも名前が取れる', () => {
  const { items } = parseCandidates('## Team Bub.\n- カテゴリ: Other\n');
  assert.equal(items[0].name, 'Team Bub.');
  assert.equal(items[0].skills, '');
});
