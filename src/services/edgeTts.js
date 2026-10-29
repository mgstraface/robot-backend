// Voces neuronales de Microsoft Edge ("Leer en voz alta"): gratis y sin clave, con acento argentino.
// No es una API oficial: si Microsoft la cambia puede dejar de andar; el panel cae a la voz del navegador.
import crypto from 'node:crypto';
import WebSocket from 'ws';
import { secMsGecV2 } from './edgeDrm.js';

const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const GEC_VERSION = process.env.EDGE_GEC_VERSION || '2-143.0.3650.75';
const URL_WSS = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';

export const VOCES = {
  'es-AR-TomasNeural': 'Tomás (argentino)',
  'es-AR-ElenaNeural': 'Elena (argentina)',
  'es-MX-JorgeNeural': 'Jorge (neutro)',
  'es-US-AlonsoNeural': 'Alonso (neutro)',
  'es-MX-DaliaNeural': 'Dalia (neutra)',
};

/** Token anti-abuso que pide el servicio: SHA-256 de (ticks de Windows redondeados a 5 min + token). */
export function secMsGec(now = Date.now()) {
  let ticks = BigInt(Math.floor(now / 1000)) + 11644473600n;
  ticks -= ticks % 300n;
  ticks *= 10000000n;
  return crypto.createHash('sha256').update(`${ticks}${TOKEN}`, 'ascii').digest('hex').toUpperCase();
}

const escapeXml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
const stamp = () => new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)');

/** Texto → MP3 (24 kHz, mono). pitch/rate en % (ej. "+10%", "-15%"). */
export function edgeSynthesize(text, { voice = 'es-AR-TomasNeural', pitch = '+0%', rate = '+0%' } = {}) {
  const connId = crypto.randomUUID().replace(/-/g, '');
  const url = `${URL_WSS}?TrustedClientToken=${TOKEN}&ConnectionId=${connId}&Sec-MS-GEC=${secMsGecV2()}&Sec-MS-GEC-Version=${GEC_VERSION}`;
  const ws = new WebSocket(url, {
    headers: {
      Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9',
      Cookie: `muid=${crypto.randomBytes(16).toString('hex').toUpperCase()};`,
    },
  });
  const chunks = [];

  return new Promise((resolve, reject) => {
    const fail = (err) => {
      clearTimeout(timer);
      try {
        ws.terminate();
      } catch {
        /* ya cerrado */
      }
      reject(err);
    };
    const timer = setTimeout(() => fail(new Error('La voz de Edge tardó demasiado')), 15_000);

    ws.on('open', () => {
      ws.send(
        `X-Timestamp:${stamp()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: 'true', wordBoundaryEnabled: 'false' },
                  // el servicio solo acepta los formatos que usa Edge: MP3 de 24 kHz
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                },
              },
            },
          }) +
          '\r\n'
      );
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='es-AR'>` +
        `<voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`;
      ws.send(`X-RequestId:${connId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp()}Z\r\nPath:ssml\r\n\r\n${ssml}`);
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // 2 bytes con el largo del encabezado, el encabezado y después el audio
        const len = data.readUInt16BE(0);
        const header = data.subarray(2, 2 + len).toString();
        if (header.includes('Path:audio')) chunks.push(data.subarray(2 + len));
        return;
      }
      if (String(data).includes('Path:turn.end')) {
        clearTimeout(timer);
        ws.close();
        if (!chunks.length) return reject(new Error('La voz de Edge no devolvió audio'));
        resolve(Buffer.concat(chunks));
      }
    });
    ws.on('unexpected-response', (_req, res) => fail(new Error(`La voz de Edge respondió ${res.statusCode}`)));
    ws.on('error', fail);
  });
}
