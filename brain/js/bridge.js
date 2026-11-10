
export class ARIABridge {
    constructor() {
        this.channel = new BroadcastChannel("aria-hologram");
        this.listeners = [];

        // Conexión con el motor local de IA
        this.modelURL = "http://127.0.0.1:8081/v1/chat/completions";

        this.channel.onmessage = (event) => {
            this.listeners.forEach(callback => {
                callback(event.data);
            });
        };
    }

    send(type, data = {}) {
        this.channel.postMessage({
            type,
            ...data,
            timestamp: Date.now()
        });
    }

    onMessage(callback) {
        this.listeners.push(callback);

        return () => {
            this.listeners = this.listeners.filter(
                listener => listener !== callback
            );
        };
    }

    // Enviar mensajes al modelo local
    async askModel(message, history = []) {
        const messages = [
            {
                role: "system",
                content: "Eres ARIA, una asistente virtual amable, paciente y profesional."
            },
            ...history,
            {
                role: "user",
                content: message
            }
        ];

        const response = await fetch(this.modelURL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages,
                temperature: 0.7,
                max_tokens: 256,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Error del motor ARIA: ${response.status}`);
        }

        const result = await response.json();

        return result.choices?.[0]?.message?.content
            ?? "No pude generar una respuesta.";
    }

    close() {
        this.channel.close();
        this.listeners = [];
    }
}
