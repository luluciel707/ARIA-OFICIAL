export const CONFIG = {
    name: "ARIA",
    version: "0.1.0",

    channelName: "aria-hologram",

    memoryKey: "aria_local_memory",

    // Ciudad por defecto para la hora y el clima.
    location: {
        name: "Corrientes",
        lat: -27.4692,
        lon: -58.8306,
        timezone: "America/Argentina/Buenos_Aires"
    },

    // Para que ARIA busque y reproduzca videos sola, pegá acá una clave de
    // YouTube Data API v3 (gratis). Sin clave, deja un botón con la búsqueda.
    // IMPORTANTE si publicás en GitHub: NO pegues la clave acá (el repositorio es público).
    // Decile a ARIA en el chat: "clave de youtube AIza..." y se guarda solo en tu navegador.
    youtube: {
        apiKey: ""
    },

    // IA generativa dentro del navegador (WebGPU). Se activa con el botón o diciendo
    // "activá la inteligencia artificial". El modelo pequeño funciona en más equipos,
    // aunque puede ser menos preciso y expresivo que modelos más grandes.
    ai: {
        modelId: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"
    },

    personality: {
        identity: "asistente personal virtual",
        tone: "cálida, dulce, espontánea, juguetona y respetuosa",
        audience: "personas adultas y mayores",
        specialties: [
            "Conversación general, ideas y explicaciones",
            "Juegos, acertijos y humor",
            "Cuidado corporal y bienestar",
            "Salud general con límites responsables",
            "Capacidades motrices y envejecimiento saludable"
        ]
    }
};
