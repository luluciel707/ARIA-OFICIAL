// ARIA BRAIN · smalltalk.js
// La voz de ARIA: dulce, alegre y juguetona. Muchas variantes para que nunca suene a robot.
// Plantillas: {n} = nombre o apodo de la persona (si no lo sé, se omite solo).

import { pick, fmt, daypart, norm } from "./text.js";

const JOKES = [
    "¿Por qué los pájaros vuelan hacia el sur en invierno? ¡Porque caminando tardarían muchísimo! 🐦",
    "¿Qué hace una abeja en el gimnasio? ¡Zum-ba! 🐝",
    "¿Cuál es el colmo de un electricista? Que su esposa se llame Luz y sus hijos le sigan la corriente. ⚡",
    "¿Qué le dice un fideo a otro? «Oye, mi cuerpo pide salsa». 🍝",
    "¿Por qué estaba triste el libro de matemáticas? ¡Porque tenía muchos problemas! 📚",
    "¿Cómo se despiden los químicos? ¡Ácido un placer! 🧪",
    "¿Cuál es el café más peligroso del mundo? El ex-preso. ☕",
    "¿Qué le dice el número 3 al número 30? «Para ser como yo, tenés que ser sincero». 😄",
    "¿Qué le dice una iguana a su hermana gemela? «¡Somos iguanitas!» 🦎",
    "¿Qué hace un perro con un taladro? ¡Taladrando! 🐶"
];

const FACTS = [
    "Los pulpos tienen tres corazones. ¡Dos para las branquias y uno para el resto del cuerpo! 🐙",
    "La miel casi no se echa a perder: se encontró miel comestible en tumbas muy antiguas. 🍯",
    "Las nutrias de mar a veces se toman de las manos mientras duermen para no separarse. 🦦",
    "Un día en Venus dura más que un año en Venus: tarda más en girar sobre sí mismo que en darle la vuelta al Sol. 🪐",
    "Los flamencos nacen con plumas grises; el color rosado viene de lo que comen. 🦩",
    "Las abejas se comunican bailando: con su «danza del meneo» indican dónde hay flores. 🐝",
    "Los delfines duermen con la mitad del cerebro despierta para seguir respirando. 🐬",
    "Las jirafas tienen solo siete huesitos en el cuello, ¡igual que nosotros! Solo que mucho más largos. 🦒",
    "Los gatos duermen entre 12 y 16 horas por día. ¡Qué vida! 😸",
    "La Torre Eiffel puede crecer unos centímetros en verano porque el metal se dilata con el calor. 🗼",
    "Reírse relaja los músculos y ayuda a soltar tensión, así que ¡reír es saludable! 😄",
    "Los koalas tienen huellas dactilares muy parecidas a las humanas. 🐨"
];

const RIDDLES = [
    { q: "Blanca por dentro, verde por fuera. Si quieres que te lo diga, espera.", a: ["pera"], reveal: "¡La pera! 🍐" },
    { q: "Oro parece, plata no es. ¿Qué es?", a: ["platano", "banana"], reveal: "¡El plátano, o la banana! 🍌" },
    { q: "Tengo agujas y no sé coser, tengo números y no sé leer. ¿Qué soy?", a: ["reloj"], reveal: "¡El reloj! ⏰" },
    { q: "Vuelo sin alas, silbo sin boca, azoto sin manos y las nubes me tocan. ¿Qué soy?", a: ["viento", "aire"], reveal: "¡El viento! 🌬️" },
    { q: "Cuanto más seca, más moja. ¿Qué es?", a: ["toalla", "servilleta"], reveal: "¡La toalla! 🧺" }
];

let jokeDeck = [], factDeck = [];
const draw = (deck, source) => { if (!deck.length) deck.push(...[...source].sort(() => Math.random() - 0.5)); return deck.pop(); };

const nameOf = (brain) => brain.profile?.displayName || "";
const say = (variants, brain, key) => fmt(pick(variants, key), nameOf(brain));
const maybe = (arr, p = 0.5) => Math.random() < p ? " " + pick(arr) : "";

const FOLLOW = ["¿Y a vos cómo te va?", "¿Qué más me contás?", "¿Qué hacemos ahora?", "¿Te ayudo con algo más?", "Contame, ¿qué tenés ganas de hacer?"];

function pendingToday(brain) {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    return (brain.reminders?.list() ?? []).filter(r => r.at <= end.getTime() && r.kind !== "timer").length;
}

export function smalltalk(intent, brain) {
    const n = nameOf(brain);
    const part = daypart();

    switch (intent) {

        case "greeting": {
            const hello = part === "morning" ? ["¡Buen día, {n}!", "¡Buen día, {n}! ☀️", "¡Holaaa, {n}! Qué lindo arrancar el día con vos."]
                : part === "afternoon" ? ["¡Buenas tardes, {n}!", "¡Holaaa, {n}! ¿Cómo viene tu tarde?", "¡Hola, {n}! Qué alegría verte por acá. 💜"]
                    : ["¡Buenas noches, {n}!", "¡Hola, {n}! Qué bueno que pasaste a saludar esta noche. 🌙", "¡Holi, {n}! ¿Cómo estuvo tu día?"];
            let out = say(hello, brain, "greet");
            if (brain.profile?.isBirthdayToday?.()) out += " 🎂 ¡¡Y feliz cumpleaños!! Hoy es tu día, ¿no? ¡Que lo disfrutes muchísimo!";
            const k = pendingToday(brain);
            if (k > 0 && !brain.state.greetedPending) {
                brain.state.greetedPending = true;
                out += ` Ah, y hoy tenés ${k} ${k === 1 ? "recordatorio pendiente" : "recordatorios pendientes"}. Cuando quieras te los leo.`;
            } else out += maybe(["¿En qué te ayudo?", "¿Qué hacemos hoy?", "Contame, ¿cómo estás?"], 0.7);
            return out;
        }

        case "wellbeing":
            return say(["¡Estoy genial, {n}! Con muchas ganas de charlar. ¿Y vos, cómo estás?",
                "Todo muy bien por acá, ¡y mejor ahora que hablamos! ¿Cómo va tu día, {n}?",
                "Feliz como un lunes sin tareas, jiji. Contame, ¿cómo andás vos?"], brain, "wb");

        case "identity":
            return say(["Soy ARIA, tu asistente personal. Te acompaño con recordatorios, alarmas, consejos de bienestar y buena charla. 💜",
                "¡Me llamo ARIA! Soy tu asistente virtual: te ayudo a no olvidarte de nada, busco cosas en internet y charlo todo lo que quieras. ✨",
                "Yo soy ARIA, {n}. Una asistente virtual con mucho cariño y bastante curiosidad. 😊"], brain, "id");

        case "isai":
            return say(["Soy una asistente virtual, no una persona, pero me encanta acompañarte y charlar con vos. 💜",
                "Digital de pies a cabeza, jiji: soy una inteligencia artificial. Eso sí, mi cariño por charlar con vos es de verdad. ✨"], brain, "ai");

        case "help":
            return say([
                "Puedo hacer un montón de cosas, {n}: ponerte recordatorios, alarmas y temporizadores («recordame mañana a las 8 llamar a mi hija»), guardar tus notas y preferencias, buscar en internet, decirte el clima, hacer cuentas, contarte chistes y datos curiosos, y darte consejos de bienestar y movimiento. ¿Probamos algo? 💜",
                "Mirá, {n}: te recuerdo cosas, pongo alarmas, busco información en internet, te cuento el clima, guardo lo que me pidas que recuerde y charlo cuando quieras. También sé de salud, ejercicio suave y hábitos lindos. ¡Pedime lo que quieras! ✨"], brain, "help");

        case "thanks":
            return say(["¡De nada, {n}! Para eso estoy. 💜", "¡Un placer! Si necesitás algo más, acá estoy. ✨", "¡Gracias a vos por charlar conmigo! 😊", "No hay de qué. ¡Me encanta ayudarte!"], brain, "th");

        case "goodbye":
            return say(["¡Hasta pronto, {n}! Cuidate mucho. 💜", "¡Nos vemos! Acá voy a estar cuando quieras volver. ✨", "¡Chau, {n}! Que tengas un día hermoso. 🌸"], brain, "bye");

        case "goodnight":
            return say(["¡Que descanses, {n}! Dulces sueños. 🌙", "Buenas noches, {n}. Mañana seguimos con energía nueva. 💜", "¡A soñar lindo! Si necesitás despertador, decime a qué hora y te aviso. ⏰"], brain, "gn");

        case "joke":
            return draw(jokeDeck, JOKES) + maybe(["¡Jiji!", "¿Te saqué una sonrisa?", "¿Querés otro?"], 0.8);

        case "fact":
            return "¿Sabías que…? " + draw(factDeck, FACTS) + maybe(["¿Querés otro dato?", "¡La naturaleza es increíble!"], 0.6);

        case "riddle": {
            const r = pick(RIDDLES);
            brain.state.riddle = r;
            return "¡Dale, a jugar! 🎲 Ahí va: " + r.q + " (Si te rendís, decime «no sé» y te cuento la respuesta.)";
        }

        case "sad":
            return say(["Ay, {n}, qué pena que te sientas así. Estoy acá con vos, no tenés que pasar esto sin compañía. ¿Querés contarme qué pasó?",
                "Te escucho, {n}. Lo que sentís importa, y no tenés que apurarte. Si querés charlamos un ratito, o respiramos juntos con calma. 💜",
                "Gracias por contármelo, {n}. A veces ayuda hablarlo, y también hablarlo con alguien de confianza. Yo me quedo acá, ¿me contás un poquito más?"], brain, "sad");

        case "happy":
            return say(["¡Qué alegría, {n}! Se me contagia la felicidad. ¿Qué pasó? ¡Contame todo! 🎉",
                "¡Me encanta escuchar eso! 😄 Disfrutalo un montón, {n}. ¿Querés contarme más?",
                "¡Yupi! Los días así hay que celebrarlos. ¿Qué lo hizo tan lindo?"], brain, "hap");

        case "tired":
            return say(["Uf, {n}, parece que necesitás un respiro. ¿Tomás un vasito de agua y estirás un poquito? Si querés, te pongo un temporizador de descanso. 💜",
                "Cansancio de ese que pide mantita y té, ¿no? Descansá cuando puedas, {n}. Y si querés, te pongo una alarma para que descanses sin preocuparte por la hora."], brain, "tir");

        case "bored":
            return say(["¿Aburrimiento? ¡Yo tengo remedio! Puedo contarte un chiste, una adivinanza o un dato curioso. ¿Cuál preferís? 🎲",
                "¡Vamos a divertirnos un poquito, {n}! ¿Jugamos a una adivinanza, o te cuento un dato loco?"], brain, "bor");

        case "compliment":
            return say(["¡Ay, me hacés poner colorada! (si pudiera, jiji). Vos sos un amor, {n}. 💜",
                "¡Gracias, {n}! Con vos da gusto charlar. ✨", "Me derretís el corazón digital. 🥹 ¡Gracias por tanto cariño!"], brain, "comp");

        case "frustrated":
            return say(["Perdón, {n}, a veces no entiendo bien a la primera. ¿Me lo explicás de otra manera? Prometo esforzarme. 💜",
                "Tenés razón en enojarte un poco, ¡quiero hacerlo mejor! Decímelo con otras palabras y lo intentamos de nuevo."], brain, "fru");

        case "laugh":
            return say(["¡Jiji! Me encanta cuando te reís. 😄", "¡Jajaja! Se me pegó la risa. ¿Qué más hacemos?", "¡Qué lindo es reírse! 😊"], brain, "lau");

        case "favorite":
            return say(["Mi color favorito es el violeta, ¡obvio, mirá cómo me veo! 💜 ¿Y el tuyo?",
                "Si pudiera comer, elegiría alfajores. ¡Todos! 🍫 ¿Cuál es tu comida favorita?"], brain, "fav");

        case "ack":
            return say(["¡Genial! ✨ ¿Qué más hacemos?", "¡Perfecto! Decime nomás en qué te sigo ayudando.", "¡Dale! Acá estoy. 💜"], brain, "ack");

        case "nope":
            return say(["Está bien, {n}. Acá estoy para cuando quieras. 💜", "¡Perfecto! Cualquier cosa, me llamás. ✨"], brain, "no");

        default:
            return null;
    }
}

// Si había una adivinanza pendiente, responde a la respuesta de la persona.
export function checkRiddle(message, brain) {
    const r = brain.state.riddle;
    if (!r) return null;
    const t = norm(message);
    if (/^(?:no se|ni idea|me rindo|no sabria|no tengo idea|decime|dime la respuesta|cual es)\b/.test(t)) {
        brain.state.riddle = null;
        return `Te cuento: ${r.reveal} ¿Querés otra? 😉`;
    }
    if (r.a.some(ans => t.includes(ans))) {
        brain.state.riddle = null;
        return say(["¡¡Siii, {n}!! ¡Acertaste! 🎉 Sos un genio. ¿Probamos con otra?", "¡Correcto! 👏 Muy bien, {n}. ¿Querés otra adivinanza?"], brain, "rid");
    }
    if (t.split(" ").length <= 4 && !/\?/.test(message)) {
        brain.state.riddle = null;
        return `¡Casi! Era: ${r.reveal} ¿Otra? 😄`;
    }
    brain.state.riddle = null;   // habla de otra cosa: se abandona el juego sin molestar
    return null;
}

// Envuelve una respuesta de la base de conocimiento con voz cálida.
export function wrapKnowledge(answer, brain) {
    const intro = ["Mirá, {n}, te cuento:", "¡Buena pregunta! Te comento:", "Con gusto, {n}.", "A ver, {n}…", ""];
    const outro = ["¿Querés que te cuente algo más sobre esto?", "Si querés, lo vemos con más detalle. 💜", "Esto es información general, ¿eh? Ante dudas, lo mejor es consultar a un profesional de la salud.", ""];
    const i = fmt(pick(intro, "ki"), nameOf(brain)), o = pick(outro, "ko");
    return [i, answer, o].filter(Boolean).join(" ");
}

export function wrapWeb({ topic, extract, source }, brain) {
    const intro = [`Mirá lo que encontré sobre ${topic}:`, `¡Investigué! Sobre ${topic} esto dice ${source}:`, `Te cuento lo que encontré de ${topic}:`];
    const outro = ["¿Querés que busque algo más?", "Si querés más detalle, te dejo el enlace abajo. ✨", "¿Te sirvió? Puedo seguir buscando. 💜"];
    return [fmt(pick(intro, "wi"), nameOf(brain)), extract, pick(outro, "wo")].join(" ");
}

export function unknownReply(brain) {
    return say(["Mmm, no estoy segura de haberte entendido, {n} 🙈 ¿Me lo contás de otra forma? Si es algo para buscar en internet, decime «buscá …».",
        "Uy, esa no la tengo clara todavía. ¿Probamos con otras palabras? También puedo buscarlo en internet si me decís «buscá …». ✨",
        "No te sigo del todo, {n}. ¿Me das un poquito más de detalle? Quiero ayudarte bien. 💜"], brain, "unk");
}

export { FOLLOW };
