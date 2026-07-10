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
