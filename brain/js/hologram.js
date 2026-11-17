// ARIA BRAIN · hologram.js
// Traduce lo que ARIA siente y hace en EXPRESSION y GESTURE para el holograma.
// Los nombres salen de CONFIG.hologram.cues (se ajustan en config.js).

import { CONFIG } from "./config.js";

// Intención de la charla -> "cue" (combinación de expresión + gesto).
const INTENT_CUES = {
    greeting: "greet", identity: "greet", goodbye: "farewell", goodnight: "farewell",
    thanks: "happy", joke: "happy", laugh: "happy", happy: "happy", compliment: "happy", wellbeing: "happy", isai: "happy",
    riddle: "playful", bored: "playful", favorite: "playful",
    fact: "explain", help: "explain", time: "explain", date: "explain",
    sad: "sad", frustrated: "sad", tired: "relaxed"
};

export function chooseCue({ safetyKind = null, intent = "unknown", createdReminder = false, hasActions = false, kb = false } = {}) {
    if (safetyKind === "crisis") return "concern";
    if (safetyKind === "medical") return "alert";
    if (createdReminder) return "confirm";
    if (INTENT_CUES[intent]) return INTENT_CUES[intent];
    if (kb || hasActions) return "explain";
    return "neutral";
}

export class HologramCues {

    constructor(send) {
        this.send = send;          // (type, payload) => void
        this.resetTimer = null;
    }

    // speechText: lo que ARIA va a decir (para calcular cuánto sostener la expresión).
    play(name, speechText = "") {
        const cue = CONFIG.hologram?.cues?.[name];
        if (!cue) return;
        const intensity = cue.intensity ?? 0.8;
        if (cue.expression) this.send("EXPRESSION", { expression: cue.expression, name: cue.expression, intensity });
        if (cue.gesture) this.send("GESTURE", { gesture: cue.gesture, name: cue.gesture });

        clearTimeout(this.resetTimer);
        if (cue.expression && cue.expression !== "neutral") {
            const speechMs = String(speechText).split(/\s+/).filter(Boolean).length * 420;
            this.resetTimer = setTimeout(() => this.send("EXPRESSION", { expression: "neutral", name: "neutral", intensity: 1 }), Math.max(4000, speechMs + 1500));
        }
    }
}
