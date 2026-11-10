// ARIA HOLOGRAM · communication.js
// Capa independiente entre ARIA HOLOGRAM y ARIA BRAIN.
//
// Formato de todo mensaje: { type, payload, source, ts }
//   - source 'brain'    → mensajes que llegan al holograma (SAY, EXPRESSION, GESTURE, STATE)
//   - source 'hologram' → mensajes que emite el holograma (USER_MESSAGE, HOLOGRAM_READY, HOLOGRAM_STATUS)
//
// Conexión: el holograma emite HOLOGRAM_STATUS cada pocos segundos. El cerebro está
// CONECTADO mientras llegue cualquier mensaje válido suyo. Un cerebro que solo quiera
// "dar señal de vida" responde con { type:'STATE', payload:{} } (STATE sin campo "state"
// no cambia nada). aria-link.js ya hace esto solo.

import { CONFIG, MESSAGE_TYPES, INBOUND_TYPES, OUTBOUND_TYPES } from './config.js';

class BroadcastTransport {
  constructor(name, onMessage) {
    this.name = 'BroadcastChannel';
    this.channel = new BroadcastChannel(name);
    this.channel.onmessage = (event) => onMessage(event.data);
  }
  send(msg) { this.channel.postMessage(msg); }
  close() { this.channel.close(); }
}

// Preparado para Windows ↔ Android. Desactivado por defecto (CONFIG.websocket.enabled) y sin probar.
class WebSocketTransport {
  constructor(url, reconnectMs, onMessage) {
    this.name = 'WebSocket';
    this.url = url;
    this.reconnectMs = reconnectMs;
    this.onMessage = onMessage;
    this.ws = null;
    this.closed = false;
    this.timer = null;
    this._connect();
  }
  _connect() {
    if (this.closed) return;
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this._retry();
      return;
    }
    this.ws.onmessage = (event) => {
      try { this.onMessage(JSON.parse(event.data)); } catch (err) { /* mensaje no JSON: se ignora */ }
    };
    this.ws.onclose = () => this._retry();
    this.ws.onerror = () => { /* onclose se encarga de reintentar */ };
  }
  _retry() {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this._connect(), this.reconnectMs);
  }
  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }
  close() {
    this.closed = true;
    clearTimeout(this.timer);
    if (this.ws) this.ws.close();
  }
}

function isValidInbound(msg) {
  return (
    msg !== null &&
    typeof msg === 'object' &&
    msg.source === 'brain' &&
    INBOUND_TYPES.includes(msg.type) &&
    (msg.payload === undefined || (typeof msg.payload === 'object' && msg.payload !== null))
  );
}

export class Communication {
  constructor() {
    this.transports = [];
    this.handlers = new Map();
    this.connectionListeners = [];
    this.connected = false;
    this.lastInbound = 0;
    this.timer = null;
  }

  // Devuelve { transports: [...nombres], warnings: [...textos] }
  start() {
    const warnings = [];
    const onMessage = (msg) => this._receive(msg);

    if (typeof BroadcastChannel !== 'undefined') {
      this.transports.push(new BroadcastTransport(CONFIG.channelName, onMessage));
    } else {
      warnings.push('Este navegador no soporta BroadcastChannel: no hay comunicación local con el cerebro.');
    }

    if (CONFIG.websocket.enabled) {
      this.transports.push(new WebSocketTransport(CONFIG.websocket.url, CONFIG.websocket.reconnectMs, onMessage));
    }

    this.timer = setInterval(() => this._checkTimeout(), 1000);
    return { transports: this.transports.map((t) => t.name), warnings };
  }

  // Registra un manejador para un tipo de mensaje entrante. fn(msg)
  on(type, fn) {
    if (!INBOUND_TYPES.includes(type)) throw new Error(`Tipo entrante desconocido: ${type}`);
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  // fn(connected:boolean) se llama solo cuando cambia el estado
  onConnectionChange(fn) { this.connectionListeners.push(fn); }

  send(type, payload = {}) {
    if (!OUTBOUND_TYPES.includes(type)) throw new Error(`Tipo saliente desconocido: ${type}`);
    const msg = { type, payload, source: 'hologram', ts: Date.now() };
    for (const transport of this.transports) {
      try { transport.send(msg); } catch (err) { console.warn(`[comunicación] fallo al enviar por ${transport.name}:`, err); }
    }
  }

  stop() {
    clearInterval(this.timer);
    this.transports.forEach((t) => t.close());
    this.transports = [];
    this._setConnected(false);
  }

  _receive(msg) {
    if (!isValidInbound(msg)) return; // se ignora todo lo que no cumpla el protocolo
    this.lastInbound = Date.now();
    this._setConnected(true);
    const list = this.handlers.get(msg.type) || [];
    for (const fn of list) {
      try { fn(msg); } catch (err) { console.error(`[comunicación] error en el manejador de ${msg.type}:`, err); }
    }
  }

  _checkTimeout() {
    if (this.connected && Date.now() - this.lastInbound > CONFIG.brainTimeoutMs) this._setConnected(false);
  }

  _setConnected(value) {
    if (this.connected === value) return;
    this.connected = value;
    for (const fn of this.connectionListeners) {
      try { fn(value); } catch (err) { console.error(err); }
    }
  }
}

export { MESSAGE_TYPES };
