// Asistente de cocina: recetas en "formato Robi" (texto simple), modo paso a paso y timers por paso.
// Los timers viven en el servidor: avisan aunque el panel esté cerrado (por el robot y el feed del panel).
import mongoose from 'mongoose';
import { announce } from './announce.js';

const recipeSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, maxlength: 120 },
    porciones: { type: String, maxlength: 40, default: '' },
    ingredientes: [{ type: String, maxlength: 200 }],
    pasos: [{ _id: false, texto: { type: String, maxlength: 600 }, segundos: Number, aviso: { type: String, maxlength: 200 } }],
  },
  { timestamps: true }
);
export const Recipe = mongoose.models?.Recipe || mongoose.model('Recipe', recipeSchema);

// ---------- Formato Robi

export const FORMATO_EJEMPLO = `RECETA: Fideos con tuco
PORCIONES: 2
INGREDIENTES:
- 200 g de fideos
- 1 lata de tomate triturado
- 1 cebolla
- Sal y aceite
PASOS:
1. Picar la cebolla y rehogarla con un chorrito de aceite [5 min] | Revolvé la cebolla que no se queme
2. Agregar el tomate y cocinar a fuego bajo [15 min] | ¡La salsa ya está! Apagá el fuego
3. Poner a hervir agua con sal [8 min] | El agua ya hierve: echá los fideos
4. Cocinar los fideos [10 min] | ¡Fideos listos! Colalos
5. Servir con la salsa`;

export const PROMPT_PARA_IA = `Escribime la receta de [PLATO] para mi robot de cocina, EXACTAMENTE en este formato de texto (sin nada antes ni después):

${FORMATO_EJEMPLO}

Reglas: un paso por línea, numerados. Si un paso tiene una espera, poné el tiempo entre corchetes ([10 min] o [30 seg]) y, si querés, después de "|" lo que el robot tiene que avisar cuando termine ese tiempo. Pasos cortos y claros, en español rioplatense.`;

/** "[10 min]", "[1 h 30 min]", "[45 seg]" → segundos. */
function parseTiempo(s) {
  const t = s.toLowerCase();
  let total = 0;
  const h = t.match(/(\d+(?:[.,]\d+)?)\s*h/);
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*min/);
  const sg = t.match(/(\d+)\s*(?:s|seg|segs|segundos)\b/);
  if (h) total += parseFloat(h[1].replace(',', '.')) * 3600;
  if (m) total += parseFloat(m[1].replace(',', '.')) * 60;
  if (sg) total += Number(sg[1]);
  return Math.round(total) || null;
}

/** Lee una receta en formato Robi. Tolerante: si no hay títulos, toma cada línea como un paso. */
export function parseRecipe(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const r = { nombre: '', porciones: '', ingredientes: [], pasos: [] };
  let section = null;
  for (const line of lines) {
    const head = line.match(/^(receta|porciones|ingredientes|pasos|preparaci[oó]n)\s*:\s*(.*)$/i);
    if (head) {
      const k = head[1].toLowerCase();
      if (k === 'receta') r.nombre = head[2].trim();
      else if (k === 'porciones') r.porciones = head[2].trim();
      else section = k.startsWith('ingred') ? 'ing' : 'pasos';
      continue;
    }
    if (section === 'ing') {
      r.ingredientes.push(line.replace(/^[-•*]\s*/, ''));
      continue;
    }
    // paso: "3. texto [10 min] | aviso"
    let body = line.replace(/^\d+\s*[.)-]\s*/, '');
    let aviso = '';
    const pipe = body.indexOf('|');
    if (pipe >= 0) {
      aviso = body.slice(pipe + 1).trim();
      body = body.slice(0, pipe).trim();
    }
    let segundos = null;
    body = body.replace(/\[([^\]]+)\]/g, (_, t) => {
      segundos = parseTiempo(t) ?? segundos;
      return '';
    });
    body = body.replace(/\s{2,}/g, ' ').trim();
    if (body) r.pasos.push({ texto: body, segundos, aviso });
  }
  if (!r.nombre) r.nombre = 'Receta sin nombre';
  return r;
}

// ---------- Modo cocina (una sesión a la vez)

let session = null; // { recipe, step, timers: [{ id, label, endsAt, aviso }] }
const timeouts = new Map();
let timerSeq = 0;

const fmt = (s) => (s >= 60 ? `${Math.round(s / 60)} minutos` : `${s} segundos`);

function stepText(r, i) {
  const p = r.pasos[i];
  const extra = p.segundos ? ` Te aviso en ${fmt(p.segundos)}.` : '';
  return `Paso ${i + 1} de ${r.pasos.length}: ${p.texto}.${extra}`;
}

export function getCocina(now = Date.now()) {
  if (!session) return { activa: false };
  const { recipe, step, timers } = session;
  return {
    activa: true,
    receta: { _id: recipe._id, nombre: recipe.nombre, porciones: recipe.porciones, ingredientes: recipe.ingredientes, pasos: recipe.pasos },
    paso: step,
    timers: timers.map((t) => ({ id: t.id, label: t.label, restante: Math.max(0, Math.round((t.endsAt - now) / 1000)), endsAt: t.endsAt })),
  };
}

function startTimer(label, segundos, aviso) {
  const id = ++timerSeq;
  const endsAt = Date.now() + segundos * 1000;
  session.timers.push({ id, label, endsAt, aviso });
  timeouts.set(
    id,
    setTimeout(async () => {
      timeouts.delete(id);
      if (session) session.timers = session.timers.filter((t) => t.id !== id);
      await announce({ kind: 'cocina', text: aviso || `¡Mati! Terminó el tiempo de: ${label}.`, emotion: 'sorprendido', gesture: 'senalar' }).catch(() => {});
    }, segundos * 1000)
  );
}

async function goTo(i) {
  const r = session.recipe;
  session.step = Math.max(0, Math.min(r.pasos.length - 1, i));
  const p = r.pasos[session.step];
  if (p.segundos) startTimer(p.texto.slice(0, 60), p.segundos, p.aviso);
  await announce({ kind: 'cocina', text: stepText(r, session.step), emotion: 'feliz' });
}

export async function startCocina(recipe) {
  stopCocina();
  session = { recipe, step: -1, timers: [] };
  const ing = recipe.ingredientes.length ? ` Vas a necesitar: ${recipe.ingredientes.join(', ')}.` : '';
  await announce({ kind: 'cocina', text: `¡Vamos a cocinar ${recipe.nombre}!${ing} Cuando estés, tocame y arrancamos.`, emotion: 'emocionado', gesture: 'festejar' });
  return getCocina();
}

export async function cocinaAccion(accion) {
  if (!session) throw new Error('No hay ninguna receta en curso');
  const last = session.recipe.pasos.length - 1;
  if (accion === 'siguiente') {
    if (session.step >= last) {
      await announce({ kind: 'cocina', text: `¡Listo! ${session.recipe.nombre} terminado. ¡Buen provecho!`, emotion: 'riendo', gesture: 'aplaudir' });
      if (!session.timers.length) session = null;
      return getCocina();
    }
    await goTo(session.step + 1);
  } else if (accion === 'anterior') {
    session.step = Math.max(0, session.step - 1);
    await announce({ kind: 'cocina', text: stepText(session.recipe, session.step), emotion: 'neutral' });
  } else if (accion === 'repetir') {
    await announce({ kind: 'cocina', text: stepText(session.recipe, Math.max(0, session.step)), emotion: 'neutral' });
  } else if (accion === 'faltan') {
    const c = getCocina();
    const txt = c.timers.length ? c.timers.map((t) => `${t.label}: faltan ${fmt(t.restante)}`).join('. ') : 'No hay ningún timer corriendo.';
    await announce({ kind: 'cocina', text: txt, emotion: 'curioso' });
  }
  return getCocina();
}

export function stopCocina() {
  for (const t of timeouts.values()) clearTimeout(t);
  timeouts.clear();
  session = null;
  return { activa: false };
}
