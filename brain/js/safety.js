
export function checkHealthSafety(message) {

    if (typeof message !== "string") {
        return {
            urgent: false,
            message: null
        };
    }

    const text = message
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const urgentPatterns = [

        // Posibles señales cardiovasculares
        /\bdolor (fuerte )?en el pecho\b/,
        /\bpresion (fuerte )?en el pecho\b/,

        // Dificultades respiratorias
        /\bdificultad para respirar\b/,
        /\bno puedo respirar\b/,
        /\bme falta el aire\b/,
        /\bme cuesta respirar\b/,

        // Pérdida de conocimiento
        /\bperdi el conocimiento\b/,
        /\bme desmaye\b/,
        /\bperdio el conocimiento\b/,

        // Posibles señales neurológicas
        /\bdebilidad repentina de un lado\b/,
        /\bno puedo mover un lado del cuerpo\b/,
        /\bse me paralizo un lado\b/,
        /\bdificultad repentina para hablar\b/
    ];

    const matched = urgentPatterns.some(pattern =>
        pattern.test(text)
    );

    if (matched) {

        return {
            urgent: true,

            message:
                "Lo que describís podría ser una señal de una emergencia médica. " +
                "Contactá inmediatamente al servicio de emergencias de tu zona. " +
                "No esperes a recibir una respuesta de ARIA ni intentes " +
                "resolverlo únicamente mediante esta conversación."
        };
    }

    return {
        urgent: false,
        message: null
    };
}
