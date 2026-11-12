import { checkHealthSafety } from "./safety.js";
import { recognizeIntent } from "./intentions.js";
import { searchKnowledge } from "./knowledge.js";

const responses = {
    greeting: [
        "¡Hola! Qué bueno que apareciste. ¿Qué hacemos?",
        "¡Buenas! ¿Cómo viene tu día? Yo ya estoy lista para la aventura, aunque sea hasta la cocina.",
        "¡Hola! Contame, ¿qué tenés en mente?"
    ],
    wellbeing: [
        "Bien, gracias por preguntar. ¿Y vos cómo andás?",
        "Todo tranquilo por acá, mis circuitos están tomando mate imaginario. ¿Vos qué tal?"
    ],
    identity: [
        "Soy ARIA, tu asistente personal. Puedo conversar, ayudarte con ideas y tareas, y también jugar o contar chistes. Con la IA generativa activada puedo hablar de muchos más temas; puedo equivocarme, así que lo importante conviene verificarlo."
    ],
    help: [
        "Puedo charlar, explicarte temas, ayudarte a pensar ideas, guardar notas y hacer juegos sencillos. Con la IA generativa activada también puedo conversar sobre muchos más temas."
    ],
    thanks: [
        "¡De nada! Me alegra que te haya servido.",
        "¡Un placer! Y mirá que no siempre me sale tan bien a la primera. 😄"
    ],
    goodbye: [
        "¡Hasta luego! Que tengas un día lindo.",
        "Nos vemos. Yo me quedo por acá, ensayando mejores chistes."
    ],
    unknown: [
        "Con la IA generativa apagada sé hacer algunas cosas y jugar, pero para conversar sobre temas variados necesitás activarla."
    ]
};

const jokes = [
    "¿Qué hace una abeja en el gimnasio? ¡ zum-ba! Bueno, ese chiste salió con las alas medio torcidas. 🐝",
    "¿Por qué el libro de matemáticas estaba triste? Porque tenía muchos problemas. Lo entiendo; yo también me pongo nerviosa con las divisiones.",
    "¿Qué le dijo un techo a otro? Techo de menos. Sí, ya sé: es un chiste bastante… cubierto."
];

const riddles = [
    { question: "Tengo agujas, pero no sé coser. Tengo números, pero no sé contar. ¿Qué soy?", answer: "reloj", hint: "Podés mirarme para saber la hora." },
    { question: "Cuanto más le quitás, más grande se vuelve. ¿Qué es?", answer: "agujero", hint: "Puede estar en la tierra o en una pared." },
    { question: "Tiene dientes y no come; tiene cabeza y no es persona. ¿Qué es?", answer: "ajo", hint: "Se usa mucho para cocinar." }
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
    if (player[1] === computer) return `Yo elegí ${computer}. ¡Empate! ¿Desempate?`;

    const wins = { piedra: "tijera", papel: "piedra", tijera: "papel" };
    return wins[player[1]] === computer
        ? `Yo elegí ${computer}. ¡Me ganaste! Bueno, revancha cuando quieras. 😄`
        : `Yo elegí ${computer}. Esta ronda fue mía; no te preocupes, no me voy a agrandar. ¿Otra?`;
}

export function reason(message, memory) {
    const safety = checkHealthSafety(message);
    if (safety.urgent) return safety.message;

    const text = normalize(message);
    if (activeRiddle) {
        if (/\b(cancelar|dejemos|cambiemos|salir)\b/.test(text)) {
            activeRiddle = null;
            return "Dale, dejamos el acertijo. ¿Qué hacemos ahora?";
        }
        if (/\b(pista|ayuda)\b/.test(text)) return `Pista: ${activeRiddle.hint}`;
        if (/\b(respuesta|me rindo|no se|no lo se)\b/.test(text)) {
            const answer = activeRiddle.answer;
            activeRiddle = null;
            return `Era ${answer}. ¿Te tiro otro o cambiamos de tema?`;
        }
        if (text.includes(activeRiddle.answer)) {
            activeRiddle = null;
            return "¡Sí, era esa! Punto para vos. ¿Seguimos con otro? 🏅";
        }
        return "Mmm, no era esa. ¿Querés otra oportunidad, una pista o te digo la respuesta?";
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
            return `Son las ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}.`;

        case "date":
            return `Hoy es ${new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.`;

        case "joke":
            return choose(jokes);

        case "coin":
            return `Salió ${Math.random() < 0.5 ? "cara" : "cruz"}. La moneda decidió; yo todavía estoy pensando qué merendar. 🪙`;

        case "dice":
            return `Salió ${Math.floor(Math.random() * 6) + 1}. A ver si la suerte hoy está de nuestro lado. 🎲`;

        case "rps":
            return playRockPaperScissors(message);

        case "game_menu":
            return "Podemos jugar piedra, papel o tijera, tirar un dado o una moneda, o hacer una adivinanza. ¿Cuál te tienta? 🎲";

        case "riddle":
            activeRiddle = choose(riddles);
            return `${activeRiddle.question} Si te trabás, pedime una pista.`;

        case "remember": {
            const note = String(message).replace(/^(recuerda que|acordate de|acuerdate de)\s+/i, "").trim();
            if (!note) return "¿Qué querés que recuerde?";
            return memory.remember(note)
                ? "Listo, lo guardé en la memoria de este navegador. 💜"
                : "No pude guardar esa información.";
        }

        case "recall": {
            const notes = memory.recall();
            if (!notes.length) return "Todavía no guardé ninguna nota.";
            return "Tengo anotado esto:\n" + notes.map((note, index) => `${index + 1}. ${note.content}`).join("\n");
        }

        case "forget": {
            const requested = String(message).replace(/^(olvida la nota|olvida que recuerdas)\s+/i, "").trim().toLowerCase();
            const note = memory.recall().find(item => item.content.toLowerCase() === requested);
            if (!note) return "No encontré una nota con ese texto exacto.";
            memory.forget(note.id);
            return "Listo, ya la borré.";
        }

        default: {
            const knowledge = searchKnowledge(message);
            if (knowledge.found) return knowledge.answer;
            return choose(responses.unknown);
        }
    }
}
