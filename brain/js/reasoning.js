// ARIA BRAIN · reasoning.js
// Respuestas "de reglas": urgencias, charla cotidiana, hora/fecha y conocimiento propio.

import { checkHealthSafety } from "./safety.js";
import { recognizeIntent } from "./intentions.js";
import { searchKnowledge } from "./knowledge.js";
import { smalltalk, wrapKnowledge, unknownReply } from "./smalltalk.js";
import { fmt, pick } from "./text.js";

const ANON = { profile: { displayName: "" }, state: {}, reminders: null };

export async function reason(message, memory, brain = ANON) {

    const safety = checkHealthSafety(message);
    if (safety.urgent) return safety.message;

    const name = brain.profile?.displayName || "";
    const intent = recognizeIntent(message);

    if (intent === "time") {
        const t = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
        return fmt(pick([`Son las ${t}, {n}. ⏰`, `Ahora mismo son las ${t}.`, `¡Las ${t}! ¿Te pongo algún aviso, {n}?`], "time"), name);
    }
    if (intent === "date") {
        const d = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        return fmt(pick([`Hoy es ${d}. 📅`, `Estamos a ${d}, {n}.`], "date"), name);
    }

    const talk = smalltalk(intent, brain);
    if (talk) return talk;

    const knowledge = searchKnowledge(message);
    if (knowledge.found) return wrapKnowledge(knowledge.answer, brain);

    return unknownReply(brain);
}
