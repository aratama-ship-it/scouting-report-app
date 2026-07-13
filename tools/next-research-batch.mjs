// roster-research.json にまだ記録の無い（未着手の）アーティストを、名簿の並び順のまま
// 先頭からN人分だけ抽出する。週次/日次の自動調査タスクが「次に何を調べるか」を
// 決定的に判断するための補助スクリプト（目視でのつき合わせミスを避ける）。
//
// roster-research.json / roster-intros.html は ../scouting-report/（非公開フォルダ）に置く。
// 実在の演者に関する調査結果をGitHub連携済みの本リポジトリに絶対にコミットしないこと。
//
// 使い方: node tools/next-research-batch.mjs <snapshot.md> [N=15]
import { readFileSync, existsSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from './parse-snapshot.mjs';
import { researchKey, isPlaceholder } from './roster-research-key.mjs';

const mdPath = process.argv[2];
const n = Number(process.argv[3] || 15);
if (!mdPath) {
  console.error('usage: node tools/next-research-batch.mjs <snapshot.md> [N]');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const privateDir = join(root, '..', 'scouting-report');
const md = readFileSync(mdPath, 'utf8');
const { performers: allPerformers } = parseSnapshot(md, basename(mdPath));
const performers = allPerformers.filter((p) => !isPlaceholder(p.name));

const researchPath = join(privateDir, 'roster-research.json');
const research = existsSync(researchPath) ? JSON.parse(readFileSync(researchPath, 'utf8')) : {};

// research[key]が存在すれば(fact付きでもno_info_foundでも)「着手済み」として扱う
const pending = performers.filter((p) => research[researchKey(p)] === undefined);
const attemptedCount = performers.length - pending.length;
const batch = pending.slice(0, n);

console.log(JSON.stringify({
  total: performers.length,
  attempted: attemptedCount,
  pending: pending.length,
  remainingAfterThisBatch: pending.length - batch.length,
  batch: batch.map((p) => ({
    key: researchKey(p), name: p.name, base: p.base, size: p.size,
    skills: p.skills, instagram: p.instagram, youtube: p.youtube,
    contact: p.contact, note: p.note,
  })),
}, null, 2));
