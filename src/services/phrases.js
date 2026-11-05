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
  futbolSinFecha: ['No encontré partidos de la Lepra por ahora.'],
  futbolProximo: ['Newell\'s juega {cuando} a las {hora} contra {contra}, {donde}. ¡Vamos Lepra!', 'La Lepra juega {cuando}, {hora}, contra {contra} ({donde}).'],
  futbolEnVivo: ['¡Está jugando! Newell\'s {us}, {contra} {rival}. {detalle}.', 'En vivo: Lepra {us} a {rival} contra {contra}. {detalle}.'],
  futbol_ganamos: ['¡Ganamos {us} a {rival} contra {contra}! ¡Dale Leproso!', 'Le ganamos {us} a {rival} a {contra}. ¡Qué lindo es ser de Newell\'s!'],
  futbol_perdimos: ['Perdimos {us} a {rival} con {contra}. Duele, pero la Lepra se banca.', 'Perdimos {rival} a {us} con {contra}. Ni me hables.'],
  futbol_empatamos: ['Empatamos {us} a {rival} con {contra}.', 'Empate {us} a {rival} con {contra}. Algo es algo.'],
  futbolHoy: ['¡Hoy juega la Lepra! A las {hora} contra {contra}. Rojo y negro todo el día.', 'Atención: hoy a las {hora} juega Newell\'s contra {contra}.'],
  futbolHoyClasico: ['¡Hoy es el clásico! A las {hora} contra los canallas. Hoy no se juega: se gana.'],
  futbolPrevia: ['¡En media hora arranca Newell\'s contra {contra}! Preparate.', 'Ya casi: Newell\'s contra {contra} en un ratito. ¡Vamos Lepra!'],
  futbolGol: ['¡GOOOOOL DE NEWELL\'S! ¡{us} a {rival}!', '¡GOOOL! ¡Vamos Lepra, carajo! {us} a {rival}.', '¡GOL, GOL, GOOOL! Newell\'s {us}, {contra} {rival}.'],
  futbolGolRival: ['Uh… gol de {contra}. {us} a {rival}. Vamos que se da vuelta.', 'Nos hicieron un gol. {us} a {rival}. ¡Arriba Lepra!'],
  futbolFinal_ganamos: ['¡Terminó! Ganamos {us} a {rival} contra {contra}. ¡Dale Leproso!'],
  futbolFinal_perdimos: ['Terminó. Perdimos {us} a {rival} con {contra}. Mañana será otro día.'],
  futbolFinal_empatamos: ['Terminó: empate {us} a {rival} con {contra}.'],
  futbolCentralPerdio: ['Ey… ¿viste? Central perdió con {contra}. Je, je, je.', 'Me enteré que Central perdió con {contra}. No digo nada, pero… je.'],
  // Frases leprosas de fábrica (originales). Las propias se cargan en el panel, en Rutinas.
  leprosa: [
    'Rojo y negro en el corazón, todo el año.',
    'Ser de Newell\'s no se explica: se siente.',
    'Hoy, mañana y siempre: la Lepra.',
    'Que suene fuerte: ¡Newell\'s, Newell\'s, Newell\'s!',
    'En Rosario hay un solo grande, y es rojo y negro.',
    '¿Sabías que Messi arrancó en las inferiores de Newell\'s? Obvio que sabías.',
    'Bielsa nos enseñó que el que no arriesga, no gana.',
    'Late el Coloso, late Rosario.',
    'Para un leproso, el clásico vale más que un campeonato.',
    '¡Vamos, vamos, la Lepra! Que se escuche hasta Arroyito.',
    'Un día sin Newell\'s es un día perdido.',
    'Al canalla, ni agua… bueno, agua sí, que hace calor.',
  ],
  reclamo: [
    '¿Hola? ¿Hay alguien ahí? Hace rato que nadie me da bola…',
    'Me estoy aburriendo un montón. ¿Jugamos a algo?',
    'Ey, ¿te olvidaste de mí? Un mimito no vendría mal.',
    'Psst… estoy acá. Contame algo, dale.',
  ],
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
