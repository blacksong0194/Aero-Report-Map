import { describe, it, expect } from "vitest";
import { euclideanDistance, bestFaceMatches, matchConfidence } from "./face-match.js";

describe("euclideanDistance", () => {
  it("vectores idénticos = 0", () => {
    expect(euclideanDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });
  it("calcula la distancia", () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBe(5);
  });
  it("longitudes distintas = Infinity", () => {
    expect(euclideanDistance([1, 2], [1])).toBe(Infinity);
  });
});

describe("bestFaceMatches", () => {
  const target = [0, 0, 0];
  const candidates = [
    { name: "A", descriptor: [0.1, 0.1, 0.1] }, // cerca
    { name: "B", descriptor: [5, 5, 5] },        // lejos
    { name: "C", descriptor: [0.2, 0, 0] },      // cerca
  ];
  it("devuelve solo los que están bajo el umbral, ordenados", () => {
    const r = bestFaceMatches(target, candidates, 0.5);
    expect(r.map((x) => x.name)).toEqual(["A", "C"]);
    expect(r[0].distance).toBeLessThan(r[1].distance);
  });
  it("ignora candidatos sin descriptor", () => {
    expect(bestFaceMatches(target, [{ name: "X" }], 0.5)).toEqual([]);
  });
  it("sin descriptor objetivo devuelve vacío", () => {
    expect(bestFaceMatches(null, candidates)).toEqual([]);
  });
});

describe("matchConfidence", () => {
  it("clasifica por distancia", () => {
    expect(matchConfidence(0.3)).toBe("muy alta");
    expect(matchConfidence(0.48)).toBe("media");
    expect(matchConfidence(0.7)).toBe("baja");
  });
});
