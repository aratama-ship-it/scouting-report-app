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
