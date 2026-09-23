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
  return {
    favorites: body.favorites || [],
    comments: body.comments || [],
    requests: body.requests || [],
    candidateStatuses: body.candidateStatuses || {},
  };
}

// 候補の選考ステータス。artist(候補名)ごとに1件（上書き式）。
export const CANDIDATE_STATUSES = ['未確認', '検討中', '連絡済み', '採用', '保留', '見送り'];

export async function setCandidateStatus(gasUrl, passphrase, myName, artist, status, note) {
  await callGas(gasUrl, 'setCandidateStatus', {
    passphrase, name: myName || '', artist, status, note: note || '',
  });
}

export async function toggleFavorite(gasUrl, passphrase, name, artist) {
  await callGas(gasUrl, 'toggleFavorite', { passphrase, name, artist });
}

export async function addComment(gasUrl, passphrase, name, artist, text) {
  await callGas(gasUrl, 'addComment', { passphrase, name, artist, text });
}

// 更新リクエスト。GAS側でRequestsとして記録し、管理者(Arata)にメール通知が飛ぶ。
export async function requestUpdate(gasUrl, passphrase, name, artist, text) {
  await callGas(gasUrl, 'requestUpdate', { passphrase, name, artist, text: text || '' });
}

const NICK_KEY = 'scout_nickname';

export function getNickname() {
  return localStorage.getItem(NICK_KEY) || '';
}

export function setNickname(name) {
  localStorage.setItem(NICK_KEY, name);
}
