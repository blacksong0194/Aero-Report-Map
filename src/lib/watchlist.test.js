import { describe, it, expect } from "vitest";
import { matchWatchlist } from "./watchlist.js";

const wl = [
  { id: 1, docNumber: "N19675651", name: "", severity: "Alta" },
  { id: 2, docNumber: "", name: "Juan Tec", severity: "Crítica" },
];

describe("matchWatchlist", () => {
  it("coincide por documento ignorando espacios y mayúsculas", () => {
    const hits = matchWatchlist({ documentNumber: "n19675651" }, wl);
    expect(hits.map((h) => h.id)).toEqual([1]);
  });
  it("coincide por nombre contenido", () => {
    const hits = matchWatchlist({ fullName: "JUAN JOEL TEC KUMUL" }, wl);
    expect(hits.map((h) => h.id)).toContain(2);
  });
  it("sin coincidencias devuelve vacío", () => {
    expect(matchWatchlist({ documentNumber: "X000" }, wl)).toEqual([]);
  });
  it("watchlist vacía devuelve vacío", () => {
    expect(matchWatchlist({ documentNumber: "N19675651" }, [])).toEqual([]);
  });
});
