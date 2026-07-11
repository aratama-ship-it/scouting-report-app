function splitSkillWords(skills) {
  return [...new Set(
    skills.split(/[/,、・]/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 3))];
}

function wordsOverlap(a, b) {
  return a.includes(b) || b.includes(a);
}

export function findRelated(target, allPerformers, { maxResults = 6 } = {}) {
  const targetWords = splitSkillWords(target.skills);
  if (targetWords.length === 0) return [];

  const scored = [];
  for (const p of allPerformers) {
    if (p === target) continue;
    const candidateWords = splitSkillWords(p.skills);
    const commonWords = targetWords.filter(
      (tw) => candidateWords.some((cw) => wordsOverlap(tw, cw)));
    if (commonWords.length > 0) scored.push({ performer: p, commonWords });
  }
  scored.sort((a, b) => b.commonWords.length - a.commonWords.length);
  return scored.slice(0, maxResults);
}
