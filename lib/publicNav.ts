// 公開ページ共通の「関連ページ」ナビのデータ。リンクを追加するときはここだけ直す。
export const PUBLIC_TOOL_LINKS = [
  { href: "/calc", label: "燃費計算" },
  { href: "/gas-cost", label: "ガソリン代計算" },
  { href: "/warikan", label: "ガソリン代の割り勘" },
  { href: "/annual-gas-cost", label: "年間ガソリン代" },
  { href: "/fuel-convert", label: "燃費の単位換算" },
  { href: "/expense", label: "経費のガソリン代記録" },
  { href: "/fuelio", label: "Fuelio からの乗り換え" },
] as const;

export function otherToolLinks(currentPath: string) {
  return PUBLIC_TOOL_LINKS.filter((l) => l.href !== currentPath);
}
