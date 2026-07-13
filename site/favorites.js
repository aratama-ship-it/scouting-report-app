async function callGas(gasUrl, action, params) {
  const url = new URL(gasUrl);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body;
}

export async function fetchFavorites(gasUrl, passphrase) {
  const body = await callGas(gasUrl, 'list', { passphrase });
  return { favorites: body.favorites || [], comments: body.comments || [] };
}

export async function toggleFavorite(gasUrl, passphrase, name, artist) {
  await callGas(gasUrl, 'toggleFavorite', { passphrase, name, artist });
}

export async function addComment(gasUrl, passphrase, name, artist, text) {
  await callGas(gasUrl, 'addComment', { passphrase, name, artist, text });
}

const NICK_KEY = 'scout_nickname';

export function getNickname() {
  return localStorage.getItem(NICK_KEY) || '';
}

export function setNickname(name) {
  localStorage.setItem(NICK_KEY, name);
}
