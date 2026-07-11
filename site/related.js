function splitSkillWords(skills) {
  return [...new Set(
    skills.split(/[/,、・]/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 3))];
}

function wordsOverlap(a, b) {
  if (a.includes(b) || b.includes(a)) return true;
  // Fuzzy match for orthographic variations: check common substring of >= 3 chars
  const minLen = Math.min(a.length, b.length);
  for (let len = minLen; len >= 3; len--) {
    for (let i = 0; i <= a.length - len; i++) {
      if (b.includes(a.substring(i, i + len))) return true;
    }
  }
  return false;
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
