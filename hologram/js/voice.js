// ARIA HOLOGRAM · voice.js
// Reconocimiento: API del navegador (Chrome/Edge; requiere internet).
// Síntesis: voz vocaloid propia de ARIA (js/vocaloid.js), 100 % local en el navegador:
// sin servidor, sin Piper, sin API keys. Si fallara, usa SpeechSynthesis del navegador.

import { CONFIG } from './config.js';
import { synthesizeVocaloid, VOCALOID_DEFAULTS } from './vocaloid.js';
import { OfflineRecognizer } from './offline-stt.js';

export class VoiceController {
  constructor(handlers = {}) {
    this.h = handlers;
    this.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    this.synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.recognition = null;
    this.wantListening = false;
    this.isSpeaking = false;
    this.voice = null;
    this.ctx = null;
    this._source = null;
    this._events = [];
    this._eventIdx = 0;
    this._t0 = 0;
    this._utterId = 0;
    this._current = null;
    this._mouthTimer = null;
    this.offline = null;
    this.offlineMode = false;
    this._offlineLoading = null;

    if (this.synth) {
      this._pickVoice();
      if (this.synth.addEventListener) {
        this.synth.addEventListener('voiceschanged', () => this._pickVoice());
      }
    }

    // Los navegadores bloquean el audio hasta el primer toque/tecla: se desbloquea solo.
    const unlock = () => { this._getContext()?.resume?.(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  _getContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    return this.ctx;
  }

  // Vosk necesita WebAssembly y micrófono (https o localhost).
  _offlineSupported() {
    return Boolean(
      CONFIG.offlineSTT?.enabled &&
      typeof WebAssembly === 'object' &&
      navigator.mediaDevices?.getUserMedia
    );
  }

  getCapabilities() {
    return {
      recognition: Boolean(this.SpeechRecognition) || this._offlineSupported(),
      recognitionEngine: this.SpeechRecognition ? 'Navegador (SpeechRecognition)' : 'Vosk local (WebAssembly)',
      synthesis: true,
      synthesisEngine: 'ARIA Vocaloid (local, js/vocaloid.js)',
      spanishVoice: true,
      voiceName: 'ARIA vocaloid',
      lipSync: 'por sílabas'
    };
  }

  _pickVoice() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    const lang = CONFIG.language.toLowerCase();
    this.voice = voices.find(v => v.lang.toLowerCase() === lang) ||
      voices.find(v => v.lang.toLowerCase().startsWith(lang.slice(0, 2))) || null;
  }

  start() {
    if (!this.SpeechRecognition || CONFIG.offlineSTT?.preferOffline) {
      if (this._offlineSupported()) {
        this._startOffline();
        return true;
      }
      this._error('El reconocimiento de voz no está disponible en este navegador (usa Chrome o Edge).');
      return false;
    }
    this.offlineMode = false;
    this.wantListening = true;
    this.h.onListeningChange?.(true);
    if (!this.isSpeaking) this._startRecognition();
    return true;
  }

  stop() {
    this.wantListening = false;
    this.h.onListeningChange?.(false);
    this._abortRecognition();
    this._stopOffline();
  }

  toggle() {
    if (this.wantListening) { this.stop(); return false; }
    return this.start();
  }

  _createRecognition() {
    const r = new this.SpeechRecognition();
    r.lang = CONFIG.language;
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = event => {
      const result = event.results[event.results.length - 1];
      if (!result || !result.isFinal) return;
      const text = result[0].transcript.trim();
      if (text) this.h.onTranscript?.(text);
    };
    r.onerror = event => {
      const code = event.error;
      if (code === 'no-speech' || code === 'aborted') return;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        this._disable('Permiso de micrófono denegado. Permitilo en el navegador.');
      } else if (code === 'audio-capture') {
        this._disable('No se detecta ningún micrófono.');
      } else if (code === 'network') {
        if (this._offlineSupported()) {
          // El servicio online de Chrome falló: se sigue con el reconocimiento local.
          this.h.onStatus?.('El servicio de voz de Chrome no responde. Cambio al reconocimiento local.');
          this._abortRecognition();
          this._startOffline();
        } else {
          this._disable('El reconocimiento de voz necesita internet (Chrome usa un servicio online).');
        }
      } else {
        this._disable(`Error de reconocimiento de voz: ${code}.`);
      }
    };
    r.onend = () => {
      if (this.wantListening && !this.isSpeaking) {
        setTimeout(() => this._startRecognition(), 350);
      }
    };
    return r;
  }

  _startRecognition() {
    if (!this.wantListening || this.isSpeaking) return;
    try {
      if (!this.recognition) this.recognition = this._createRecognition();
      this.recognition.start();
    } catch (_) { /* Ignorar InvalidStateError si ya estaba activo. */ }
  }

  // ---- Reconocimiento local con Vosk ----

  async _pickModelUrl() {
    const urls = CONFIG.offlineSTT.modelUrls || [];
    for (const url of urls) {
      try {
        const response = await fetch(new URL(url, window.location.href).href, { method: 'HEAD', cache: 'no-store' });
        if (response.ok) return url;
      } catch (_) { /* se prueba la siguiente */ }
    }
    throw new Error('No se encontró el modelo de voz en español.');
  }

  async _startOffline() {
    this.offlineMode = true;
    this.wantListening = true;
    this.h.onListeningChange?.(true);
    try {
      if (!this.offline) {
        if (!this._offlineLoading) {
          this.h.onStatus?.('Cargando el reconocimiento de voz (solo tarda la primera vez)...');
          this._offlineLoading = (async () => {
            const cfg = CONFIG.offlineSTT;
            const modelUrl = await this._pickModelUrl();
            const recognizer = new OfflineRecognizer({
              scriptUrl: cfg.scriptUrl,
              modelUrl,
              onResult: (text) => this.h.onTranscript?.(text),
              onError: (message) => this._error(message)
            });
            await recognizer.load();
            this.offline = recognizer;
          })().finally(() => { this._offlineLoading = null; });
        }
        await this._offlineLoading;
      }
      if (!this.wantListening) return; // la persona apagó la escucha mientras cargaba
      await this.offline.start();
      this.offline.setActive(!this.isSpeaking);
      this.h.onStatus?.('Te estoy escuchando...');
    } catch (error) {
      console.error('[ARIA VOICE] Reconocimiento local:', error);
      this._disable(`No pude iniciar el reconocimiento de voz: ${error.message || error}`);
    }
  }

  _stopOffline() {
    if (!this.offline) return;
    try { this.offline.release(); } catch (_) { /* ya liberado */ }
  }

  _abortRecognition() {
    if (!this.recognition) return;
    try { this.recognition.abort(); } catch (_) { /* ya detenido */ }
  }

  _disable(message) {
    this.wantListening = false;
    this.h.onListeningChange?.(false);
    this._error(message);
  }

  async speak(text) {
    const clean = String(text || '').trim();
    if (!clean) return false;

    const id = ++this._utterId;
    this._stopCurrentAudio();
    if (this.synth) this.synth.cancel();
    this.isSpeaking = true;
    this._abortRecognition();
    this.offline?.setActive(false); // para que no se escuche a sí misma
    this.h.onSpeakStart?.();

    try {
      // Deja que el navegador pinte el estado "hablando" antes de calcular el audio.
      await new Promise(resolve => setTimeout(resolve, 0));
      if (id !== this._utterId) return false;

      const ctx = this._getContext();
      if (!ctx) throw new Error('Este navegador no tiene Web Audio.');

      const result = synthesizeVocaloid(clean.slice(0, 1200), { ...VOCALOID_DEFAULTS, ...(CONFIG.vocaloid || {}) });
      if (id !== this._utterId) return false;
      if (!result.samples.length) throw new Error('No hay texto pronunciable.');

      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (_) { /* se informa abajo */ } }
      if (ctx.state !== 'running') throw new Error('El navegador bloqueó el audio: tocá la página una vez y probá de nuevo.');

      const buffer = ctx.createBuffer(1, result.samples.length, result.sampleRate);
      buffer.copyToChannel(result.samples, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => this._finishSpeak(id);

      this._source = source;
      this._events = result.events;
      this._eventIdx = 0;
      this._t0 = ctx.currentTime + 0.03;
      source.start(this._t0);
      this._startMouthPulse();
      this.h.onSpeakPlan?.({ durationMs: (result.samples.length / result.sampleRate) * 1000 });
      return true;
    } catch (error) {
      if (id !== this._utterId) return false;
      this._stopMouthPulse();
      console.warn('[ARIA VOICE] Falló la voz vocaloid, uso la voz del navegador:', error);
      return this._speakFallback(clean, id, error);
    }
  }

  // Plan B: voz del navegador, lo más aguda posible para acercarse al estilo.
  _speakFallback(clean, id, cause) {
    if (!this.synth) {
      this._error(`No se pudo generar la voz de ARIA: ${cause?.message || 'error desconocido'}.`);
      this._finishSpeak(id);
      return false;
    }
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = CONFIG.language;
      if (this.voice) u.voice = this.voice;
      u.pitch = 2;
      u.rate = 1.05;
      u.onboundary = () => this.h.onBoundary?.();
      u.onend = () => { this._finishSpeak(id); resolve(true); };
      u.onerror = () => { this._finishSpeak(id); resolve(false); };
      this.h.onSpeakPlan?.({ durationMs: Math.max(800, clean.length * 70), estimated: true });
      this.synth.speak(u);
    });
  }

  // Anima la boca en cada sílaba, usando el reloj del audio para que coincida con lo que se oye.
  _startMouthPulse() {
    this._stopMouthPulse();
    this._mouthTimer = setInterval(() => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime - this._t0;
      while (this._eventIdx < this._events.length && this._events[this._eventIdx] <= now) {
        this._eventIdx++;
        this.h.onBoundary?.();
      }
    }, 25);
  }

  _stopMouthPulse() {
    if (this._mouthTimer) clearInterval(this._mouthTimer);
    this._mouthTimer = null;
  }

  _finishSpeak(id) {
    if (id !== this._utterId) return;
    this._stopMouthPulse();
    this._stopCurrentAudio();
    this.isSpeaking = false;
    this.h.onSpeakEnd?.();
    if (this.wantListening) {
      if (this.offlineMode) setTimeout(() => { if (this.wantListening && !this.isSpeaking) this.offline?.setActive(true); }, 450);
      else setTimeout(() => this._startRecognition(), 450);
    }
  }

  _stopCurrentAudio() {
    this._stopMouthPulse();
    if (this._source) {
      this._source.onended = null;
      try { this._source.stop(); } catch (_) { /* ya terminado */ }
      try { this._source.disconnect(); } catch (_) { /* ya desconectado */ }
      this._source = null;
    }
  }

  cancelSpeech() {
    this._utterId++;
    this._stopCurrentAudio();
    if (this.synth) this.synth.cancel();
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.h.onSpeakEnd?.();
    }
  }

  _error(message) {
    if (this.h.onError) this.h.onError(message);
    else console.warn(`[ARIA VOICE] ${message}`);
  }
}
