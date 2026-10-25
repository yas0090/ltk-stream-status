import { describe, expect, it } from "vitest";
import { isLtk } from "../../src/shared/ltk";

describe("isLtk（AC-12, AC-13）", () => {
  it("キーワードを含むタイトルは true", () => {
    expect(isLtk("【LTK】スクリム", ["LTK"])).toBe(true);
  });

  it("大文字・小文字の違いを無視する", () => {
    expect(isLtk("ltk練習", ["LTK"])).toBe(true);
    expect(isLtk("Ltk本番", ["LTK"])).toBe(true);
    expect(isLtk("LTK本番", ["ltk"])).toBe(true);
  });

  it("全角・半角の違いを無視する", () => {
    expect(isLtk("ＬＴＫ本番", ["LTK"])).toBe(true);
    expect(isLtk("ｌｔｋ本番", ["LTK"])).toBe(true);
    expect(isLtk("LTK本番", ["ＬＴＫ"])).toBe(true);
    expect(isLtk("ｴﾙﾃｨｰｹｰ杯", ["エルティーケー"])).toBe(true);
    expect(isLtk("League　The K4sen", ["League The K4sen"])).toBe(true);
  });

  it("キーワードが複数あれば、どれか1つを含めば true", () => {
    expect(isLtk("k4sen杯 練習", ["LTK", "k4sen杯"])).toBe(true);
  });

  it("どのキーワードも含まないタイトルは false", () => {
    expect(isLtk("ソロランク", ["LTK", "k4sen杯"])).toBe(false);
    expect(isLtk("", ["LTK"])).toBe(false);
  });
});
