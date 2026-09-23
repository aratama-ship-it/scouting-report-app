// 候補→名簿への昇格ロジックとスナップショットmd生成。
// 2026-09-23: Googleシートの読み取りを廃止し、前回スナップショット＋「採用」ステータスの候補で
// 次週のスナップショットを組み立てる運用に変更（PROJECT_NOTES.md セクションC参照）。
const CATEGORY_PREFIX_RE = /^(.*?)[（(]/;

// 候補カテゴリ文字列（例: "Musician（Whistling / 口笛）"）から名簿Base列相当の
// 短い区分（例: "Musician"）を取り出す。既存名簿のBase値（Physical Circus / Other /
// Musician / Dancer / Clown 等）に合わせるための変換。
export function shortCategory(category) {
  const m = CATEGORY_PREFIX_RE.exec(category || '');
  const head = (m ? m[1] : category || '').trim();
  return head || 'Other';
}

export function candidateToRow(candidate, promotedDate) {
  return {
    name: candidate.name,
    size: candidate.size || '1',
    base: shortCategory(candidate.category),
    skills: candidate.skills || '',
    instagram: '',
    youtube: '',
    contact: candidate.url || '',
    note: `候補採用(${promotedDate})`,
  };
}

// candidateWeeks: parseCandidates()の結果配列（{date, items}）。同名候補は最初に出現した週を採用。
// existingNames: 既に名簿にいる名前のSet。
// statusByName: GASのcandidateStatuses（{ [artist]: { status } }）。
export function selectPromotable(candidateWeeks, existingNames, statusByName) {
  const seen = new Set();
  const promotable = [];
  for (const week of candidateWeeks) {
    for (const c of week.items) {
      if (seen.has(c.name) || existingNames.has(c.name)) { seen.add(c.name); continue; }
      seen.add(c.name);
      const status = statusByName?.[c.name]?.status;
      if (status === '採用') promotable.push(c);
    }
  }
  return promotable;
}

export function formatSnapshotTable(performers) {
  const header = '| 名前 | Size | Base | Skills | Instagram | Youtube | Contact | Note |';
  const sep = '|---|---|---|---|---|---|---|---|';
  const rows = performers.map((p) => `| ${p.name} | ${p.size || ''} | ${p.base || ''} | ${p.skills || ''} | ${p.instagram || ''} | ${p.youtube || ''} | ${p.contact || ''} | ${p.note || ''} |`);
  return [header, sep, ...rows].join('\n');
}
