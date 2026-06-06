import { describe, it, expect } from "vitest";
import { matchReportedDoc } from "./reported-docs.js";

const list = [
  { id: 1, docNumber: "AF0002266", type: "robado" },
  { id: 2, docNumber: "X-999", type: "perdido" },
];

describe("matchReportedDoc", () => {
  it("coincide ignorando guiones/espacios y mayúsculas", () => {
    expect(matchReportedDoc("af 000 2266", list).map((r) => r.id)).toEqual([1]);
    expect(matchReportedDoc("X999", list).map((r) => r.id)).toEqual([2]);
  });
  it("sin coincidencia devuelve vacío", () => {
    expect(matchReportedDoc("Z123", list)).toEqual([]);
  });
  it("documento vacío o lista vacía devuelve vacío", () => {
    expect(matchReportedDoc("", list)).toEqual([]);
    expect(matchReportedDoc("AF0002266", [])).toEqual([]);
  });
});
