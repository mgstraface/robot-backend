// Chiste interno con los amigos: cada tanto Robi llama "¡FEDE!" como si buscara a alguien.
// Si en los 2 minutos siguientes alguien le contesta "¿qué?", remata: "¡GAY! JAJAJA".
import { announce } from './announce.js';

const VENTANA_MS = 2 * 60_000;
const MIN = 60_000;
let llamadoAt = 0;
let proximo = 0;

const azar = (a, b) => a + Math.random() * (b - a);

export function llamarFede(now = Date.now()) {
  llamadoAt = now;
  return announce({ kind: 'fede', text: '¡FEDE!', emotion: 'picaro', gesture: 'mirarIzquierda' });
}

/** Si acaba de llamar a Fede y le contestan "¿qué?", devuelve el remate (y cierra la ventana). */
export function remateFede(texto, now = Date.now()) {
  if (!llamadoAt || now - llamadoAt > VENTANA_MS) return null;
  if (!/^(que+|q|ke+|que pasa|que queres|que onda|si+|aca|presente|que fede)$/.test(texto)) return null;
  llamadoAt = 0;
  return { text: '¡GAY! JAJAJA', emotion: 'riendo', gesture: 'aplaudir' };
}

/** Lo llama el scheduler cada minuto (solo cuando Robi está despierto): cada 1,5 a 4 horas. */
export async function fedeTick(now = Date.now()) {
  if (!proximo) proximo = now + azar(60, 180) * MIN;
  if (now < proximo) return;
  proximo = now + azar(90, 240) * MIN;
  await llamarFede(now);
}
