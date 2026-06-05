// Utilidades de formato (lógica pura, sin dependencias de React)

// Número de reporte: YYMMNN (año, mes, secuencia). Ej. 260601
export function buildReportNumber(counter) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const nn = String(counter).padStart(2, "0");
  return yy + mm + nn;
}

// Fecha de hoy en formato YYYY-MM-DD
export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
