// Respuestas armadas (sin IA): varias por situación y elige una al azar para no sonar repetido.
const PHRASES = {
  hora: ['Son las {hora}.', 'Las {hora} en punto… bueno, casi.', 'Ya son las {hora}.'],
  fecha: ['Hoy es {fecha}.', 'Estamos a {fecha}.'],
  clima: ['Ahora hay {clima}.', 'Afuera: {clima}.', 'Te cuento: {clima}.'],
  climaError: ['No pude ver el clima ahora. Mirá por la ventana, que es gratis.'],
  timerOk: ['Listo, te aviso en {cuanto}.', 'Dale, en {cuanto} te aviso.', 'Anotado: {cuanto} y te aviso.'],
  recordatorioOk: ['Listo, en {cuanto} te recuerdo {que}.', 'Anotado: {que}, en {cuanto}.'],
  alarmaOk: ['Alarma puesta para las {hora}.', 'Dale, a las {hora} te despierto.'],
  timer: ['¡Ey! Ya pasó el tiempo.', '¡Tiempo! Ya está.', '¡Ring ring! Se terminó el timer.'],
  alarma: ['¡Arriba! Es la hora.', '¡Despertate! Sonó la alarma.'],
  recordatorio: ['¡Ey! Acordate: {que}.', 'Te aviso como quedamos: {que}.'],
  cancelados: ['Listo, cancelé {n}.', 'Borrados: {n}.'],
  nadaPendiente: ['No tenés nada pendiente.', 'No hay timers ni alarmas.'],
  pendientes: ['Tenés {lista}.'],
  foco: ['Arranca el foco: 25 minutos sin distracciones. Yo te vigilo.'],
  chiste: [
    '¿Por qué los esqueletos no pelean entre ellos? Porque no tienen agallas.',
    '¿Qué le dijo un fantasma a otro? ¿Vos creés en los humanos?',
    '¿Por qué la momia no tiene amigos? Porque está muy envuelta en sí misma.',
    '¿Qué música escucha un esqueleto? Rock de huesos duros.',
    '¿Cómo se llama el vampiro que hace pan? Drácula, el panadero de la noche.',
  ],
};

export function pick(key, vars = {}) {
  const list = PHRASES[key] || [''];
  const s = list[Math.floor(Math.random() * list.length)];
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}
