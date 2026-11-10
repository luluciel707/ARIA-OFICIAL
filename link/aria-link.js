// ARIA LINK · aria-link.js
// Puente para el LADO DEL CEREBRO. Se incluye con un <script> en la página del cerebro y
// no modifica ningún archivo existente del cerebro.
//
//   <script src="/link/aria-link.js"></script>
//   <script>
//     const link = AriaLink.connect({
//       onUserMessage: (text) => { /* el usuario habló: pásaselo a tu lógica */ },
//     });
//     link.say('Hola');                 // ARIA lo pronuncia
//     link.expression('happy', 0.8);    // neutral, happy, sad, surprised, thinking, confused, angry
//     link.gesture('wave');             // wave, nod, shake, look (con direction)
//     link.gesture('look', 'left');
//     link.state('THINKING');           // IDLE, LISTENING, THINKING, SPEAKING, HAPPY, ERROR
//   </script>
//
// Requisito de BroadcastChannel: la página del cerebro y el holograma deben estar en el MISMO
// origen (mismo protocolo, host y puerto). 127.0.0.1 y localhost cuentan como orígenes distintos.
//
// autoAck: cada vez que el holograma envía HOLOGRAM_STATUS, este puente responde con
// { type:'STATE', payload:{} } (sin campo "state"), que solo significa "el cerebro está vivo".
// Así el holograma muestra CONECTADO sin cambiar su estado.

(function (global) {
  'use strict';

  function connect(options) {
    if (typeof BroadcastChannel === 'undefined') {
      throw new Error('AriaLink: este navegador no soporta BroadcastChannel.');
    }

    var opts = Object.assign({
      channelName: 'aria-hologram',
      autoAck: true,
      onUserMessage: null,    // (text, msg)
      onHologramReady: null,  // (status, msg)
      onHologramStatus: null, // (status, msg)
      onMessage: null,        // (msg) cualquier mensaje del holograma
    }, options || {});

    var channel = new BroadcastChannel(opts.channelName);

    function post(type, payload) {
      channel.postMessage({ type: type, payload: payload || {}, source: 'brain', ts: Date.now() });
    }

    channel.onmessage = function (event) {
      var msg = event.data;
      if (!msg || typeof msg !== 'object' || msg.source !== 'hologram') return;

      if (opts.onMessage) opts.onMessage(msg);

      switch (msg.type) {
        case 'USER_MESSAGE':
          if (opts.onUserMessage && msg.payload && typeof msg.payload.text === 'string') {
            opts.onUserMessage(msg.payload.text, msg);
          }
          break;
        case 'HOLOGRAM_READY':
          if (opts.onHologramReady) opts.onHologramReady(msg.payload, msg);
          if (opts.autoAck) post('STATE', {});
          break;
        case 'HOLOGRAM_STATUS':
          if (opts.onHologramStatus) opts.onHologramStatus(msg.payload, msg);
          if (opts.autoAck) post('STATE', {});
          break;
        default:
          break;
      }
    };

    return {
      say: function (text) { post('SAY', { text: String(text) }); },
      expression: function (name, intensity) {
        post('EXPRESSION', intensity === undefined ? { name: name } : { name: name, intensity: intensity });
      },
      gesture: function (name, direction, holdMs) {
        var p = { name: name };
        if (direction !== undefined) p.direction = direction;
        if (holdMs !== undefined) p.holdMs = holdMs;
        post('GESTURE', p);
      },
      state: function (state) { post('STATE', { state: state }); },
      close: function () { channel.close(); },
    };
  }

  global.AriaLink = { connect: connect };
})(typeof window !== 'undefined' ? window : globalThis);
