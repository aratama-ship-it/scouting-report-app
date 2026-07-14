import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt } from '../tools/crypto.mjs';

test('暗号化→復号のラウンドトリップ', async () => {
  const envelope = await encrypt('correct horse battery', '{"hello":"世界"}');
  assert.equal(envelope.v, 1);
  assert.equal(envelope.kdf, 'PBKDF2-SHA256');
  assert.ok(envelope.iter >= 100000); // 強力な合言葉前提での速度/安全のバランス下限
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
