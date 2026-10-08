import { describe, expect, it } from "vitest";
import {
  STATION_BRANDS,
  detectBrand,
  detectStationBrand,
  normalizeStationName,
  stationKey,
} from "@/lib/stations";

describe("normalizeStationName", () => {
  it.each([
    ["ＥＮＥＯＳ　セルフつつじヶ丘店", "ENEOS セルフつつじヶ丘店"],
    ["  ENEOS   セルフ  つつじヶ丘  ", "ENEOS セルフ つつじヶ丘"],
    ["ｺｽﾓ石油 ｾﾙﾌ中央", "コスモ石油 セルフ中央"],
    ["（株）宇佐美鉱油 新宿店", "宇佐美鉱油 新宿店"],
    ["㈱宇佐美鉱油 新宿店", "宇佐美鉱油 新宿店"],
    ["株式会社ENEOSフロンティア 府中SS", "ENEOSフロンティア 府中SS"],
    ["ENEOSフロンティア株式会社 府中SS", "ENEOSフロンティア 府中SS"],
    ["有限会社 山田石油 本店", "山田石油 本店"],
    ["山田石油(有) 本店", "山田石油 本店"],
    ["店名：出光 セルフ高尾", "出光 セルフ高尾"],
    ["・ENEOS 調布店 -", "ENEOS 調布店"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeStationName(raw)).toBe(expected);
  });

  it("keeps a trailing 店 / SS as part of the name", () => {
    expect(normalizeStationName("ENEOS 調布店")).toBe("ENEOS 調布店");
    expect(normalizeStationName("出光 高尾SS")).toBe("出光 高尾SS");
  });

  it("returns an empty string for empty / non-string input or a corporate suffix only", () => {
    expect(normalizeStationName("")).toBe("");
    expect(normalizeStationName("   ")).toBe("");
    expect(normalizeStationName("（株）")).toBe("");
    expect(normalizeStationName(null)).toBe("");
    expect(normalizeStationName(undefined)).toBe("");
    expect(normalizeStationName(123)).toBe("");
  });
});

describe("detectBrand", () => {
  it.each<[string, string | null]>([
    // ENEOS（全角・半角・カナ・小文字）
    ["ENEOS セルフつつじヶ丘", "ENEOS"],
    ["ＥＮＥＯＳ　セルフつつじヶ丘店", "ENEOS"],
    ["eneos 調布", "ENEOS"],
    ["エネオス 調布", "ENEOS"],
    ["ｴﾈｵｽ 調布", "ENEOS"],
    ["Dr.Drive ENEOS 府中", "ENEOS"],
    ["Dr.Drive 府中", "ENEOS"],
    ["ドクタードライブ 府中", "ENEOS"],
    ["エネオスセルフ 調布", "ENEOS"],
    // 出光・apollostation・昭和シェル
    ["apollostation 八王子", "出光"],
    ["アポロステーション 八王子", "出光"],
    ["出光 セルフ高尾", "出光"],
    ["IDEMITSU 高尾", "出光"],
    ["昭和シェル石油 立川", "出光"],
    ["Shell 立川", "出光"],
    // その他のブランド
    ["コスモ石油 セルフ中央", "コスモ石油"],
    ["セルフコスモ 中央", "コスモ石油"],
    ["COSMO 中央", "コスモ石油"],
    ["キグナス 町田", "キグナス"],
    ["KYGNUS 町田", "キグナス"],
    ["SOLATO 松山", "SOLATO"],
    ["太陽石油 松山", "SOLATO"],
    ["JA-SS 相模原", "JA-SS"],
    ["ＪＡ－ＳＳ 相模原", "JA-SS"],
    ["JA−SS 相模原", "JA-SS"],
    ["JAーSS 相模原", "JA-SS"],
    ["JAｰSS 相模原", "JA-SS"],
    ["JAセルフ 相模原", "JA-SS"],
    ["宇佐美 東名高速", "宇佐美"],
    ["USAMI 東名", "宇佐美"],
    ["コストコ 多摩境", "コストコ"],
    ["COSTCO 多摩境", "コストコ"],
    ["伊藤忠エネクス 横浜", "伊藤忠エネクス"],
    ["三菱商事エネルギー 川崎", "三菱商事エネルギー"],
    // 旧ブランド
    ["ESSO 世田谷", "ESSO・Mobil・ゼネラル"],
    ["エッソ 世田谷", "ESSO・Mobil・ゼネラル"],
    ["Mobil 世田谷", "ESSO・Mobil・ゼネラル"],
    ["モービル 世田谷", "ESSO・Mobil・ゼネラル"],
    ["東燃ゼネラル 世田谷", "ESSO・Mobil・ゼネラル"],
    ["エクソンモービル 世田谷", "ESSO・Mobil・ゼネラル"],
    // ブランドだけの名前
    ["ENEOS", "ENEOS"],
    ["ｺｽﾄｺ", "コストコ"],
    // 判定できない名前・単語の途中
    ["山田石油 本店", null],
    ["JAPAN ENERGY", null],
    ["COSMOS 調布", null],
    ["MOBILE 調布", null],
    // 漢字の部分一致（旧ブランドの "日石" "日本石油" は辞書から外した）
    ["朝日石油 本店", null],
    ["西日本石油 博多", null],
    // 一般語の "ゼネラル" / "GENERAL"
    ["ゼネラル 世田谷", null],
    ["GENERAL 世田谷", null],
    // カタカナの単語の途中
    ["コスモス薬品 調布", null],
    ["シェルター 立川", null],
    ["ミシェル 立川", null],
    ["オートモービル 世田谷", null],
    ["スーパーエッソー 世田谷", null],
    ["", null],
  ])("%s → %s", (raw, expected) => {
    expect(detectBrand(raw)).toBe(expected);
  });

  it("picks the alias nearest to the start when several brands appear", () => {
    expect(detectBrand("ENEOS 宇佐美 国道1号")).toBe("ENEOS");
    expect(detectBrand("宇佐美 ENEOS 国道1号")).toBe("宇佐美");
  });

  it("returns null for non-strings", () => {
    expect(detectBrand(null)).toBeNull();
    expect(detectBrand(undefined)).toBeNull();
    expect(detectStationBrand(42)).toBeNull();
  });

  it("STATION_BRANDS has unique ids and labels, and every brand detects its own aliases", () => {
    const ids = STATION_BRANDS.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    const labels = STATION_BRANDS.map(b => b.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const brand of STATION_BRANDS) {
      for (const alias of brand.aliases) {
        expect(detectStationBrand(`${alias} テスト店`)?.id, alias).toBe(brand.id);
      }
    }
  });
});

describe("stationKey", () => {
  it("groups spelling variants of the same station", () => {
    const key = stationKey("ENEOS セルフつつじヶ丘");
    expect(key).toBe("eneos|つつじケ丘");
    for (const variant of [
      "ＥＮＥＯＳ　セルフつつじヶ丘店",
      "エネオス セルフ つつじヶ丘",
      "eneos セルフつつじケ丘",
      "ENEOS つつじヶ丘SS",
      "(株)ENEOS セルフ・つつじヶ丘店",
      "ENEOS SELF つつじヶ丘",
    ]) {
      expect(stationKey(variant), variant).toBe(key);
    }
  });

  it("keeps different stations and different brands apart", () => {
    expect(stationKey("ENEOS 調布店")).not.toBe(stationKey("ENEOS 府中店"));
    expect(stationKey("ENEOS 調布")).not.toBe(stationKey("出光 調布"));
    expect(stationKey("出光 調布")).toBe(stationKey("apollostation 調布店"));
  });

  it("brand-only names share the brand's empty-name key", () => {
    expect(stationKey("ENEOS")).toBe("eneos|");
    expect(stationKey("ＥＮＥＯＳ")).toBe("eneos|");
    expect(stationKey("エネオス")).toBe("eneos|");
    expect(stationKey("JA-SS")).toBe("ja|");
  });

  it("does not strip parts of names that only look like aliases", () => {
    expect(stationKey("朝日石油 本店")).toBe("|朝日石油本");
    expect(stationKey("西日本石油 博多")).toBe("|西日本石油博多");
    expect(stationKey("ENEOS 西博多")).toBe("eneos|西博多");
    expect(stationKey("ENEOS 西博多")).not.toBe(stationKey("西日本石油 博多"));
    expect(stationKey("コスモス薬品 調布")).toBe("|コスモス薬品調布");
    expect(stationKey("シェルター 立川")).toBe("|シェルター立川");
    expect(stationKey("オートモービル 世田谷")).toBe("|オートモービル世田谷");
  });

  it("groups Dr.Drive and JA-SS spelling variants", () => {
    expect(stationKey("Dr.Drive 府中")).toBe("eneos|府中");
    expect(stationKey("ドクタードライブ 府中店")).toBe("eneos|府中");
    expect(stationKey("ENEOS Dr.Drive 府中")).toBe("eneos|府中");
    const key = stationKey("JA-SS 相模原");
    expect(key).toBe("ja|相模原");
    for (const variant of ["JA−SS 相模原", "JAーSS 相模原", "ＪＡ－ＳＳ 相模原店", "JA SS 相模原"]) {
      expect(stationKey(variant), variant).toBe(key);
    }
  });

  it("treats ー and U+2212 between non-kana as separators, but keeps the long vowel after kana", () => {
    expect(stationKey("ENEOSー府中")).toBe("eneos|府中");
    expect(stationKey("ENEOS−府中")).toBe("eneos|府中");
    expect(stationKey("山田石油ー本店")).toBe("|山田石油本");
    expect(stationKey("ヤマダオートー 本店")).toBe("|ヤマダオートー本");
    expect(stationKey("ターミナル 調布")).toBe("|ターミナル調布");
    expect(stationKey("らーめん石油")).toBe("|らーめん石油");
  });

  it("uses an empty brand id for unknown names", () => {
    expect(stationKey("山田石油 本店")).toBe("|山田石油本");
    expect(stationKey("ﾔﾏﾀﾞ石油")).toBe("|ヤマダ石油");
    expect(stationKey("Yamada Oil")).toBe("|yamadaoil");
  });

  it("returns null for empty input", () => {
    expect(stationKey("")).toBeNull();
    expect(stationKey("   ")).toBeNull();
    expect(stationKey("株式会社")).toBeNull();
    expect(stationKey(null)).toBeNull();
    expect(stationKey(undefined)).toBeNull();
  });

  it("is deterministic", () => {
    expect(stationKey("ENEOS セルフつつじヶ丘")).toBe(stationKey("ENEOS セルフつつじヶ丘"));
  });
});
