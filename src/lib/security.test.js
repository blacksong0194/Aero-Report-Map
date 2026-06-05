import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, isHashed } from "./security.js";

describe("hashPassword / verifyPassword", () => {
  it("genera un hash con formato pbkdf2", async () => {
    const h = await hashPassword("secreto123");
    expect(isHashed(h)).toBe(true);
    expect(h.split("$")).toHaveLength(4);
  });
  it("verifica la contraseña correcta", async () => {
    const h = await hashPassword("secreto123");
    expect(await verifyPassword("secreto123", h)).toBe(true);
  });
  it("rechaza la contraseña incorrecta", async () => {
    const h = await hashPassword("secreto123");
    expect(await verifyPassword("otra", h)).toBe(false);
  });
  it("usa sal distinta cada vez", async () => {
    const a = await hashPassword("igual");
    const b = await hashPassword("igual");
    expect(a).not.toBe(b);
  });
  it("verifica como falso un hash inválido", async () => {
    expect(await verifyPassword("x", "no-es-hash")).toBe(false);
  });
});
