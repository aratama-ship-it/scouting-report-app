#!/usr/bin/env node
// 前回スナップショット＋候補ステータス「採用」から、今週のスナップショットmdを生成する。
// 2026-09-24設計: 候補ステータスは scouting-report/candidate-status.csv がローカル正本
// （Google Sheets/GASは廃止。本人がExcel/Numbers等で直接編集、またはAIが週次実行時に反映）。
// 使い方: node tools/promote-candidates.mjs YYYY-MM-DD
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from './parse-snapshot.mjs';
import { parseCandidates } from './parse-candidates.mjs';
import { parseCsvObjects } from './parse-csv.mjs';
import { selectPromotable, candidateToRow, formatSnapshotTable } from './write-snapshot.mjs';

const today = process.argv[2];
if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  console.error('usage: node tools/promote-candidates.mjs YYYY-MM-DD');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = process.env.SCOUT_SOURCE || join(root, '..', 'scouting-report');
const archiveDir = join(SOURCE, 'archive');
const candidatesDir = join(SOURCE, 'candidates');

const archiveFiles = readdirSync(archiveDir).filter((f) => f.endsWith('.md')).sort();
if (archiveFiles.length === 0) {
  console.error(`スナップショットが1件もありません（${archiveDir}）。初回は手動でarchiveを作成してください。`);
  process.exit(1);
}
const latestFile = archiveFiles.at(-1);
const latest = parseSnapshot(readFileSync(join(archiveDir, latestFile), 'utf8'), latestFile);
const latestPerformers = latest.performers.filter((p) => p.name !== '(未入力)');

const candidateWeeks = existsSync(candidatesDir)
  ? readdirSync(candidatesDir).filter((f) => f.endsWith('.md')).sort()
      .map((f) => parseCandidates(readFileSync(join(candidatesDir, f), 'utf8'), f))
  : [];

const statusCsvPath = join(SOURCE, 'candidate-status.csv');
const statusByName = {};
if (existsSync(statusCsvPath)) {
  parseCsvObjects(readFileSync(statusCsvPath, 'utf8')).forEach((r) => {
    if (r.artist && r.status) statusByName[r.artist] = { status: r.status };
  });
}
const statusNote = `${statusCsvPath} から${Object.keys(statusByName).length}件`;

const existingNames = new Set(latestPerformers.map((p) => p.name));
const promotable = selectPromotable(candidateWeeks, existingNames, statusByName);
const newPerformers = [...latestPerformers, ...promotable.map((c) => candidateToRow(c, today))];

const outPath = join(archiveDir, `snapshot_${today}.md`);
if (existsSync(outPath)) {
  console.error(`${outPath} は既に存在します。上書きしません（手作業で確認してください）。`);
  process.exit(1);
}

const header = `# スカウティング名簿 スナップショット ${today}

前回スナップショット（${latest.date}）を引き継ぎ、候補ステータスが「採用」になった演者を追加した。
2026-09-23よりGoogleシートの読み取りを廃止し、ローカル(archive/candidates)＋アプリを正本とする運用に変更
（詳細は PROJECT_NOTES.md セクションC）。候補ステータス取得: ${statusNote}

列: 名前 / Size / Base / Skills / Instagram / Youtube / Contact / Note
`;

const trailer = promotable.length
  ? `\n## 今回の昇格（候補 → 名簿）\n${promotable.map((c) => `- ${c.name}（${c.category}）`).join('\n')}\n`
  : '\n今回の昇格: なし\n';

writeFileSync(outPath, `${header}\n${formatSnapshotTable(newPerformers)}\n${trailer}`);
console.log(`OK: ${outPath} を作成（名簿${newPerformers.length}名／昇格${promotable.length}件／候補ステータス取得: ${statusNote}）`);
if (promotable.length) console.log('昇格:', promotable.map((c) => c.name).join('、'));
