// ARIA HOLOGRAM · media.js
// Panel de música y video. Reproduce YouTube incrustado, o muestra un botón
// para abrir una búsqueda cuando no hay clave de YouTube configurada.

const VIDEO_ID = /^[\w-]{11}$/;
const SEARCH_URL = /^https:\/\/www\.youtube\.com\/results\?search_query=/;

export class MediaPlayer {
  constructor(panel) {
    this.panel = panel;
    this.frame = panel?.querySelector("#media-frame") ?? null;
    this.title = panel?.querySelector("#media-title") ?? null;
    this.link = panel?.querySelector("#media-link") ?? null;
    this.closeButton = panel?.querySelector("#media-close") ?? null;
    this.closeButton?.addEventListener("click", () => this.stop());
  }

  get available() {
    return Boolean(this.panel && this.frame && this.title && this.link);
  }

  play({ videoId, title = "" } = {}) {
    if (!this.available || !VIDEO_ID.test(videoId || "")) return false;
    this.frame.hidden = false;
    this.link.hidden = true;
    this.frame.src =
      `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`;
    this.title.textContent = title || "Reproduciendo";
    this.panel.hidden = false;
    return true;
  }

  search({ query = "", url = "" } = {}) {
    if (!this.available || !SEARCH_URL.test(url)) return false;
    this.frame.src = "about:blank";
    this.frame.hidden = true;
    this.link.href = url;
    this.link.hidden = false;
    this.title.textContent = query ? `Buscar: ${query}` : "Buscar en YouTube";
    this.panel.hidden = false;
    return true;
  }

  stop() {
    if (!this.available) return;
    this.frame.src = "about:blank"; // corta el audio
    this.panel.hidden = true;
  }
}
