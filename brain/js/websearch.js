// ARIA BRAIN · websearch.js
// Búsqueda por internet SIN claves, directo desde el navegador:
//   · Wikipedia (español, luego inglés)      · DuckDuckGo Instant Answer
//   · Open-Meteo (clima y ubicaciones)
// Limitación honesta: un navegador no puede leer cualquier página web (CORS), así que para
// temas que cambian a cada rato (noticias, cotizaciones) ARIA ofrece abrir la búsqueda en un clic.

import { CONFIG } from "./config.js";
import { fold, tokens } from "./text.js";

const cache = new Map();

async function getJSON(url, ms = CONFIG.search.timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally { clearTimeout(timer); }
}

export function shorten(text, max = 420) {
    text = String(text ?? "").replace(/\s+/g, " ").replace(/\s*\([^)]*\)/g, (m) => m.length > 40 ? "" : m).trim();
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
    return (end > max * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…");
}

// ---------------------------------------------------------------- extracción de la consulta
const LEADS = /^(?:(?:por favor|porfa|aria)[, ]*)?(?:buscame|busca|googlea|googleame|investiga|investigame|averigua|averiguame|fijate|quiero saber|necesito saber|me podes decir|podes decirme|decime|contame|cuentame|explicame|explica|hablame de|hablame sobre)\s+/;
const TAIL_SRC = /\b(?:en|por|a traves de)\s+(?:internet|google|la web|wikipedia|el navegador|linea)\b/g;
const QUESTION_RE = /\b(?:que es|que son|que significa|que quiere decir|quien es|quien fue|quienes fueron|quienes son|cuando (?:fue|nacio|murio|se fundo|se creo|empezo|termino)|donde (?:queda|esta|nacio|se encuentra)|como se llama|de que trata|para que sirve|como funciona|que paso (?:con|en)|que pasa (?:con|en))\s+(.+)$/;
// Preguntas donde la palabra clave también importa para buscar bien.
const FULL_QUESTIONS = [
    [/\bcuantos habitantes tiene\s+(.+)$/, (s) => `población de ${s}`],
    [/\bcual es (?:la|el)\s+((?:capital|moneda|idioma|significado|origen|historia|diferencia|distancia|altura|superficie)\b.*)$/, (s) => s]
];

// Devuelve el tema a buscar (con tildes originales) o null.
export function extractLookupQuery(message) {
    const text = String(message ?? "").trim();
    if (!text) return null;
    const f = fold(text);
    const clean = (s) => s.replace(TAIL_SRC, " ").replace(/^(?:sobre|acerca de|de|del|el tema de|la palabra)\s+/i, "")
        .replace(/^(?:el|la|los|las|un|una)\s+/i, "").replace(/[?!¿¡.\s]+$/g, "").replace(/\s+/g, " ").trim();

    const lead = f.match(LEADS);
    if (lead) {
        const rest = text.slice(lead[0].length);
        const inner = fold(rest).match(QUESTION_RE);
        const q = clean(inner ? rest.slice(rest.length - inner[1].length) : rest);
        return q.length >= 2 ? q : null;
    }
    for (const [re, build] of FULL_QUESTIONS) {
        const fm = f.match(re);
        if (fm) return build(clean(text.slice(text.length - fm[1].length)));
    }
    const m = f.match(QUESTION_RE);
    if (m) {
        const q = clean(text.slice(text.length - m[1].length));
        return q.length >= 2 ? q : null;
    }
    return null;
}

export function isExplicitSearch(message) {
    const f = fold(message);
    return /\b(busca\w*|googlea\w*|investiga\w*|averigua\w*|fijate)\b.*\b(internet|google|web|online|wikipedia|linea)\b/.test(f)
        || /^(?:(?:por favor|porfa|aria)[, ]*)?(buscame|busca|googlea|googleame|investiga|investigame|averigua|averiguame)\b/.test(f);
}

// ¿Parece una pregunta de información general (no una charla personal)?
export function isInfoQuestion(message) {
    if (extractLookupQuery(message)) return true;
    const f = fold(message);
    const personal = /\b(me|mi|mis|vos|tu|tus|te|nosotras?|conmigo|contigo|deje|guarde|puse|perdi|olvide|anote|dije)\b/.test(f);
    const interrogative = /^(?:que|quien|quienes|cuando|donde|como|cual|cuales|cuanto|cuanta|cuantos|cuantas|por que|para que)\b/.test(f);
    return interrogative && !personal && f.split(" ").length >= 3;
}

// Temas que cambian cada minuto: no hay fuente en vivo sin claves → se ofrecen enlaces.
export function isLiveTopic(message) {
    return /\b(noticias?|ultimas noticias|dolar|cotizacion|euro|bitcoin|resultado|resultados|partido|marcador|horario de|trafico|transito|loteria|quiniela)\b/.test(fold(message));
}

export function searchLinks(query) {
    const q = encodeURIComponent(query);
    return [
        { label: "Buscar en Google", url: `https://www.google.com/search?q=${q}` },
        { label: "Buscar en DuckDuckGo", url: `https://duckduckgo.com/?q=${q}` }
    ];
}

// ---------------------------------------------------------------- Wikipedia
async function searchWikipedia(query, lang) {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search` +
        `&gsrsearch=${encodeURIComponent(query)}&gsrlimit=4&prop=extracts%7Cinfo&exintro=1&explaintext=1` +
        `&exchars=900&exlimit=4&inprop=url&redirects=1`;
    const data = await getJSON(url);
    const pages = Object.values(data?.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    const qTokens = new Set(tokens(query));
    const usable = pages.filter(p => p.extract && !/puede referirse a|may refer to|hace referencia a:?$/i.test(p.extract.slice(0, 200)));
    // prioriza páginas cuyo título comparte palabras con la consulta
    usable.sort((a, b) => {
        const sa = tokens(a.title).filter(t => qTokens.has(t)).length;
        const sb = tokens(b.title).filter(t => qTokens.has(t)).length;
        return sb - sa || (a.index ?? 99) - (b.index ?? 99);
    });
    return usable.map(p => ({
        title: p.title, extract: p.extract, url: p.fullurl || `https://${lang}.wikipedia.org/?curid=${p.pageid}`,
        source: lang === "es" ? "Wikipedia" : "Wikipedia (en inglés)"
    }));
}

// ---------------------------------------------------------------- DuckDuckGo
async function searchDuckDuckGo(query) {
    const data = await getJSON(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=aria`);
    const out = [];
    if (data.AbstractText) out.push({ title: data.Heading || query, extract: data.AbstractText, url: data.AbstractURL, source: "DuckDuckGo" });
    else if (data.Answer) out.push({ title: query, extract: String(data.Answer), url: "", source: "DuckDuckGo" });
    else if (data.Definition) out.push({ title: data.Heading || query, extract: data.Definition, url: data.DefinitionURL, source: "DuckDuckGo" });
    for (const t of (data.RelatedTopics || []).slice(0, 3)) {
        if (t.Text && !out.length) out.push({ title: query, extract: t.Text, url: t.FirstURL, source: "DuckDuckGo" });
    }
    return out;
}

// Búsqueda principal. Devuelve { ok, query, results, offline }
export async function webSearch(query) {
    query = String(query ?? "").trim();
    if (!query) return { ok: false, query, results: [] };
    if (cache.has(query)) return cache.get(query);

    let results = [], failures = 0, attempts = 0;
    const attempt = async (fn) => {
        attempts++;
        try { return await fn(); } catch (_) { failures++; return []; }
    };

    for (const lang of CONFIG.search.languages) {
        results = await attempt(() => searchWikipedia(query, lang));
        if (results.length) break;
    }
    if (!results.length) results = await attempt(() => searchDuckDuckGo(query));

    const out = { ok: results.length > 0, query, results: results.slice(0, 3), offline: failures === attempts && attempts > 0 };
    if (out.ok) { cache.set(query, out); if (cache.size > 40) cache.delete(cache.keys().next().value); }
    return out;
}

// ---------------------------------------------------------------- clima
const WMO = {
    0: "despejado", 1: "mayormente despejado", 2: "algo nublado", 3: "nublado", 45: "con niebla", 48: "con niebla",
    51: "con llovizna", 53: "con llovizna", 55: "con llovizna fuerte", 56: "con llovizna helada", 57: "con llovizna helada",
    61: "con lluvia débil", 63: "con lluvia", 65: "con lluvia fuerte", 66: "con lluvia helada", 67: "con lluvia helada",
    71: "con nevadas débiles", 73: "con nevadas", 75: "con nevadas fuertes", 77: "con nieve granulada",
    80: "con chubascos", 81: "con chubascos", 82: "con chubascos fuertes", 85: "con chubascos de nieve", 86: "con chubascos de nieve",
    95: "con tormenta", 96: "con tormenta y granizo", 99: "con tormenta y granizo"
};
export const describeWeather = (code) => WMO[code] ?? "variable";

export async function getWeather(place = null) {
    let { name, lat, lon } = CONFIG.location;
    if (place) {
        const geo = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=es&format=json`);
        const hit = geo?.results?.[0];
        if (!hit) return { found: false, place };
        ({ name, latitude: lat, longitude: lon } = { name: hit.name, latitude: hit.latitude, longitude: hit.longitude });
    }
    const data = await getJSON(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=2`);
    const c = data.current, d = data.daily;
    return {
        found: true, place: name,
        now: { temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), humidity: c.relative_humidity_2m, wind: Math.round(c.wind_speed_10m), text: describeWeather(c.weather_code) },
        today: { max: Math.round(d.temperature_2m_max[0]), min: Math.round(d.temperature_2m_min[0]), rain: d.precipitation_probability_max[0], text: describeWeather(d.weather_code[0]) },
        tomorrow: { max: Math.round(d.temperature_2m_max[1]), min: Math.round(d.temperature_2m_min[1]), rain: d.precipitation_probability_max[1], text: describeWeather(d.weather_code[1]) }
    };
}
