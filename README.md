# Scouting Report Webapp

パフォーマー・スカウティング名簿のチーム共有ビューア。
データは合言葉で暗号化された site/data/data.enc のみを含む（生データ非収録）。

## お気に入り・コメント機能

名簿の詳細ビューから☆お気に入り・コメントを付けられる。データはGoogle Apps Script
経由で専用シート（Scouting reportスプレッドシート内の「Favorites」タブ）に即時反映
される。週次ビルド（data.enc）とは独立しており、`npm run build` は不要。

- 初期設定・URLの再発行: `gas/DEPLOY.md` を参照
- GASのURLは `site/favorites-config.js` の `GAS_URL` で管理（公開リポジトリに
  含まれるが、合言葉の検証はGAS側で行うため問題ない）

## 更新手順（週次）
1. ../scouting-report/ に週次スナップショットと候補mdが保存される（既存の定期タスク）
2. `npm run build`（合言葉は .secret から読まれる）
3. `git add site/data/data.enc && git commit -m "data: YYYY-MM-DD" && git push`
4. GitHub Actions が自動で Pages に反映

## 開発
- `npm test` … パーサー・暗号のテスト
