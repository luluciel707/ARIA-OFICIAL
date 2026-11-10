
const knowledgeBase = {

    bodyCare: {
        name: "Cuidado corporal",

        topics: [
            {
                keywords: ["piel", "cuidar la piel", "higiene"],
                answer:
                    "El cuidado de la piel incluye mantener una higiene adecuada, " +
                    "utilizar productos suaves y protegerla del sol. " +
                    "Las necesidades pueden cambiar con la edad y el tipo de piel."
            },
            {
                keywords: ["descanso", "dormir", "sueño"],
                answer:
                    "El descanso es importante para el bienestar físico y mental. " +
                    "Mantener horarios regulares y un ambiente tranquilo " +
                    "puede favorecer un buen descanso."
            },
            {
                keywords: ["hidratación", "hidratacion", "agua", "beber agua"],
                answer:
                    "Mantener una hidratación adecuada ayuda al funcionamiento " +
                    "normal del organismo. Las necesidades de líquidos varían " +
                    "según cada persona, su actividad y su situación de salud."
            }
        ]
    },

    health: {
        name: "Salud general",

        topics: [
            {
                keywords: ["alimentación", "alimentacion", "nutrición", "nutricion"],
                answer:
                    "Una alimentación variada y equilibrada contribuye al bienestar. " +
                    "Es importante considerar las necesidades individuales, " +
                    "las preferencias y las posibles indicaciones profesionales."
            },
            {
                keywords: ["prevención", "prevencion"],
                answer:
                    "La prevención incluye controles de salud, vacunación " +
                    "según las recomendaciones correspondientes y hábitos " +
                    "saludables. Los controles permiten consultar dudas " +
                    "y detectar problemas de salud."
            },
            {
                keywords: ["presión arterial", "presion arterial"],
                answer:
                    "La presión arterial es la fuerza que ejerce la sangre " +
                    "sobre las paredes de las arterias. Su interpretación " +
                    "depende de las mediciones y del contexto de cada persona. " +
                    "Un profesional puede ayudarte a comprender tus resultados."
            }
        ]
    },

    motorSkills: {
        name: "Capacidades motrices",

        topics: [
            {
                keywords: ["equilibrio"],
                answer:
                    "El equilibrio es la capacidad de mantener la estabilidad " +
                    "del cuerpo al estar quietos o al movernos. Es importante " +
                    "para actividades cotidianas como caminar, levantarse " +
                    "y cambiar de dirección."
            },
            {
                keywords: ["coordinación", "coordinacion"],
                answer:
                    "La coordinación permite organizar los movimientos " +
                    "del cuerpo para realizar acciones de manera controlada. " +
                    "Participa, por ejemplo, al caminar, escribir o tomar objetos."
            },
            {
                keywords: ["flexibilidad"],
                answer:
                    "La flexibilidad es la capacidad de las articulaciones " +
                    "y los músculos para permitir determinados movimientos. " +
                    "Puede variar entre personas y con el paso del tiempo."
            },
            {
                keywords: ["fuerza muscular", "fuerza"],
                answer:
                    "La fuerza muscular es la capacidad de los músculos " +
                    "para generar tensión y permitir movimientos o esfuerzos. " +
                    "Es importante para muchas actividades cotidianas."
            },
            {
                keywords: ["movilidad", "movimiento"],
                answer:
                    "La movilidad es la capacidad de mover el cuerpo " +
                    "y sus articulaciones. Interviene en acciones cotidianas " +
                    "como caminar, sentarse, levantarse y alcanzar objetos."
            }
        ]
    },

    healthyAging: {
        name: "Envejecimiento saludable",

        topics: [
            {
                keywords: ["envejecimiento", "envejecer", "vejez"],
                answer:
                    "El envejecimiento es un proceso natural. Puede producir " +
                    "cambios en la fuerza, la movilidad, el descanso y otras " +
                    "funciones, pero no ocurre de la misma manera en todas " +
                    "las personas."
            },
            {
                keywords: ["autonomía", "autonomia", "independencia"],
                answer:
                    "La autonomía es la posibilidad de tomar decisiones " +
                    "sobre nuestra propia vida. Mantenerla implica respetar " +
                    "las preferencias personales y contar con los apoyos " +
                    "necesarios cuando hacen falta."
            }
        ]
    },

    emotionalWellbeing: {
        name: "Bienestar emocional",

        topics: [
            {
                keywords: ["soledad"],
                answer:
                    "La soledad puede afectar el bienestar emocional. " +
                    "Mantener vínculos sociales, participar en actividades " +
                    "agradables y hablar con personas de confianza puede " +
                    "ayudar a sentirse acompañado."
            },
            {
                keywords: ["estrés", "estres", "tranquilidad"],
                answer:
                    "El bienestar emocional también forma parte del cuidado " +
                    "integral. Los momentos de descanso, las actividades " +
                    "agradables y el acompañamiento pueden contribuir " +
                    "a manejar las preocupaciones."
            }
        ]
    }
};

function normalize(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

export function searchKnowledge(message) {

    const text = normalize(message);

    for (const [categoryId, category] of Object.entries(knowledgeBase)) {

        for (const topic of category.topics) {

            const found = topic.keywords.some(keyword =>
                text.includes(normalize(keyword))
            );

            if (found) {
                return {
                    found: true,
                    category: category.name,
                    categoryId,
                    answer: topic.answer
                };
            }
        }
    }

    return {
        found: false,
        category: null,
        categoryId: null,
        answer: null
    };
}

export function getKnowledgeCategories() {

    return Object.entries(knowledgeBase).map(([id, category]) => ({
        id,
        name: category.name,
        topics: category.topics.length
    }));
}
