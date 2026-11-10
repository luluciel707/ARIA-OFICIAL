import { CONFIG } from "./config.js";

export class ARIAMemory {

    constructor() {
        this.notes = [];
        this.load();
    }

    load() {
        try {
            const saved = localStorage.getItem(CONFIG.memoryKey);

            this.notes = saved ? JSON.parse(saved) : [];

            if (!Array.isArray(this.notes)) {
                this.notes = [];
            }

        } catch (error) {
            console.error("Error cargando memoria:", error);
            this.notes = [];
        }
    }

    save() {
        try {
            localStorage.setItem(
                CONFIG.memoryKey,
                JSON.stringify(this.notes)
            );

            return true;

        } catch (error) {
            console.error("Error guardando memoria:", error);
            return false;
        }
    }

    remember(content) {

        if (typeof content !== "string") return false;

        content = content.trim();

        if (!content || content.length > 500) {
            return false;
        }

        this.notes.push({
            id: crypto.randomUUID(),
            content,
            date: new Date().toISOString()
        });

        return this.save();
    }

    recall() {
        return [...this.notes];
    }

    search(query) {

        const normalized = query.toLowerCase();

        return this.notes.filter(note =>
            note.content.toLowerCase().includes(normalized)
        );
    }

    forget(id) {

        this.notes = this.notes.filter(
            note => note.id !== id
        );

        return this.save();
    }

    clear() {
        this.notes = [];
        return this.save();
    }
}