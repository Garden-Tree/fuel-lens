/**
 * ガソリンスタンド名の正規化とブランド判定（純粋関数）。
 *
 * 統計ページの「スタンド別の単価」で、表記ゆれのある店舗名（全角・半角、会社名の有無、末尾の「店」など）を
 * 同じスタンドとしてまとめるために使う。ネットワークや外部データには依存せず、結果は入力だけで決まる。
 *
 * - normalizeStationName: 表示用の正規化（NFKC・空白の整理・会社名の除去）。末尾の「店」などの名前の一部は残す
 * - detectBrand: 小さな辞書（STATION_BRANDS）で石油元売り・主要チェーンのブランドを判定する
 * - stationKey: グルーピング用のキー（ブランド + 店舗名のゆれを吸収した文字列）
 */

/** スタンドのブランド定義 */
export type StationBrand = {
  /** キー用の識別子（英小文字） */
  id: string;
  /** 表示名 */
  label: string;
  /**
   * 別名。NFKC 正規化・大文字化してから部分一致で比較する（全角・半角カナ、全角英字の違いは吸収される）。
   * 英数字で始まる・終わる別名は、前後が英字でないときだけ一致する（"JA" が "JAPAN" に一致しないように）。
   * カタカナで始まる・終わる別名は、前後がカタカナ・長音「ー」でないときだけ一致する
   * （"コスモ" が "コスモス薬品"、"シェル" が "シェルター" "ミシェル"、"モービル" が "オートモービル" に一致しないように）。
   * ただし隣が「セルフ」のとき（"エネオスセルフ" "セルフコスモ"）は境界とみなす。
   * 漢字だけの短い別名は他の名前の一部に紛れやすいので入れない（"日石" は "朝日石油"、"日本石油" は "西日本石油" に含まれる）。
   */
  aliases: readonly string[];
  /** 現在は別ブランドに統合された旧ブランド（古い記録の判定用） */
  historic?: boolean;
};

/**
 * 判定に使うブランドの辞書。
 * 1 つの店舗名に複数の別名が含まれるときは、文字列の先頭に近いもの（同じ位置なら長い別名）を採る。
 */
export const STATION_BRANDS: readonly StationBrand[] = [
  {
    id: "eneos",
    label: "ENEOS",
    aliases: ["ENEOS", "エネオス", "JOMO", "ジョモ", "Dr.Drive", "ドクタードライブ"],
  },
  {
    id: "idemitsu",
    label: "出光",
    aliases: [
      "apollostation",
      "apollo station",
      "アポロステーション",
      "出光興産",
      "出光",
      "IDEMITSU",
      "イデミツ",
      "昭和シェル石油",
      "昭和シェル",
      "シェル",
      "SHELL",
    ],
  },
  { id: "cosmo", label: "コスモ石油", aliases: ["コスモ石油", "コスモ", "COSMO"] },
  { id: "kygnus", label: "キグナス", aliases: ["キグナス石油", "キグナス", "KYGNUS"] },
  { id: "solato", label: "SOLATO", aliases: ["SOLATO", "ソラト", "太陽石油"] },
  // "JA\u2212SS" は数学のマイナス記号（NFKC でも "-" にならない）、"JAーSS" は長音をダッシュ代わりにした表記
  { id: "ja", label: "JA-SS", aliases: ["JA-SS", "JA\u2212SS", "JAーSS", "JASS", "JA SS", "JA"] },
  { id: "usami", label: "宇佐美", aliases: ["宇佐美", "USAMI", "ウサミ"] },
  { id: "costco", label: "コストコ", aliases: ["コストコ", "COSTCO"] },
  { id: "itochu-enex", label: "伊藤忠エネクス", aliases: ["伊藤忠エネクス", "ITOCHU ENEX", "ITOCHU", "エネクス", "ENEX"] },
  { id: "mc-energy", label: "三菱商事エネルギー", aliases: ["三菱商事エネルギー", "三菱商事"] },
  {
    id: "emg",
    label: "ESSO・Mobil・ゼネラル",
    // 単独の "ゼネラル" / "GENERAL" は一般語なので入れない（"東燃ゼネラル" だけ判定する）
    aliases: ["エクソンモービル", "EXXONMOBIL", "EXXON", "エクソン", "ESSO", "エッソ", "MOBIL", "モービル", "東燃ゼネラル"],
    historic: true,
  },
];

// ---------------------------------------------------------------------------
// 正規化
// ---------------------------------------------------------------------------

/**
 * 会社の種類を表す表記。NFKC 後に除去する（"（株）" "㈱" は NFKC で "(株)" になる）。
 * 前後の空白も一緒に取り、名前の途中なら 1 つの空白に置き換える。
 */
const CORPORATE_RE = /\s*(?:\(\s*(?:株|有|合|名|資)\s*\)|株式会社|有限会社|合同会社|合資会社|合名会社)\s*/g;

/** 先頭の「店名:」のようなラベル（レシートの読み取り結果に付くことがある装飾） */
const LEADING_LABEL_RE = /^(?:店舗名|店名|SS名|給油所名)\s*[:：]\s*/i;

/** 先頭・末尾の区切り記号（名前の一部ではない装飾） */
const EDGE_PUNCT_RE = /^[\s・\-‐–—:：,，、。.]+|[\s・\-‐–—:：,，、。.]+$/g;

/**
 * 表示用に店舗名を正規化する。
 * 1. NFKC 正規化（全角英数・全角空白・半角カナを揃える）
 * 2. 先頭の「店名:」などのラベルと、会社の種類（(株) 株式会社 (有) 有限会社 など）を除く
 * 3. 連続する空白を 1 つにし、前後の空白と区切り記号を取る
 *
 * 末尾の「店」「SS」などは名前の一部として残す（グルーピングでの吸収は stationKey が行う）。
 * 文字列以外・空は "" を返す。
 */
export function normalizeStationName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let s = raw.normalize("NFKC");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(LEADING_LABEL_RE, "");
  s = s.replace(CORPORATE_RE, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(EDGE_PUNCT_RE, "");
  return s;
}

// ---------------------------------------------------------------------------
// ブランド判定
// ---------------------------------------------------------------------------

const ASCII_ALNUM_RE = /[A-Z0-9]/;
const ASCII_LETTER_RE = /[A-Z]/;
/** カタカナと長音「ー」（中黒「・」は区切りなので含めない） */
const KATAKANA_RE = /[\u30A1-\u30FA\u30FC-\u30FF\u31F0-\u31FF]/;
/** カタカナの別名の隣にあっても境界とみなす語 */
const KATAKANA_BOUNDARY_WORD = "セルフ";

/** 比較用の形（NFKC + 大文字） */
function toComparable(s: string): string {
  return s.normalize("NFKC").toUpperCase();
}

type AliasMatch = { brand: StationBrand; index: number; length: number };

/** 比較用に整形した別名（辞書の順を保つ） */
const COMPARABLE_ALIASES: ReadonlyArray<{ brand: StationBrand; alias: string }> = STATION_BRANDS.flatMap(brand =>
  brand.aliases.map(alias => ({ brand, alias: toComparable(alias) }))
);

/**
 * haystack の中で alias が出現する位置をすべて返す。
 * - 別名の先頭・末尾が英数字なら、隣の文字が英字のときは一致としない（単語の途中を拾わない）
 * - 別名の先頭・末尾がカタカナ・長音なら、隣の文字がカタカナ・長音のときは一致としない
 *   （ただし隣が「セルフ」なら一致とする）
 */
function findAlias(haystack: string, alias: string): number[] {
  const hits: number[] = [];
  if (!alias) return hits;
  const first = alias[0];
  const last = alias[alias.length - 1];
  const latinStart = ASCII_ALNUM_RE.test(first);
  const latinEnd = ASCII_ALNUM_RE.test(last);
  const kanaStart = KATAKANA_RE.test(first);
  const kanaEnd = KATAKANA_RE.test(last);
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(alias, from);
    if (i < 0) break;
    const end = i + alias.length;
    const before = i > 0 ? haystack[i - 1] : "";
    const after = haystack[end] ?? "";
    const okStart =
      (!latinStart || !ASCII_LETTER_RE.test(before)) &&
      (!kanaStart || !KATAKANA_RE.test(before) || haystack.slice(0, i).endsWith(KATAKANA_BOUNDARY_WORD));
    const okEnd =
      (!latinEnd || !ASCII_LETTER_RE.test(after)) &&
      (!kanaEnd || !KATAKANA_RE.test(after) || haystack.startsWith(KATAKANA_BOUNDARY_WORD, end));
    if (okStart && okEnd) hits.push(i);
    from = i + 1;
  }
  return hits;
}

/** 最も先頭に近い別名の一致（同じ位置なら長い別名、さらに同じなら辞書順） */
function firstBrandMatch(comparable: string): AliasMatch | null {
  let best: AliasMatch | null = null;
  for (const { brand, alias } of COMPARABLE_ALIASES) {
    const hits = findAlias(comparable, alias);
    if (hits.length === 0) continue;
    const index = hits[0];
    if (!best || index < best.index || (index === best.index && alias.length > best.length)) {
      best = { brand, index, length: alias.length };
    }
  }
  return best;
}

/** 店舗名からブランド定義を判定する。判定できなければ null */
export function detectStationBrand(raw: unknown): StationBrand | null {
  const name = normalizeStationName(raw);
  if (!name) return null;
  return firstBrandMatch(toComparable(name))?.brand ?? null;
}

/**
 * 店舗名からブランドの表示名を返す（例: "ＥＮＥＯＳ　セルフ○○店" → "ENEOS"）。判定できなければ null。
 * 辞書は STATION_BRANDS。
 */
export function detectBrand(raw: unknown): string | null {
  return detectStationBrand(raw)?.label ?? null;
}

// ---------------------------------------------------------------------------
// グルーピングキー
// ---------------------------------------------------------------------------

/** キーで無視する文字（空白・区切り記号。U+2212 MINUS SIGN は NFKC でも "-" にならないので明示する） */
const KEY_SEPARATORS_RE = /[\s・\-\u2212‐–—_/／,，、。.:：()（）「」[\]]+/g;

/**
 * ダッシュ代わりの長音「ー」（"JAーSS" "ENEOSー府中"）。かな（ひらがな・カタカナ）の直後の「ー」は長音なので残し、
 * それ以外の位置の「ー」の並びだけを区切りとして取り除く。
 */
const KEY_DASH_CHOON_RE = /(?<![\u3041-\u3096\u309D\u309E\u30A1-\u30FA\u30FC-\u30FF\u31F0-\u31FF])\u30FC+/g;

/** キーで無視する「セルフ」表記（同じ店舗でレシートによって付いたり付かなかったりする） */
const KEY_SELF_RE = /セルフ|(^|[^A-Z])SELF(?![A-Z])/g;

/** キーで無視する末尾の店舗種別（「○○店」「○○SS」「○○サービスステーション」を同じ店舗とみなす） */
const KEY_TRAILING_RE = /(?:サービスステーション|給油所|SS|店)+$/;

/**
 * 店舗名のグルーピングキー。`ブランドID|店舗名の比較用文字列` の形（ブランド不明は ID が空）。
 * 比較用文字列は、正規化した名前からブランドの別名・「セルフ」・空白と区切り記号・末尾の「店」「SS」などを除き、
 * 「ヶ」「ケ」を揃えて小文字にしたもの。例: "ENEOS セルフつつじヶ丘" と "ＥＮＥＯＳ　セルフつつじヶ丘店" は同じキー。
 * ブランドだけの名前（"ENEOS"）は `eneos|`。名前が空（会社名だけを含む）なら null。
 */
export function stationKey(raw: unknown): string | null {
  const name = normalizeStationName(raw);
  if (!name) return null;
  let s = toComparable(name);
  const brand = firstBrandMatch(s)?.brand ?? null;
  if (brand) {
    // 長い別名から順に、そのブランドの別名をすべて取り除く
    const aliases = brand.aliases.map(toComparable).sort((a, b) => b.length - a.length);
    for (const alias of aliases) {
      const hits = findAlias(s, alias);
      for (let i = hits.length - 1; i >= 0; i--) {
        s = s.slice(0, hits[i]) + " " + s.slice(hits[i] + alias.length);
      }
    }
  }
  s = s.replace(KEY_SELF_RE, (_m, prefix: string | undefined) => `${prefix ?? ""} `);
  s = s.replace(KEY_DASH_CHOON_RE, "");
  s = s.replace(KEY_SEPARATORS_RE, "");
  s = s.replace(KEY_TRAILING_RE, "");
  s = s.replace(/ヶ/g, "ケ").replace(/ヵ/g, "カ");
  s = s.toLowerCase();
  if (!brand && !s) return null;
  return `${brand?.id ?? ""}|${s}`;
}
