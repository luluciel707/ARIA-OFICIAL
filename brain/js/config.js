export const CONFIG = {
    name: "ARIA",
    version: "0.2.0",

    channelName: "aria-hologram",

    memoryKey: "aria_local_memory",

    // Ciudad por defecto para la hora y el clima.
    location: {
        name: "Corrientes",
        lat: -27.4692,
        lon: -58.8306,
        timezone: "America/Argentina/Buenos_Aires"
    },

    // Número de emergencias que ARIA menciona ante una urgencia (Argentina: 911).
    emergencyNumber: "911",

    // Para que ARIA busque y reproduzca videos sola, pegá acá una clave de
    // YouTube Data API v3 (gratis). Sin clave, deja un botón con la búsqueda.
    // IMPORTANTE si publicás en GitHub: NO pegues la clave acá (el repositorio es público).
    // Decile a ARIA en el chat: "clave de youtube AIza..." y se guarda solo en tu navegador.
    youtube: {
        apiKey: ""
    },

    // IA generativa dentro del navegador (WebGPU). Se activa con el botón o diciendo
    // "activá la inteligencia artificial". Qwen2.5 0.5B pesa unos 300 MB (solo se baja una vez).
    // Opción con mejor calidad (pesa ~1 GB, pide más RAM):
    //   "Qwen2.5-1.5B-Instruct-q4f16_1-MLC"
    ai: {
        modelId: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"
    },

    // Búsqueda por internet (sin claves): Wikipedia + DuckDuckGo desde el navegador.
    search: {
        timeoutMs: 8000,
        languages: ["es", "en"]
    },

    // Memoria de largo plazo (RAG local).
    rag: {
        maxUserChars: 300000   // tope de texto de documentos propios (localStorage)
    },

    personality: {
        identity: "Asistente personal virtual de bienestar",
        tone: "Dulce, alegre, juguetona, cercana y paciente",
        audience: "Cualquier persona, con especial cariño y paciencia hacia adultos mayores",
        specialties: [
            "Recordatorios y alarmas",
            "Cuidado corporal",
            "Salud general",
            "Capacidades motrices",
            "Envejecimiento saludable",
            "Bienestar emocional"
        ]
    }
};
