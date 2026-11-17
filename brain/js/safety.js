// ARIA BRAIN · safety.js
// Detecta señales de emergencia médica o de crisis emocional y responde con calma y prioridad.

import { CONFIG } from "./config.js";

const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const MEDICAL = [
    /\bdolor (fuerte )?en el pecho\b/, /\bpresion (fuerte )?en el pecho\b/, /\bme duele el pecho\b/,
    /\bdificultad para respirar\b/, /\bno puedo respirar\b/, /\bme falta el aire\b/, /\bme cuesta respirar\b/,
    /\bperdi el conocimiento\b/, /\bme desmaye\b/, /\bperdio el conocimiento\b/, /\bse desmayo\b/,
    /\bdebilidad repentina de un lado\b/, /\bno puedo mover un lado del cuerpo\b/, /\bse me paralizo un lado\b/,
    /\bdificultad repentina para hablar\b/, /\bboca torcida\b/, /\bme cai y no puedo (levantarme|moverme)\b/,
    /\bvomito sangre\b/, /\bsangrado (muy )?(fuerte|abundante)\b/
];

const CRISIS = [
    /\bquiero morirme\b/, /\bme quiero morir\b/, /\bquiero matarme\b/, /\bpienso en suicid/, /\bno quiero vivir\b/,
    /\bquitarme la vida\b/, /\bacabar con mi vida\b/, /\bquiero hacerme dano\b/, /\bme quiero lastimar\b/, /\bmejor no estar aqui\b/
];

export function checkHealthSafety(message) {
    if (typeof message !== "string") return { urgent: false, message: null, kind: null };
    const text = fold(message);
    const num = CONFIG.emergencyNumber || "911";

    if (CRISIS.some(re => re.test(text))) {
        return {
            urgent: true, kind: "crisis",
            message: "Gracias por contármelo. Lo que sentís me importa mucho y no tenés que pasarlo sin compañía. " +
                `Si estás en peligro o pensás en hacerte daño ahora, llamá al ${num} o pedile a alguien cercano que se quede con vos en este momento. ` +
                "Hablar con un profesional también puede ayudar muchísimo. Yo me quedo acá, charlando con vos. 💜"
        };
    }
    if (MEDICAL.some(re => re.test(text))) {
        return {
            urgent: true, kind: "medical",
            message: "Lo que describís podría ser una emergencia médica, y quiero que estés a salvo. " +
                `Llamá ahora al ${num} (emergencias) o pedile a alguien cercano que te ayude. ` +
                "No esperes a que te responda ni intentes resolverlo solo con esta charla. 💜"
        };
    }
    return { urgent: false, message: null, kind: null };
}
