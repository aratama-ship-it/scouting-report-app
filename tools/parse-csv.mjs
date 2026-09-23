// 最小限のCSV読み書き（依存パッケージなし）。RFC4180準拠:
// ダブルクォートで囲んだフィールド内のカンマ・改行・""(エスケープされた")に対応。
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { pushField(); continue; }
    if (c === '\r') continue;
    if (c === '\n') { pushRow(); continue; }
    field += c;
  }
  if (field !== '' || row.length) pushRow();
  // 完全な空行（末尾の改行等）を除外
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// 1行目をヘッダーとして、各行をオブジェクトに変換する。
export function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function formatCsvField(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function formatCsvRow(values) {
  return values.map(formatCsvField).join(',');
}

// header配列 + オブジェクト配列 からCSVテキストを生成する（末尾改行つき）。
export function formatCsvObjects(header, rows) {
  const lines = [formatCsvRow(header), ...rows.map((r) => formatCsvRow(header.map((h) => r[h] ?? '')))];
  return lines.join('\n') + '\n';
}
