// Registro local de documentos reportados (robados / perdidos / invalidados),
// inspirado en el concepto SLTD de INTERPOL. Lógica pura, sin dependencias de React.
import { normalizeDoc } from "./person-match.js";

export const REPORTED_TYPES = ["robado", "perdido", "invalidado", "alterado"];

// Devuelve las entradas del registro cuyo número de documento coincide (normalizado).
export function matchReportedDoc(docNumber, reportedDocs) {
  const d = normalizeDoc(docNumber);
  if (!d || !reportedDocs || !reportedDocs.length) return [];
  return reportedDocs.filter((r) => normalizeDoc(r.docNumber) === d);
}
