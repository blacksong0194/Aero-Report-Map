import { describe, it, expect } from "vitest";
import { buildReportNumber, todayStr } from "./format.js";

describe("buildReportNumber", () => {
  it("formatea YYMMNN con padding", () => {
    const n = buildReportNumber(3);
    expect(n).toHaveLength(6);
    expect(n.endsWith("03")).toBe(true);
  });
  it("usa dos dígitos de secuencia", () => {
    expect(buildReportNumber(12).endsWith("12")).toBe(true);
  });
});

describe("todayStr", () => {
  it("devuelve YYYY-MM-DD", () => {
    const d = new Date(2026, 5, 4); // 4 jun 2026 (mes 0-based)
    expect(todayStr(d)).toBe("2026-06-04");
  });
  it("rellena con ceros", () => {
    const d = new Date(2026, 0, 9);
    expect(todayStr(d)).toBe("2026-01-09");
  });
});
