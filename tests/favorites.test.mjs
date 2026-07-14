import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFavorites, toggleFavorite, addComment, requestUpdate } from '../site/favorites.js';

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
  assert.deepEqual(result, { favorites: [{ name: 'A', artist: 'X' }], comments: [], requests: [] });
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

test('requestUpdate は action=requestUpdate と artist を送る', async () => {
  let capturedUrl;
  globalThis.fetch = async (url) => {
    capturedUrl = url.toString();
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  await requestUpdate('https://example.com/exec', 'pass1', 'アラタ', 'Zeroko', 'もっと動画見たい');
  assert.match(capturedUrl, /action=requestUpdate/);
  assert.match(capturedUrl, new RegExp(`artist=Zeroko`));
  assert.match(capturedUrl, new RegExp(`text=${encodeURIComponent('もっと動画見たい')}`));
});
