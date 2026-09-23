# Scouting Report Webapp

パフォーマー・スカウティング名簿のチーム共有ビューア。
データは合言葉で暗号化された site/data/data.enc のみを含む（生データ非収録）。

## ☆お気に入り・コメント・候補ステータス（閲覧専用）

名簿の詳細ビュー・候補カードに☆お気に入り・コメント・候補の選考ステータスが表示される。
**2026-09-24よりGoogle Apps Script/Google Sheetsは不使用。** 実体は `../scouting-report/`
直下の `favorites.csv`・`comments.csv`・`candidate-status.csv`（週次ビルド時に暗号化して
data.encへ同梱）。アプリからの書き込み（ボタン操作）はできない。更新は本人がCSVを直接編集するか、
チャットでAIに伝えて反映してもらう（列の形式は `../scouting-report/PROJECT_NOTES.md` セクションC参照）。

## 更新手順（週次）
1. `node tools/promote-candidates.mjs YYYY-MM-DD` で ../scouting-report/archive/ に週次スナップショットを生成
2. ../scouting-report/candidates/ に候補mdを保存（既存の定期タスク）
3. `npm run build`（合言葉は .secret から読まれる。CSV3種も同時にdata.encへ同梱）
4. `git add site/data/data.enc && git commit -m "data: YYYY-MM-DD" && git push`
5. GitHub Actions が自動で Pages に反映

## 開発
- `npm test` … パーサー・暗号のテスト
