// ARIA BRAIN · skills.js
// Habilidades que usan internet o el reloj del equipo: hora, fecha, clima, música y videos.
// Se consultan ANTES del modelo local, para que ARIA nunca invente la hora ni el clima.

import { CONFIG } from "./config.js";
import { checkHealthSafety } from "./safety.js";

// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------

// Minúsculas, sin tildes ni signos: "¿Qué hora es?" -> "que hora es"
function normalize(text) {
    return String(text)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[¿?¡!.,;:"]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const YOUTUBE_ID = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/i;

function decodeEntities(text) {
    const box = document.createElement("textarea");
    box.innerHTML = text;
    return box.value;
}

async function fetchJSON(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

const YT_KEY_STORAGE = "aria_youtube_key";

function getYouTubeKey() {
    if (CONFIG.youtube?.apiKey) return CONFIG.youtube.apiKey;
    try { return localStorage.getItem(YT_KEY_STORAGE) || ""; } catch (_) { return ""; }
}

const NO_INTERNET =
    "No pude conectarme a internet en este momento. Revisá la conexión y probamos de nuevo.";

// ---------------------------------------------------------------
// Reconocimiento de pedidos (no necesita internet, se puede probar solo)
// ---------------------------------------------------------------

const MEDIA_WORDS = /\b(musica|cancion|canciones|tema|video|videos|clip|youtube)\b/;

export function parseRequest(message) {
    const raw = String(message || "");
    const t = normalize(raw);
    if (!t) return null;

    // 1) Un enlace de YouTube pegado: se reproduce directo.
    const link = raw.match(YOUTUBE_ID);
    if (link) return { type: "media-play", videoId: link[1], kind: "video", query: "" };

    // 2) Detener la reproducción.
    if (/^(para|parar|pausa|pausar|deten|detene|detener|apaga|apagar|cierra|cerrar|saca|quita|sacar|quitar|cortar|corta)\b/.test(t)
        && /\b(musica|video|videos|cancion|reproduccion|todo|youtube)\b/.test(t)) {
        return { type: "media-stop" };
    }

    // 3) Reproducir música o video.
    const play = t.match(/^(?:(?:por favor|aria|oye|ey)\s+)*(pon|pone|poneme|ponme|poner|reproduci|reproduce|reproducime|reproducir|toca|tocame|tocar|pasame|pasa|mostrame|muestrame|mostra|busca|buscame)\s+(.+)$/);
    if (play) {
        const verb = play[1];
        let rest = play[2];
        const strongVerb = /^(reproduc|toca|pasame)/.test(verb);
        if (strongVerb || MEDIA_WORDS.test(rest)) {
            const kind = /\b(video|videos|clip)\b/.test(rest) ? "video" : "music";
            rest = rest
                .replace(/\ben youtube\b/g, " ")
                .replace(/^(?:(?:un|una|el|la|los|las|algo|algun|alguna)\s+)*(?:video|videos|clip|musica|cancion|canciones|tema)\b\s*(?:de|del|sobre|para)?\s*/, "")
                .replace(/^algo\s+(?:de|del)\s+/, "")
                .replace(/\s+/g, " ")
                .trim();
            return { type: "media-play", kind, query: rest, videoId: null };
        }
    }

    // 3b) Clave de YouTube (se guarda solo en este navegador).
    const keyMatch = raw.match(/clave\s+(?:de|para)\s+youtube\W+(AIza[\w-]{20,})/i);
    if (keyMatch) return { type: "yt-key", key: keyMatch[1] };

    // 3c) Activar o apagar la IA generativa del navegador.
    if (/^(?:por favor )?(activ\w*|prend\w*|encend\w*|habilit\w*)\b.*\b(ia|inteligencia|modo inteligente|cerebro generativo)\b/.test(t)) return { type: "ai-on" };
    if (/^(?:por favor )?(desactiv\w*|apag\w*|deshabilit\w*)\b.*\b(ia|inteligencia|modo inteligente|cerebro generativo)\b/.test(t)) return { type: "ai-off" };

    // 3d) Búsqueda explícita en internet.
    const search = t.match(/^(?:por favor )?(?:busca|buscame|investiga|investigame|averigua|averiguame)\s+(?:en\s+)?(?:wikipedia|internet|la web|google)?\s*(?:sobre|acerca de|de)?\s*(.{2,80})$/);
    if (search && !MEDIA_WORDS.test(search[1])) return { type: "lookup", query: cleanQuery(search[1]) };

    // 4) Clima.
    if (/\b(clima|pronostico|temperatura|llover|llueve|llovera|lluvia|hace frio|hace calor|que tiempo hace|tiempo (?:hace|en|de hoy|para|manana))\b/.test(t)) {
        const tomorrow = /\bmanana\b/.test(t);
        const clean = t
            .replace(/\b(hoy|manana|ahora|esta tarde|esta noche|actual|actualmente|por favor)\b/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        let city = null;
        const a = clean.match(/\b(?:en|para)\s+([a-z ]{2,40})$/);
        const b = clean.match(/\b(?:clima|tiempo|temperatura|pronostico)\s+de\s+([a-z ]{2,40})$/);
        if (a) city = a[1].trim();
        else if (b) city = b[1].trim();
        if (city && /^(mi ciudad|aqui|aca|casa|mi casa|la zona|mi zona|la ciudad|el exterior|la calle)$/.test(city)) city = null;
        return { type: "weather", city, tomorrow };
    }

    // 5) Hora y fecha.
    if (/\b(que hora es|la hora|hora es|hora tenemos|me decis la hora|dime la hora)\b/.test(t)) return { type: "time" };
    if (/\b(que fecha es|que dia es|fecha de hoy|dia de hoy|que dia estamos|a cuanto estamos)\b/.test(t)) return { type: "date" };

    return null;
}

// ---------------------------------------------------------------
// Hora y fecha (del reloj de la computadora, sin internet)
// ---------------------------------------------------------------

function answerTime() {
    const tz = CONFIG.location?.timezone;
    const time = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
    return `Son las ${time}.`;
}

function answerDate() {
    const tz = CONFIG.location?.timezone;
    const date = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz });
    return `Hoy es ${date}.`;
}

// ---------------------------------------------------------------
// Clima (Open-Meteo: gratis, sin clave)
// ---------------------------------------------------------------

const WEATHER_CODES = {
    0: "cielo despejado", 1: "mayormente despejado", 2: "parcialmente nublado", 3: "nublado",
    45: "niebla", 48: "niebla con escarcha",
    51: "llovizna leve", 53: "llovizna", 55: "llovizna intensa", 56: "llovizna helada", 57: "llovizna helada intensa",
    61: "lluvia débil", 63: "lluvia moderada", 65: "lluvia fuerte", 66: "lluvia helada", 67: "lluvia helada fuerte",
    71: "nevada leve", 73: "nevada", 75: "nevada fuerte", 77: "granizo fino",
    80: "chubascos leves", 81: "chubascos", 82: "chubascos fuertes", 85: "chubascos de nieve", 86: "chubascos de nieve fuertes",
    95: "tormenta", 96: "tormenta con granizo", 99: "tormenta fuerte con granizo"
};

async function findPlace(city) {
    if (!city) return { ...CONFIG.location };
    const url = "https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&format=json&name=" + encodeURIComponent(city);
    const data = await fetchJSON(url);
    const hit = data?.results?.[0];
    if (!hit) return null;
    return {
        name: hit.name,
        lat: hit.latitude,
        lon: hit.longitude,
        timezone: hit.timezone || "auto"
    };
}

async function answerWeather({ city, tomorrow }) {
    let place;
    try {
        place = await findPlace(city);
    } catch (_) {
        return NO_INTERNET;
    }
    if (!place) return `No encontré una ciudad llamada "${city}". ¿Me la decís de otra forma?`;

    const url = "https://api.open-meteo.com/v1/forecast"
        + `?latitude=${place.lat}&longitude=${place.lon}`
        + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m"
        + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
        + "&timezone=auto&forecast_days=2";

    let data;
    try {
        data = await fetchJSON(url);
    } catch (_) {
        return NO_INTERNET;
    }

    const round = (n) => Math.round(Number(n));
    const describe = (code) => WEATHER_CODES[code] || "condiciones variables";
    const daily = data.daily;

    if (tomorrow && daily?.time?.length > 1) {
        const rain = daily.precipitation_probability_max?.[1];
        return `Mañana en ${place.name} se espera ${describe(daily.weather_code[1])}, `
            + `con máxima de ${round(daily.temperature_2m_max[1])} grados y mínima de ${round(daily.temperature_2m_min[1])}`
            + (Number.isFinite(rain) ? `. La probabilidad de lluvia es del ${round(rain)} por ciento.` : ".");
    }

    const now = data.current;
    let text = `En ${place.name} ahora hay ${round(now.temperature_2m)} grados`;
    if (Math.abs(now.apparent_temperature - now.temperature_2m) >= 2) {
        text += `, con sensación térmica de ${round(now.apparent_temperature)}`;
    }
    text += `, ${describe(now.weather_code)}, humedad del ${round(now.relative_humidity_2m)} por ciento`
        + ` y viento de ${round(now.wind_speed_10m)} kilómetros por hora.`;

    if (daily?.time?.length) {
        const rain = daily.precipitation_probability_max?.[0];
        text += ` Hoy la máxima es de ${round(daily.temperature_2m_max[0])} y la mínima de ${round(daily.temperature_2m_min[0])}`
            + (Number.isFinite(rain) ? `, con ${round(rain)} por ciento de probabilidad de lluvia.` : ".");
    }
    return text;
}

// ---------------------------------------------------------------
// Música y videos (se reproducen en el holograma con YouTube)
// ---------------------------------------------------------------

async function searchYouTube(query) {
    const key = getYouTubeKey();
    if (!key) return null;
    const url = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1"
        + "&videoEmbeddable=true&safeSearch=moderate"
        + "&q=" + encodeURIComponent(query)
        + "&key=" + encodeURIComponent(key);
    const data = await fetchJSON(url);
    const item = data?.items?.[0];
    if (!item?.id?.videoId) return { notFound: true };
    return { videoId: item.id.videoId, title: decodeEntities(item.snippet?.title || query) };
}

async function answerMedia(req, ctx) {
    if (req.type === "media-stop") {
        ctx.sendToHologram("MEDIA", { action: "stop" });
        return "Listo, detuve la reproducción.";
    }

    if (!ctx.hologramConnected) {
        return "Para reproducir música o videos necesito el holograma abierto. Abrilo en otra pestaña y volvé a pedírmelo.";
    }

    // Enlace de YouTube pegado: no hace falta buscar.
    if (req.videoId) {
        ctx.sendToHologram("MEDIA", { action: "play", videoId: req.videoId, title: "", kind: req.kind });
        return "Reproduciendo el video.";
    }

    const query = req.query || (req.kind === "video" ? "videos relajantes" : "música relajante");
    const searchText = req.kind === "music" && req.query ? `${query} audio` : query;

    let found;
    try {
        found = await searchYouTube(searchText);
    } catch (_) {
        return NO_INTERNET;
    }

    // Sin clave de YouTube: se le deja al usuario un botón con la búsqueda lista.
    if (found === null) {
        ctx.sendToHologram("MEDIA", {
            action: "search",
            query,
            url: "https://www.youtube.com/results?search_query=" + encodeURIComponent(searchText)
        });
        return `Te dejé en pantalla la búsqueda de ${query} en YouTube. Tocá el botón para abrirla. Si querés que lo reproduzca sola, decime: clave de youtube, y pegá tu clave.`;
    }
    if (found.notFound) return `No encontré resultados para ${query}.`;

    ctx.sendToHologram("MEDIA", { action: "play", videoId: found.videoId, title: found.title, kind: req.kind });
    return req.kind === "video"
        ? `Reproduciendo el video: ${found.title}.`
        : `Reproduciendo ${found.title}.`;
}

// ---------------------------------------------------------------
// Búsqueda en internet (Wikipedia en español: gratis, sin clave)
// ---------------------------------------------------------------

function cleanQuery(text) {
    return String(text)
        .replace(/^(?:el|la|los|las|un|una|unos|unas)\s+/, "")
        .replace(/\s+/g, " ")
        .trim();
}

// "¿Qué es la hipertensión?", "¿Quién fue Borges?", "Contame sobre los Andes" -> consulta o null.
// No ejecuta nada: el cerebro la usa solo si no hay conocimiento propio ni IA generativa.
export function extractLookupQuery(message) {
    const t = normalize(message);
    const m =
        t.match(/^(?:(?:y|entonces|oye|dime|decime)\s+)?(?:que|quien|quienes|cual|cuales)\s+(?:es|son|fue|fueron|era|eran)\s+(.{2,80})$/) ||
        t.match(/^que significa\s+(.{2,80})$/) ||
        t.match(/^(?:contame|cuentame|hablame|decime|dime)\s+(?:algo\s+)?(?:sobre|de|acerca de)\s+(.{2,80})$/);
    return m ? cleanQuery(m[1]) : null;
}

function shorten(text, maxChars = 420) {
    const clean = String(text).replace(/\([^)]*\)/g, "").replace(/\s+([.,;:])/g, "$1").replace(/\s+/g, " ").trim();
    if (clean.length <= maxChars) return clean;
    const cut = clean.slice(0, maxChars);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
    return (end > 120 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…");
}

// Devuelve el texto de respuesta, "" si no hay resultados, o null si no hay conexión.
export async function wikiLookup(query) {
    const url = "https://es.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1"
        + "&generator=search&gsrlimit=1&prop=extracts&exintro=1&explaintext=1&exsentences=3"
        + "&gsrsearch=" + encodeURIComponent(query);
    let data;
    try {
        data = await fetchJSON(url);
    } catch (_) {
        return null;
    }
    const page = Object.values(data?.query?.pages || {})
        .sort((a, b) => (a.index || 0) - (b.index || 0))[0];
    if (!page?.extract) return "";
    return `${shorten(page.extract)} Fuente: Wikipedia, artículo «${page.title}».`;
}

async function answerLookup(req) {
    const result = await wikiLookup(req.query);
    if (result === null) return NO_INTERNET;
    if (result === "") return `No encontré información sobre ${req.query}. ¿Querés que la busque con otras palabras?`;
    return result;
}

async function answerAI(on, ctx) {
    const ai = ctx.ai;
    if (!ai) return "La IA generativa no está disponible en esta versión.";
    if (!on) {
        ai.disable();
        return "Listo, apagué la IA generativa. Sigo ayudándote con lo que ya sé y con búsquedas.";
    }
    if (!ai.supported) {
        return "Este navegador no tiene WebGPU, que hace falta para la IA generativa. Probá con Chrome o Edge actualizados.";
    }
    if (ai.ready) return "La IA generativa ya está activa.";
    ai.enable()
        .then(() => ctx.announce?.("Ya estoy lista. Ahora puedo conversar con vos sobre muchos más temas."))
        .catch(() => ctx.announce?.("No pude cargar la IA generativa. Probá de nuevo más tarde."));
    return "Voy a descargar mi cerebro generativo, unos trescientos megas, solo esta primera vez. Te aviso cuando termine.";
}

function answerYouTubeKey(req) {
    try {
        localStorage.setItem(YT_KEY_STORAGE, req.key);
    } catch (_) {
        return "No pude guardar la clave en este navegador.";
    }
    return "Listo, guardé la clave de YouTube solo en este navegador. Ya puedo buscar música y videos.";
}

// ---------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------

// Devuelve el texto de la respuesta, o null si el mensaje no es para una habilidad.
export async function runSkills(message, ctx) {
    if (typeof message !== "string") return null;

    // La seguridad de salud siempre va primero.
    if (checkHealthSafety(message).urgent) return null;

    const req = parseRequest(message);
    if (!req) return null;

    switch (req.type) {
        case "time": return answerTime();
        case "date": return answerDate();
        case "weather": return answerWeather(req);
        case "media-play":
        case "media-stop": return answerMedia(req, ctx);
        case "lookup": return answerLookup(req);
        case "ai-on": return answerAI(true, ctx);
        case "ai-off": return answerAI(false, ctx);
        case "yt-key": return answerYouTubeKey(req);
        default: return null;
    }
}
