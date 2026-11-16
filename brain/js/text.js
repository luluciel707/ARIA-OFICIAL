// ARIA BRAIN · text.js
// Utilidades de texto compartidas (normalización, tokens, plantillas).

// Pasa a minúsculas y quita tildes SIN cambiar el largo del texto
// (así se pueden usar índices del texto plegado sobre el original).
export function fold(s) {
    return String(s ?? "").normalize("NFC").toLowerCase()
        .replace(/[áàäâ]/g, "a").replace(/[éèëê]/g, "e").replace(/[íìïî]/g, "i")
        .replace(/[óòöô]/g, "o").replace(/[úùüû]/g, "u").replace(/ñ/g, "n");
}

// Normalización "de búsqueda": sin tildes, sin signos, espacios simples.
export function norm(s) {
    return fold(s).replace(/[¿?¡!.,;:()"“”«»\[\]{}]/g, " ").replace(/\s+/g, " ").trim();
}

const STOP = new Set((
    "de la el los las un una unos unas y o a en por con para que se me te mi tu su al del lo es son soy sos " +
    "eres fue ser esta este eso esa ese como mas muy ya si no pero cual cuales cuanto cuanta cuantos cuantas " +
    "quien quienes donde cuando tiene tienen hay puedo puedes podes sobre dime decime contame cuentame quiero " +
    "hablame tengo tener hacer hace nos le les ni sin mis tus sus uno dos aria vos vas va voy"
).split(" "));

const SUFFIXES = ["amiento", "imiento", "aciones", "uciones", "acion", "ucion", "idades", "mente",
    "adores", "adora", "ador", "ancia", "encia", "idad", "ando", "iendo", "ados", "adas", "idos",
    "idas", "ado", "ada", "ido", "ida", "ar", "er", "ir", "es", "s"];

export function stem(w) {
    if (w.length <= 3) return w;
    for (const suf of SUFFIXES) {
        if (w.endsWith(suf) && w.length - suf.length >= 3) return w.slice(0, -suf.length);
    }
    return w;
}

export function tokens(s, { keepStop = false } = {}) {
    return norm(s).split(" ").filter(Boolean)
        .filter(w => keepStop || !STOP.has(w))
        .map(stem);
}

export function pick(arr, memoKey) {
    if (!arr.length) return "";
    if (memoKey) {
        pick._last = pick._last || {};
        let i = Math.floor(Math.random() * arr.length);
        if (arr.length > 1 && i === pick._last[memoKey]) i = (i + 1) % arr.length;
        pick._last[memoKey] = i;
        return arr[i];
    }
    return arr[Math.floor(Math.random() * arr.length)];
}

export function uid() {
    return (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

// Rellena {n} (nombre) y limpia comas si no hay nombre.
export function fmt(template, name = "") {
    const startsWithName = template.startsWith("{n}");
    let out = template
        .replace(/,\s*\{n\}/g, name ? `, ${name}` : "")
        .replace(/\{n\},?\s*/g, name ? `${name}, ` : "")
        .replace(/\{n\}/g, name || "")
        .replace(/\s+([!?.,])/g, "$1").replace(/\s{2,}/g, " ").trim();
    if (startsWithName && !name) out = out.charAt(0).toUpperCase() + out.slice(1);
    return out;
}

export function capitalize(s) {
    s = String(s ?? "").trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function daypart(date = new Date()) {
    const h = date.getHours();
    if (h >= 5 && h < 12) return "morning";
    if (h >= 12 && h < 20) return "afternoon";
    return "night";
}

// Texto apto para la voz del holograma: sin emojis, enlaces ni marcas.
export function speechText(text) {
    return String(text ?? "")
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, "")
        .replace(/[*_`#>«»]+/g, "")
        .replace(/\s+/g, " ").trim();
}
