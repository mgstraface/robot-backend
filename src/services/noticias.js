// Noticias de Newell's desde Google Noticias (RSS público, gratis y sin clave).
const URL_RSS = 'https://news.google.com/rss/search?q=%22Newell%27s%22&hl=es-419&gl=AR&ceid=AR:es-419';
const CACHE_MS = 30 * 60 * 1000;
let cache = { at: 0, items: [] };
let next = 0;

const decode = (s) =>
  String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

/** Lee los <item> del RSS. Pura, para testear. */
export function parseRss(xml) {
  const items = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const get = (tag) => decode(m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]);
    let title = get('title');
    const source = get('source');
    // Google agrega " - Medio" al final del título
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const date = Date.parse(get('pubDate'));
    if (title) items.push({ title, source, date: Number.isFinite(date) ? date : 0 });
  }
  return items.sort((a, b) => b.date - a.date);
}

export async function newellsNews(now = Date.now()) {
  if (now - cache.at > CACHE_MS || !cache.items.length) {
    const res = await fetch(URL_RSS, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Google Noticias respondió ${res.status}`);
    cache = { at: now, items: parseRss(await res.text()).slice(0, 8) };
    next = 0;
  }
  if (!cache.items.length) return null;
  // cada vez que le pedís, la siguiente
  const item = cache.items[next % cache.items.length];
  next++;
  return item;
}
