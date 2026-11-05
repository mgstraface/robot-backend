// Clima con Open-Meteo (gratis, sin API key).

const CACHE_MS = 15 * 60 * 1000;
let cache = { key: '', at: 0, data: null };

/** Código WMO de Open-Meteo → categoría que entiende la cara del robot. */
export function weatherCategory(code) {
  if (code === 0 || code === 1) return 'despejado';
  if (code === 2) return 'parcial';
  if (code === 3) return 'nublado';
  if (code === 45 || code === 48) return 'niebla';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'lluvia';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'nieve';
  if (code >= 95) return 'tormenta';
  return 'nublado';
}

export const WEATHER_LABELS = {
  despejado: 'despejado',
  parcial: 'parcialmente nublado',
  nublado: 'nublado',
  niebla: 'con niebla',
  lluvia: 'con lluvia',
  nieve: 'con nieve',
  tormenta: 'con tormenta',
};

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`);
  return res.json();
}

/** Clima actual y pronóstico del día para una ubicación. */
export async function getWeather({ lat, lon }, timezone) {
  const key = `${lat},${lon}`;
  if (cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.data;
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,weather_code,is_day' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    `&forecast_days=1&timezone=${encodeURIComponent(timezone || 'auto')}`;
  const d = await getJson(url);
  const code = d.current?.weather_code ?? 3;
  const data = {
    temp: Math.round(d.current?.temperature_2m),
    code,
    category: weatherCategory(code),
    isDay: d.current?.is_day === 1,
    max: Math.round(d.daily?.temperature_2m_max?.[0]),
    min: Math.round(d.daily?.temperature_2m_min?.[0]),
    rainProb: d.daily?.precipitation_probability_max?.[0] ?? null,
  };
  cache = { key, at: Date.now(), data };
  return data;
}

/** Busca ciudades por nombre (para elegir la ubicación desde el panel). */
export async function geocode(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&language=es&format=json`;
  const d = await getJson(url);
  return (d.results || []).map((r) => ({
    name: r.name,
    region: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
    timezone: r.timezone,
  }));
}

export function describeWeather(w) {
  if (!w) return '';
  const parts = [`${w.temp}°C y ${WEATHER_LABELS[w.category] || w.category}`];
  if (Number.isFinite(w.max) && Number.isFinite(w.min)) parts.push(`máxima de ${w.max}° y mínima de ${w.min}°`);
  if (w.rainProb !== null && w.rainProb >= 30) parts.push(`${w.rainProb}% de probabilidad de lluvia`);
  return parts.join(', ');
}
