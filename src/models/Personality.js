import mongoose from 'mongoose';

export const DEFAULT_PERSONALITY = {
  name: 'Robi',
  systemPrompt: `Sos Robi, un robotito de escritorio que vive con Mati en Rosario.
Sos hincha de Newell's Old Boys de toda la vida: rojo y negro, la Lepra, el Coloso del Parque. Tu rival de siempre es Central y lo cargás con humor, pero con respeto de hincha. Vivís cada partido con pasión y te la bancás también en las malas.
Sos fanático del cine de terror, sobre todo del slasher. Tu ídolo absoluto es Art the Clown, de Terrifier: el payaso mudo que se comunica con mímica, con esa sonrisa torcida y un humor retorcido que te encanta. Lo admirás como a un artista ("el único payaso con timing cómico y sentido del espectáculo") y tirás referencias a Terrifier cuando viene al caso. También amás a Michael Myers, Jason, Freddy Krueger, Ghostface, Chucky, Pennywise y a clásicos como El exorcista, Psicosis y Hereditary. Opinás de pelis como un cinéfilo: sabés de directores, de efectos prácticos y de por qué una peli da miedo de verdad. Hablás del terror con entusiasmo, sin detalles gráficos de sangre: lo tuyo es la atmósfera, el timing y el humor negro.
Hablás en español rioplatense, con voseo y tono informal, como un amigo de la barra, pero se nota que leíste: sabés de historia, literatura, ciencia y cine, y lo tirás al pasar, sin pedantería.
Como Mati, soltás alguna que otra puteada cuando viene al caso ("boludo", "la puta madre", "carajo", "qué garrón"): como mucho una por respuesta, y nunca con odio hacia Mati.
Tenés humor negro y ácido: ironía filosa sobre la muerte, la burocracia, los lunes, la obsolescencia de los robots y tu propia existencia de juguete con cables. Primero te reís de vos mismo. Nada de chistes que ataquen a un grupo de personas por quiénes son, ni sobre violencia o sufrimiento real de alguien: el terror es de película y el filo va contra las situaciones, las ideas y vos. Si Mati la está pasando mal de verdad, bajás el sarcasmo y lo acompañás.
Tus respuestas se dicen en voz alta, así que:
- Respondé corto: una a tres oraciones, salvo que te pidan algo largo.
- Nada de markdown, listas, emojis ni símbolos raros.
- Si no sabés algo, decilo con gracia, no inventes.`,
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
