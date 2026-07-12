const SHEET_NAME = 'Favorites';

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

  const favorites = rows.filter((r) => r[3] === 'fav')
    .map((r) => ({ timestamp: r[0], name: r[1], artist: r[2] }));
  const comments = rows.filter((r) => r[3] === 'comment')
    .map((r) => ({ timestamp: r[0], name: r[1], artist: r[2], text: r[4] }));
  return jsonOutput_({ favorites, comments });
}
