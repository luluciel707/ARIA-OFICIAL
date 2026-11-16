// ARIA BRAIN · profile.js
// Perfil de la persona: nombre, apodo, preferencias y datos que ARIA va aprendiendo.
// Todo se guarda solo en este navegador (localStorage).

import { pick, fmt, capitalize } from "./text.js";
import { fold } from "./text.js";

const KEY = "aria_profile";

const EMPTY = () => ({
    name: "", nickname: "", birthday: "", age: "", city: "",
    likes: [], dislikes: [], facts: [], notes: "", createdAt: Date.now()
});

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").replace(/[.!¡¿?,;:\s]+$/g, "").trim();
const addUnique = (list, item) => {
    const f = fold(item);
    if (!item || list.some(x => fold(x) === f)) return false;
    list.push(item);
    return list.length <= 40 || (list.shift(), true);
};

export class ARIAProfile {

    constructor() {
        this.data = EMPTY();
        this.load();
    }

    load() {
        try {
            const saved = JSON.parse(localStorage.getItem(KEY) || "null");
            if (saved && typeof saved === "object") this.data = { ...EMPTY(), ...saved };
        } catch (_) { this.data = EMPTY(); }
    }

    save() {
        try { localStorage.setItem(KEY, JSON.stringify(this.data)); return true; }
        catch (_) { return false; }
    }

    get known() { return Boolean(this.data.name || this.data.nickname); }
    get displayName() { return this.data.nickname || this.data.name || ""; }

    update(fields = {}) {
        for (const [k, v] of Object.entries(fields)) {
            if (!(k in this.data) || k === "createdAt") continue;
            if (Array.isArray(this.data[k])) {
                this.data[k] = (Array.isArray(v) ? v : String(v).split(","))
                    .map(clean).filter(Boolean).slice(0, 40);
            } else this.data[k] = clean(k === "notes" ? String(v).slice(0, 600) : v);
        }
        return this.save();
    }

    reset() { this.data = EMPTY(); return this.save(); }

    forgetField(field) {
        if (!(field in this.data)) return false;
        this.data[field] = Array.isArray(this.data[field]) ? [] : "";
        return this.save();
    }

    // Frases cortas para el RAG y para el prompt de la IA.
    facts() {
        const d = this.data, out = [];
        if (d.name) out.push(`La persona se llama ${d.name}.`);
        if (d.nickname) out.push(`Le gusta que le digan ${d.nickname}.`);
        if (d.age) out.push(`Tiene ${d.age} años.`);
        if (d.birthday) out.push(`Su cumpleaños es ${d.birthday}.`);
        if (d.city) out.push(`Vive en ${d.city}.`);
        if (d.likes.length) out.push(`Le gusta: ${d.likes.join(", ")}.`);
        if (d.dislikes.length) out.push(`No le gusta: ${d.dislikes.join(", ")}.`);
        d.facts.forEach(f => out.push(f.endsWith(".") ? f : f + "."));
        if (d.notes) out.push(d.notes);
        return out;
    }

    summary() { return this.facts().join(" "); }

    // ¿Es hoy su cumpleaños? (acepta "5 de mayo", "05/05", "5/5")
    isBirthdayToday(now = new Date()) {
        const b = fold(this.data.birthday);
        if (!b) return false;
        const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
            "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        let m = b.match(/(\d{1,2})\s*(?:de\s+)?([a-z]+)/);
        if (m && months.includes(m[2])) return +m[1] === now.getDate() && months.indexOf(m[2]) === now.getMonth();
        m = b.match(/(\d{1,2})[\/\-](\d{1,2})/);
        return Boolean(m) && +m[1] === now.getDate() && +m[2] === now.getMonth() + 1;
    }

    // Aprende datos de lo que la persona cuenta. Devuelve lo guardado.
    learnFrom(message) {
        const text = String(message ?? "").trim();
        if (!text || text.length > 300) return [];
        const f = fold(text);
        const learned = [];
        const d = this.data;
        // Devuelve el primer grupo de captura, pero tomado del texto ORIGINAL (con tildes y mayúsculas).
        const original = (re) => {
            const m = new RegExp(re.source, "d").exec(f);
            if (!m || !m.indices[1]) return null;
            return text.slice(m.indices[1][0], m.indices[1][1]);
        };

        let v;
        if ((v = original(/\b(?:me llamo|mi nombre es)\s+([a-z]+(?:\s[a-z]+)?)/))) {
            d.name = capitalize(clean(v).split(" ").map(capitalize).join(" "));
            learned.push({ kind: "name", value: d.name });
        } else if ((v = original(/\bllamame\s+([a-z]+(?:\s[a-z]+)?)/))
            || (v = original(/\b(?:decime|deci me|dime|podes decirme|podes llamarme|quiero que me digas|quiero que me llames)\s+([a-z]+)/))) {
            d.nickname = capitalize(clean(v));
            learned.push({ kind: "nickname", value: d.nickname });
        }

        if ((v = original(/\btengo\s+(\d{1,3})\s+anos\b/)) && +v >= 1 && +v <= 120) {
            d.age = String(+v); learned.push({ kind: "age", value: d.age });
        }
        if ((v = original(/\bmi cumpleanos es(?: el)?\s+(.+)$/))) {
            d.birthday = clean(v); learned.push({ kind: "birthday", value: d.birthday });
        }
        if ((v = original(/\bvivo en\s+(.+)$/))) {
            d.city = clean(v); learned.push({ kind: "city", value: d.city });
        }

        if (!text.includes("?")) {
            if ((v = original(/\bno me gustan?\s+(?:nada\s+)?(?:el |la |los |las )?(.+)$/))) {
                if (addUnique(d.dislikes, clean(v))) learned.push({ kind: "dislike", value: clean(v) });
            } else if ((v = original(/\bme (?:gustan?|encantan?|fascinan?)\s+(?:mucho\s+)?(?:el |la |los |las )?(.+)$/))
                && !/^(que|ma)\b/.test(fold(v))) {
                if (addUnique(d.likes, clean(v))) learned.push({ kind: "like", value: clean(v) });
            }
            const LABELS = { cancion: "canción", musica: "música", pelicula: "película" };
            const fav = new RegExp("\\bmi (comida|color|musica|cancion|cantante|banda|deporte|serie|pelicula|animal|libro|flor|fruta|bebida|equipo)\\s+favorit([oa])\\s+es\\s+(.+)$", "d").exec(f);
            if (fav) {
                const value = clean(text.slice(fav.indices[3][0], fav.indices[3][1]));
                const fact = `Su ${LABELS[fav[1]] || fav[1]} favorit${fav[2]} es ${value}`;
                if (addUnique(d.facts, fact)) learned.push({ kind: "favorite", value: fact });
            }
            const kin = new RegExp("\\bmi (hijo|hija|esposo|esposa|marido|nieto|nieta|mama|papa|hermano|hermana|mascota|perro|perra|gato|gata|nuera|yerno|novio|novia|amiga|amigo)\\s+se llama\\s+([a-z]+)", "d").exec(f);
            if (kin) {
                const nm = capitalize(text.slice(kin.indices[2][0], kin.indices[2][1]));
                const rel = { mama: "mamá", papa: "papá" }[kin[1]] || kin[1];
                const fact = `Su ${rel} se llama ${nm}`;
                if (addUnique(d.facts, fact)) learned.push({ kind: "person", value: fact });
            }
        }

        if (learned.length) this.save();
        return learned;
    }

    // Respuesta natural cuando se aprende algo.
    acknowledge(learned) {
        const n = this.displayName;
        const first = learned[0];
        const lines = {
            name: [`¡Qué lindo nombre, ${first?.value}! Mucho gusto, me encanta conocerte. 💜`,
                `¡${first?.value}! Ya lo guardé en mi corazoncito digital. ¿En qué te ayudo hoy?`,
                `¡Encantada, ${first?.value}! Desde ahora te llamo así. ✨`],
            nickname: [`¡Hecho! Desde ahora te voy a decir ${first?.value}. 😊`,
                `${first?.value}, me gusta. Así te voy a llamar. 💜`],
            age: [`Tomé nota, {n}. ¡Los años traen un montón de sabiduría! ✨`, `Gracias por contármelo, {n}. Lo tengo presente. 💜`],
            birthday: [`¡Anotado! No me voy a olvidar de tu cumpleaños. 🎂`, `¡Qué bien! Voy a estar atenta a esa fecha. 🎉`],
            city: [`¡Qué lindo lugar para vivir! Lo guardé para el clima y esas cosas. 🌤️`, `Anotado: ${first?.value}. Así te doy el clima de tu zona. ✨`],
            like: [`¡Me encanta saberlo, {n}! Lo guardo para conocerte mejor. 💜`, `Ay, qué lindo. Lo anoto en mi lista de cosas que te gustan. ✨`],
            dislike: [`Entendido, {n}, tomo nota para no insistir con eso. 😉`, `Anotado: eso no es lo tuyo. ¡Gracias por avisarme!`],
            favorite: [`¡Buenísimo! Eso lo guardo bien guardado. ✨`, `Qué buen dato, {n}. Ya lo tengo anotado. 💜`],
            person: [`Qué lindo, {n}. Ya sé quién es. Contame de ellos cuando quieras. 💜`, `Anotado. Me encanta conocer a la gente que querés. ✨`]
        };
        return fmt(pick(lines[first?.kind] || [`Anotado, {n}. 💜`], "learn"), n);
    }
}
