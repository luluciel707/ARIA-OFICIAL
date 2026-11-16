// ARIA BRAIN · knowledge.js
// Conocimiento propio de ARIA (salud, movimiento, hábitos, vida práctica), ahora sobre el RAG local.

import { rag } from "./rag.js";
import { KB } from "./kb-data.js";

export function searchKnowledge(message) {
    const [best] = rag.search(message, { k: 1, sources: ["kb"], minCoverage: 0.5 });
    // Cobertura alta, o al menos dos palabras clave en común (evita respuestas por una palabra suelta).
    const solid = best && (best.coverage >= 0.6 || best.matched >= 2);
    if (!solid) return { found: false, category: null, categoryId: null, answer: null, title: null };
    return { found: true, category: best.cat, categoryId: best.cat, answer: best.text, title: best.title, score: best.score };
}

export function getKnowledgeCategories() {
    const map = new Map();
    for (const e of KB) map.set(e.cat, (map.get(e.cat) || 0) + 1);
    return [...map.entries()].map(([name, topics]) => ({ id: name, name, topics }));
}
