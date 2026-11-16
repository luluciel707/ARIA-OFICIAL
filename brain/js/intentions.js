// ARIA BRAIN · intentions.js
// Reconoce intenciones de conversación con expresiones regulares (sobre texto sin tildes).

import { norm } from "./text.js";

const RULES = [
    ["remember", /^(?:recorda|recuerda|anota|anotame|guarda|guardame|acordate|apunta) (?:que |de que )?\w+/],
    ["recall", /\b(?:que recordas|que recuerdas|que tenes en memoria|que tienes en memoria|mis notas|que anotaste|que guardaste)\b/],
    ["forget", /^(?:olvida|olvidate|borra|elimina)\w* (?:la nota|de que|que|la anotacion|lo de)\b/],

    ["time", /\b(?:que hora es|decime la hora|dime la hora|hora actual|me decis la hora|me das la hora|que hora son)\b/],
    ["date", /\b(?:que fecha es|que dia es|fecha de hoy|a cuanto estamos|que dia es hoy|que dia de la semana)\b/],

    ["goodnight", /\b(?:me voy a dormir|voy a dormir|a dormir|que descanses|buenas noches y|hasta manana)\b/],
    ["goodbye", /^(?:adios|chau|chao|hasta luego|hasta pronto|nos vemos|me voy|bye)\b/],
    ["thanks", /^(?:gracias|muchas gracias|te agradezco|mil gracias|genial gracias|ok gracias|gracias aria|graciass)\b/],
    ["greeting", /^(?:hola|holi|holis|holaa+|hey|ey|buenas|buen dia|buenos dias|buenas tardes|buenas noches|que tal|wenas|ola)\b/],

    ["wellbeing", /\b(?:como estas|como andas|como te va|que tal estas|como te sentis|como te sientes|como va tu dia|como amaneciste)\b/],
    ["identity", /\b(?:quien sos|quien eres|que sos|que eres|como te llamas|cual es tu nombre|presentate|quien te creo)\b/],
    ["isai", /\b(?:sos (?:una )?(?:humana|persona|real|robot|maquina)|eres (?:una )?(?:humana|persona|real|robot)|estas viva|tenes sentimientos)\b/],
    ["help", /^(?:ayuda|ayudame|que podes hacer|que puedes hacer|que sabes hacer|que sabes|para que servis|tus funciones|que haces|como te uso|en que me ayudas|en que me podes ayudar)\b/],

    ["joke", /\b(?:chiste|chistecito|hacerme reir|haceme reir|algo gracioso|algo divertido|hacer reir)\b/],
    ["fact", /\b(?:dato curioso|dato interesante|cosa curiosa|algo interesante|sabias que|curiosidad)\b/],
    ["riddle", /\b(?:adivinanza|acertijo|adivina|jugamos|juguemos|jugar a algo|jugar conmigo)\b/],

    ["sad", /\b(?:estoy triste|me siento triste|me siento mal|estoy mal|estoy deprimid|me siento solo|me siento sola|estoy angustiad|ganas de llorar|dia horrible|no doy mas|estoy cansad[oa] de todo|extrano a|estoy preocupad)/],
    ["happy", /\b(?:estoy feliz|estoy contento|estoy contenta|que alegria|me siento bien|estoy re bien|que lindo dia|buenas noticias|me fue genial|estoy emocionad|estoy muy bien)/],
    ["tired", /\b(?:estoy cansad|tengo sueno|estoy agotad|no dormi|estoy sin energia)/],
    ["bored", /\b(?:estoy aburrid|me aburro|aburrimiento|no se que hacer)/],
    ["compliment", /\b(?:sos (?:muy |re )?(?:linda|genial|divina|increible|buena|simpatica|dulce|un amor|lo mejor|la mejor|inteligente|hermosa)|te quiero|me caes bien|me encantas|sos un sol|que linda sos|te adoro|sos mi amiga)\b/],
    ["frustrated", /\b(?:sos (?:tonta|inutil|mala|estupida|lenta)|no servis|no entendes|no entendiste|que mal que|no me ayudas)\b/],
    ["laugh", /^(?:ja(?:ja)+|je(?:je)+|ji(?:ji)+|jsjs+|jaja+|jeje+|jiji+|xd+|ajaj+|lol)\b/],
    ["favorite", /\bcual es tu (?:comida|color|musica|cancion|animal|estacion|flor)\b/],
    ["ack", /^(?:si|sii+|dale|ok|okey|okay|bueno|listo|claro|perfecto|de una|mmm+|aja|ajam|entiendo|ya veo|entonces)$/],
    ["nope", /^(?:no|nop|nada|nada mas|no gracias|todavia no|ahora no)$/]
];

export function recognizeIntent(message) {
    const text = norm(message);
    for (const [name, re] of RULES) if (re.test(text)) return name;
    return "unknown";
}
