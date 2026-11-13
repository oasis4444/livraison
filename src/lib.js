// Outils partagés : réponses HTTP, sécurité, géographie, tarifs.

export const now = () => Date.now();

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export const fail = (status, code, message) => { throw new HttpError(status, code, message); };

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...extra },
  });
}

export function withSecurityHeaders(res) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) r.headers.set(k, v);
  r.headers.set('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  r.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://tiles.openfreemap.org https://unpkg.com",
      "connect-src 'self' https://nominatim.openstreetmap.org https://routing.openstreetmap.de https://tiles.openfreemap.org https://unpkg.com",
      "worker-src 'self' blob:",
      "child-src blob:",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  return r;
}

export async function readJson(req) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > 64 * 1024) fail(413, 'too_large', 'Requête trop volumineuse');
  try { return await req.json(); } catch { return {}; }
}

// ---------- Validation ----------
export function str(v, { min = 0, max = 500, name = 'champ' } = {}) {
  const s = (v ?? '').toString().trim();
  if (s.length < min) fail(400, 'invalid', `${name} requis`);
  return s.slice(0, max);
}

export function int(v, { min = -Infinity, max = Infinity, name = 'valeur' } = {}) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) fail(400, 'invalid', `${name} invalide`);
  return n;
}

export function coord(lat, lng) {
  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < -90 || a > 90 || b < -180 || b > 180) fail(400, 'invalid', 'Coordonnées GPS invalides');
  return [a, b];
}

// Numéros malgaches : 03X XX XXX XX → +2613XXXXXXXX
export function normalizePhone(p) {
  let d = (p ?? '').toString().replace(/[^\d+]/g, '');
  if (d.startsWith('+261')) d = d.slice(4);
  else if (d.startsWith('00261')) d = d.slice(5);
  else if (d.startsWith('261') && d.length === 12) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (!/^3[2-9]\d{7}$/.test(d)) fail(400, 'invalid_phone', 'Numéro de téléphone invalide (ex : 034 12 345 67)');
  return '+261' + d;
}

// ---------- Crypto ----------
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function randomHex(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return hex(a);
}

export function randomPin() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 10000).padStart(4, '0');
}

export async function hashPassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations }, key, 256);
  return hex(bits);
}

export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- Géographie ----------
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Boîte englobante (degrés) pour pré-filtrer en SQL avant le calcul exact.
export function bbox(lat, lng, km) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lat + dLat, lng - dLng, lng + dLng];
}

export const round500 = (n) => Math.max(500, Math.round(n / 500) * 500);

export function suggestPrice(s, pickup, drop) {
  const straight = haversineKm(pickup[0], pickup[1], drop[0], drop[1]);
  const road = straight * Number(s.road_factor || 1.3);
  const price = Math.max(Number(s.min_price), Number(s.base_fare) + road * Number(s.per_km));
  const etaMin = Math.max(3, Math.round((road / Number(s.bike_speed_kmh || 14)) * 60));
  return { distance_km: Math.round(road * 100) / 100, suggested_price: round500(price), eta_min: etaMin };
}

export function csv(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(';')];
  for (const r of rows) lines.push(columns.map((c) => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(';'));
  return '﻿' + lines.join('\r\n');
}

export const fmtDate = (ms) => (ms ? new Date(ms + 3 * 3600e3).toISOString().replace('T', ' ').slice(0, 16) : '');
