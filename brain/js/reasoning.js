import { checkHealthSafety } from "./safety.js";
import { recognizeIntent } from "./intentions.js";
import { searchKnowledge } from "./knowledge.js";

const responses = {

    greeting: [
        "¡Holaaa! Qué lindo tenerte por aquí. ¿En qué puedo ayudarte? 💜",
        "¡Hola! Estoy lista para acompañarte.",
        "¡Holi! ¿Qué te gustaría aprender hoy?"
    ],

    wellbeing: [
        "Estoy funcionando correctamente y lista para ayudarte. ¿Cómo estás hoy?",
        "¡Todo en orden por aquí! ¿Cómo va tu día?"
    ],

    identity: [
        "Soy ARIA, tu asistente virtual de bienestar. Puedo ayudarte a conocer más sobre el cuidado corporal, la salud general y las capacidades motrices. 💜"
    ],

    help: [
        "Puedo conversar contigo, guardar notas y ofrecer información educativa sobre bienestar, cuidado corporal, salud general, movilidad y envejecimiento saludable."
    ],

    thanks: [
        "¡De nada! Me alegra poder ayudarte. ✨",
        "¡Para eso estoy! ¿Tenés otra consulta?"
    ],

    goodbye: [
        "¡Hasta pronto! Espero que tengas un lindo día.",
        "Nos vemos. Quedaré en espera. 💜"
    ],

    unknown: [
        "No estoy completamente segura de comprender tu consulta. ¿Podrías explicármela un poquito más?",
        "Quiero darte una respuesta útil y correcta. ¿Podrías contarme algún detalle más?",
        "Todavía no tengo información suficiente sobre ese tema."
    ]
};

function choose(array) {
    return array[Math.floor(Math.random() * array.length)];
}

export function reason(message, memory) { const safety = checkHealthSafety(message);

if (safety.urgent) {
    return safety.message;
}

    const intent = recognizeIntent(message);

    switch (intent) {

        case "greeting":
        case "wellbeing":
        case "identity":
        case "help":
        case "thanks":
        case "goodbye":
            return choose(responses[intent]);

        case "time":
            return `Son las ${new Date().toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit"
            })}.`;

        case "date":
            return `Hoy es ${new Date().toLocaleDateString("es-AR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric"
            })}.`;

        case "remember": {

            const note = message.replace(
                /^recuerda que\s+/i,
                ""
            ).trim();

            if (!note) return "¿Qué querés que recuerde?";

            return memory.remember(note)
                ? "¡Listo! Guardé esa información en mi memoria local. 💜"
                : "No pude guardar esa información.";
        }

        case "recall": {

            const notes = memory.recall();

            if (!notes.length) {
                return "Mi memoria todavía está vacía.";
            }

            return "Esto es lo que recuerdo:\n" +
                notes.map((note, index) =>
                    `${index + 1}. ${note.content}`
                ).join("\n");
        }

        case "forget": {

            const requested = message
                .replace(/^olvida la nota\s+/i, "")
                .trim()
                .toLowerCase();

            const note = memory.recall().find(item =>
                item.content.toLowerCase() === requested
            );

            if (!note) {
                return "No encontré una nota con ese contenido exacto.";
            }

            memory.forget(note.id);

            return "Listo, eliminé esa nota de mi memoria local.";
        }

        default: {

            const knowledge = searchKnowledge(message);

            if (knowledge.found) {
                return knowledge.answer +
                    "\n\nSi querés, puedo explicarte más sobre este tema. 💜";
            }

            return choose(responses.unknown);
        }
    }
}
