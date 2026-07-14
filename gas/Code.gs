const SHEET_NAME = 'Favorites';
const CANDIDATES_SHEET = 'Candidates';

function getPassphrase_() {
  return PropertiesService.getScriptProperties().getProperty('PASSPHRASE');
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['timestamp', 'name', 'artist', 'type', 'text']);
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

  // 更新リクエスト: Favoritesシートに type=request で記録し、管理者にメール通知する。
  if (p.action === 'requestUpdate') {
    if (!p.artist) return jsonOutput_({ error: 'artist is required' });
    sheet.appendRow([new Date().toISOString(), p.name || '', p.artist, 'request', p.text || '']);
    notifyRequest_(p.name || '(no name)', p.artist, p.text || '');
    return jsonOutput_({ ok: true });
  }

  const favorites = rows.filter((r) => r[3] === 'fav')
    .map((r) => ({ timestamp: r[0], name: r[1], artist: r[2] }));
  const comments = rows.filter((r) => r[3] === 'comment')
    .map((r) => ({ timestamp: r[0], name: r[1], artist: r[2], text: r[4] }));
  const requests = rows.filter((r) => r[3] === 'request')
    .map((r) => ({ timestamp: r[0], name: r[1], artist: r[2], text: r[4] }));
  return jsonOutput_({ favorites, comments, requests });
}

// 更新リクエストを管理者にメール通知。宛先はスクリプトプロパティ NOTIFY_EMAIL、
// 無ければこのスクリプトの実行者(=オーナー)のアドレス。メール失敗でも記録は成功させる。
function notifyRequest_(name, artist, text) {
  try {
    var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL')
      || Session.getEffectiveUser().getEmail();
    if (!to) return;
    MailApp.sendEmail({
      to: to,
      subject: '[Scouting] 更新リクエスト: ' + artist,
      body: name + ' さんが「' + artist + '」の更新・詳細をリクエストしました。\n\n'
        + 'メモ: ' + (text || '(なし)') + '\n\n'
        + '記録先: スプレッドシートの Favorites タブ (type=request)\n'
        + 'アプリ: https://aratama-ship-it.github.io/scouting-report-app/',
    });
  } catch (err) {
    // 通知失敗はリクエスト記録の成否に影響させない
  }
}

// 週次スカウティング候補の自動追記。本名簿には触れず「Candidates」タブに積む。
// 承認した候補をユーザーが手で本名簿へ移す運用。
function getCandidatesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CANDIDATES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CANDIDATES_SHEET);
    sheet.appendRow(['added_date', 'name', 'category', 'size', 'skills', 'url', 'reason', 'status']);
  }
  return sheet;
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput_({ error: 'invalid JSON body' });
  }
  const expected = getPassphrase_();
  if (!expected || body.passphrase !== expected) {
    return jsonOutput_({ error: 'invalid passphrase' });
  }

  if (body.action === 'addCandidates') {
    if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
      return jsonOutput_({ error: 'candidates array is required' });
    }
    const sheet = getCandidatesSheet_();
    const existing = new Set(
      sheet.getDataRange().getValues().slice(1).map((r) => String(r[1]).trim()));
    const date = body.date || new Date().toISOString().slice(0, 10);
    let added = 0;
    const skipped = [];
    for (const c of body.candidates) {
      const name = String(c.name || '').trim();
      if (!name) continue;
      if (existing.has(name)) {
        skipped.push(name);
        continue;
      }
      sheet.appendRow([date, name, c.category || '', c.size || '',
        c.skills || '', c.url || '', c.reason || '', c.status || '']);
      existing.add(name);
      added++;
    }
    return jsonOutput_({ ok: true, added, skipped });
  }

  return jsonOutput_({ error: 'unknown action' });
}
