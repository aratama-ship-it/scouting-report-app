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

test('部分文字列一致で共通語を検出する（"Dance" は "Contemporary Dance" に含まれる）', () => {
  const target = p('A', 'Dancer', 'Dance');
  const near = p('B', 'Physical Circus', 'Contemporary Dance');
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
