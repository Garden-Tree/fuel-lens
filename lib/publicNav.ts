// 公開ページ共通の「関連ページ」ナビのデータ。リンクを追加するときはここだけ直す。
export const PUBLIC_TOOL_LINKS = [
  { href: "/calc", label: "燃費計算" },
  { href: "/gas-cost", label: "ガソリン代計算" },
  { href: "/warikan", label: "ガソリン代の割り勘" },
  { href: "/route-gas-cost", label: "区間別のガソリン代" },
  { href: "/annual-gas-cost", label: "年間ガソリン代" },
  { href: "/fuel-convert", label: "燃費の単位換算" },
  { href: "/expense", label: "経費のガソリン代記録" },
  { href: "/fuelio", label: "Fuelio からの乗り換え" },
] as const;

/**
 * 燃費を記録し続けたい人向けのガイド（/fuel-log・/fuel-log-excel）。
 * PUBLIC_TOOL_LINKS とは分け、/calc と区間ページ（/route-gas-cost/[slug]）のナビには載せない
 * （検索結果の判定中のページのリンク構成を変えないため）。ガイド 2 枚・/expense・/fuelio・ランディングのフッターに載せる。
 */
export const FUEL_LOG_GUIDE_LINKS = [
  { href: "/fuel-log", label: "燃費記録のつけ方" },
  { href: "/fuel-log-excel", label: "燃費管理をエクセルで" },
] as const;

export function otherToolLinks(currentPath: string) {
  return PUBLIC_TOOL_LINKS.filter((l) => l.href !== currentPath);
}

export function otherGuideLinks(currentPath: string) {
  return FUEL_LOG_GUIDE_LINKS.filter((l) => l.href !== currentPath);
}
