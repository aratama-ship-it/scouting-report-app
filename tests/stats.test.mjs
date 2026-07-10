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
