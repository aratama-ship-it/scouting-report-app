const SHEET_NAME = 'Favorites';
const CANDIDATE_STATUS_SHEET = 'CandidateStatus';
const VALID_STATUSES = ['未確認', '検討中', '連絡済み', '採用', '保留', '見送り'];

function getPassphrase_() {
  return PropertiesService.getScriptProperties().getProperty('PASSPHRASE');
}

// スプレッドシートはIDで開く（openById=標準のspreadsheets権限。getActiveSpreadsheetの
// currentonly権限は他の権限追加で壊れやすく、匿名Webアプリで問題を起こしたため使わない）。
// シートIDはコードに直書きせず、スクリプトプロパティ SHEET_ID から読む。
function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return SpreadsheetApp.openById(id);
}

// 権限承認用: エディタの実行メニューから一度これを実行すると spreadsheets 権限の
// 承認画面が出る（末尾に _ が無いのでメニューに表示される）。
function authorizeApp() {
  getSheet_();
  getCandidateStatusSheet_();
}

function getSheet_() {
  const ss = ss_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['timestamp', 'name', 'artist', 'type', 'text']);
  }
  return sheet;
}

// 候補の選考ステータス（1候補=1行、artist列をキーに上書き）。
// 2026-09-23: 候補パイプライン化の一環で「Candidates」タブへの自動追記（addCandidates）を廃止し、
// こちらに一本化した。候補一覧そのものの正本はscouting-report/candidates/（ローカル）。
function getCandidateStatusSheet_() {
  const ss = ss_();
  let sheet = ss.getSheetByName(CANDIDATE_STATUS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CANDIDATE_STATUS_SHEET);
    sheet.appendRow(['timestamp', 'name', 'artist', 'status', 'note']);
  }
  return sheet;
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const expected = getPassphrase_();
  if (!expected || p.passphrase !== expected) {
    return jsonOutput_({ error: 'invalid passphrase' });
  }

  if (p.action === 'setCandidateStatus') {
    if (!p.artist || !p.status) return jsonOutput_({ error: 'artist and status are required' });
    if (VALID_STATUSES.indexOf(p.status) === -1) return jsonOutput_({ error: 'invalid status' });
    const statusSheet = getCandidateStatusSheet_();
    const statusRows = statusSheet.getDataRange().getValues().slice(1);
    const rowIndex = statusRows.findIndex((r) => r[2] === p.artist);
    const row = [new Date().toISOString(), p.name || '', p.artist, p.status, p.note || ''];
    if (rowIndex >= 0) {
      statusSheet.getRange(rowIndex + 2, 1, 1, row.length).setValues([row]); // +1ヘッダー +1 1-indexed
    } else {
      statusSheet.appendRow(row);
    }
    return jsonOutput_({ ok: true });
  }

  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues().slice(1);

  if (p.action === 'toggleFavorite') {
    if (!p.name || !p.artist) return jsonOutput_({ error: 'name and artist are required' });
    const existingRowIndex = rows.findIndex(
      (r) => r[1] === p.name && r[2] === p.artist && r[3] === 'fav');
    if (existingRowIndex >= 0) {
      sheet.deleteRow(existingRowIndex + 2); // +1 ヘッダー行 +1 1-indexed
    } else {
      sheet.appendRow([new Date().toISOString(), p.name, p.artist, 'fav', '']);
    }
    return jsonOutput_({ ok: true });
  }

  if (p.action === 'addComment') {
    if (!p.name || !p.artist || !p.text) {
      return jsonOutput_({ error: 'name, artist and text are required' });
    }
    sheet.appendRow([new Date().toISOString(), p.name, p.artist, 'comment', p.text]);
    return jsonOutput_({ ok: true });
  }

  // 更新リクエスト: Favoritesシートに type=request で記録する。
  // 通知はMac側の定期タスクがこのlistをポーリングして行う（GASからメール送信すると
  // spreadsheets.currentonly権限と競合してWebアプリ全体が壊れるため、メールは使わない）。
  if (p.action === 'requestUpdate') {
    if (!p.artist) return jsonOutput_({ error: 'artist is required' });
    sheet.appendRow([new Date().toISOString(), p.name || '', p.artist, 'request', p.text || '']);
    return jsonOutput_({ ok: true });
  }

  const favorites = rows.filter((r) => r[3] === 'fav')
    .map((r) => ({ timestamp: r[0], name: r[1], artist: r[2] }));
  const comments = rows.filter((r) => r[3] === 'comment')
    .map((r) => ({ timestamp: r[0], name: r[1], artist: r[2], text: r[4] }));
  const requests = rows.filter((r) => r[3] === 'request')
    .map((r) => ({ timestamp: r[0], name: r[1], artist: r[2], text: r[4] }));

  const statusRows = getCandidateStatusSheet_().getDataRange().getValues().slice(1);
  const candidateStatuses = {};
  statusRows.forEach((r) => {
    candidateStatuses[r[2]] = { timestamp: r[0], name: r[1], status: r[3], note: r[4] };
  });

  return jsonOutput_({ favorites, comments, requests, candidateStatuses });
}
