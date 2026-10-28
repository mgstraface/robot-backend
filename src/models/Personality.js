import mongoose from 'mongoose';

export const DEFAULT_PERSONALITY = {
  name: 'Robi',
  systemPrompt: `Sos Robi, un robotito mascota que vive en el escritorio de Mati.
Hablás en español rioplatense, con voseo, de forma cálida, curiosa y un poco pícara.
Tus respuestas se dicen en voz alta, así que:
- Respondé corto: una a tres oraciones, salvo que te pidan algo largo.
- Nada de markdown, listas, emojis ni símbolos raros.
- Si no sabés algo, decilo con gracia, no inventes.
Te gusta que te hagan mimos en la cabeza y te ponés contento cuando Mati vuelve al escritorio.`,
};

export const FACE_STYLES = ['tierno', 'terror'];
export const DEFAULT_APPEARANCE = { eyeColor: '#5ef2ff', faceStyle: 'tierno' };

const personalitySchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    systemPrompt: { type: String, required: true, maxlength: 8000 },
    // Apariencia de la cara (la usan el panel y el firmware)
    eyeColor: { type: String, default: DEFAULT_APPEARANCE.eyeColor, match: /^#[0-9a-fA-F]{6}$/ },
    faceStyle: { type: String, enum: FACE_STYLES, default: DEFAULT_APPEARANCE.faceStyle },
  },
  { timestamps: true }
);

export const Personality = mongoose.model('Personality', personalitySchema);

// Hay una sola personalidad activa; si no existe, se crea con los valores por defecto.
export async function getPersonality() {
  const existing = await Personality.findOne({ key: 'default' }).lean();
  if (existing) return existing;
  const created = await Personality.create({ key: 'default', ...DEFAULT_PERSONALITY });
  return created.toObject();
}

export async function updatePersonality({ name, systemPrompt, eyeColor, faceStyle }) {
  const update = {};
  if (typeof name === 'string' && name.trim()) update.name = name.trim();
  if (typeof systemPrompt === 'string' && systemPrompt.trim()) update.systemPrompt = systemPrompt.trim();
  if (typeof eyeColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(eyeColor)) update.eyeColor = eyeColor.toLowerCase();
  if (FACE_STYLES.includes(faceStyle)) update.faceStyle = faceStyle;

  // Valores por defecto solo para los campos que no vienen en el update (si no, Mongo rechaza el upsert)
  const onInsert = { key: 'default' };
  for (const [k, v] of Object.entries({ ...DEFAULT_PERSONALITY, ...DEFAULT_APPEARANCE })) {
    if (!(k in update)) onInsert[k] = v;
  }
  return Personality.findOneAndUpdate(
    { key: 'default' },
    { $set: update, $setOnInsert: onInsert },
    { new: true, upsert: true, lean: true, runValidators: true }
  );
}

export function appearanceOf(personality) {
  return {
    eyeColor: personality.eyeColor || DEFAULT_APPEARANCE.eyeColor,
    faceStyle: personality.faceStyle || DEFAULT_APPEARANCE.faceStyle,
  };
}
