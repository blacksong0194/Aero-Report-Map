import { describe, it, expect } from "vitest";
import { buildNotifications } from "./notifications.js";

const incidents = [
  { id: 1, reportName: "Crítica abierta", severity: "Crítica", status: "En Proceso", date: "2026-06-04", persons: [] },
  { id: 2, reportName: "Alta resuelta", severity: "Alta", status: "Resuelto", persons: [] },
  { id: 3, reportName: "Escalada", severity: "Media", status: "Escalado", persons: [] },
  { id: 4, reportName: "Con vigilado", severity: "Baja", status: "Resuelto", persons: [{ fullName: "JUAN GARCIA", documentNumber: "AF0002266" }] },
];
const watchlist = [{ id: 9, docNumber: "AF0002266", name: "", reason: "Interés", severity: "Crítica" }];

describe("buildNotifications", () => {
  const n = buildNotifications(incidents, watchlist);
  it("genera notificación de vigilancia, crítica sin resolver y escalada", () => {
    const kinds = n.map((x) => x.kind);
    expect(kinds).toContain("watchlist");
    expect(kinds).toContain("priority");
    expect(kinds).toContain("escalated");
  });
  it("no notifica una alta YA resuelta", () => {
    expect(n.find((x) => x.id === "sev-2")).toBeUndefined();
  });
  it("ordena la vigilancia primero", () => {
    expect(n[0].kind).toBe("watchlist");
  });
  it("cada notificación apunta a su novedad", () => {
    expect(n.every((x) => x.incidentId != null)).toBe(true);
  });
});
