// Actualización de la placa por WiFi: GitHub compila el firmware y lo publica en el release "firmware"
// (archivo robi-<número>.bin). El servidor averigua cuál es el último, se lo ofrece al robot y se lo pasa.
import crypto from 'node:crypto';

const REPO = process.env.FIRMWARE_REPO || 'mgstraface/robot-backend';
const TAG = 'firmware';
const CACHE_MS = 5 * 60_000;

let info = null;
let infoAt = 0;
let bin = null; // { build, data, md5 }

/** Último firmware publicado: { build, size, url } (o null si todavía no hay). */
export async function latestFirmware(now = Date.now()) {
  if (info && now - infoAt < CACHE_MS) return info;
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, {
    headers: { 'User-Agent': 'robot-backend', Accept: 'application/vnd.github+json' },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
  const rel = await r.json();
  const asset = (rel.assets || []).find((a) => /^robi-\d+\.bin$/.test(a.name));
  info = asset ? { build: Number(asset.name.match(/\d+/)[0]), size: asset.size, url: asset.browser_download_url } : null;
  infoAt = now;
  return info;
}

/** El .bin del último firmware (se baja una vez y queda en memoria). */
export async function firmwareBinary() {
  const last = await latestFirmware();
  if (!last) return null;
  if (bin?.build === last.build) return bin;
  const r = await fetch(last.url, { headers: { 'User-Agent': 'robot-backend' } });
  if (!r.ok) throw new Error(`No pude bajar el firmware (${r.status})`);
  const data = Buffer.from(await r.arrayBuffer());
  bin = { build: last.build, data, md5: crypto.createHash('md5').update(data).digest('hex') };
  return bin;
}
