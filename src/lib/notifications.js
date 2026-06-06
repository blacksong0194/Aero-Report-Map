// Genera las notificaciones del centro de alertas a partir de los datos existentes
// (novedades + lista de vigilancia). Lógica pura, sin dependencias de React.
import { matchWatchlist } from "./watchlist.js";
import { matchReportedDoc } from "./reported-docs.js";

const RANK = { reported: -1, watchlist: 0, "Crítica": 1, Alta: 2, escalated: 3 };

function incidentTitle(inc) {
  return inc.reportName || (inc.area + " — " + (inc.time || "")) || "Novedad";
}

export function buildNotifications(incidents, watchlist, reportedDocs) {
  const notifs = [];

  // 0. Documentos reportados (robados/perdidos/invalidados) detectados en novedades — máxima prioridad
  for (const inc of incidents || []) {
    const ppl = (inc.persons && inc.persons.length) ? inc.persons : (inc.person ? [inc.person] : []);
    for (const p of ppl) {
      const hits = matchReportedDoc(p.documentNumber, reportedDocs);
      if (hits.length) {
        notifs.push({
          id: "rd-" + inc.id + "-" + (p.documentNumber || ""),
          kind: "reported",
          rank: RANK.reported,
          severity: "Crítica",
          title: "🚫 Documento reportado: " + (p.documentNumber || ""),
          subtitle: (hits[0].type || "reportado") + " · " + incidentTitle(inc),
          incidentId: inc.id,
        });
      }
    }
  }

  // 1. Coincidencias de la lista de vigilancia detectadas en novedades (lo más urgente)
  for (const inc of incidents || []) {
    const ppl = (inc.persons && inc.persons.length) ? inc.persons : (inc.person ? [inc.person] : []);
    for (const p of ppl) {
      const hits = matchWatchlist(p, watchlist);
      if (hits.length) {
        const nm = p.fullName || ((p.firstName || "") + " " + (p.lastName || "")).trim() || p.documentNumber || "Persona";
        notifs.push({
          id: "wl-" + inc.id + "-" + (p.documentNumber || nm),
          kind: "watchlist",
          rank: RANK.watchlist,
          severity: hits[0].severity || "Alta",
          title: "⚠ Vigilancia: " + nm,
          subtitle: (hits[0].reason || "En lista de vigilancia") + " · " + incidentTitle(inc),
          incidentId: inc.id,
        });
      }
    }
  }

  // 2. Novedades de alta/crítica sin resolver, y escaladas
  for (const inc of incidents || []) {
    const unresolved = inc.status !== "Resuelto";
    if (unresolved && (inc.severity === "Crítica" || inc.severity === "Alta")) {
      notifs.push({
        id: "sev-" + inc.id,
        kind: "priority",
        rank: RANK[inc.severity] != null ? RANK[inc.severity] : 2,
        severity: inc.severity,
        title: incidentTitle(inc),
        subtitle: inc.severity + " · " + (inc.status || "") + (inc.date ? " · " + inc.date : ""),
        incidentId: inc.id,
      });
    } else if (inc.status === "Escalado") {
      notifs.push({
        id: "esc-" + inc.id,
        kind: "escalated",
        rank: RANK.escalated,
        severity: inc.severity || "",
        title: incidentTitle(inc),
        subtitle: "Escalado" + (inc.date ? " · " + inc.date : ""),
        incidentId: inc.id,
      });
    }
  }

  notifs.sort((a, b) => a.rank - b.rank);
  return notifs;
}
