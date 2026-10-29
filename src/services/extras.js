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
