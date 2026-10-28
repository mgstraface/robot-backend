import mongoose from 'mongoose';

// Fotos del portarretrato. Llegan ya achicadas desde el panel (JPEG ~320×172), así que pesan poco.
export const MAX_PHOTOS = 60;
export const MAX_PHOTO_BYTES = 400 * 1024;

const photoSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    mime: { type: String, default: 'image/jpeg' },
    size: Number,
  },
  { timestamps: true }
);

export const Photo = mongoose.model('Photo', photoSchema);

/** ¿Es un JPEG? (los primeros bytes de todo JPEG son FF D8 FF) */
export function isJpeg(buf) {
  return Buffer.isBuffer(buf) && buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}
