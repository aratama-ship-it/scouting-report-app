# Scouting Report Webapp

パフォーマー・スカウティング名簿のチーム共有ビューア。
データは合言葉で暗号化された site/data/data.enc のみを含む（生データ非収録）。

## 更新手順（週次）
1. ../scouting-report/ に週次スナップショットと候補mdが保存される（既存の定期タスク）
2. `npm run build`（合言葉は .secret から読まれる）
3. `git add site/data/data.enc && git commit -m "data: YYYY-MM-DD" && git push`
4. GitHub Actions が自動で Pages に反映

## 開発
- `npm test` … パーサー・暗号のテスト
