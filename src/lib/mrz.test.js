import { describe, it, expect } from "vitest";
import { parseMRZRobust } from "./mrz.js";

// Texto OCR real (pasaporte dominicano, con errores típicos de OCR)
const ocrText = `REPÚBLICA DOMINICANA
GARCIA ESTRELLA
JUAN JOSE
AF0002266
PPDOMGARCIA<ESTRELLA<<JUAN<JOSE<<<<<<<<<<<<<
AF00022665D0M8203058M3603125<<<
<<<00`;

describe("parseMRZRobust", () => {
  const r = parseMRZRobust(ocrText);
  it("extrae el número de documento alfanumérico", () => {
    expect(r.documentNumber).toBe("AF0002266");
  });
  it("corrige la nacionalidad con O/0 y la mapea", () => {
    expect(r.nationality).toBe("Dominicana");
  });
  it("extrae fecha de nacimiento", () => {
    expect(r.dateOfBirth).toBe("05/03/1982");
  });
  it("extrae sexo", () => {
    expect(r.gender).toBe("Masculino");
  });
  it("extrae fecha de expiración (siglo correcto)", () => {
    expect(r.expiryDate).toBe("12/03/2036");
  });
  it("extrae nombres desde la línea 1 del MRZ", () => {
    expect(r.lastName).toBe("GARCIA ESTRELLA");
    expect(r.firstName).toBe("JUAN JOSE");
  });
  it("devuelve null si no hay MRZ", () => {
    expect(parseMRZRobust("solo texto sin mrz")).toBeNull();
  });
});
