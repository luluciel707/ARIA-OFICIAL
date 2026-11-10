export class ARIAConversation {

    constructor() {
        this.history = [];
        this.maxHistory = 30;
    }

    add(role, content) {

        if (!["user", "assistant", "system"].includes(role)) {
            console.warn("Rol de conversación no válido.");
            return false;
        }

        if (typeof content !== "string" || !content.trim()) {
            return false;
        }

        this.history.push({
            role,
            content: content.trim(),
            timestamp: Date.now()
        });

        // Mantener solamente los últimos 30 mensajes.
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        return true;
    }

    getHistory() {
        return [...this.history];
    }

    getLastMessage() {
        return this.history.length
            ? this.history[this.history.length - 1]
            : null;
    }

    getRecentMessages(amount = 10) {
        return this.history.slice(-amount);
    }

    clear() {
        this.history = [];
    }

    get length() {
        return this.history.length;
    }
}
