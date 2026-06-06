import { describe, it, expect } from "vitest";
import { parseReportedRows } from "./import-reported.js";

describe("parseReportedRows", () => {
  it("mapea encabezados en español e inglés y normaliza el tipo", () => {
    const rows = [
      { Documento: "AF0002266", Tipo: "Robado", Titular: "Juan Perez", Motivo: "Reporte 1" },
      { document: "X-123", type: "lost", name: "Ana", reason: "ref 2" },
    ];
    const { entries } = parseReportedRows(rows);
    expect(entries.length).toBe(2);
    expect(entries[0]).toMatchObject({ docNumber: "AF0002266", type: "robado", name: "Juan Perez" });
    expect(entries[1].type).toBe("perdido");
  });
  it("omite filas sin documento y cuenta inválidas", () => {
    const { entries, invalid } = parseReportedRows([{ tipo: "robado" }, { documento: "Z9" }]);
    expect(entries.length).toBe(1);
    expect(invalid).toBe(1);
  });
  it("omite duplicados contra la lista existente y dentro del archivo", () => {
    const existing = [{ docNumber: "AF0002266" }];
    const rows = [{ documento: "af 000 2266" }, { documento: "B1" }, { documento: "B1" }];
    const { entries, duplicates } = parseReportedRows(rows, existing);
    expect(entries.map((e) => e.docNumber)).toEqual(["B1"]);
    expect(duplicates).toBe(2);
  });
  it("tipo desconocido cae a 'robado'", () => {
    const { entries } = parseReportedRows([{ documento: "C1", tipo: "loquesea" }]);
    expect(entries[0].type).toBe("robado");
  });
});
