export function recognizeIntent(message) {

    const text = String(message || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    if (/^(hola|holi|hey|buenas|buen dia|buenos dias|buenas tardes|buenas noches)/.test(text)) {
        return "greeting";
    }

    if (/como estas|que tal estas/.test(text)) {
        return "wellbeing";
    }

    if (/quien eres|quien sos|que eres|que sos/.test(text)) {
        return "identity";
    }

    if (/que puedes hacer|ayuda|tus funciones/.test(text)) {
        return "help";
    }

    if (/que hora es|dime la hora/.test(text)) {
        return "time";
    }

    if (/que fecha es|que dia es/.test(text)) {
        return "date";
    }

    if (/^(gracias|muchas gracias|te agradezco)/.test(text)) {
        return "thanks";
    }

    if (/^(recuerda que|acordate de|acuerdate de)\s+/.test(text)) {
        return "remember";
    }

    if (/que recuerdas|que tienes en memoria|que tenes en memoria/.test(text)) {
        return "recall";
    }

    if (/^olvida la nota\s+/.test(text)) {
        return "forget";
    }

    if (/^(adios|hasta luego|nos vemos)/.test(text)) {
        return "goodbye";
    }

    if (/^mi nombre es\s+/.test(text) || /^llamame\s+/.test(text) || /^me llamo\s+/.test(text)) {
        return "set_name";
    }

    if (/\b(modo breve|modo simple|modo detallado|modo serio|modo divertido|modo juego|respuestas breves|respuestas largas|mas breve|mas detallado|menos chistes|mas chistes)\b/.test(text)) {
        return "set_mode";
    }

    if (/\b(chiste|chistes|hazme reir|haceme reir|cuentame algo gracioso|contame algo gracioso)\b/.test(text)) {
        return "joke";
    }

    if (/\b(adivinanza|adivinanzas|acertijo|acertijos)\b/.test(text)) {
        return "riddle";
    }

    if (/\b(cara o cruz|tira una moneda|lanza una moneda|lanzar una moneda)\b/.test(text)) {
        return "coin";
    }

    if (/\b(dado|dados)\b/.test(text) && /\b(tira|tirame|lanza|lanzame|dado|dados)\b/.test(text)) {
        return "dice";
    }

    if (/\b(piedra papel tijera|juguemos|jugar)\b/.test(text) && /\b(piedra|papel|tijera|jugar|juguemos)\b/.test(text)) {
        return "rps";
    }

    if (/\b(que juego|a que jugamos|juguemos a algo|quiero jugar)\b/.test(text)) {
        return "game_menu";
    }

    return "unknown";
}
