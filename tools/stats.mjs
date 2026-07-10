export function computeStats(performers) {
  const counts = {};
  for (const x of performers) {
    const base = x.base || '(未分類)';
    counts[base] = (counts[base] || 0) + 1;
  }
  const byBase = Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1]));
  return { total: performers.length, byBase };
}
