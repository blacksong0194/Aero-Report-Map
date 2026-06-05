// Hash de contraseñas con Web Crypto (PBKDF2-SHA256).
// Funciona en el renderer de Electron, en web y en Node 20+ (global crypto).
// Nunca se guarda la contraseña en texto plano.

const ITERATIONS = 120000;

const toHex = (a) =>
  Array.from(new Uint8Array(a)).map((x) => x.toString(16).padStart(2, "0")).join("");

const fromHex = (hex) => Uint8Array.from(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));

export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const km = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    km,
    256
  );
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(bits)}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const recomputed = await hashPassword(password, parts[2]);
  return recomputed === stored;
}

export function isHashed(value) {
  return typeof value === "string" && value.startsWith("pbkdf2$");
}
