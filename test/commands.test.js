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
