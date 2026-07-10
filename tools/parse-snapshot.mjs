export function parseSnapshot(mdText, fileName = '') {
  const dateMatch = (fileName + '\n' + mdText).match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : null;
  const performers = [];
  for (const line of mdText.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 8) continue;
    if (cells[0] === '名前' || /^:?-+:?$/.test(cells[0])) continue;
    const [name, size, base, skills, instagram, youtube, contact, note] = cells;
    if (!name) continue;
    performers.push({ name, size, base, skills, instagram, youtube, contact, note });
  }
  return { date, performers };
}
