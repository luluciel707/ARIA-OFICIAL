import { checkHealthSafety } from "./safety.js";
import { recognizeIntent } from "./intentions.js";
import { searchKnowledge } from "./knowledge.js";

const responses = {
    greeting: [
        "¡Hola! Qué bueno verte. ¿Qué querés hacer hoy?",
        "¡Buenas! Estoy lista para charlar, ayudar o hacer algo más divertido.",
        "¡Hola! ¿Qué onda? ¿Charla, ayuda o un juego?"
    ],
    wellbeing: [
        "Bien, gracias por preguntar. ¿Y vos cómo andás?",
        "Todo tranquilo por acá. ¿Cómo va tu día?"
    ],
    identity: [
        "Soy ARIA, tu asistente personal. Puedo hablar, ayudar en lo que haga falta, guardar notas y acompañarte con chistes y juegos cuando te apetece."
    ],
    help: [
        "Puedo charlar, explicarte cosas, ayudarte a pensar, guardar tus notas y jugar un ratito si te gusta. Si querés, también puedo adaptarme al tono que prefieras."
    ],
    thanks: [
        "¡De nada! Para eso estoy.",
        "Un placer. ¿Querés seguir?"
    ],
    goodbye: [
        "¡Hasta luego! Que tengas un día lindo.",
        "Nos vemos. Yo me quedo por acá, lista para otra charla."
    ],
    unknown: [
        "No te entendí del todo. ¿Podés decirlo de otra forma?",
        "No estoy segura de qué querés exactamente. ¿Me lo contás otra vez en palabras más simples?"
    ]
};

const jokes = [
    "¿Qué hace una abeja en el gimnasio? ¡zum-ba! Bueno, hoy el chiste salió con demasiada energía. 🐝",
    "¿Por qué el libro de matemáticas estaba triste? Porque tenía muchos problemas. Yo también me pongo nerviosa cuando me ponen una cuenta.",
    "¿Qué le dijo un techo a otro? Techo de menos. Sí… es un chiste muy cubierto."
];

const riddles = [
    { question: "Tengo agujas, pero no sé coser. Tengo números, pero no sé contar. ¿Qué soy?", answer: "reloj", hint: "Podés mirarme para saber la hora." },
    { question: "Cuanto más le quitás, más grande se vuelve. ¿Qué es?", answer: "agujero", hint: "Puede estar en la tierra o en una pared." },
    { question: "Tiene dientes y no come; tiene cabeza y no es persona. ¿Qué es?", answer: "ajo", hint: "Se usa para cocinar." }
];

let activeRiddle = null;

function choose(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function normalize(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function playRockPaperScissors(message) {
    const text = normalize(message);
    const player = text.match(/\b(piedra|papel|tijera)\b/);
    if (!player) return "¡Dale! Elegí: piedra, papel o tijera.";

    const options = ["piedra", "papel", "tijera"];
    const computer = choose(options);
    if (player[1] === computer) return `Yo elegí ${computer}. ¡Empate! ¿Otra ronda?`;

    const wins = { piedra: "tijera", papel: "piedra", tijera: "papel" };
    return wins[player[1]] === computer
        ? `Yo elegí ${computer}. ¡Me ganaste! Revancha cuando quieras. 😄`
        : `Yo elegí ${computer}. ¡Esta vez me tocó a mí! ¿Otra?`;
}

function extractNameFromMessage(message) {
    const match = String(message || "")
        .match(/(?:mi nombre es|me llamo|llamame)\s+([a-zA-ZÀ-ÿ\s]+)/i);
    return match ? match[1].trim() : "";
}

function parseModeFromMessage(message) {
    const text = normalize(message);
    if (/(modo breve|respuestas breves|mas breve|simple)/.test(text)) return { verbosity: "breve" };
    if (/(modo detallado|mas detallado|detallado|explicame bien)/.test(text)) return { verbosity: "detallado" };
    if (/(modo serio|serio|menos chistes)/.test(text)) return { humor: "nulo" };
    if (/(modo divertido|mas chistes|juguetón|jugueton|divertido)/.test(text)) return { humor: "alto" };
    return null;
}

export function reason(message, memory) {
    const safety = checkHealthSafety(message);
    if (safety.urgent) return safety.message;

    const profile = memory.getProfile ? memory.getProfile() : {};
    const preferredName = profile.preferredName || profile.name || "amiga";
    const text = normalize(message);

    if (activeRiddle) {
        if (/(cancelar|dejemos|cambiemos|salir)/.test(text)) {
            activeRiddle = null;
            return "Dale, dejamos el acertijo. ¿Qué hacemos ahora?";
        }
        if (/(pista|ayuda)/.test(text)) return `Pista: ${activeRiddle.hint}`;
        if (/(respuesta|me rindo|no se|no lo se)/.test(text)) {
            const answer = activeRiddle.answer;
            activeRiddle = null;
            return `Era ${answer}. ¿Te doy otro o cambiamos de tema?`;
        }
        if (text.includes(activeRiddle.answer)) {
            activeRiddle = null;
            return "¡Sí, era esa! Punto para vos. ¿Otro? 🏅";
        }
        return "Mmm, no era esa. ¿Querés pista, otra oportunidad o la respuesta?";
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

        case "set_name": {
            const name = extractNameFromMessage(message);
            if (!name) return "¿Cómo te gustaría que te llame?";
            memory.updateProfile({ name, preferredName: name });
            return `Perfecto, desde ahora te voy a llamar ${name}. 💜`;
        }

        case "set_mode": {
            const changes = parseModeFromMessage(message);
            if (!changes) return "¿Qué modo querés? Puedo ser breve, detallada, más seria o más divertida.";
            memory.updateProfile(changes);
            const modeText = changes.verbosity || changes.humor === "nulo" ? (changes.verbosity === "breve" ? "más breve" : "más detallada") : "más divertida";
            return `Listo, voy a responder ${modeText}.`;
        }

        case "time":
            return `Son las ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}.`;

        case "date":
            return `Hoy es ${new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.`;

        case "joke":
            return choose(jokes);

        case "coin":
            return `Salió ${Math.random() < 0.5 ? "cara" : "cruz"}. La moneda tomó la decisión que yo no podía. 🪙`;

        case "dice":
            return `Salió ${Math.floor(Math.random() * 6) + 1}. ¡A jugar! 🎲`;

        case "rps":
            return playRockPaperScissors(message);

        case "game_menu":
            return "Podemos jugar piedra, papel o tijera, tirar un dado o una moneda, o hacer una adivinanza. ¿Cuál te tienta? 🎲";

        case "riddle":
            activeRiddle = choose(riddles);
            return `${activeRiddle.question} Si querés, pedime pista o decime me rindo.`;

        case "remember": {
            const note = String(message).replace(/^(recuerda que|acordate de|acuerdate de)\s+/i, "").trim();
            if (!note) return "¿Qué querés que recuerde?";
            return memory.remember(note)
                ? `Listo, ${preferredName}, lo guardé. 💜`
                : "No pude guardar esa información.";
        }

        case "recall": {
            const notes = memory.recall();
            if (!notes.length) return "Todavía no guardé ninguna nota.";
            return "Tengo anotado esto:\n" + notes.map((note, index) => `${index + 1}. ${note.content}`).join("\n");
        }

        case "forget": {
            const requested = String(message).replace(/^olvida la nota\s+/i, "").trim().toLowerCase();
            const note = memory.recall().find(item => item.content.toLowerCase() === requested);
            if (!note) return "No encontré una nota con ese texto exacto.";
            memory.forget(note.id);
            return "Listo, ya la borré.";
        }

        default: {
            const relevant = memory.findRelevantContext(message);
            const knowledge = searchKnowledge(message);

            if (relevant.length) {
                const context = relevant[0];
                return `Me acordé de esto que podría ayudar: ${context.content}. Si querés, te lo desarrollo más o te ayudo a encontrar una idea mejor.`;
            }

            if (knowledge.found) {
                return knowledge.answer;
            }

            return choose(responses.unknown);
        }
    }
}
