const FIELDS = ['size', 'base', 'skills', 'instagram', 'youtube', 'contact', 'note'];

export function diffSnapshots(oldPerformers, newPerformers) {
  const oldMap = new Map(oldPerformers.map((x) => [x.name, x]));
  const newMap = new Map(newPerformers.map((x) => [x.name, x]));
  const added = newPerformers.filter((x) => !oldMap.has(x.name));
  const removed = oldPerformers.filter((x) => !newMap.has(x.name));
  const changed = [];
  for (const [name, np] of newMap) {
    const op = oldMap.get(name);
    if (!op) continue;
    const fields = FIELDS
      .filter((f) => (op[f] || '') !== (np[f] || ''))
      .map((f) => ({ field: f, from: op[f] || '', to: np[f] || '' }));
    if (fields.length) changed.push({ name, fields });
  }
  return { added, removed, changed };
}
