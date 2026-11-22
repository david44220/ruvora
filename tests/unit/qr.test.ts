import { describe, expect, it } from "vitest";
import { encodeQr } from "../../src/lib/qr";

describe("local ISO/IEC 18004 QR code generator", () => {
  it("encodes realistic TOTP otpauth URIs with valid finder, timing, dark module and SVG path", () => {
    const uri =
      "otpauth://totp/Ruvora%3Aoperator%40ruvora.example?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Ruvora&algorithm=SHA1&digits=6&period=30";
    const qr = encodeQr(uri);
    expect(qr.version).toBeGreaterThanOrEqual(7);
    expect(qr.version).toBeLessThanOrEqual(10);
    expect(qr.size).toBe(21 + 4 * (qr.version - 1));
    expect(qr.modules).toHaveLength(qr.size);
    expect(qr.modules.every((row) => row.length === qr.size)).toBe(true);
    expect(qr.viewBox).toBe(`0 0 ${qr.size + 8} ${qr.size + 8}`);
    expect(qr.svgPath.startsWith("M")).toBe(true);

    // Verify all three 7x7 finder pattern outer corners and 3x3 dark centers
    for (const [r0, c0] of [
      [0, 0],
      [0, qr.size - 7],
      [qr.size - 7, 0],
    ]) {
      expect(qr.modules[r0]![c0]).toBe(true);
      expect(qr.modules[r0 + 1]![c0 + 1]).toBe(false);
      expect(qr.modules[r0 + 3]![c0 + 3]).toBe(true);
    }

    // Verify timing patterns and fixed dark module (4*V + 9, 8)
    for (let i = 8; i < qr.size - 8; i++) {
      expect(qr.modules[6]![i]).toBe(i % 2 === 0);
      expect(qr.modules[i]![6]).toBe(i % 2 === 0);
    }
    expect(qr.modules[4 * qr.version + 9]![8]).toBe(true);
  });

  it("supports short Version 1 payloads and rejects payloads over Version 10 EC-M capacity", () => {
    const small = encodeQr("ruvora");
    expect(small.version).toBe(1);
    expect(small.size).toBe(21);
    expect(() => encodeQr("x".repeat(250))).toThrow();
  });
});
