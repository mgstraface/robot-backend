// Menú en la pantalla del robot: la placa pide cosas (recetas, timers, clima, modo...) y el servidor las hace.
// Lo que hay que decir sale con announce(), así también lo dice el panel/celular (el robot todavía no tiene parlante).
import { appearanceOf, getPersonality, updatePersonality } from '../models/Personality.js';
import { announce } from '../services/announce.js';
import { cocinaAccion, getCocina, Recipe, startCocina, stopCocina } from '../services/cocina.js';
import { runCommand } from '../services/commands.js';
import { moodEvent } from '../services/mood.js';
import { pick } from '../services/phrases.js';
import { addReminder } from '../services/reminders.js';

/** Resumen de la cocina para la pantallita del robot. */
export function cocinaParaRobot(now = Date.now()) {
  const c = getCocina(now);
  if (!c.activa) return { type: 'cocina', activa: false };
  const r = c.receta;
  const paso = c.paso >= 0 ? r.pasos[c.paso] : null;
  const timer = [...c.timers].sort((a, b) => a.restante - b.restante)[0];
  return {
    type: 'cocina',
    activa: true,
    id: String(r._id || ''),
    nombre: r.nombre,
    paso: c.paso,
    total: r.pasos.length,
    texto: paso ? paso.texto : `Ingredientes: ${r.ingredientes.join(', ')}`,
    restante: timer ? timer.restante : 0,
  };
}

export async function handleMenu(msg, reply, broadcast) {
  const accion = String(msg.accion || '');
  switch (accion) {
    case 'recetas': {
      const list = await Recipe.find({}, { nombre: 1 }).sort({ updatedAt: -1 }).limit(20).lean();
      reply({ type: 'recetas', items: list.map((r) => ({ id: String(r._id), nombre: r.nombre })) });
      return;
    }
    case 'cocinar': {
      const c = getCocina();
      // la misma receta que está en curso: se retoma, no arranca de cero
      if (!(c.activa && String(c.receta._id) === String(msg.id))) {
        const recipe = await Recipe.findById(String(msg.id)).lean().catch(() => null);
        if (!recipe) return reply({ type: 'error', message: 'No encontré esa receta' });
        await startCocina(recipe);
      }
      broadcast(cocinaParaRobot());
      return;
    }
    case 'cocina': {
      const paso = String(msg.paso || '');
      if (paso === 'stop') stopCocina();
      else if (['siguiente', 'anterior', 'repetir', 'faltan'].includes(paso) && getCocina().activa) await cocinaAccion(paso);
      broadcast(cocinaParaRobot());
      return;
    }
    case 'estadoCocina':
      reply(cocinaParaRobot());
      return;
    case 'timer': {
      const min = Math.max(1, Math.min(180, Number(msg.min) || 0));
      await addReminder({ at: new Date(Date.now() + min * 60_000), kind: 'timer', text: '' });
      await announce({ kind: 'timer', text: pick('timerOk', { cuanto: min === 1 ? '1 minuto' : `${min} minutos` }), emotion: 'feliz', gesture: 'asentir' });
      return;
    }
    case 'comando': {
      // reusa los comandos gratis (clima, hora, foco, chiste...)
      const r = await runCommand(String(msg.texto || ''));
      if (!r) return;
      await announce({ kind: 'menu', text: r.text, emotion: r.emotion || 'neutral', gesture: r.gesture, actions: r.weather ? ['clima'] : [], weather: r.weather });
      return;
    }
    case 'modo': {
      const p = await getPersonality();
      const updated = await updatePersonality({ faceStyle: p.faceStyle === 'terror' ? 'tierno' : 'terror' });
      broadcast({ type: 'appearance', ...appearanceOf(updated) });
      return;
    }
    case 'cosquillas':
      moodEvent('mimo');
      return;
    default:
      reply({ type: 'error', message: `Acción de menú desconocida: ${accion}` });
  }
}
