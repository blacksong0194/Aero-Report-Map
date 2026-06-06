import { describe, it, expect } from "vitest";
import { parseMRZRobust, mrzCheckDigit, documentExpiryStatus } from "./mrz.js";

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
  it("valida los dígitos de control del MRZ real", () => {
    expect(r.mrzValid).toBe(true);
    expect(r.checks).toEqual({ doc: true, dob: true, expiry: true });
  });
});

describe("mrzCheckDigit (ICAO 7-3-1)", () => {
  it("calcula el dígito del número de documento", () => {
    expect(mrzCheckDigit("AF0002266")).toBe(5);
  });
  it("calcula el dígito de la fecha", () => {
    expect(mrzCheckDigit("820305")).toBe(8);
  });
});

describe("documentExpiryStatus", () => {
  const ref = new Date(2026, 5, 5);
  it("documento vigente", () => {
    expect(documentExpiryStatus("12/03/2036", ref).status).toBe("vigente");
  });
  it("documento vencido", () => {
    expect(documentExpiryStatus("01/01/2020", ref).status).toBe("vencido");
  });
  it("documento por vencer (≤180 días)", () => {
    expect(documentExpiryStatus("01/08/2026", ref).status).toBe("por_vencer");
  });
  it("fecha inválida devuelve null", () => {
    expect(documentExpiryStatus("basura", ref)).toBeNull();
  });
});
