// Emociones que entiende la cara del robot. El firmware y el panel usan estos mismos nombres.
export const EMOTIONS = [
  'neutral',
  'feliz',
  'triste',
  'sorprendido',
  'enojado',
  'pensando',
  'dormido',
  'amor',
  'curioso',
  'escuchando',
  'mareado',
  'asustado',
  'picaro',
  'aburrido',
  'riendo',
  'llorando',
  'confundido',
  'emocionado',
  'avergonzado',
  'nervioso',
  'muerto',
];

// Acciones que el servidor puede pedirle al robot (además de las de su propia vida).
// "clima" va acompañada de la categoría del clima (despejado, lluvia, tormenta…).
export const ROBOT_ACTIONS = ['apagon', 'risa', 'lagrima', 'colmillos', 'tercerOjo', 'clima', 'gol', 'bandera'];

// Gestos: de cabeza (cuello de 2 servos) y de brazos (un servo por hombro). El firmware tiene la coreografía de cada uno.
export const GESTURES = [
  // cabeza (servos del cuello)
  'asentir', 'negar', 'mirarArriba', 'mirarAbajo', 'mirarIzquierda', 'mirarDerecha', 'ladear',
  // brazos (servos de los hombros)
  'saludar', 'festejar', 'aplaudir', 'hombros', 'taparse', 'abrazo', 'bailar', 'senalar',
];

// Reacciones al sensor de movimiento (IMU) del robot.
export const MOTION_REACTIONS = {
  sacudir: 'mareado',
  levantar: 'sorprendido',
  caer: 'triste',
};

// Emociones que puede elegir la IA al responder (las de estado, como "pensando", las pone el servidor).
export const AI_EMOTIONS = ['neutral', 'feliz', 'triste', 'sorprendido', 'enojado', 'amor', 'curioso', 'asustado', 'picaro', 'aburrido', 'riendo', 'llorando', 'confundido', 'emocionado', 'avergonzado', 'nervioso', 'muerto'];

export function isEmotion(value) {
  return EMOTIONS.includes(value);
}

// Reacción inmediata a cada zona táctil, sin pasar por la IA (tiene que ser instantánea).
export const TOUCH_REACTIONS = {
  cabeza: 'feliz',
  panza: 'amor',
  espalda: 'sorprendido',
};

/**
 * La IA responde empezando con la emoción entre corchetes y, opcional, un gesto de cabeza:
 * "[feliz] [asentir] ¡Sí, obvio!". Devuelve { emotion, gesture, text }.
 */
export function parseReply(raw) {
  const { emotion, text } = parseEmotion(raw);
  const match = text.match(/^\[([a-zA-Záéíóúñ]+)\]\s*/);
  if (!match) return { emotion, gesture: null, text };
  const g = GESTURES.find((x) => x.toLowerCase() === match[1].toLowerCase());
  // si el tag no es un gesto válido igual lo sacamos del texto: no tiene que leerse en voz alta
  return { emotion, gesture: g || null, text: text.slice(match[0].length).trim() };
}

/**
 * La IA responde empezando con la emoción entre corchetes: "[feliz] ¡Hola Mati!".
 * Separa la emoción del texto. Si falta o no es válida, usa "neutral".
 */
export function parseEmotion(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/^\[([a-záéíóúñ]+)\]\s*/i);
  if (!match) return { emotion: 'neutral', text };
  const candidate = match[1].toLowerCase();
  return {
    emotion: AI_EMOTIONS.includes(candidate) ? candidate : 'neutral',
    text: text.slice(match[0].length).trim(),
  };
}
