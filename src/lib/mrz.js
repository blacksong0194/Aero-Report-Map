// Parser robusto de MRZ de pasaporte (TD3) tolerante a errores de OCR.
// Maneja números de documento alfanuméricos (ej. "AF0002266"), confusión O/0,
// y nombres desde la línea 1. Lógica pura (sin dependencias de React).

const NAT_MAP = {
  MEX:"Mexicana", USA:"Estadounidense", DOM:"Dominicana", COL:"Colombiana",
  VEN:"Venezolana", ESP:"Española", CUB:"Cubana", HAI:"Haitiana", BRA:"Brasileña",
  ARG:"Argentina", GBR:"Británica", CAN:"Canadiense", PRI:"Puertorriqueña",
  CHL:"Chilena", PER:"Peruana", ECU:"Ecuatoriana", FRA:"Francesa", ITA:"Italiana",
  DEU:"Alemana", PRT:"Portuguesa", CHN:"China", IND:"India",
};
const ISS_MAP = {
  MEX:"Estados Unidos Mexicanos", DOM:"República Dominicana", USA:"Estados Unidos",
  COL:"Colombia", VEN:"Venezuela", ESP:"España", CUB:"Cuba", HAI:"Haití",
  BRA:"Brasil", ARG:"Argentina", GBR:"Reino Unido", CAN:"Canadá", CHL:"Chile",
  PER:"Perú", ECU:"Ecuador", FRA:"Francia", ITA:"Italia", DEU:"Alemania", PRT:"Portugal",
};

function yymmdd(r, future) {
  if (!/^[0-9]{6}$/.test(r)) return "";
  const yy = parseInt(r.slice(0, 2), 10);
  const yr = future ? (yy <= 60 ? 2000 + yy : 1900 + yy) : (yy <= 30 ? 2000 + yy : 1900 + yy);
  return r.slice(4, 6) + "/" + r.slice(2, 4) + "/" + yr;
}

// Dígito de control ICAO 9303 (ponderación cíclica 7-3-1). '<' y desconocidos = 0.
function charVal(c) {
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
  if (c >= "A" && c <= "Z") return c.charCodeAt(0) - 55; // A=10 … Z=35
  return 0;
}
export function mrzCheckDigit(str) {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < str.length; i++) sum += charVal(str[i]) * w[i % 3];
  return sum % 10;
}

// Estado de vigencia de un documento a partir de su fecha "DD/MM/YYYY".
// Devuelve { status: "vencido"|"por_vencer"|"vigente", days } o null si no parsea.
export function documentExpiryStatus(expiryStr, refDate = new Date()) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(expiryStr || "");
  if (!m) return null;
  const exp = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (isNaN(exp.getTime())) return null;
  const days = Math.floor((exp.getTime() - refDate.getTime()) / 86400000);
  if (days < 0) return { status: "vencido", days };
  if (days <= 180) return { status: "por_vencer", days };
  return { status: "vigente", days };
}

// Devuelve { documentNumber, nationality, issuingCountry, dateOfBirth, gender, expiryDate,
//            firstName, lastName, fullName } con los campos que pudo extraer, o null.
export function parseMRZRobust(text) {
  if (!text) return null;
  const flat = text.toUpperCase().replace(/[ \t\r\n]+/g, "");
  const out = {};

  // Línea 2 del MRZ: documento(≤9) check nacionalidad(3) nacimiento(6) check sexo expiración(6) check
  const m2 = flat.match(/([A-Z0-9<]{5,9})([0-9O])([A-Z0]{3})([0-9O]{6})([0-9O])([MFX])([0-9O]{6})([0-9O])?/);
  if (m2) {
    const fix = (s) => s.replace(/O/g, "0"); // posiciones numéricas: O→0
    out.documentNumber = m2[1].replace(/</g, "");
    const natCode = m2[3].replace(/0/g, "O"); // posición de letras: 0→O
    out.nationality = NAT_MAP[natCode] || natCode;
    out.issuingCountry = ISS_MAP[natCode] || out.nationality;
    out.dateOfBirth = yymmdd(fix(m2[4]), false);
    out.gender = m2[6] === "M" ? "Masculino" : m2[6] === "F" ? "Femenino" : "";
    out.expiryDate = yymmdd(fix(m2[7]), true);
    // Validación de dígitos de control ICAO (detecta errores de OCR o alteración)
    const docOk = String(mrzCheckDigit(m2[1].padEnd(9, "<"))) === fix(m2[2]);
    const dobOk = String(mrzCheckDigit(fix(m2[4]))) === fix(m2[5]);
    const expOk = m2[8] ? (String(mrzCheckDigit(fix(m2[7]))) === fix(m2[8])) : null; // null = no verificable
    out.checks = { doc: docOk, dob: dobOk, expiry: expOk };
    // Válido si los verificables coinciden (la expiración solo si está presente)
    out.mrzValid = docOk && dobOk && (expOk !== false);
  }

  // Línea 1 del MRZ: P<PAIS<APELLIDOS<<NOMBRES<<
  const m1 = flat.match(/P[<A-Z0-9]?([A-Z]{3})([A-Z][A-Z<]*?)<<([A-Z][A-Z<]*?)<</);
  if (m1) {
    out.lastName = m1[2].replace(/</g, " ").replace(/\s+/g, " ").trim();
    out.firstName = m1[3].replace(/</g, " ").replace(/\s+/g, " ").trim();
    out.fullName = (out.firstName + " " + out.lastName).trim();
    if (!out.issuingCountry) {
      const c = m1[1];
      out.issuingCountry = ISS_MAP[c] || c;
      out.nationality = out.nationality || NAT_MAP[c] || c;
    }
  }

  return (m2 || m1) ? out : null;
}
