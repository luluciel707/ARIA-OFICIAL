
import { CONFIG } from "./config.js";
import { ARIAMemory } from "./memory.js";
import { ARIAConversation } from "./conversation.js";
import { reason } from "./reasoning.js";
import { runSkills, extractLookupQuery, wikiLookup } from "./skills.js";
import { recognizeIntent } from "./intentions.js";
import { searchKnowledge } from "./knowledge.js";
import { checkHealthSafety } from "./safety.js";
import { generativeEngine } from "./webllm.js";

// El servidor Python/llama.cpp solo existe en la PC local; en GitHub Pages no se consulta.
const LOCAL_HOST = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

class ARIABrain {

    constructor() {
        this.memory = new ARIAMemory();
        this.conversation = new ARIAConversation();
        this.channel = null;
        this.initialized = false;
        this.hologramConnected = false;
        this.localGatewayAvailable = false;
        this.ai = generativeEngine;
    }

    // =====================================
    // INICIALIZACIÓN
    // =====================================

    initialize() {

        if (this.initialized) return;

        if ("BroadcastChannel" in window) {

            // Admite channelName o channel.
            const channelName =
                CONFIG.channelName || CONFIG.channel;

            if (!channelName) {
                console.error("ARIA: falta configurar el canal.");
                return;
            }

            this.channel = new BroadcastChannel(channelName);

            this.channel.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            console.log("ARIA: canal de comunicación preparado.");

        } else {
            console.error(
                "Este navegador no admite BroadcastChannel."
            );
            return;
        }

        this.initialized = true;

        // El gateway Python es opcional y solo se busca en la PC local.
        if (LOCAL_HOST) this.checkLocalGateway();

        // Si la IA generativa ya estaba activada, se vuelve a cargar (el modelo queda en caché).
        if (this.ai.wasEnabled && this.ai.supported) {
            this.ai.enable().catch(() => { /* el estado queda en la interfaz */ });
        }

        console.log(
            `${CONFIG.name} BRAIN v${CONFIG.version} iniciado.`
        );
    }

    async checkLocalGateway() {
        try {
            const response = await fetch("/api/status", { cache: "no-store" });
            if (!response.ok) throw new Error("Gateway no disponible");
            const status = await response.json();
            this.localGatewayAvailable = Boolean(status.ok);
            console.log("ARIA Python Gateway:", this.localGatewayAvailable ? "conectado" : "desconectado", "| Modelo:", status.model ? "disponible" : "no iniciado");
            return status;
        } catch (_) {
            this.localGatewayAvailable = false;
            console.info("ARIA: gateway Python no detectado; se usará el cerebro JavaScript.");
            return null;
        }
    }

    // Respuesta de la IA generativa: primero la del navegador (WebGPU), si no, el servidor local.
    async askGenerative(message) {
        const history = this.conversation.getRecentMessages(8).slice(0, -1);
        const memories = this.memory.recall().slice(-12).map(note => note.content);

        if (this.ai.ready) {
            try {
                const answer = await this.ai.ask(message, history, memories);
                if (answer) return answer;
            } catch (error) {
                console.warn("ARIA: falló la IA del navegador.", error.message);
            }
        }
        return this.askLocalModel(message);
    }

    // Avisos que no son respuesta a un mensaje (por ejemplo, "terminé de descargar la IA").
    announce(text) {
        this.conversation.add("assistant", text);
        this.sendToHologram("SAY", { text });
        window.dispatchEvent(new CustomEvent("aria:response", { detail: text }));
    }

    async askLocalModel(message) {
        if (!LOCAL_HOST) return null;
        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message,
                    history: this.conversation.getRecentMessages(8).slice(0, -1),
                    memories: this.memory.recall().slice(-12).map(note => note.content)
                })
            });
            if (!response.ok) return null;
            const result = await response.json();
            if (result.available && typeof result.answer === "string" && result.answer.trim()) {
                this.localGatewayAvailable = true;
                return result.answer.trim();
            }
            return null;
        } catch (error) {
            this.localGatewayAvailable = false;
            console.info("ARIA: modelo local no disponible; usando respaldo JS.", error.message);
            return null;
        }
    }

    // =====================================
    // RECEPCIÓN DE MENSAJES
    // =====================================

    handleMessage(data) {

        if (!data || typeof data !== "object") return;

        // Solo aceptar mensajes procedentes del holograma.
        if (data.source !== "hologram") return;

        const payload = data.payload || {};

        switch (data.type) {

            case "USER_MESSAGE": {

                if (typeof payload.text !== "string") return;

                this.processMessage(payload.text).then(response => {

                    if (response) {
                        window.dispatchEvent(
                            new CustomEvent("aria:response", {
                                detail: response
                            })
                        );
                    }

                });

                break;
            }

            case "HOLOGRAM_READY": {

                this.hologramConnected = true;

                console.log("ARIA HOLOGRAM está conectado.");

                this.setState("IDLE");

                break;
            }

            case "HOLOGRAM_STATUS": {

                this.hologramConnected = true;

                // Responder para confirmar que el cerebro está activo.
                this.setState("IDLE");

                break;
            }
        }
    }

    // =====================================
    // ESTADOS
    // =====================================

    setState(state) {

        this.sendToHologram("STATE", {
            state: String(state).toUpperCase()
        });
    }

    // =====================================
    // COMUNICACIÓN CON EL HOLOGRAMA
    // =====================================

    sendToHologram(type, payload = {}) {

        if (!this.channel) return;

        this.channel.postMessage({

            type,

            payload,

            source: "brain",

            ts: Date.now()

        });
    }

    // =====================================
    // PROCESAMIENTO DE MENSAJES
    // =====================================

    async processMessage(message) {

        if (typeof message !== "string") return null;

        message = message.trim();

        if (!message) return null;

        this.conversation.add("user", message);

        this.setState("THINKING");

        try {

            // 1) Habilidades con datos reales: hora, fecha, clima, música, videos, búsquedas.
            const skillResponse = await runSkills(message, {
                sendToHologram: (type, payload) => this.sendToHologram(type, payload),
                hologramConnected: this.hologramConnected,
                ai: this.ai,
                announce: (text) => this.announce(text)
            });

            let response = skillResponse;

            // 2) Lo que ARIA resuelve mejor por reglas (urgencias de salud, saludos, notas, conocimiento propio).
            if (!response) {
                const deterministic = checkHealthSafety(message).urgent
                    || recognizeIntent(message) !== "unknown"
                    || searchKnowledge(message).found;
                if (deterministic) response = await reason(message, this.memory);
            }

            // 3) IA generativa (navegador o servidor local), si está disponible.
            if (!response) response = await this.askGenerative(message);

            // 4) Sin IA: buscar en Wikipedia preguntas del tipo "qué es / quién fue ...".
            if (!response) {
                const query = extractLookupQuery(message);
                if (query) {
                    const found = await wikiLookup(query);
                    if (found) response = found;
                }
            }

            // 5) Respaldo final del razonamiento en JavaScript.
            if (!response) response = await reason(message, this.memory);

            if (typeof response !== "string" || !response.trim()) {
                throw new Error("El razonamiento no devolvió una respuesta válida.");
            }

            // Guardar la respuesta.
            this.conversation.add("assistant", response);

            // Enviar al holograma.
            this.sendToHologram("SAY", {
                text: response
            });

            this.setState("IDLE");

            return response;

        } catch (error) {

            console.error("Error en ARIA BRAIN:", error);

            const fallback =
                "Tuve un pequeño problema procesando ese mensaje. ¿Lo intentamos otra vez?";

            this.setState("ERROR");

            this.sendToHologram("SAY", {
                text: fallback
            });

            return fallback;
        }
    }

    // =====================================
    // ESTADO DEL SISTEMA
    // =====================================

    getStatus() {

        return {

            name: CONFIG.name,

            version: CONFIG.version,

            initialized: this.initialized,

            memoryEntries: this.memory.recall().length,

            conversationMessages: this.conversation.length,

            hologramConnected: this.hologramConnected,

            localGatewayAvailable: this.localGatewayAvailable,

            ai: { supported: this.ai.supported, state: this.ai.state }

        };
    }

    // =====================================
    // CIERRE
    // =====================================

    close() {

        if (this.channel) {

            this.channel.close();

            this.channel = null;
        }

        this.hologramConnected = false;

        this.initialized = false;
    }
}

// =====================================
// INSTANCIA PRINCIPAL
// =====================================

export const ariaBrain = new ARIABrain();

ariaBrain.initialize();

window.ariaBrain = ariaBrain;
