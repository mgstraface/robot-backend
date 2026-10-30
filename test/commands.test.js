process.env.MONGO_URI ||= 'mongodb://127.0.0.1:27017/robot-test';
process.env.ADMIN_TOKEN ||= 'test-admin';
process.env.DEVICE_TOKEN ||= 'test-device';

import assert from 'node:assert/strict';
import { test } from 'node:test';
const { nextAt, parseCommand } = await import('../src/services/commands.js');

test('timers y recordatorios', () => {
  assert.deepEqual(parseCommand('Robi, avisame en 10 minutos'), { type: 'timer', ms: 600_000, que: '' });
  assert.deepEqual(parseCommand('poneme un timer de media hora'), { type: 'timer', ms: 1_800_000, que: '' });
  assert.deepEqual(parseCommand('recordame que saque la ropa en una hora'), { type: 'timer', ms: 3_600_000, que: 'saque la ropa' });
  assert.deepEqual(parseCommand('avisame en dos horas y media que llame a Fran'), { type: 'timer', ms: 9_000_000, que: 'llame a fran' });
});

test('alarmas', () => {
  assert.deepEqual(parseCommand('despertame a las 7'), { type: 'alarma', hour: 7, minute: 0, que: '' });
  assert.deepEqual(parseCommand('Alarma a las 6:45'), { type: 'alarma', hour: 6, minute: 45, que: '' });
  assert.deepEqual(parseCommand('avisame a las 5 y media de la tarde que tengo reunión'), { type: 'alarma', hour: 17, minute: 30, que: 'tengo reunion' });
});

test('otros comandos y lo que no es comando', () => {
  assert.equal(parseCommand('¿Qué hora es?').type, 'hora');
  assert.equal(parseCommand('che robi, qué día es hoy').type, 'fecha');
  assert.equal(parseCommand('¿Cómo está el clima?').type, 'clima');
  assert.equal(parseCommand('contame un chiste').type, 'chiste');
  assert.equal(parseCommand('cancelá las alarmas').type, 'cancelar');
  assert.equal(parseCommand('¿qué timers tengo?').type, 'pendientes');
  assert.equal(parseCommand('modo foco').type, 'foco');
  assert.equal(parseCommand('¿a qué hora es la reunión con el cliente?'), null);
  assert.equal(parseCommand('¿Cómo estás Robi?'), null);
  assert.equal(parseCommand('contame qué opinás de las películas de terror'), null);
});

test('nextAt: hoy si no pasó, mañana si ya pasó', () => {
  const tz = 'America/Argentina/Buenos_Aires';
  const now = Date.UTC(2026, 9, 29, 12, 0); // 9:00 en Argentina
  assert.equal(nextAt(10, 0, tz, now), Date.UTC(2026, 9, 29, 13, 0));
  assert.equal(nextAt(8, 0, tz, now), Date.UTC(2026, 9, 30, 11, 0));
});

test('fútbol: comandos y lectura de ESPN', async () => {
  assert.deepEqual(parseCommand('¿Cuándo juega Newell\'s?'), { type: 'futbol', kind: 'cuando' });
  assert.deepEqual(parseCommand('cómo salió la lepra'), { type: 'futbol', kind: 'resultado' });
  const { parseEvent, diffMatch } = await import('../src/services/futbol.js');
  const ev = {
    id: '1',
    date: '2026-11-01T23:00Z',
    competitions: [
      {
        status: { type: { state: 'in', shortDetail: "55'" } },
        competitors: [
          { homeAway: 'home', score: '2', team: { id: '14', displayName: "Newell's Old Boys", shortDisplayName: "Newell's" } },
          { homeAway: 'away', score: { value: 1 }, team: { id: '9', displayName: 'Rosario Central', shortDisplayName: 'Central' } },
        ],
      },
    ],
  };
  const m = parseEvent(ev, '14');
  assert.equal(m.ours, true);
  assert.equal(m.us.score, 2);
  assert.equal(m.rival.name, 'Central');
  assert.equal(m.us.home, true);
  assert.deepEqual(diffMatch({ us: 1, rival: 1 }, m), ['gol']);
  assert.deepEqual(diffMatch({ us: 2, rival: 0 }, m), ['golRival']);
  assert.deepEqual(diffMatch(undefined, m), []);
});

test('frases leprosas: comando y frases propias', async () => {
  assert.deepEqual(parseCommand('Robi, cantá algo de Newell\'s'), { type: 'leprosa' });
  assert.deepEqual(parseCommand('tirame una frase leprosa'), { type: 'leprosa' });
  const { fraseLeprosa } = await import('../src/services/futbol.js');
  assert.equal(fraseLeprosa({ frasesLeprosas: ['Mi frase'] }), 'Mi frase');
  assert.ok(fraseLeprosa({ frasesLeprosas: [] }).length > 5);
});

test('noticias de Newell\'s: comando y lectura del RSS', async () => {
  assert.deepEqual(parseCommand('Robi, tirame una noticia de Newell\'s'), { type: 'noticia' });
  assert.deepEqual(parseCommand('¿qué novedades hay de la lepra?'), { type: 'noticia' });
  const { parseRss } = await import('../src/services/noticias.js');
  const xml = `<rss><channel>
    <item><title>Newell&#39;s ganó el clásico - Olé</title><source url="x">Olé</source><pubDate>Wed, 28 Oct 2026 10:00:00 GMT</pubDate></item>
    <item><title><![CDATA[Refuerzo para la Lepra - La Capital]]></title><source url="y">La Capital</source><pubDate>Thu, 29 Oct 2026 10:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const items = parseRss(xml);
  assert.equal(items[0].title, 'Refuerzo para la Lepra');
  assert.equal(items[1].title, "Newell's ganó el clásico");
  assert.equal(items[1].source, 'Olé');
  const { forSpeech } = await import('../src/services/voice.js');
  assert.equal(forSpeech("¡GOOOOOL DE NEWELL'S! Je, je, je."), "¡goool de newell's! jejeje.");
});

test('dólar y Halloween', async () => {
  assert.deepEqual(parseCommand('Robi, ¿cómo está el dólar?'), { type: 'dolar' });
  assert.deepEqual(parseCommand('a cuanto esta el blue'), { type: 'dolar' });
  const { describeDolar, isHalloween } = await import('../src/services/extras.js');
  assert.match(describeDolar({ blue: { compra: 1200, venta: 1230 }, oficial: { venta: 1050 } }), /blue está a 1\.230 pesos/);
  assert.equal(isHalloween(Date.UTC(2026, 9, 31, 15, 0)), true);
  assert.equal(isHalloween(Date.UTC(2026, 10, 1, 2, 0)), true); // 23 h del 31 en Argentina
  assert.equal(isHalloween(Date.UTC(2026, 9, 30, 15, 0)), false);
});

test('recetas: formato Robi y texto suelto', async () => {
  const { parseRecipe, FORMATO_EJEMPLO } = await import('../src/services/cocina.js');
  const r = parseRecipe(FORMATO_EJEMPLO);
  assert.equal(r.nombre, 'Fideos con tuco');
  assert.equal(r.porciones, '2');
  assert.equal(r.ingredientes.length, 4);
  assert.equal(r.pasos.length, 5);
  assert.deepEqual(r.pasos[0], { texto: 'Picar la cebolla y rehogarla con un chorrito de aceite', segundos: 300, aviso: 'Revolvé la cebolla que no se queme' });
  assert.equal(r.pasos[4].segundos, null);
  const suelta = parseRecipe('Poner a hervir el agua\nEchar los fideos [10 min]\nColar [30 seg]\nHornear [1 h 15 min]');
  assert.equal(suelta.pasos.length, 4);
  assert.deepEqual(suelta.pasos.map((p) => p.segundos), [null, 600, 30, 4500]);
  assert.deepEqual(parseCommand('siguiente'), { type: 'cocina', accion: 'siguiente' });
  assert.deepEqual(parseCommand('¿Cuánto falta?'), { type: 'cocina', accion: 'faltan' });
});

test('chiste de Fede: "¿qué?" después de llamarlo remata, y solo una vez', async () => {
  const { remateFede } = await import('../src/services/fede.js');
  const { normalize } = await import('../src/services/commands.js');
  assert.equal(remateFede(normalize('¿Qué?')), null); // sin llamado previo no hace nada
});
