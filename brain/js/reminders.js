// ARIA BRAIN · reminders.js
// Recordatorios, alarmas y temporizadores en lenguaje natural (español).
//   "recordame mañana a las 8 llamar a mi hija"   "poné una alarma a las 7:30"
//   "temporizador de 5 minutos"                   "recordame todos los días a las 9 tomar la pastilla"
// Se guardan en localStorage y suenan mientras la página de ARIA esté abierta.

import { fold, uid, capitalize } from "./text.js";

const KEY = "aria_reminders";

export const DAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DAYS_F = DAYS_ES.map(fold);
const MONTHS_F = MONTHS_ES.map(fold);

// ---------------------------------------------------------------- números en palabras
const UNITS = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60 };
const NW = Object.keys(UNITS).sort((a, b) => b.length - a.length).join("|");
const TENS = "(?:treinta|cuarenta|cincuenta|sesenta)";
const ONES = "(?:un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)";
const NUM = `(?:\\d{1,3}|${TENS}(?: y ${ONES})?|${NW})`;
const MONTH_RE = MONTHS_F.join("|");
const DAY_RE = "(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)";

function toNum(s) {
    s = String(s).trim();
    if (/^\d+$/.test(s)) return +s;
    const m = s.match(/^(\w+)(?: y (\w+))?$/);
    return m ? (UNITS[m[1]] ?? 0) + (m[2] ? (UNITS[m[2]] ?? 0) : 0) : 0;
}

const UNIT_MS = (u) => /^seg/.test(u) ? 1e3 : /^min/.test(u) ? 6e4 : /^(hora|hs|h)/.test(u) ? 36e5 : /^dia/.test(u) ? 864e5 : 6048e5;

// ---------------------------------------------------------------- escáner con máscara
// Busca patrones sobre el texto "plegado" (sin tildes) y marca lo encontrado para
// poder rescatar después el texto de la tarea con sus tildes originales.
function scanner(raw) {
    raw = String(raw).normalize("NFC");
    let cur = fold(raw);
    const mask = new Array(raw.length).fill(false);
    return {
        grab(re) {
            const m = re.exec(cur);
            if (!m) return null;
            for (let i = m.index; i < m.index + m[0].length; i++) mask[i] = true;
            cur = cur.slice(0, m.index) + "\u0001".repeat(m[0].length) + cur.slice(m.index + m[0].length);
            return m;
        },
        rest() { return raw.split("").map((c, i) => mask[i] ? " " : c).join("").replace(/\s+/g, " ").trim(); },
        get text() { return cur; }
    };
}

// ---------------------------------------------------------------- interpretación de fecha y hora
export function nextOccurrence(rep, afterMs = Date.now()) {
    if (rep.type === "interval") return afterMs + rep.ms;
    const base = new Date(afterMs);
    for (let i = 0; i <= 8; i++) {
        const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, rep.h, rep.m, 0, 0);
        if (d.getTime() <= afterMs) continue;
        const dow = d.getDay();
        if (rep.type === "daily") return d.getTime();
        if (rep.type === "weekdays" && dow >= 1 && dow <= 5) return d.getTime();
        if (rep.type === "weekly" && dow === rep.day) return d.getTime();
    }
    return afterMs + 864e5;
}

const CLOCK_RE = new RegExp(`\\b(?:a|de|para|hacia|desde)\\s+las?\\s+(${NUM})\\b(?:\\s*[:.h]\\s*(\\d{2}))?(?:\\s*(?:hs|horas|h)\\b)?(?:\\s+(y media|y cuarto|menos cuarto|en punto|y ${NUM}|menos ${NUM}))?(?:\\s*(am|pm)\\b)?`);
const REL_RE = new RegExp(`\\b(?:en|dentro de|de aqui a|luego de|despues de)\\s+(?:(media hora)|(${NUM})\\s*(segundos?|segs?|minutos?|mins?|horas?|hs|h|dias?|semanas?)(?:\\s+y\\s+(media|cuarto|(${NUM})\\s*(?:minutos?|mins?)))?)\\b`);

export function parseWhen(raw, now = new Date(), { kind = "reminder", scan } = {}) {
    const S = scan || scanner(raw);
    const g = S.grab;
    let m, repeat = null;

    // 1) repeticiones
    if ((m = g(/\b(?:todos los dias|todas los dias|cada dia|diariamente|a diario)\b/))) repeat = { type: "daily" };
    else if ((m = g(/\b(?:de lunes a viernes|dias de semana|dias habiles|todos los dias habiles)\b/))) repeat = { type: "weekdays" };
    else if ((m = g(new RegExp(`\\b(?:todos los|cada)\\s+(${DAY_RE})s?\\b`)))) repeat = { type: "weekly", day: DAYS_F.indexOf(m[1]) };
    else if ((m = g(new RegExp(`\\bcada\\s+(?:(media hora)|(${NUM})\\s*(minutos?|mins?|horas?|hs|h))\\b`)))) {
        repeat = { type: "interval", ms: m[1] ? 18e5 : toNum(m[2]) * UNIT_MS(m[3]) };
    }
    if (repeat?.type === "interval") {
        if (repeat.ms < 6e4) return { ok: false, none: true };
        return { ok: true, at: new Date(now.getTime() + repeat.ms), repeat };
    }

    // 2) relativo ("en 10 minutos", "en media hora", "en 2 días")
    if ((m = g(REL_RE))) {
        let ms;
        if (m[1]) ms = 18e5;
        else {
            ms = toNum(m[2]) * UNIT_MS(m[3]);
            if (m[4]) ms += /^media/.test(m[4]) ? 18e5 : /^cuarto/.test(m[4]) ? 9e5 : toNum(m[5]) * 6e4;
        }
        if (!m[1] && /^(dia|semana)/.test(m[3])) {
            // días/semanas: conserva la hora si se indica una; si no, la hora actual
            const clock = readClock(S, kind, now, true);
            const d = new Date(now.getTime() + ms);
            if (clock) d.setHours(clock.h, clock.min, 0, 0);
            return { ok: true, at: d, repeat };
        }
        return { ok: true, at: new Date(now.getTime() + ms), repeat };
    }

    // 3) momento del día
    let period = null, dayOffset = null, esta = false, fixedHour = null;
    if ((m = g(/\b(?:de|por|en|a)\s+la\s+(manana|madrugada|tarde|noche)\b/))) period = m[1];
    if ((m = g(/\b(?:al|a la|a)\s+(mediodia|medianoche)\b/))) fixedHour = m[1] === "mediodia" ? 12 : 0;
    if ((m = g(/\besta\s+(noche|tarde|manana|madrugada)\b/))) { period = m[1]; dayOffset = 0; esta = true; }

    // 4) día
    let target = null;
    if (g(/\bpasado manana\b/)) dayOffset = 2;
    else if (g(/\bmanana\b/)) dayOffset = 1;
    else if (g(/\bhoy\b/)) dayOffset = 0;
    else if ((m = g(new RegExp(`\\bel\\s+(\\d{1,2})\\s+de\\s+(${MONTH_RE})(?:\\s+de\\s+(\\d{4}))?\\b`)))) {
        target = { d: +m[1], mo: MONTHS_F.indexOf(m[2]), y: m[3] ? +m[3] : null };
    } else if ((m = g(/\bel\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
        target = { d: +m[1], mo: +m[2] - 1, y: m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : null };
    } else if (repeat?.type === "weekly") {
        target = { weekday: repeat.day };
    } else if ((m = g(new RegExp(`\\b(?:el\\s+)?(proximo\\s+|este\\s+)?(${DAY_RE})\\b`)))) {
        target = { weekday: DAYS_F.indexOf(m[2]), next: /proximo/.test(m[1] || "") };
    }

    // 5) hora
    let clock = fixedHour != null ? { h: fixedHour, min: 0, fixed: true } : readClock(S, kind, now, false);
    if (!clock && repeat && repeat.type !== "interval") return { ok: false, needTime: true, repeat };

    let defaultTime = false;
    if (!clock) {
        if (period) clock = { h: { manana: 9, madrugada: 5, tarde: 17, noche: 21 }[period], min: 0, fixed: true };
        else if (dayOffset != null && dayOffset > 0 || target) { clock = { h: 9, min: 0, fixed: true }; defaultTime = true; }
        else return { ok: false, none: !target && dayOffset == null, needTime: dayOffset === 0 || Boolean(target) };
    }

    let { h, min } = clock;
    const explicitDay = (dayOffset != null && dayOffset > 0) || Boolean(target);
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (!clock.fixed) {
        // am/pm explícito o "de la tarde / noche"
        if (clock.ampm === "pm" && h < 12) h += 12;
        else if (clock.ampm === "am" && h === 12) h = 0;
        else if (period === "tarde" || period === "noche") { if (h < 12) h += 12; else if (h === 12 && period === "noche") h = 0; }
        else if ((period === "manana" || period === "madrugada") && h === 12) h = 0;
        else if (!clock.ampm && !period && h >= 1 && h <= 11) {
            // sin marcar: se adivina la mitad del día más probable
            const preferAM = kind === "alarm" ? (h >= 4) : (h >= 7);
            const pref = preferAM ? h : h + 12, alt = preferAM ? h + 12 : h;
            const at = (hh, add = 0) => new Date(today0.getFullYear(), today0.getMonth(), today0.getDate() + add, hh, min);
            if (explicitDay) h = pref;
            else if (at(pref) > now) h = pref;
            else if (kind !== "alarm" && !repeat && at(alt) > now) h = alt;
            else h = pref;
        }
    }

    let date;
    if (target?.weekday != null) {
        let delta = (target.weekday - now.getDay() + 7) % 7;
        if (target.next && delta === 0) delta = 7;
        date = new Date(today0.getFullYear(), today0.getMonth(), today0.getDate() + delta, h, min);
        if (date <= now) date = new Date(date.getTime() + 6048e5);
    } else if (target?.d) {
        let y = target.y ?? now.getFullYear();
        date = new Date(y, target.mo, target.d, h, min);
        if (!target.y && date <= now) date = new Date(y + 1, target.mo, target.d, h, min);
    } else {
        const add = dayOffset ?? 0;
        date = new Date(today0.getFullYear(), today0.getMonth(), today0.getDate() + add, h, min);
        if (date <= now) {
            if (dayOffset === 0 && !esta && !repeat && !period) return { ok: false, past: true };
            if (!esta || repeat) date = new Date(date.getTime() + 864e5);
            else return { ok: false, past: true };
        }
    }

    if (repeat && repeat.type !== "interval") {
        repeat = { ...repeat, h: date.getHours(), m: date.getMinutes() };
        if (repeat.type === "weekly" && repeat.day == null) repeat.day = date.getDay();
        date = new Date(nextOccurrence(repeat, now.getTime()));
    }
    return { ok: true, at: date, repeat, defaultTime };
}

// Lee "a las 8", "a las 7:30", "a las 8 y media", "7 pm", "19:45".
function readClock(S, kind, now, optional) {
    const g = S.grab;
    let m;
    if ((m = g(CLOCK_RE))) {
        let h = toNum(m[1]), min = m[2] ? +m[2] : 0;
        const mod = m[3] || "";
        if (/^y media/.test(mod)) min = 30;
        else if (/^y cuarto/.test(mod)) min = 15;
        else if (/^menos cuarto/.test(mod)) { h -= 1; min = 45; }
        else if (/^menos/.test(mod)) { h -= 1; min = 60 - toNum(mod.replace(/^menos\s+/, "")); }
        else if (/^y\s/.test(mod)) min = toNum(mod.replace(/^y\s+/, ""));
        if (h < 0) h = 23;
        if (h > 24 || min > 59) return null;
        return { h: h === 24 ? 0 : h, min, ampm: m[4] || null };
    }
    if ((m = g(/\b(\d{1,2})[:.h](\d{2})\s*(am|pm)?\b/))) {
        const h = +m[1], min = +m[2];
        if (h > 24 || min > 59) return null;
        return { h: h === 24 ? 0 : h, min, ampm: m[3] || null };
    }
    if ((m = g(/\b(\d{1,2})\s*(am|pm)\b/))) {
        return +m[1] > 12 || +m[1] < 1 ? null : { h: +m[1], min: 0, ampm: m[2] };
    }
    return null;
}

// ---------------------------------------------------------------- interpretación de órdenes
const LEAD = ["aria", "por favor", "porfa", "recordame", "recuerdame", "avisame", "acordame", "agendame", "recordarme", "haceme acordar",
    "no me dejes que me olvide", "no me dejes olvidar", "no me olvides", "ponme", "poneme", "ponele", "pone", "ponga", "creame", "crea", "programame",
    "programa", "configurame", "configura", "agregame", "agrega", "anotame", "anota", "armame", "despertame", "despiertame", "quiero",
    "necesito", "un", "una", "alarma", "despertador", "temporizador", "timer", "recordatorio", "de", "que", "para", "y"];
const LEAD_RE = new RegExp(`^(?:${LEAD.sort((a, b) => b.length - a.length).join("|")})\\b[\\s,;:.-]*`);

function cleanTask(text, { timer = false } = {}) {
    let t = text.replace(/\s+/g, " ").trim();
    for (let i = 0; i < 8; i++) {
        const next = fold(t).replace(LEAD_RE, "");
        if (next.length === fold(t).length) break;
        t = t.slice(t.length - next.length).trim();
    }
    if (timer) t = t.replace(/^(?:a|para)\s+/i, "");
    return t.replace(/[\s,;:.\-!¡¿?]+$/g, "").replace(/^[\s,;:.\-]+/, "").replace(/\s+(por favor|porfa)$/i, "").trim();
}

const KINDS = "recordatorios?|alarmas?|temporizadores?|timers?|despertador(?:es)?|avisos?|pendientes?";

export function parseCommand(message, now = new Date()) {
    const f = fold(message);

    // posponer
    if (/\b(pospon\w*|posponer|aplaza\w*|snooze|\w+\s+minutos?\s+mas)\b/.test(f)) {
        const m = f.match(new RegExp(`(${NUM})\\s*(minutos?|mins?|horas?)`));
        const mins = m ? toNum(m[1]) * (/^hora/.test(m[2]) ? 60 : 1) : 5;
        return { action: "snooze", minutes: Math.min(Math.max(mins, 1), 600) };
    }

    // cancelar / apagar
    if (/\b(cancel\w*|borr\w*|elimin\w*|quit\w*|sac\w*|apag\w*|desactiv\w*|anul\w*)\b/.test(f) && new RegExp(`\\b(${KINDS})\\b`).test(f)) {
        const type = /\balarmas?\b|\bdespertador/.test(f) ? "alarm" : /\btemporizador|\btimers?\b/.test(f) ? "timer" : /\brecordatorio|\baviso/.test(f) ? "reminder" : null;
        const S = scanner(message);
        const clock = readClock(S, type || "reminder", now, true);
        const all = /\b(todos|todas)\b/.test(f);
        let text = S.rest();
        text = fold(text).replace(new RegExp(`\\b(cancel\\w*|borr\\w*|elimin\\w*|quit\\w*|sac\\w*|apag\\w*|desactiv\\w*|anul\\w*|${KINDS}|todos|todas|el|la|los|las|de|del|que|mi|mis|por favor|porfa|aria)\\b`, "g"), " ").replace(/\s+/g, " ").trim();
        return { action: "cancel", type, all, clock: clock ? { h: clock.h, min: clock.min } : null, hint: text };
    }

    const wantsCreate = /\b(recordame|recuerdame|avisame|acordame|agendame|recordarme|haceme acordar|no me dejes (?:que me )?(?:olvidar|olvide)|no me olvides|pone\w*|crea\w*|programa\w*|configura\w*|agrega\w*|anota\w*|arma\w*|quiero|necesito|despert\w*|despiert\w*|activa\w*)\b/.test(f);

    // listar
    if (!/\b(recordame|recuerdame|avisame|acordame|agendame)\b/.test(f)
        && new RegExp(`\\b(${KINDS})\\b`).test(f)
        && /\b(mis|mostr\w+|ver|lista\w*|leeme|decime|dime|cuales|cuantos|cuantas|que|tengo|tenes|hay)\b/.test(f)
        && !(wantsCreate && /\b(pone\w*|crea\w*|programa\w*|configura\w*|agrega\w*|arma\w*|despert\w*)\b/.test(f))) {
        const filter = /\balarma/.test(f) ? "alarm" : /\btemporizador|\btimer/.test(f) ? "timer" : /\brecordatorio|\baviso|\bpendiente/.test(f) ? "reminder" : null;
        return { action: "list", filter };
    }

    // crear
    const isAlarm = /\b(alarma|despertador|despertame|despiertame|despertarme)\b/.test(f);
    const isTimer = /\b(temporizador|timer|cuenta regresiva)\b/.test(f);
    const isReminder = /\b(recordame|recuerdame|avisame|acordame|agendame|recordarme|haceme acordar|no me dejes (?:que me )?(?:olvidar|olvide)|no me olvides)\b/.test(f)
        || (/\brecordatorio\b/.test(f) && wantsCreate);
    const kind = isTimer ? "timer" : isAlarm ? "alarm" : isReminder ? "reminder" : null;
    if (!kind) return null;

    const S = scanner(message);

    if (kind === "timer") {
        const m = S.grab(new RegExp(`\\b(?:de|por|en|a)?\\s*(?:(media hora)|(${NUM})\\s*(segundos?|segs?|minutos?|mins?|horas?|hs|h))\\b`));
        if (!m) return { action: "need_time", kind, text: "Temporizador" };
        const ms = m[1] ? 18e5 : toNum(m[2]) * UNIT_MS(m[3]);
        return { action: "create", kind, text: cleanTask(S.rest(), { timer: true }) || "Temporizador", at: new Date(now.getTime() + ms), repeat: null, durationMs: ms };
    }

    const when = parseWhen(message, now, { kind, scan: S });
    const text = cleanTask(S.rest());
    if (when.ok) {
        if (kind === "reminder" && !text) return { action: "need_text", when };
        return { action: "create", kind, text: text || (kind === "alarm" ? "Alarma" : ""), at: when.at, repeat: when.repeat, defaultTime: when.defaultTime };
    }
    if (when.past) return { action: "past", kind, text };
    return { action: "need_time", kind, text: text || (kind === "alarm" ? "Alarma" : ""), repeat: when.repeat || null };
}

// ---------------------------------------------------------------- formatos
export const fmtClock = (d) => new Date(d).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });

export function fmtWhen(at, now = new Date()) {
    const d = new Date(at);
    const day0 = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
    const diff = Math.round((day0(d) - day0(now)) / 864e5);
    const t = fmtClock(d);
    if (diff === 0) return `hoy a las ${t}`;
    if (diff === 1) return `mañana a las ${t}`;
    if (diff > 1 && diff < 7) return `el ${DAYS_ES[d.getDay()]} a las ${t}`;
    return `el ${d.getDate()} de ${MONTHS_ES[d.getMonth()]} a las ${t}`;
}

export function fmtDuration(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s} segundo${s === 1 ? "" : "s"}`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} minuto${m === 1 ? "" : "s"}`;
    const h = Math.floor(m / 60), r = m % 60;
    return `${h} hora${h === 1 ? "" : "s"}` + (r ? ` y ${r} minuto${r === 1 ? "" : "s"}` : "");
}

export function fmtRepeat(rep) {
    if (!rep) return "";
    if (rep.type === "daily") return "todos los días";
    if (rep.type === "weekdays") return "de lunes a viernes";
    if (rep.type === "weekly") return `todos los ${DAYS_ES[rep.day]}`;
    if (rep.type === "interval") return `cada ${fmtDuration(rep.ms)}`;
    return "";
}

// ---------------------------------------------------------------- agenda con temporizador interno
export class ARIAReminders extends EventTarget {

    constructor() {
        super();
        this.items = [];
        this.ringing = new Map();
        this.lastFired = null;
        this.timer = null;
        this._load();
    }

    _load() {
        try {
            const v = JSON.parse(localStorage.getItem(KEY) || "[]");
            this.items = Array.isArray(v) ? v.filter(x => x && typeof x.at === "number") : [];
        } catch (_) { this.items = []; }
    }

    _save() {
        try { localStorage.setItem(KEY, JSON.stringify(this.items)); } catch (_) { /* sin almacenamiento */ }
        this.dispatchEvent(new CustomEvent("change"));
    }

    add({ kind = "reminder", text, at, repeat = null }) {
        const ms = at instanceof Date ? at.getTime() : +at;
        if (!Number.isFinite(ms)) return null;
        const item = { id: uid(), kind, text: String(text || "").slice(0, 200), at: ms, repeat, created: Date.now() };
        this.items.push(item);
        this.items.sort((a, b) => a.at - b.at);
        this._save();
        return item;
    }

    list(kind = null) { return this.items.filter(i => !kind || i.kind === kind).sort((a, b) => a.at - b.at); }

    remove(id) {
        const n = this.items.length;
        this.items = this.items.filter(i => i.id !== id);
        this.stopRinging(id);
        if (this.items.length !== n) this._save();
        return this.items.length < n;
    }

    removeMany(ids) { let c = 0; for (const id of ids) if (this.remove(id)) c++; return c; }

    // Busca elementos para cancelar según el pedido.
    find({ type = null, clock = null, hint = "" } = {}) {
        const pool = this.list(type);
        if (clock) {
            const hit = pool.filter(i => {
                const d = new Date(i.at);
                return d.getMinutes() === clock.min && d.getHours() % 12 === clock.h % 12;
            });
            if (hit.length) return hit;
        }
        if (hint) {
            const words = hint.split(" ").filter(w => w.length > 2);
            const hit = pool.filter(i => words.some(w => fold(i.text).includes(w)));
            if (hit.length) return hit;
        }
        return [];
    }

    start() {
        if (this.timer) return;
        this.catchUp();
        this.timer = setInterval(() => this.tick(), 1000);
    }

    stop() { clearInterval(this.timer); this.timer = null; }

    // Lo que venció mientras la página estaba cerrada.
    catchUp() {
        const now = Date.now();
        for (const r of [...this.items]) if (r.at <= now) this.fire(r, { late: true });
    }

    tick() {
        const now = Date.now();
        for (const r of [...this.items]) if (r.at <= now) this.fire(r, { late: now - r.at > 20000 });
    }

    fire(r, { late = false } = {}) {
        const ago = Date.now() - r.at;
        const copy = { ...r };
        if (r.repeat) {
            r.at = nextOccurrence(r.repeat, Math.max(Date.now(), r.at));
            // repeticiones atrasadas muchas horas: se avanza sin molestar
            if (late && ago > 12 * 36e5) { this._save(); return; }
        } else {
            this.items = this.items.filter(i => i.id !== r.id);
        }
        this.lastFired = copy;
        this.ringing.set(copy.id, copy);
        const autoStop = copy.kind === "reminder" ? 25000 : 90000;
        setTimeout(() => this.stopRinging(copy.id), autoStop);
        this._save();
        this.dispatchEvent(new CustomEvent("fire", { detail: { item: copy, late, agoMs: ago } }));
    }

    stopRinging(id = null) {
        const ids = id ? [id] : [...this.ringing.keys()];
        let any = false;
        for (const i of ids) any = this.ringing.delete(i) || any;
        if (any) this.dispatchEvent(new CustomEvent("stop", { detail: { remaining: this.ringing.size } }));
        return any;
    }

    get isRinging() { return this.ringing.size > 0; }

    snooze(minutes = 5) {
        const base = this.lastFired;
        if (!base) return null;
        this.stopRinging();
        return this.add({ kind: base.kind === "timer" ? "timer" : base.kind, text: base.text, at: Date.now() + minutes * 6e4 });
    }
}

export { capitalize };
