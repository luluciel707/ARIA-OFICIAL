
// ARIA HOLOGRAM · offline-stt.js
// Reconocimiento de voz local con Vosk (WebAssembly).

function absolute(url) {
  return new URL(url, window.location.href).href;
}

async function exists(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store'
    });
    return response.ok;
  } catch (error) {
    console.error('[ARIA VOSK] No se pudo comprobar:', url, error);
    return false;
  }
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    if (window.Vosk) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = url;

    script.onload = () => {
      if (window.Vosk) {
        resolve();
      } else {
        reject(new Error('vosk.js cargó pero no define Vosk.'));
      }
    };

    script.onerror = () => {
      reject(new Error(`No se pudo cargar ${url}`));
    };

    document.head.appendChild(script);
  });
}

export class OfflineRecognizer {
  static async assetsPresent({ scriptUrl, modelUrl }) {
    const [scriptExists, modelExists] = await Promise.all([
      exists(absolute(scriptUrl)),
      exists(absolute(modelUrl))
    ]);

    return scriptExists && modelExists;
  }

  constructor({
    scriptUrl,
    modelUrl,
    onResult,
    onPartial,
    onError
  }) {
    this.scriptUrl = absolute(scriptUrl);
    this.modelUrl = absolute(modelUrl);

    this.onResult = onResult;
    this.onPartial = onPartial;
    this.onError = onError;

    this.model = null;
    this.recognizer = null;
    this.stream = null;
    this.ctx = null;
    this.source = null;
    this.node = null;

    this.active = false;
    this.audioDebugged = false;
  }

  async load() {
    if (this.model) return;

    console.log('[ARIA VOSK] Cargando biblioteca...');

    await loadScript(this.scriptUrl);

    console.log('[ARIA VOSK] Cargando modelo español...');

    this.model = await window.Vosk.createModel(this.modelUrl);

    console.log('[ARIA VOSK] Modelo cargado correctamente.');
  }

  _makeRecognizer() {
    try {
      this.recognizer?.remove?.();
    } catch (error) {
      console.warn('[ARIA VOSK] Liberación anterior:', error);
    }

    const rec = new this.model.KaldiRecognizer(
      this.ctx.sampleRate
    );

    rec.on('result', (message) => {
      if (!this.active) return;

      const text = String(
        message?.result?.text || ''
      ).trim();

      if (text) {
        console.log('[ARIA VOSK] Resultado:', text);
        this.onResult?.(text);
      }
    });

    rec.on('partialresult', (message) => {
      if (!this.active) return;

      const text = String(
        message?.result?.partial || ''
      ).trim();

      if (text) {
        console.log('[ARIA VOSK] Parcial:', text);
        this.onPartial?.(text);
      }
    });

    rec.on('error', (message) => {
      const error = message?.error || message;
      console.error('[ARIA VOSK] Error del reconocedor:', error);
      this.onError?.(
        `Error del reconocimiento local: ${error || 'desconocido'}`
      );
    });

    this.recognizer = rec;
  }

  // Abre el micrófono y prepara el procesamiento de audio.
  async start() {
    if (this.stream) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        'El navegador no permite usar el micrófono. Hace falta localhost o HTTPS.'
      );
    }

    console.log('[ARIA AUDIO] Solicitando micrófono...');

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1
      }
    });

    const AC = window.AudioContext || window.webkitAudioContext;

    if (!AC) {
      throw new Error('AudioContext no está disponible.');
    }

    this.ctx = new AC();

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this._makeRecognizer();

    this.node = this.ctx.createScriptProcessor(
      4096,
      1,
      1
    );

    this.audioDebugged = false;

    this.node.onaudioprocess = (event) => {
      if (!this.audioDebugged) {
        this.audioDebugged = true;

        console.log('[ARIA AUDIO] Recibiendo audio:', {
          active: this.active,
          audioContext: this.ctx.state,
          sampleRate: event.inputBuffer.sampleRate,
          channels: event.inputBuffer.numberOfChannels,
          microphone: this.stream
            ?.getAudioTracks()[0]?.readyState
        });
      }

      if (!this.active || !this.recognizer) return;

      try {
        this.recognizer.acceptWaveform(
          event.inputBuffer
        );
      } catch (error) {
        console.error(
          '[ARIA VOSK] Error procesando audio:',
          error
        );

        this.onError?.(
          `Error procesando audio: ${error.message || error}`
        );
      }
    };

    this.source = this.ctx.createMediaStreamSource(
      this.stream
    );

    this.source.connect(this.node);
    this.node.connect(this.ctx.destination);

    console.log('[ARIA AUDIO] Micrófono conectado.');
  }

  // Activa o pausa la escucha.
  setActive(on) {
    const next = Boolean(on);

    if (next === this.active) return;

    this.active = next;

    console.log(
      '[ARIA VOSK] Escucha:',
      next ? 'ACTIVADA' : 'PAUSADA'
    );

    if (next && this.model && this.ctx) {
      this._makeRecognizer();
    }
  }

  // Libera todos los recursos.
  release() {
    this.active = false;

    try {
      if (this.node) {
        this.node.onaudioprocess = null;
      }
    } catch (error) {}

    try {
      this.source?.disconnect();
    } catch (error) {}

    try {
      this.node?.disconnect();
    } catch (error) {}

    try {
      this.recognizer?.remove?.();
    } catch (error) {}

    this.stream?.getTracks().forEach(track => {
      track.stop();
    });

    try {
      this.ctx?.close();
    } catch (error) {}

    this.stream = null;
    this.ctx = null;
    this.source = null;
    this.node = null;
    this.recognizer = null;

    console.log('[ARIA VOSK] Recursos liberados.');
  }
}
