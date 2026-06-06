// Parseo de filas (de Excel/CSV) a entradas de documentos reportados.
// Lógica pura: recibe filas como objetos {columna: valor} y devuelve entradas limpias.
import { normalizeDoc } from "./person-match.js";
import { REPORTED_TYPES } from "./reported-docs.js";

const norm = (s) =>
  (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Mapea un valor de tipo (en varios idiomas/sinónimos) a uno de REPORTED_TYPES.
function mapType(raw) {
  const t = norm(raw);
  if (REPORTED_TYPES.includes(t)) return t;
  if (t.includes("rob") || t.includes("stol")) return "robado";
  if (t.includes("perd") || t.includes("lost")) return "perdido";
  if (t.includes("inval") || t.includes("revok") || t.includes("cancel")) return "invalidado";
  if (t.includes("alter") || t.includes("fake") || t.includes("forg") || t.includes("falsif")) return "alterado";
  return "robado";
}

// rows: array de objetos (claves = encabezados). existing: lista actual (para evitar duplicados).
// Devuelve { entries, duplicates, invalid }.
export function parseReportedRows(rows, existing = []) {
  const seen = new Set((existing || []).map((r) => normalizeDoc(r.docNumber)));
  const entries = [];
  let duplicates = 0, invalid = 0;
  for (const row of rows || []) {
    if (!row || typeof row !== "object") { invalid++; continue; }
    const keys = Object.keys(row);
    const find = (...names) => {
      for (const k of keys) { if (names.includes(norm(k))) return row[k]; }
      return "";
    };
    const doc = (find("documento", "document", "doc", "numero", "número", "numero de documento", "pasaporte", "passport", "nro", "no") || "").toString().trim();
    if (!doc) { invalid++; continue; }
    const nd = normalizeDoc(doc);
    if (!nd) { invalid++; continue; }
    if (seen.has(nd)) { duplicates++; continue; }
    seen.add(nd);
    entries.push({
      docNumber: doc.toUpperCase(),
      type: mapType(find("tipo", "type", "estado", "status")),
      name: (find("titular", "nombre", "name", "holder") || "").toString().trim(),
      reason: (find("motivo", "reason", "referencia", "reference", "nota", "notes", "observacion", "observación") || "").toString().trim(),
    });
  }
  return { entries, duplicates, invalid };
}
