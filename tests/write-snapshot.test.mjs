import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortCategory, candidateToRow, selectPromotable, formatSnapshotTable } from '../tools/write-snapshot.mjs';

test('shortCategory は括弧の前の区分だけを取り出す', () => {
  assert.equal(shortCategory('Musician（Whistling / 口笛）'), 'Musician');
  assert.equal(shortCategory('Other（Kamishibai / 街頭紙芝居）'), 'Other');
  assert.equal(shortCategory('Physical Circus'), 'Physical Circus');
  assert.equal(shortCategory(''), 'Other');
});

test('candidateToRow は名簿の列形式に変換する', () => {
  const row = candidateToRow({
    name: '木場大輔', category: 'Musician（Japanese Traditional / 胡弓）',
    size: '1', skills: '胡弓独奏', url: 'https://www.yuzuruha.net/',
  }, '2026-09-30');
  assert.equal(row.name, '木場大輔');
  assert.equal(row.base, 'Musician');
  assert.equal(row.contact, 'https://www.yuzuruha.net/');
  assert.equal(row.note, '候補採用(2026-09-30)');
  assert.equal(row.instagram, '');
});

test('selectPromotable は採用ステータスかつ未登録の候補だけを返す', () => {
  const weeks = [
    { date: '2026-09-07', items: [{ name: 'A', category: 'Other' }, { name: 'B', category: 'Other' }] },
    { date: '2026-09-14', items: [{ name: 'C', category: 'Other' }, { name: 'A', category: 'Other（重複）' }] },
  ];
  const existingNames = new Set(['B']); // Bは既に名簿にいる（採用済み扱いでも除外）
  const statusByName = { A: { status: '採用' }, C: { status: '検討中' } };
  const promotable = selectPromotable(weeks, existingNames, statusByName);
  assert.equal(promotable.length, 1);
  assert.equal(promotable[0].name, 'A');
  assert.equal(promotable[0].category, 'Other'); // 初出週(09-07)のデータを採用、重複週は無視
});

test('selectPromotable はステータス未取得(空オブジェクト)でも空配列を返す(エラーにしない)', () => {
  const weeks = [{ date: '2026-09-07', items: [{ name: 'A', category: 'Other' }] }];
  const promotable = selectPromotable(weeks, new Set(), {});
  assert.deepEqual(promotable, []);
});

test('formatSnapshotTable はヘッダー・区切り・行を生成する', () => {
  const table = formatSnapshotTable([
    { name: 'Zeroko', size: '2', base: 'Clown', skills: 'comedy', instagram: '', youtube: '', contact: '', note: '' },
  ]);
  const lines = table.split('\n');
  assert.equal(lines[0], '| 名前 | Size | Base | Skills | Instagram | Youtube | Contact | Note |');
  assert.equal(lines[1], '|---|---|---|---|---|---|---|---|');
  assert.equal(lines[2], '| Zeroko | 2 | Clown | comedy |  |  |  |  |');
});
