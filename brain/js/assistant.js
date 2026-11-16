// ARIA BRAIN · assistant.js
// Las habilidades de asistente personal: perfil, recordatorios/alarmas/temporizadores, notas,
// búsqueda en documentos propios, cálculos, clima y búsqueda por internet.
// Cada habilidad devuelve un texto, un objeto { text, actions } o null (si no corresponde).

import { fold, norm, fmt, pick, capitalize } from "./text.js";
import { parseCommand, parseWhen, fmtWhen, fmtDuration, fmtRepeat, fmtClock } from "./reminders.js";
import { webSearch, extractLookupQuery, isExplicitSearch, isLiveTopic, searchLinks, getWeather, shorten } from "./websearch.js";
import { checkRiddle, wrapWeb } from "./smalltalk.js";
import { requestNotifications, unlockAudio } from "./alerts.js";
import { recognizeIntent } from "./intentions.js";

const nameOf = (brain) => brain.profile.displayName;
const say = (variants, brain, key) => fmt(pick(variants, key), nameOf(brain));
const fresh = (obj, ms = 180000) => obj && Date.now() - obj.at < ms;

// ------------------------------------------------------------------ calculadora segura (sin eval)
export function evaluate(expr) {
    const toks = expr.match(/\d+(?:\.\d+)?|[-+*/^()]/g);
    if (!toks || toks.join("").length < expr.replace(/\s/g, "").length) return null;
    const prec = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };
    const out = [], ops = [];
    let prev = null;
    for (let t of toks) {
        if (/\d/.test(t)) { out.push(+t); prev = "n"; }
        else if (t === "(") { ops.push(t); prev = "("; }
        else if (t === ")") { while (ops.length && ops.at(-1) !== "(") out.push(ops.pop()); if (!ops.length) return null; ops.pop(); prev = "n"; }
        else {
            if (t === "-" && (prev === null || prev === "(" || prev === "o")) { out.push(0); }
            while (ops.length && ops.at(-1) !== "(" && (prec[ops.at(-1)] > prec[t] || (prec[ops.at(-1)] === prec[t] && t !== "^"))) out.push(ops.pop());
            ops.push(t); prev = "o";
        }
    }
    while (ops.length) { const o = ops.pop(); if (o === "(") return null; out.push(o); }
    const st = [];
    for (const t of out) {
        if (typeof t === "number") { st.push(t); continue; }
        const b = st.pop(), a = st.pop();
        if (a === undefined || b === undefined) return null;
        st.push(t === "+" ? a + b : t === "-" ? a - b : t === "*" ? a * b : t === "/" ? a / b : a ** b);
    }
    return st.length === 1 && Number.isFinite(st[0]) ? st[0] : null;
}

function calculate(message) {
    let t = fold(message).replace(/(\d),(\d)/g, "$1.$2").replace(/[¿?!¡]/g, " ");
    const asked = /\b(cuanto es|cuanto da|cuanto son|cuanto seria|calcula\w*|resolve\w*|cuanto me da)\b/.test(t);
    const pure = /^[\d\s+\-*/x×÷().%^]+$/.test(t.trim()) && /\d\s*[-+*/x×÷^]\s*\d/.test(t);
    if (!asked && !pure) return null;
    t = t.replace(/\b(cuanto es|cuanto da|cuanto son|cuanto seria|cuanto me da|calcula\w*|resolve\w*|por favor)\b/g, " ").trim();
    let r = null, m;
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:%|por ciento)\s*de\s*(\d+(?:\.\d+)?)/))) r = (+m[1] * +m[2]) / 100;
    else if ((m = t.match(/\braiz(?: cuadrada)? de\s*(\d+(?:\.\d+)?)/))) r = Math.sqrt(+m[1]);
    else if ((m = t.match(/\b(mitad|doble|triple|cuarta parte|tercio|tercera parte) de\s*(\d+(?:\.\d+)?)/))) {
        r = +m[2] * ({ mitad: 0.5, doble: 2, triple: 3, "cuarta parte": 0.25, tercio: 1 / 3, "tercera parte": 1 / 3 }[m[1]]);
    } else {
        const e = t.replace(/\bmultiplicado por\b|\bpor\b|\bx\b|×/g, "*").replace(/\bdividido (?:por|entre)\b|\bentre\b|÷/g, "/")
            .replace(/\bmas\b/g, "+").replace(/\bmenos\b/g, "-").replace(/\belevado a\b/g, "^").replace(/\bal cuadrado\b/g, "^2").replace(/\s+/g, "");
        if (!/^[\d+\-*/().^]+$/.test(e)) return null;
        r = evaluate(e);
    }
    if (r == null || !Number.isFinite(r)) return null;
    return r.toLocaleString("es-AR", { maximumFractionDigits: 6 });
}

// ------------------------------------------------------------------ recordatorios
function confirmCreate(cmd, item, brain) {
    const n = nameOf(brain);
    const when = fmtWhen(item.at);
    const rep = cmd.repeat ? ` Se repite ${fmtRepeat(cmd.repeat)}.` : "";
    let out;
    if (cmd.kind === "alarm") {
        out = fmt(pick([`¡Alarma lista para ${when}! ⏰`, `Hecho, {n}: te despierto ${when}. ⏰`, `¡Alarma puesta ${when}! Que no se te pase. ⏰`], "al"), n);
    } else if (cmd.kind === "timer") {
        out = fmt(pick([`¡Temporizador de ${fmtDuration(cmd.durationMs)} en marcha! ⏳`, `Listo, {n}: en ${fmtDuration(cmd.durationMs)} te aviso. ⏳`], "tm"), n);
        if (cmd.text && cmd.text !== "Temporizador") out += ` (${cmd.text})`;
        return out;
    } else {
        out = fmt(pick([`¡Listo, {n}! Te aviso ${when}: «${item.text}». ✨`, `Anotado, {n}. ${capitalize(when)} te recuerdo «${item.text}». 💜`, `¡De una! ${capitalize(when)} te digo: «${item.text}». ✨`], "rm"), n);
    }
    out += rep;
    if (cmd.defaultTime) out += " (Elegí las 9:00; si querés otra hora, decime.)";
    if (!brain.state.warnedOpen && localStorage.getItem("aria_warned_open") !== "1") {
        brain.state.warnedOpen = true;
        try { localStorage.setItem("aria_warned_open", "1"); } catch (_) { /* sin almacenamiento */ }
        out += " Acordate de dejar esta página abierta para que pueda avisarte.";
    }
    return out;
}

function createFrom(cmd, brain) {
    const item = brain.reminders.add({ kind: cmd.kind, text: cmd.text, at: cmd.at, repeat: cmd.repeat });
    if (!item) return "Uy, no pude programar eso. ¿Probamos de nuevo? 🙈";
    unlockAudio();
    requestNotifications().catch(() => { });
    return confirmCreate(cmd, item, brain);
}

function describeItem(r) {
    const icon = r.kind === "alarm" ? "⏰" : r.kind === "timer" ? "⏳" : "🔔";
    return `${icon} ${fmtWhen(r.at)}${r.kind === "alarm" ? "" : ` · ${r.text}`}${r.repeat ? ` (${fmtRepeat(r.repeat)})` : ""}`;
}

function handleReminders(message, brain) {
    const { reminders, state } = brain;
    const now = new Date();

    // respuesta a "¿para cuándo?" / "¿qué querés que te recuerde?"
    if (fresh(state.pending)) {
        const p = state.pending; state.pending = null;
        if (p.needText) {
            return createFrom({ kind: "reminder", text: message.trim().replace(/[.!]+$/, ""), at: p.when.at, repeat: p.when.repeat }, brain);
        }
        const w = parseWhen(message, now, { kind: p.kind });
        if (w.ok) return createFrom({ kind: p.kind, text: p.text, at: w.at, repeat: p.repeat || w.repeat }, brain);
    } else state.pending = null;

    const cmd = parseCommand(message, now);
    if (!cmd) return null;

    switch (cmd.action) {
        case "create": return createFrom(cmd, brain);

        case "need_time":
            state.pending = { at: Date.now(), kind: cmd.kind, text: cmd.text, repeat: cmd.repeat };
            return cmd.kind === "alarm" ? say(["¿A qué hora querés la alarma, {n}?", "Dale, ¿para qué hora la pongo?"], brain, "ntA")
                : say(["¡Claro! ¿Para cuándo querés que te avise? Por ejemplo «mañana a las 8» o «en 20 minutos». ✨", "Con gusto, {n}. ¿A qué hora te lo recuerdo?"], brain, "ntR");

        case "need_text":
            state.pending = { at: Date.now(), needText: true, when: cmd.when };
            return say(["¿Y qué querés que te recuerde, {n}?", "Perfecto, ¿qué anoto en el recordatorio?"], brain, "nx");

        case "past":
            return say(["Esa hora ya pasó hoy, {n}. ¿Me decís para mañana o para otro momento?", "Uy, ese horario ya pasó. ¿Lo pongo para mañana?"], brain, "pa");

        case "list": {
            const items = reminders.list(cmd.filter);
            const label = cmd.filter === "alarm" ? "alarmas" : cmd.filter === "timer" ? "temporizadores" : "recordatorios";
            if (!items.length) return say([`Por ahora no tenés ${label} programados, {n}. ¿Te preparo uno? ✨`, `No hay ${label} pendientes. ¡Todo despejado! 😊`], brain, "li");
            return `Esto es lo que tenés pendiente:\n` + items.map(describeItem).join("\n");
        }

        case "cancel": {
            const specific = cmd.type || cmd.clock || cmd.hint || cmd.all;
            if (reminders.isRinging && !specific) { reminders.stopRinging(); return "¡Listo, la apagué! 💜"; }
            let target;
            if (cmd.all) target = reminders.list(cmd.type);
            else if (cmd.clock || cmd.hint) target = reminders.find(cmd);
            else target = reminders.list(cmd.type).length === 1 ? reminders.list(cmd.type) : [];
            if (!target.length) {
                return reminders.list(cmd.type).length
                    ? "No encontré cuál querés borrar. Decime «mis recordatorios» para verlos y te digo cómo identificarlo."
                    : say(["No tenés nada programado para borrar, {n}. 😊"], brain, "cn");
            }
            const n = reminders.removeMany(target.map(t => t.id));
            return say([`Listo, {n}: eliminé ${n} ${n === 1 ? "aviso" : "avisos"}. ✨`, `Hecho, ya lo saqué de la lista. 💜`], brain, "cd");
        }

        case "snooze": {
            const item = reminders.snooze(cmd.minutes);
            return item ? say([`Dale, {n}, te vuelvo a avisar en ${cmd.minutes} minutos. 😉`, `Pospuesto ${cmd.minutes} minutos. ¡Pero no te me escapes! ⏰`], brain, "sn")
                : "No tengo nada reciente para posponer, {n}.".replace("{n}", nameOf(brain) || "che");
        }
    }
    return null;
}

// ------------------------------------------------------------------ perfil
function handleProfile(message, brain) {
    const { profile, rag, memory, state } = brain;
    const f = norm(message);
    const touch = () => { rag.reindex({ memory, profile }); window.dispatchEvent(new CustomEvent("aria:profile-changed")); };

    // primer contacto: ¿cómo te llamás?
    if (state.awaitingName) {
        state.awaitingName = false;
        const t = message.trim().replace(/^(?:me llamo|mi nombre es|soy|llamame|decime|podes decirme|me dicen)\s+/i, "").replace(/[.!¡]+/g, "").trim();
        if (/^(?:no|prefiero no|nada|despues|no quiero)\b/i.test(fold(t))) return "Está bien, sin problema. Cuando quieras contarme cómo te llamás, decímelo. 💜";
        if (t && t.split(/\s+/).length <= 3 && !/[\d?]/.test(t) && /^[A-Za-zÁÉÍÓÚÑáéíóúñü' -]+$/.test(t)) {
            profile.update({ name: t.split(/\s+/).map(capitalize).join(" ") });
            touch();
            return profile.acknowledge([{ kind: "name", value: profile.data.name }]);
        }
    }

    if (/\b(?:como me llamo|cual es mi nombre|sabes mi nombre|sabes como me llamo|quien soy)\b/.test(f)) {
        return profile.known ? say(["¡Claro que sí! Te llamás {n}. 💜", "Te llamás {n}, ¿cómo me voy a olvidar? 😊"], brain, "wn")
            : "Todavía no me lo dijiste. ¿Cómo te llamo? 💜";
    }
    if (/\b(?:que sabes de mi|que sabes sobre mi|que conoces de mi|que recordas de mi|mi perfil|que tenes anotado de mi)\b/.test(f)) {
        const facts = profile.facts();
        return facts.length ? "Esto es lo que sé de vos: " + facts.join(" ") + " Si algo cambió, decímelo y lo actualizo. 💜"
            : "Todavía sé muy poquito de vos. Contame tu nombre, qué te gusta, dónde vivís… ¡lo que quieras compartir! ✨";
    }
    if (/\b(?:borra|elimina|olvida)\w* (?:mi perfil|todo (?:sobre|de) mi|mis datos|todo lo que sabes de mi)\b/.test(f)) {
        profile.reset(); touch();
        return "Listo, borré todo lo que sabía de vos. Empezamos de cero cuando quieras. 💜";
    }
    if (/\bolvida\w* mi (nombre|apodo)\b/.test(f)) {
        profile.forgetField(/apodo/.test(f) ? "nickname" : "name"); touch();
        return "Hecho, ya lo olvidé.";
    }

    const learned = profile.learnFrom(message);
    if (learned.length) { touch(); return profile.acknowledge(learned); }
    return null;
}

// ------------------------------------------------------------------ notas
function handleNotes(message, brain) {
    const { memory, rag, profile } = brain;
    const f = fold(message).trim();
    const reindex = () => rag.reindex({ memory, profile });

    let m = f.match(/^(?:recorda|recuerda|anota|anotame|guarda|guardame|acordate|apunta)\s+(?:que\s+|de que\s+)?(.+)$/);
    if (m && recognizeIntent(message) === "remember") {
        const note = message.trim().slice(message.trim().length - m[1].length).replace(/[.!]+$/, "");
        if (memory.remember(note)) { reindex(); return say(["¡Anotado, {n}! Lo guardo en mi memoria. 💜", "Listo, ya lo tengo guardadito. ✨", "¡No me lo olvido más! 😉"], brain, "nt"); }
        return "Uy, no pude guardarlo (¿es muy largo?). Probá con algo más cortito. 🙈";
    }

    if (recognizeIntent(message) === "recall") {
        const notes = memory.recall();
        return notes.length ? "Esto es lo que tengo anotado:\n" + notes.map((n, i) => `${i + 1}. ${n.content}`).join("\n")
            : say(["Todavía no me pediste que anote nada, {n}. Decime «recordá que …» y lo guardo. 💜"], brain, "rc");
    }

    m = f.match(/^(?:olvida\w*|borra\w*|elimina\w*)\s+(?:la nota\s+|que\s+|de que\s+|lo de\s+|la anotacion\s+)?(.+)$/);
    if (m) {
        const q = norm(m[1]);
        const hit = memory.recall().find(n => norm(n.content).includes(q) || q.includes(norm(n.content)))
            || memory.recall().find(n => q.split(" ").filter(w => w.length > 3).some(w => norm(n.content).includes(w)));
        if (!hit) return "No encontré una nota parecida a esa. Decime «qué recordás» para ver la lista.";
        memory.forget(hit.id); reindex();
        return `Listo, olvidé: «${hit.content}». 💜`;
    }
    return null;
}

function handleDocSearch(message, brain) {
    const f = fold(message);
    if (!/\b(?:mis|mi)\s+(?:notas|documentos|archivos|apuntes|memoria|libreta)\b/.test(f)
        || !/\b(?:busca\w*|fijate|que dice\w*|encontra\w*|hay algo|segun)\b/.test(f)) return null;
    const q = f.replace(/\b(?:busca\w*|fijate|que dice\w*|encontra\w*|hay algo|segun|en|sobre|de|mis|mi|notas|documentos|archivos|apuntes|memoria|libreta|por favor|aria)\b/g, " ").replace(/\s+/g, " ").trim();
    if (!q) return "¿Qué querés que busque en tus notas y documentos?";
    const hits = brain.rag.search(q, { k: 3, sources: ["doc", "nota", "perfil"] });
    if (!hits.length) return say(["Busqué en tus notas y documentos, {n}, pero no encontré nada sobre eso. 🙈"], brain, "ds");
    return "Encontré esto en tus cosas:\n" + hits.map(h => `• (${h.source === "doc" ? h.title : h.source}) ${h.text.length > 220 ? h.text.slice(0, 220) + "…" : h.text}`).join("\n");
}

// ------------------------------------------------------------------ clima
async function handleWeather(message, brain) {
    const f = fold(message);
    const asks = /\b(?:clima|pronostico|temperatura|va a llover|llueve|lluvia|paraguas|hace (?:mucho )?(?:calor|frio)|que calor|que frio)\b/.test(f)
        || /\btiempo\b.*\b(?:hoy|manana|hace|va a|esta|en)\b/.test(f) && !/\b(?:no tengo|cuanto|mucho|poco|tiempo libre|a tiempo)\b/.test(f);
    if (!asks) return null;
    const m = message.match(/\b(?:en|de)\s+((?:[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)(?:\s+(?:de |del |la )?[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)*)/);
    const place = m && !/^(Hoy|Mañana|Aria|ARIA)$/.test(m[1]) ? m[1] : null;
    try {
        const w = await getWeather(place);
        if (!w.found) return `No encontré «${place}» en el mapa. ¿Me lo escribís de otra forma? 🙈`;
        const tom = /\bmanana\b/.test(f);
        const d = tom ? w.tomorrow : w.today;
        let out = tom
            ? `Mañana en ${w.place}: ${d.text}, entre ${d.min}° y ${d.max}°`
            : `En ${w.place} ahora hay ${w.now.temp}° y está ${w.now.text} (sensación de ${w.now.feels}°). Hoy la máxima es ${d.max}° y la mínima ${d.min}°`;
        out += d.rain >= 40 ? `, con ${d.rain}% de probabilidad de lluvia: ¡llevate el paraguas! ☔` : ".";
        const t = tom ? d.max : w.now.temp;
        if (t >= 32) out += " Con este calor, tomá agua seguido y evitá el sol fuerte. 🧊";
        else if (t <= 10) out += " ¡Abrigate bien! 🧣";
        return out;
    } catch (_) {
        return { text: "Uy, no pude consultar el clima ahora, ¿tenés internet? 🙈", actions: searchLinks("clima " + (place || "hoy")) };
    }
}

// ------------------------------------------------------------------ internet
export async function webAnswer(query, brain) {
    const r = await webSearch(query);
    if (r.ok) {
        const top = r.results[0];
        const actions = [];
        if (top.url) actions.push({ label: `Leer más en ${top.source}`, url: top.url });
        actions.push(searchLinks(query)[0]);
        return { text: wrapWeb({ topic: query, extract: shorten(top.extract), source: top.source }, brain), actions, web: r };
    }
    if (r.offline) return { text: "Uy, parece que no tengo conexión a internet ahora mismo 🙈 Probá de nuevo en un ratito, o abrí la búsqueda vos:", actions: searchLinks(query) };
    return { text: `No encontré nada claro sobre «${query}». Capaz con otras palabras sale mejor. Mientras tanto, te dejo la búsqueda lista:`, actions: searchLinks(query) };
}

async function handleWeb(message, brain) {
    const f = fold(message);
    const explicit = isExplicitSearch(message);
    if (isLiveTopic(message) && (explicit || f.split(" ").length <= 7 || /[?]|^(?:que|como|cuanto|a cuanto|cual|dame|decime|mostrame)\b/.test(f))) {
        const q = extractLookupQuery(message) || message.replace(/[?¿!¡]/g, "").trim();
        return { text: say(["Eso cambia a cada ratito, {n}, y no tengo una fuente en vivo para darte el dato exacto. Te dejo la búsqueda lista para que lo veas al instante:"], brain, "lv"), actions: searchLinks(q) };
    }
    if (!explicit) return null;
    const q = extractLookupQuery(message) || message.replace(/[?¿!¡]/g, "").trim();
    if (q.length < 2) return "¿Qué querés que busque?";
    return webAnswer(q, brain);
}

// ------------------------------------------------------------------ activar IA
function handleAI(message, brain) {
    if (!/\b(?:activa|enciende|prende|inicia)\w* (?:la |tu )?(?:ia|inteligencia artificial)\b/.test(fold(message))) return null;
    if (!brain.ai.supported) return "Tu navegador no tiene WebGPU, así que no puedo activar la IA generativa acá. Igual sigo ayudándote con todo lo demás. 💜";
    if (brain.ai.ready) return "¡Ya la tengo activa! Preguntame lo que quieras. ✨";
    brain.ai.enable().then(() => brain.announce("Ya estoy lista. Ahora puedo conversar con vos sobre muchos más temas. ✨")).catch(() => { });
    return "Dale, empiezo a prepararla. La primera vez tarda un poco porque se descarga una sola vez. Te aviso cuando termine. ⏳";
}

// ------------------------------------------------------------------ entrada
export async function runAssistantSkills(message, brain) {
    const { reminders, state } = brain;
    const f = norm(message);

    // 0) Una alarma suena: "ya está", "basta", "gracias"...
    if (reminders.isRinging && /^(?:basta|silencio|para|parar|detene\w*|ya esta|ya la vi|ya lo vi|ya lo escuche|listo|ok|oka|entendido|gracias|apaga\w*|calla\w*|ya)\b/.test(f) && f.split(" ").length <= 5
        && !/\b(?:recordatorios?|alarmas?)\b.*\b(?:todos|todas)\b/.test(f)) {
        reminders.stopRinging();
        return say(["¡Listo, {n}! La apagué. 💜", "Apagada. ¡Que tengas un lindo momento! ✨"], brain, "stp");
    }

    // 1) juego de adivinanzas en curso
    const riddle = checkRiddle(message, brain);
    if (riddle) return riddle;

    // 2) recordatorios, alarmas, temporizadores
    const rem = handleReminders(message, brain);
    if (rem) return rem;

    // 3) perfil (incluye "¿cómo te llamás?" inicial)
    const prof = handleProfile(message, brain);
    if (prof) return prof;

    // 4) notas y documentos propios
    const note = handleNotes(message, brain) || handleDocSearch(message, brain);
    if (note) return note;

    // 5) cuentas
    const c = calculate(message);
    if (c) return say([`Eso da ${c}. 🧮`, `Me da ${c}, {n}. ✨`, `El resultado es ${c}.`], brain, "ca");

    // 6) IA, clima, internet
    return handleAI(message, brain) || await handleWeather(message, brain) || await handleWeb(message, brain);
}
