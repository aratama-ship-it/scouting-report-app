// roster-research.json のキー生成と、空プレースホルダー行の判定を共有する小さなモジュール。
// 同姓同名(例:「Ayaka」が複数)がいるため、名前だけをキーにしない。
// Instagramがあれば 'ig:{ハンドル小文字}'、無ければ 'name:{名前}::{カテゴリ}' にフォールバック。
export function researchKey(p) {
  const m = String(p.instagram || '').match(/instagram\.com\/([^/?]+)/i);
  return m ? `ig:${m[1].toLowerCase()}` : `name:${p.name}::${p.base || ''}`;
}

export function isPlaceholder(name) {
  return !name || /未入力|^\(.*\)$/.test(String(name).trim());
}
