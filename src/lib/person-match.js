// Coincidencia inteligente de personas (lógica pura, sin dependencias de React).
// Cruza por número de documento (exacto = 100%) y por similitud de nombre
// (sensibilidad "equilibrada": evita falsos positivos).

export function normalizeDoc(doc) {
  return (doc || "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const DIACRITICS = /[̀-ͯ]/g;
export function nameTokens(name) {
  return (name || "")
    .toString()
    .toLowerCase()
    .normalize("NFD").replace(DIACRITICS, "") // quita acentos
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// ¿Son probablemente el MISMO documento, tolerando errores de OCR (0/8, 1/I, 5/S…)?
// Iguales tras normalizar, o distancia de edición pequeña (≤2 en docs largos, ≤1 cortos).
export function docsLikelySame(a, b) {
  const na = normalizeDoc(a), nb = normalizeDoc(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const maxLen = Math.max(na.length, nb.length);
  if (Math.abs(na.length - nb.length) > 2) return false;
  const tol = maxLen >= 8 ? 2 : 1;
  return levenshtein(na, nb) <= tol;
}

// Devuelve 0..1. 1 = nombres equivalentes; 0.85 = todas las palabras del más corto
// están en el más largo (tolera segundos nombres, orden y un error de tipeo).
export function nameSimilarity(a, b) {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  if (ta.join(" ") === tb.join(" ")) return 1;
  const shorter = ta.length <= tb.length ? ta : tb;
  const longer = ta.length <= tb.length ? tb : ta;
  const tokenIn = (tok) => longer.some((o) => o === tok || (tok.length > 3 && levenshtein(tok, o) <= 1));
  const allMatch = shorter.every(tokenIn);
  if (allMatch && shorter.length >= 2) return 0.85;
  const common = shorter.filter((tok) => longer.includes(tok)).length;
  return Math.min(0.6, (common / longer.length));
}

const SIMILAR_THRESHOLD = 0.8;

function personMatch(a, b) {
  const da = normalizeDoc(a.docNumber || a.documentNumber);
  const db = normalizeDoc(b.docNumber || b.documentNumber);
  if (da && db && da === db) return { type: "exact", score: 1 };
  const nameA = a.name || a.fullName || ((a.firstName || "") + " " + (a.lastName || "")).trim();
  const nameB = b.name || b.fullName || ((b.firstName || "") + " " + (b.lastName || "")).trim();
  const sim = nameSimilarity(nameA, nameB);
  if (sim >= SIMILAR_THRESHOLD) return { type: "similar", score: sim };
  return null;
}

// Casos asociados a una persona, alimentándose de informes y vigilancia.
// person: { docNumber/documentNumber, name/fullName }
export function findRelatedCases(person, incidents, watchlist) {
  const cases = [];
  for (const inc of incidents || []) {
    const people = (inc.persons && inc.persons.length) ? inc.persons : (inc.person ? [inc.person] : []);
    let best = null;
    for (const p of people) {
      const m = personMatch(person, p);
      if (m && (!best || m.score > best.score)) best = m;
    }
    if (best) {
      cases.push({
        id: inc.id,
        label: inc.reportName || (inc.area + " — " + (inc.time || "")),
        date: inc.date || "",
        time: inc.time || "",
        area: inc.area || "",
        status: inc.status || "",
        severity: inc.severity || "",
        matchType: best.type,
      });
    }
  }
  const watch = (watchlist || []).filter((w) => personMatch(person, { docNumber: w.docNumber, name: w.name }));
  return { cases, watch };
}

// Para la detección al agregar a una novedad.
// known: [{ name/docNumber, source, label }]
export function findDuplicates(person, known) {
  const exact = [], similar = [];
  for (const k of known || []) {
    const m = personMatch(person, k);
    if (!m) continue;
    if (m.type === "exact") exact.push(k);
    else similar.push({ ...k, score: m.score });
  }
  return { exact, similar };
}
