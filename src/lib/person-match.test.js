import { describe, it, expect } from "vitest";
import { normalizeDoc, nameSimilarity, findRelatedCases, findDuplicates, docsLikelySame } from "./person-match.js";

describe("docsLikelySame (tolerante a OCR)", () => {
  it("trata como el mismo doc una variación de un dígito (0/8)", () => {
    expect(docsLikelySame("AF0002266", "AF8002266")).toBe(true);
  });
  it("ignora guiones y espacios", () => {
    expect(docsLikelySame("001-2345678-9", "0012345678 9")).toBe(true);
  });
  it("marca como distintos documentos claramente diferentes", () => {
    expect(docsLikelySame("AF0002266", "XY1234567")).toBe(false);
  });
  it("vacío => false", () => {
    expect(docsLikelySame("", "AF0002266")).toBe(false);
  });
});

describe("normalizeDoc", () => {
  it("normaliza guiones y espacios", () => {
    expect(normalizeDoc("001-2345678-9")).toBe("00123456789");
    expect(normalizeDoc("af 000 2266")).toBe("AF0002266");
  });
});

describe("nameSimilarity", () => {
  it("idénticos = 1", () => {
    expect(nameSimilarity("Juan Jose", "JUAN JOSE")).toBe(1);
  });
  it("subconjunto de palabras = alta", () => {
    expect(nameSimilarity("Juan Garcia", "Juan Jose Garcia Estrella")).toBeGreaterThanOrEqual(0.8);
  });
  it("tolera un error de tipeo", () => {
    expect(nameSimilarity("Juan Garcia", "Juan Garsia")).toBeGreaterThanOrEqual(0.8);
  });
  it("nombres distintos = bajo", () => {
    expect(nameSimilarity("Pedro Gomez", "Juan Garcia")).toBeLessThan(0.8);
  });
});

const incidents = [
  { id: 1, reportName: "No admitido", date: "2026-06-04", area: "Migración", status: "Resuelto", persons: [{ fullName: "JUAN JOSE GARCIA ESTRELLA", documentNumber: "AF0002266" }] },
  { id: 2, reportName: "Equipaje", date: "2026-06-03", area: "Aduanas", status: "En Proceso", persons: [{ fullName: "Maria Perez", documentNumber: "X1" }] },
];
const watchlist = [{ id: 9, docNumber: "AF0002266", name: "", reason: "Interés", severity: "Alta" }];

describe("findRelatedCases", () => {
  it("encuentra casos por documento exacto + vigilancia", () => {
    const r = findRelatedCases({ documentNumber: "AF0002266", fullName: "Juan Garcia" }, incidents, watchlist);
    expect(r.cases.map((c) => c.id)).toEqual([1]);
    expect(r.cases[0].matchType).toBe("exact");
    expect(r.watch.length).toBe(1);
  });
  it("encuentra por nombre similar aunque el documento no esté", () => {
    const r = findRelatedCases({ fullName: "Juan Garcia Estrella" }, incidents, []);
    expect(r.cases.map((c) => c.id)).toContain(1);
  });
});

describe("findDuplicates", () => {
  const known = [
    { name: "Juan Jose Garcia Estrella", docNumber: "AF0002266", source: "informe", label: "No admitido" },
    { name: "Pedro Gomez", docNumber: "Z9", source: "mapa", label: "Nodo" },
  ];
  it("documento idéntico = exacta (100%)", () => {
    const r = findDuplicates({ documentNumber: "af0002266", fullName: "Otro Nombre" }, known);
    expect(r.exact.length).toBe(1);
  });
  it("nombre parecido sin doc = similar", () => {
    const r = findDuplicates({ fullName: "Juan Garcia" }, known);
    expect(r.similar.length).toBe(1);
    expect(r.exact.length).toBe(0);
  });
});
