process.env.MONGO_URI ||= 'mongodb://127.0.0.1:27017/robot-test';
process.env.ADMIN_TOKEN ||= 'test-admin';
process.env.DEVICE_TOKEN ||= 'test-device';

import assert from 'node:assert/strict';
import { test } from 'node:test';

const { isSleepHour, localParts, zonedToUtc, startOfLocalDay } = await import('../src/time.js');
const { parseICS, occurrencesBetween, parseIcsDate } = await import('../src/services/ics.js');
const { weatherCategory, describeWeather } = await import('../src/services/weather.js');
const { sanitizeSettings, publicSettings, withDefaults } = await import('../src/models/Settings.js');
const { planScares, shouldRemind } = await import('../src/services/scheduler.js');
const { briefingInstruction } = await import('../src/services/routines.js');

const TZ = 'America/Argentina/Buenos_Aires';

test('zonedToUtc y localParts son inversas (Argentina, UTC-3)', () => {
  const ts = zonedToUtc(2026, 10, 29, 10, 30, 0, TZ);
  assert.equal(new Date(ts).toISOString(), '2026-10-29T13:30:00.000Z');
  const p = localParts(ts, TZ);
  assert.deepEqual([p.year, p.month, p.day, p.hour, p.minute, p.weekday], [2026, 10, 29, 10, 30, 4]);
  assert.equal(new Date(startOfLocalDay(ts, TZ)).toISOString(), '2026-10-29T03:00:00.000Z');
});

test('isSleepHour con rangos normales y que cruzan medianoche', () => {
  assert.equal(isSleepHour(3, 0, 7), true);
  assert.equal(isSleepHour(7, 0, 7), false);
  assert.equal(isSleepHour(23, 22, 7), true);
  assert.equal(isSleepHour(6, 22, 7), true);
  assert.equal(isSleepHour(12, 22, 7), false);
  assert.equal(isSleepHour(5, 3, 3), false);
});

test('parseIcsDate: UTC, TZID y fecha sola', () => {
  assert.equal(new Date(parseIcsDate('20261029T130000Z').ts).toISOString(), '2026-10-29T13:00:00.000Z');
  assert.equal(new Date(parseIcsDate('20261029T100000', { TZID: TZ }).ts).toISOString(), '2026-10-29T13:00:00.000Z');
  const allDay = parseIcsDate('20261029', { VALUE: 'DATE' }, TZ);
  assert.equal(allDay.allDay, true);
});

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:daily-1
SUMMARY:Daily de
  objetivos
DTSTART;TZID=America/Argentina/Buenos_Aires:20261026T093000
DTEND;TZID=America/Argentina/Buenos_Aires:20261026T094500
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
EXDATE;TZID=America/Argentina/Buenos_Aires:20261028T093000
END:VEVENT
BEGIN:VEVENT
UID:daily-1
RECURRENCE-ID;TZID=America/Argentina/Buenos_Aires:20261029T093000
SUMMARY:Daily (movida)
DTSTART;TZID=America/Argentina/Buenos_Aires:20261029T110000
DTEND;TZID=America/Argentina/Buenos_Aires:20261029T111500
END:VEVENT
BEGIN:VEVENT
UID:once
SUMMARY:Dentista
DTSTART:20261030T180000Z
DTEND:20261030T190000Z
END:VEVENT
BEGIN:VEVENT
UID:cancelada
STATUS:CANCELLED
SUMMARY:No va
DTSTART:20261030T150000Z
END:VEVENT
BEGIN:VEVENT
UID:cada-dos
SUMMARY:Riego
DTSTART:20261026T120000Z
RRULE:FREQ=DAILY;INTERVAL=2;COUNT=3
END:VEVENT
END:VCALENDAR`;

test('occurrencesBetween expande repeticiones, respeta EXDATE, excepciones y cancelados', () => {
  const events = parseICS(ICS, TZ);
  const from = zonedToUtc(2026, 10, 26, 0, 0, 0, TZ);
  const to = zonedToUtc(2026, 11, 2, 0, 0, 0, TZ);
  const occ = occurrencesBetween(events, from, to, TZ);
  const fmt = (e) => `${new Date(e.start).toISOString().slice(0, 16)} ${e.summary}`;
  assert.deepEqual(occ.map(fmt), [
    '2026-10-26T12:00 Riego',
    '2026-10-26T12:30 Daily de objetivos',
    '2026-10-27T12:30 Daily de objetivos',
    // miércoles 28: excluido por EXDATE
    '2026-10-28T12:00 Riego',
    '2026-10-29T14:00 Daily (movida)', // excepción reemplaza a la de las 9:30
    '2026-10-30T12:00 Riego',
    '2026-10-30T12:30 Daily de objetivos',
    '2026-10-30T18:00 Dentista',
    // sábado y domingo no hay daily; Riego llegó a COUNT=3
  ]);
  const daily = occ.find((e) => e.summary === 'Daily de objetivos');
  assert.equal(daily.end - daily.start, 15 * 60 * 1000);
});

test('weatherCategory y describeWeather', () => {
  assert.equal(weatherCategory(0), 'despejado');
  assert.equal(weatherCategory(3), 'nublado');
  assert.equal(weatherCategory(63), 'lluvia');
  assert.equal(weatherCategory(81), 'lluvia');
  assert.equal(weatherCategory(95), 'tormenta');
  assert.equal(weatherCategory(45), 'niebla');
  const d = describeWeather({ temp: 22, category: 'lluvia', max: 25, min: 15, rainProb: 70 });
  assert.match(d, /22°C y con lluvia/);
  assert.match(d, /70% de probabilidad/);
});

test('sanitizeSettings valida y rechaza valores malos', () => {
  const ok = sanitizeSettings({
    sleepFrom: 23,
    sleepTo: 7,
    scaresPerDay: 3,
    calendarUrl: 'webcal://calendar.google.com/x/basic.ics',
    city: { name: 'Córdoba', lat: -31.4, lon: -64.18 },
    timezone: 'America/Argentina/Cordoba',
  });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.update.calendarUrl, 'https://calendar.google.com/x/basic.ics');
  const bad = sanitizeSettings({ sleepFrom: 25, scaresPerDay: 10, calendarUrl: 'http://inseguro', timezone: 'Marte/Base' });
  assert.deepEqual(bad.errors.sort(), ['calendarUrl', 'scaresPerDay', 'sleepFrom', 'timezone']);
});

test('publicSettings no expone la URL del calendario', () => {
  const pub = publicSettings(withDefaults({ calendarUrl: 'https://calendar.google.com/calendar/ical/secreto123/basic.ics' }));
  assert.equal(pub.calendarUrl, undefined);
  assert.equal(pub.hasCalendar, true);
  assert.doesNotMatch(pub.calendarPreview, /secreto123/);
});

test('planScares reparte sustos solo en horas despierto', () => {
  const dayStart = zonedToUtc(2026, 10, 29, 0, 0, 0, TZ);
  let i = 0;
  const seq = [0.01, 0.5, 0.99, 0.2, 0.7, 0.3];
  const times = planScares(3, dayStart, 0, 7, () => seq[i++ % seq.length]);
  assert.equal(times.length, 3);
  for (const t of times) assert.equal(isSleepHour(localParts(t, TZ).hour, 0, 7), false);
  assert.deepEqual(planScares(0, dayStart, 0, 7), []);
});

test('shouldRemind avisa dentro de la ventana y no después de empezado', () => {
  const now = Date.UTC(2026, 9, 29, 12, 0);
  assert.equal(shouldRemind(now, now + 9 * 60000, 10), true);
  assert.equal(shouldRemind(now, now + 11 * 60000, 10), false);
  assert.equal(shouldRemind(now, now - 60000, 10), false);
});

test('briefingInstruction arma el contexto del saludo', () => {
  const start = zonedToUtc(2026, 10, 29, 9, 30, 0, TZ);
  const text = briefingInstruction({
    owner: 'Mati',
    hour: 8,
    timeText: '08:05',
    weatherText: '18°C y despejado',
    cityName: 'Rosario',
    events: [{ start, summary: 'Daily' }],
    tz: TZ,
  });
  assert.match(text, /es la mañana/);
  assert.match(text, /Saludá a Mati/);
  assert.match(text, /En Rosario está 18°C y despejado/);
  assert.match(text, /09:30 Daily/);
});

test('isJpeg reconoce JPEG por sus primeros bytes', async () => {
  const { isJpeg } = await import('../src/models/Photo.js');
  assert.equal(isJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), true);
  assert.equal(isJpeg(Buffer.from('<svg></svg>')), false);
  assert.equal(isJpeg('no es buffer'), false);
});

test('sanitizeSettings valida el portarretrato', () => {
  const ok = sanitizeSettings({ frameEnabled: true, frameFaceSec: 45, framePhotoSec: 8 });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.update, { frameEnabled: true, frameFaceSec: 45, framePhotoSec: 8 });
  const bad = sanitizeSettings({ frameEnabled: 'si', framePhotoSec: 1 });
  assert.deepEqual(bad.errors.sort(), ['frameEnabled', 'framePhotoSec']);
});
