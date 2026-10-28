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
];

// Emociones que puede elegir la IA al responder (las de estado, como "pensando", las pone el servidor).
export const AI_EMOTIONS = ['neutral', 'feliz', 'triste', 'sorprendido', 'enojado', 'amor', 'curioso'];

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
