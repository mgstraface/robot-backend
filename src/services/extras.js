// Cosas chicas sin IA: cotización del dólar y fechas especiales (Halloween).
import { localParts } from '../time.js';

const DOLAR_MS = 10 * 60 * 1000;
let dolarCache = { at: 0, data: null };

/** Cotizaciones de dolarapi.com (pública y gratis). */
export async function getDolar(now = Date.now()) {
  if (dolarCache.data && now - dolarCache.at < DOLAR_MS) return dolarCache.data;
  const res = await fetch('https://dolarapi.com/v1/dolares', { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`dolarapi respondió ${res.status}`);
  const list = await res.json();
  const by = Object.fromEntries(list.map((d) => [d.casa, d]));
  const data = { blue: by.blue, oficial: by.oficial, mep: by.bolsa };
  dolarCache = { at: now, data };
  return data;
}

const peso = (n) => (Number.isFinite(n) ? `${Math.round(n).toLocaleString('es-AR')} pesos` : 'sin dato');

export function describeDolar(d) {
  const parts = [];
  if (d.blue) parts.push(`El blue está a ${peso(d.blue.venta)} para la venta y ${peso(d.blue.compra)} la compra`);
  if (d.oficial) parts.push(`el oficial a ${peso(d.oficial.venta)}`);
  if (d.mep) parts.push(`y el MEP a ${peso(d.mep.venta)}`);
  return parts.length ? `${parts.join(', ')}.` : 'No encontré la cotización ahora.';
}

/** ¿Hoy es Halloween (31 de octubre, hora local)? */
export function isHalloween(now = Date.now(), tz = 'America/Argentina/Buenos_Aires') {
  const p = localParts(now, tz);
  return p.month === 10 && p.day === 31;
}

// ---------- Cumpleaños y fechas importantes

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Días que faltan para la próxima vez que sea dia/mes (0 = hoy). */
export function daysUntil(dia, mes, now = Date.now(), tz = 'America/Argentina/Buenos_Aires') {
  const p = localParts(now, tz);
  const today = Date.UTC(p.year, p.month - 1, p.day);
  let target = Date.UTC(p.year, mes - 1, dia);
  if (target < today) target = Date.UTC(p.year + 1, mes - 1, dia);
  return Math.round((target - today) / 86_400_000);
}

/** Avisos de hoy: el mismo día, el día antes y 3 días antes. */
export function fechasAvisos(fechas = [], now = Date.now(), tz) {
  const out = [];
  for (const f of fechas) {
    const d = daysUntil(f.dia, f.mes, now, tz);
    if (![0, 1, 3].includes(d)) continue;
    const quien = f.nombre;
    const que = f.tipo === 'cumple' ? `cumple ${quien}` : f.tipo === 'aniversario' ? `es el aniversario: ${quien}` : `es ${quien}`;
    let texto;
    if (d === 0) texto = f.tipo === 'cumple' ? `¡Hoy cumple ${quien}! No te olvides de saludar.` : `¡Hoy ${que}!`;
    else if (d === 1) texto = `Ojo: mañana ${que}.`;
    else {
      const wd = WEEKDAYS_ES[new Date(now + d * 86_400_000).getUTCDay()];
      texto = f.tipo === 'cumple' ? `Te aviso: el ${wd} cumple ${quien}. ¿Ya tenés regalo?` : `Te aviso: el ${wd} ${que}.`;
    }
    out.push({ texto, dias: d, fecha: f });
  }
  return out;
}
