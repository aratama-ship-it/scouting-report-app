import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseCsvObjects, formatCsvRow, formatCsvObjects } from '../tools/parse-csv.mjs';

test('parseCsv は単純なカンマ区切りを分解する', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,2,3\n'), [['a', 'b', 'c'], ['1', '2', '3']]);
});

test('parseCsv はダブルクォート内のカンマ・改行・エスケープした"を扱う', () => {
  const csv = 'name,text\n木場,"カンマ,改行\n両方入り"\n分山,"""引用符"""\n';
  assert.deepEqual(parseCsv(csv), [
    ['name', 'text'],
    ['木場', 'カンマ,改行\n両方入り'],
    ['分山', '"引用符"'],
  ]);
});

test('parseCsv は末尾に改行が無くても最終行を読む', () => {
  assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('parseCsvObjects はヘッダー行をキーにしてオブジェクト配列を返す', () => {
  const objs = parseCsvObjects('artist,status,note\n木場大輔,採用,\n風船太郎,検討中,要相談\n');
  assert.deepEqual(objs, [
    { artist: '木場大輔', status: '採用', note: '' },
    { artist: '風船太郎', status: '検討中', note: '要相談' },
  ]);
});

test('parseCsvObjects はヘッダーのみ(データ0件)で空配列を返す', () => {
  assert.deepEqual(parseCsvObjects('artist,status,note\n'), []);
});

test('formatCsvRow はカンマ・引用符・改行を含む値をクォートする', () => {
  assert.equal(formatCsvRow(['plain', 'a,b', 'has "quote"', 'line\nbreak']),
    'plain,"a,b","has ""quote""","line\nbreak"');
});

test('formatCsvObjects はヘッダー+行を書き出し、parseCsvObjectsで往復できる', () => {
  const header = ['artist', 'status', 'note'];
  const rows = [{ artist: '木場大輔', status: '採用', note: 'メモ,カンマ入り' }];
  const csv = formatCsvObjects(header, rows);
  assert.deepEqual(parseCsvObjects(csv), rows);
});
