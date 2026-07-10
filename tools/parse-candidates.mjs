const FIELD_MAP = {
  'カテゴリ': 'category',
  '人数': 'size',
  'スキル': 'skills',
  'URL': 'url',
  '推薦理由': 'reason',
  '確認状況': 'status',
};
const EMPTY = { category: '', size: '', skills: '', url: '', reason: '', status: '' };

export function parseCandidates(mdText, fileName = '') {
  const dateMatch = (fileName + '\n' + mdText).match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : null;
  const items = [];
  let current = null;
  for (const line of mdText.split('\n')) {
    const heading = line.match(/^##\s+(?:\d+\.\s*)?(.+?)\s*$/);
    if (heading) {
      current = { name: heading[1], ...EMPTY };
      items.push(current);
      continue;
    }
    if (!current) continue;
    const field = line.match(/^-\s*([^:：]+?)\s*[:：]\s*(.*)$/);
    if (field && FIELD_MAP[field[1]]) current[FIELD_MAP[field[1]]] = field[2].trim();
  }
  return { date, items };
}
