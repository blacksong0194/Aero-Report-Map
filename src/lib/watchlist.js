// Coincidencia con la lista de vigilancia (lógica pura).
// Devuelve las entradas de watchlist que coinciden con el resultado del scanner,
// por número de documento (exacto, normalizado) o por nombre (contiene).

const norm = (s) => (s || "").toString().toUpperCase().replace(/\s+/g, "");

export function matchWatchlist(result, watchlist) {
  if (!result || !watchlist || !watchlist.length) return [];
  const doc = norm(result.documentNumber);
  const name = (result.fullName || ((result.firstName || "") + " " + (result.lastName || "")))
    .toLowerCase()
    .trim();
  return watchlist.filter((w) => {
    const docHit = w.docNumber && doc && norm(w.docNumber) === doc;
    const wn = (w.name || "").toLowerCase().trim();
    // Coincidencia por tokens: todas las palabras del nombre vigilado deben
    // aparecer en el nombre escaneado (tolera segundos nombres y orden distinto).
    const nameHit = wn && name && wn.split(/\s+/).every((tok) => name.includes(tok));
    return docHit || nameHit;
  });
}
