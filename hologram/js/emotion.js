// ARIA HOLOGRAM · emotion.js
// Lee lo que ARIA va a decir (o lo que dijo el usuario) y decide, frase por frase,
// qué expresión mostrar, con cuánta intensidad y qué gesto acompaña.
// Es heurístico: busca palabras y signos típicos del español rioplatense. No "entiende",
// pero alcanza para que la cara y el cuerpo acompañen el tono de lo que se dice.

import { clamp } from './config.js';

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// [raíz sin tildes, peso]. Se busca al comienzo de una palabra.
const LEXICON = {
  happy: [
    ['gracias', 0.5], ['genial', 1], ['excelente', 1], ['felicit', 1], ['que bueno', 0.8],
    ['me alegra', 1], ['me encanta', 1], ['buenisim', 1], ['bien hecho', 1], ['perfect', 0.8],
    ['jaja', 1], ['jeje', 0.8], ['jiji', 0.8], ['divertid', 0.7], ['lind', 0.5], ['hermos', 0.6],
    ['bienvenid', 0.8], ['con gusto', 0.6], ['de nada', 0.6], ['logr', 0.6], ['orgullos', 0.8],
    ['maravill', 1], ['estupend', 1], ['buen trabajo', 0.8], ['animo', 0.5], ['vamos', 0.4],
    ['bien', 0.3], ['hola', 0.6], ['buen dia', 0.6], ['buenos dias', 0.6], ['buenas', 0.5],
  ],
  sad: [
    ['lamento', 1], ['lo siento', 1], ['perdon', 0.6], ['triste', 1], ['pena', 0.7],
    ['desafortunad', 0.8], ['lastima', 0.8], ['cansad', 0.4], ['extran', 0.5], ['dificil', 0.4],
    ['no pude', 0.6], ['no puedo', 0.3], ['sufr', 0.7],
  ],
  concerned: [
    ['cuidado', 0.7], ['no te fuerces', 1], ['no fuerces', 1], ['si te duele', 1], ['dolor', 0.6],
    ['duele', 0.6], ['peligro', 0.8], ['lesion', 0.8], ['mareo', 0.8], ['medico', 0.5],
    ['kinesiolog', 0.5], ['despacio', 0.3],
  ],
  surprised: [
    ['wow', 1], ['sorpren', 1], ['increible', 0.9], ['en serio', 0.7], ['no puedo creer', 1],
    ['que locura', 0.9], ['asombr', 1], ['de verdad', 0.5], ['no me lo esperaba', 1],
  ],
  thinking: [
    ['a ver', 0.8], ['mmm', 1], ['hmm', 1], ['dejame pensar', 1], ['dejame ver', 1], ['veamos', 0.8],
    ['pensemos', 0.8], ['quizas', 0.5], ['tal vez', 0.5], ['depende', 0.6], ['probablemente', 0.5],
    ['creo que', 0.4], ['si no me equivoco', 0.7], ['me parece', 0.4],
  ],
  confused: [
    ['no entiendo', 1], ['no estoy segura', 0.9], ['no se si', 0.8], ['no se bien', 0.8],
    ['no se que', 0.7], ['confund', 1], ['no me queda claro', 1], ['podrias aclarar', 0.8],
    ['a que te referis', 0.8], ['a que te refieres', 0.8], ['no me suena', 0.6],
  ],
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const COMPILED = Object.entries(LEXICON).map(([name, list]) => [
  name,
  list.map(([stem, weight]) => [new RegExp('(?:^|[^a-z])' + escapeRe(stem), 'g'), weight]),
]);

const MAX_INTENSITY = { happy: 0.7, sad: 0.7, surprised: 0.8, thinking: 1, confused: 1, angry: 0.8 };

function classify(text) {
  const n = norm(text);
  let best = null;
  let bestScore = 0;
  for (const [name, list] of COMPILED) {
    let score = 0;
    for (const [re, weight] of list) {
      const m = n.match(re);
      if (m) score += weight * Math.min(m.length, 2);
    }
    if (score > bestScore) { best = name; bestScore = score; }
  }
  return bestScore >= 0.4 ? { name: best, score: Math.min(bestScore, 2.5) } : null;
}

function splitSentences(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  const parts = clean.match(/[^.!?…]+[.!?…]*\s*/g) || [clean];
  return parts.map((s) => s.trim()).filter(Boolean);
}

function pickGesture(n, i, hit, exclaim, question) {
  if (i === 0 && /^[¡¿\s]*(hola|buen dia|buenos dias|buenas)/.test(n)) return 'wave';
  if (/(muchas gracias|mil gracias|te agradezco|lo siento mucho)/.test(n)) return 'bow';
  if (/^[¡¿\s]*no\s*[,.!]/.test(n) || /^[¡\s]*no[\s.!]*$/.test(n)) return 'shake';
  if (/^[¡¿\s]*(si|claro|exacto|por supuesto|obvio|dale|listo|de acuerdo|perfecto)\b/.test(n)) return 'nod';
  if (/(no se si|no se bien|tal vez|quizas|depende|ni idea)/.test(n)) return 'shrug';
  if (/(a ver|mmm|hmm|dejame pensar|dejame ver|veamos|pensemos)/.test(n)) return 'think';
  if (hit && hit.name === 'happy' && hit.score >= 1.2 && exclaim) return 'cheer';
  if (question) return 'tilt';
  return null;
}

// Devuelve una lista de segmentos:
//   { start (0..1 dentro del discurso), text, expression, intensity, mood, gesture }
// opts.lockExpression: la expresión viene fijada por el cerebro, no se calcula.
// opts.lockGesture: el gesto viene fijado por el cerebro, no se calcula.
export function planPerformance(text, opts = {}) {
  const sentences = splitSentences(text);
  if (!sentences.length) return [];

  const weights = sentences.map((s) => s.length + 8); // 8 ≈ pausa entre frases
  const total = weights.reduce((a, b) => a + b, 0);

  const plan = [];
  let cumulative = 0;
  let prev = null;
  let lastGestureIndex = -2;

  sentences.forEach((sentence, i) => {
    const start = cumulative / total;
    cumulative += weights[i];

    const n = norm(sentence);
    const hit = classify(sentence);
    const exclaim = sentence.includes('!');
    const question = sentence.includes('?');

    let expression;
    let intensity;
    let mood;

    if (hit) {
      const k = 0.3 + 0.3 * hit.score + (exclaim ? 0.15 : 0);
      if (hit.name === 'concerned') {
        expression = 'sad';
        intensity = clamp(k * 0.5, 0.2, 0.45);
        mood = 'concerned';
      } else {
        expression = hit.name;
        intensity = clamp(k, 0.3, MAX_INTENSITY[hit.name] ?? 0.8);
        mood = hit.name;
      }
    } else if (question) {
      expression = 'thinking';
      intensity = 0.25;
      mood = 'thinking';
    } else if (prev && prev.intensity * 0.65 >= 0.18) {
      // Sin pistas nuevas, la emoción anterior se apaga de a poco en lugar de cortarse.
      expression = prev.expression;
      intensity = prev.intensity * 0.65;
      mood = prev.mood;
    } else {
      expression = 'happy'; // sonrisa suave de base
      intensity = 0.15;
      mood = 'neutral';
    }
    prev = { expression, intensity, mood };

    let gesture = null;
    if (!opts.lockGesture) {
      gesture = pickGesture(n, i, hit, exclaim, question);
      if (gesture && i > 0 && i - lastGestureIndex < 2) gesture = null; // no saturar de gestos
      if (gesture) lastGestureIndex = i;
    }

    plan.push({
      start,
      text: sentence,
      expression: opts.lockExpression ? undefined : expression,
      intensity: opts.lockExpression ? undefined : intensity,
      mood: opts.lockExpression ? undefined : mood,
      gesture,
    });
  });

  return plan;
}

// Reacción suave de ARIA mientras escucha al usuario. Devuelve null si no hay nada que reflejar.
export function analyzeUserText(text) {
  const hit = classify(text);
  if (!hit) return null;
  const intensity = clamp(0.2 + 0.12 * hit.score, 0.2, 0.45);
  if (hit.name === 'sad' || hit.name === 'concerned') return { expression: 'sad', intensity, mood: 'concerned' };
  if (hit.name === 'angry') return { expression: 'sad', intensity, mood: 'concerned' };
  return { expression: hit.name, intensity, mood: hit.name };
}
