function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function chunkText(text, maxWords = 180) {
    const cleaned = String(text || "").trim();
    if (!cleaned) return [];

    const paragraphs = cleaned
        .split(/\n+/)
        .map(p => p.trim())
        .filter(Boolean);

    const chunks = [];
    let current = [];

    for (const paragraph of paragraphs) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (!words.length) continue;

        if (current.length + words.length <= maxWords) {
            current.push(...words);
            continue;
        }

        if (current.length) {
            chunks.push(current.join(" "));
            current = [...words];
        } else {
            chunks.push(paragraph);
        }
    }

    if (current.length) chunks.push(current.join(" "));

    return chunks.filter(Boolean);
}

export function buildDocumentIndex(documents = []) {
    const normalizedDocs = Array.isArray(documents) ? documents : [];
    const chunks = [];

    for (const doc of normalizedDocs) {
        const title = String(doc?.title || "Documento").trim();
        const content = String(doc?.content || "").trim();
        if (!content) continue;

        const textChunks = chunkText(content, 160);
        if (!textChunks.length) continue;

        for (const chunk of textChunks) {
            chunks.push({
                title,
                content: chunk,
                source: title,
                docId: doc?.id || title
            });
        }
    }

    return chunks;
}

export function searchRAG(query, documents = [], limit = 3) {
    const text = normalizeText(query);
    if (!text || !Array.isArray(documents) || !documents.length) return [];

    const index = buildDocumentIndex(documents);
    if (!index.length) return [];

    const tokens = text
        .split(/\s+/)
        .filter(token => token.length > 2)
        .filter((token, idx, arr) => arr.indexOf(token) === idx);

    if (!tokens.length) return [];

    const scored = index
        .map(entry => {
            const hay = normalizeText(entry.content);
            const hits = tokens.filter(token => hay.includes(token)).length;
            const exact = hay.includes(text) ? 2 : 0;
            const score = hits * 3 + exact;
            return { ...entry, score };
        })
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    return scored.map(item => ({
        title: item.title,
        content: item.content,
        source: item.source,
        score: item.score
    }));
}
