import { describe, expect, it } from "vitest";
import { minorMoney, ruNumber } from "../../src/lib/api";
const normalizeSpaces = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

describe("exact EUR minor-unit presentation", () => {
  it.each([
    ["0", "€0.00"],
    ["1", "€0.01"],
    ["9", "€0.09"],
    ["99", "€0.99"],
    ["100", "€1.00"],
    ["101", "€1.01"],
    ["-1", "-€0.01"],
    ["-99", "-€0.99"],
    ["-100", "-€1.00"],
    ["-101", "-€1.01"],
  ])("formats the whole-cent boundary %s", (amount, expected) => {
    expect(minorMoney(amount)).toBe(expected);
  });

  it("preserves every digit above the floating-point safe-integer range", () => {
    expect(minorMoney("900719925474099301")).toBe("€9,007,199,254,740,993.01");
    expect(minorMoney(-900719925474099301n)).toBe("-€9,007,199,254,740,993.01");
  });

  it("uses French decimal/grouping conventions without losing the sign or cents", () => {
    expect(normalizeSpaces(minorMoney("1234567", "fr"))).toBe("12 345,67 €");
    expect(minorMoney("-1", "fr")).toBe("-0,01 €");
    expect(normalizeSpaces(minorMoney("900719925474099301", "fr"))).toBe(
      "9 007 199 254 740 993,01 €",
    );
  });

  it("accepts safe integer numbers, bigint, and integer strings consistently", () => {
    expect(minorMoney(123)).toBe("€1.23");
    expect(minorMoney(123n)).toBe("€1.23");
    expect(minorMoney("123")).toBe("€1.23");
    expect(minorMoney()).toBe("€0.00");
    expect(minorMoney("-0")).toBe("€0.00");
  });
});

describe("exact Reward Unit micro-unit presentation", () => {
  it.each([
    ["0", "0"],
    ["1", "0.000001"],
    ["10", "0.00001"],
    ["100000", "0.1"],
    ["250000", "0.25"],
    ["999999", "0.999999"],
    ["1000000", "1"],
    ["1000001", "1.000001"],
    ["1234567", "1.234567"],
    ["-1", "-0.000001"],
    ["-250000", "-0.25"],
    ["-999999", "-0.999999"],
    ["-1000000", "-1"],
    ["-1000001", "-1.000001"],
  ])("formats micro-unit boundary %s", (amount, expected) => {
    expect(ruNumber(amount)).toBe(expected);
  });

  it("preserves a large whole value and its six-digit fractional tail", () => {
    expect(ruNumber("9007199254740993123456")).toBe("9,007,199,254,740,993.123456");
    expect(ruNumber("-9007199254740993123456")).toBe("-9,007,199,254,740,993.123456");
  });

  it("formats negative French corrections below one RU correctly", () => {
    expect(ruNumber("-250000", "fr")).toBe("-0,25");
    expect(normalizeSpaces(ruNumber("1234567890", "fr"))).toBe("1 234,56789");
    expect(ruNumber("-0", "fr")).toBe("0");
    expect(ruNumber()).toBe("0");
  });
});

describe("exact display input guards", () => {
  it.each([
    Number.MAX_SAFE_INTEGER + 1,
    Number.MIN_SAFE_INTEGER - 1,
    0.01,
    NaN,
    Infinity,
    -Infinity,
  ])("rejects unsafe or fractional numeric amount case %#", (value) => {
    expect(() => minorMoney(value)).toThrow(RangeError);
    expect(() => ruNumber(value)).toThrow(RangeError);
  });

  it.each(["", " 1 ", "1.25", "1e6", "not-an-amount"])(
    "rejects non-integer amount string %s",
    (value) => {
      expect(() => minorMoney(value)).toThrow(RangeError);
      expect(() => ruNumber(value)).toThrow(RangeError);
    },
  );
});
