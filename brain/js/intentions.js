export function recognizeIntent(message) {

    const text = message.toLowerCase().trim();

    if (/^(hola|holi|hey|buenas|buen día|buenos días|buenas tardes|buenas noches)/.test(text)) {
        return "greeting";
    }

    if (/cómo estás|como estas|qué tal estás|que tal estas/.test(text)) {
        return "wellbeing";
    }

    if (/quién eres|quien eres|qué eres|que eres/.test(text)) {
        return "identity";
    }

    if (/qué puedes hacer|que puedes hacer|ayuda|tus funciones/.test(text)) {
        return "help";
    }

    if (/qué hora es|que hora es|dime la hora/.test(text)) {
        return "time";
    }

    if (/qué fecha es|que fecha es|qué día es|que dia es/.test(text)) {
        return "date";
    }

    if (/^(gracias|muchas gracias|te agradezco)/.test(text)) {
        return "thanks";
    }

    if (/^recuerda que\s+/.test(text)) {
        return "remember";
    }

    if (/qué recuerdas|que recuerdas|qué tienes en memoria|que tienes en memoria/.test(text)) {
        return "recall";
    }

    if (/^olvida la nota\s+/.test(text)) {
        return "forget";
    }

    if (/^(adiós|adios|hasta luego|nos vemos)/.test(text)) {
        return "goodbye";
    }

    return "unknown";
}