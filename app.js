/* Sigillo — filigrana per copie di documenti d'identità.
 * Tutto gira nel browser: nessuna richiesta di rete (vedi CSP in index.html). */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const WM_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 simboli = 5 bit
const REG_KEY = 'sigillo.registro.v1';
const MAX_SRC = 4000;   // lato massimo della sorgente in memoria
const OUT_MAX = 2400;   // lato massimo dell'immagine esportata
const OUT_MIN = 1100;   // i ritagli piccoli vengono ingranditi fino a qui

if (window.pdfjsLib) {
  // Con pdf.worker.min.js caricato via <script>, pdf.js usa il "fake worker"
  // nel thread principale: funziona anche aprendo il file da disco (file://).
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
}

/* ------------------------------------------------------------------ stato */
const S = {
  base: null,        // canvas sorgente originale (non ruotato)
  rotation: 0,       // 0, 90, 180, 270
  src: null,         // canvas sorgente ruotato
  crop: null,        // {x,y,w,h} in coordinate di src
  ratio: 0,
  covers: [],        // {x,y,w,h,type} in coordinate di src
  coverType: 'black',
  selCover: -1,
  mode: 'crop',
  fmt: 'png',
  pdf: null,
  fileName: 'documento',
  isDemo: true,
  preview: null,     // canvas renderizzato (senza marca invisibile)
  previewK: 1,
};

/* --------------------------------------------------------------- utilità */
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function slug(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function randomCode() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return 'SG-' + [...b].map(v => CODE_ALPHABET[v & 31]).join('');
}
function normCode(s) {
  const m = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^SG/, '');
  return m.length === 6 ? 'SG-' + m : null;
}
async function sha256(blob) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

/* ---------------------------------------------------- documento di esempio */
function makeDemo() {
  const W = 1600, H = 1150;
  const c = newCanvas(W, H), g = c.getContext('2d');
  // "scrivania" con un po' di texture, come una foto reale
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#8d7b69'); bg.addColorStop(1, '#6f5f50');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${Math.random() < .5 ? 255 : 0},${Math.random() < .5 ? 240 : 0},200,${Math.random() * .05})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 30, 1 + Math.random() * 2);
  }
  // tessera ID-1 (85.6 x 54 mm)
  const cw = 1000, ch = Math.round(cw / 1.5858), cx = 300, cy = 260;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 40; g.shadowOffsetY = 18;
  roundRect(g, cx, cy, cw, ch, 36); g.fillStyle = '#eef3ef'; g.fill();
  g.restore();
  g.save(); roundRect(g, cx, cy, cw, ch, 36); g.clip();
  const cg = g.createLinearGradient(cx, cy, cx + cw, cy + ch);
  cg.addColorStop(0, '#dfeee8'); cg.addColorStop(.5, '#f4efe2'); cg.addColorStop(1, '#e3e9f2');
  g.fillStyle = cg; g.fillRect(cx, cy, cw, ch);
  g.strokeStyle = 'rgba(40,90,120,.12)'; g.lineWidth = 1.2;
  for (let i = 0; i < 60; i++) {
    g.beginPath();
    for (let x = 0; x <= cw; x += 8) g.lineTo(cx + x, cy + i * 12 + Math.sin(x / 40 + i) * 8);
    g.stroke();
  }
  g.fillStyle = '#1b2a3a'; g.font = `700 34px ${WM_FONT}`; g.textAlign = 'center';
  g.fillText('REPUBBLICA ITALIANA', cx + cw / 2 + 60, cy + 64);
  g.font = `15px ${WM_FONT}`; g.fillStyle = '#44525f';
  g.fillText('CARTA D’IDENTITÀ · DOCUMENTO FITTIZIO DI ESEMPIO', cx + cw / 2 + 60, cy + 90);
  // foto
  g.fillStyle = '#c9bfb3'; g.fillRect(cx + 50, cy + 130, 220, 280);
  g.fillStyle = '#8f8479';
  g.beginPath(); g.arc(cx + 160, cy + 225, 58, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(cx + 160, cy + 400, 100, 90, 0, Math.PI, 0); g.fill();
  g.textAlign = 'left';
  const fields = [
    ['COGNOME / SURNAME', 'ESEMPIO'], ['NOME / NAME', 'MARIO'],
    ['LUOGO E DATA DI NASCITA', 'ROMA (RM) · 01.01.1980'], ['CITTADINANZA', 'ITALIANA'],
    ['RESIDENZA', 'VIA DEL NULLA 1 · 00100 ROMA'], ['NUMERO DOCUMENTO', 'XX0000000'], ['SCADENZA', '01.01.2036'],
  ];
  fields.forEach(([k, v], i) => {
    const y = cy + 140 + i * 44;
    g.fillStyle = '#6a7580'; g.font = `12px ${WM_FONT}`; g.fillText(k, cx + 310, y);
    g.fillStyle = '#111'; g.font = `700 22px Georgia, serif`; g.fillText(v, cx + 310, y + 23);
  });
  g.fillStyle = '#1b2a3a'; g.font = `18px ${'ui-monospace, Menlo, monospace'}`;
  g.fillText('CA<<XX0000000<<<ESEMPIO<<<<<<<<<<<<<<<', cx + 50, cy + ch - 56);
  g.fillText('8001010M3601015ITA<<<<<<<<<<<<<<<<<<<<', cx + 50, cy + ch - 28);
  g.restore();
  return c;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/* ------------------------------------------------------ caricamento file */
async function loadFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const wasDemo = S.isDemo;
  S.isDemo = false;
  try {
    if (isPdf) {
      if (!window.pdfjsLib) throw new Error('Libreria PDF non disponibile');
      const data = new Uint8Array(await file.arrayBuffer());
      S.pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
      const sel = $('#pdfPage');
      sel.innerHTML = '';
      for (let i = 1; i <= S.pdf.numPages; i++) sel.add(new Option(`Pagina ${i} di ${S.pdf.numPages}`, i));
      $('#pdfPageRow').hidden = S.pdf.numPages < 2;
      setSource(await renderPdfPage(S.pdf, 1));
    } else {
      S.pdf = null;
      $('#pdfPageRow').hidden = true;
      setSource(await loadImage(file));
    }
    S.fileName = file.name.replace(/\.[^.]+$/, '');
    $('#fileInfo').textContent = `${file.name} · ${S.base.width}×${S.base.height}px. Ora ritaglia la parte che serve.`;
    setMode('crop');
  } catch (err) {
    console.error(err);
    S.isDemo = wasDemo;
    toast(isPdf ? 'Impossibile leggere questo PDF.' : 'Formato immagine non supportato da questo browser (HEIC: usa Safari o converti in JPG).', 4500);
  }
}
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_SRC / Math.max(img.naturalWidth, img.naturalHeight));
      const c = newCanvas(img.naturalWidth * k, img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); // l'orientamento EXIF è già applicato
      URL.revokeObjectURL(url);
      res(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
    img.src = url;
  });
}
async function renderPdfPage(pdf, n, targetLong = 2600, exactScale = null) {
  const page = await pdf.getPage(n);
  const vp1 = page.getViewport({ scale: 1 });
  const scale = exactScale ?? Math.min(targetLong / Math.max(vp1.width, vp1.height), MAX_SRC / Math.max(vp1.width, vp1.height));
  const vp = page.getViewport({ scale });
  const c = newCanvas(vp.width, vp.height);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp }).promise;
  return c;
}
function setSource(canvas) {
  S.base = canvas;
  S.rotation = 0;
  applyRotation();
}
function applyRotation() {
  const b = S.base, r = S.rotation;
  const swap = r === 90 || r === 270;
  const c = newCanvas(swap ? b.height : b.width, swap ? b.width : b.height);
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.rotate(r * Math.PI / 180);
  g.drawImage(b, -b.width / 2, -b.height / 2);
  S.src = c;
  S.covers = [];
  S.selCover = -1;
  S.crop = defaultCrop();
  schedule();
}
function defaultCrop() {
  const W = S.src.width, H = S.src.height;
  if (S.isDemo && S.rotation === 0 && W === 1600) return { x: 280, y: 240, w: 1040, h: 671 };
  return fitRatio({ x: 0, y: 0, w: W, h: H }, S.ratio, W, H);
}
function fitRatio(r, ratio, W, H) {
  if (!ratio) return r;
  let w = r.w, h = w / ratio;
  if (h > r.h) { h = r.h; w = h * ratio; }
  const x = clamp(r.x + (r.w - w) / 2, 0, W - w), y = clamp(r.y + (r.h - h) / 2, 0, H - h);
  return { x, y, w, h };
}

/* -------------------------------------------------------------- lettura form */
function opts() {
  const dest = $('#dest').value.trim();
  const fin = $('#fin').value.trim();
  const date = fmtDate($('#date').value);
  const code = $('#code').value;
  const text = $('#tpl').value
    .replace(/\{destinatario\}/gi, dest ? dest.toUpperCase() : '____')
    .replace(/\{finalit[aà]\}/gi, fin ? fin.toUpperCase() : '____')
    .replace(/\{data\}/gi, date)
    .replace(/\{codice\}/gi, code)
    .replace(/\s+/g, ' ').trim();
  return {
    dest, fin, date, code, text,
    color: $('#color').value,
    opacity: +$('#opacity').value / 100,
    size: +$('#size').value,
    density: +$('#density').value,
    angle: +$('#angle').value,
    sealPos: $('#sealPos').value,
    tile: $('#optTile').checked,
    lines: $('#optLines').checked,
    seal: $('#optSeal').checked,
    mark: $('#optMark').checked,
    bw: $('#optBW').checked,
  };
}

/* ------------------------------------------------------------------ rendering */
function outputScale(crop) {
  const long = Math.max(crop.w, crop.h);
  if (long > OUT_MAX) return OUT_MAX / long;
  if (long < OUT_MIN) return OUT_MIN / long;
  return 1;
}

function renderOutput(o, { invisible = false } = {}) {
  const cr = S.crop;
  const k = outputScale(cr);
  const W = Math.round(cr.w * k), H = Math.round(cr.h * k);
  const c = newCanvas(W, H), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(S.src, cr.x, cr.y, cr.w, cr.h, 0, 0, W, H);

  if (o.bw) toGray(g, W, H);

  for (const cv of S.covers) {
    const r = { x: (cv.x - cr.x) * k, y: (cv.y - cr.y) * k, w: cv.w * k, h: cv.h * k };
    if (cv.type === 'pixel') pixelate(g, c, r);
    else { g.fillStyle = '#000'; g.fillRect(r.x, r.y, r.w, r.h); }
  }

  if (o.tile || o.lines) drawTiled(g, W, H, o);
  if (o.seal) drawSeal(g, W, H, o);
  if (invisible && o.mark) embedMark(g, W, H, o.code);
  return { canvas: c, k };
}

function toGray(g, W, H) {
  const im = g.getImageData(0, 0, W, H), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = clamp((l - 128) * 1.08 + 128, 0, 255);
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(im, 0, 0);
}

function pixelate(g, c, r) {
  const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
  const w = Math.min(c.width - x, Math.ceil(r.w)), h = Math.min(c.height - y, Math.ceil(r.h));
  if (w < 2 || h < 2) return;
  const block = Math.max(10, Math.round(Math.min(w, h) / 5), Math.round(Math.max(c.width, c.height) / 90));
  const t = newCanvas(Math.max(1, w / block), Math.max(1, h / block));
  t.getContext('2d').drawImage(c, x, y, w, h, 0, 0, t.width, t.height);
  g.save();
  g.imageSmoothingEnabled = false;
  g.drawImage(t, 0, 0, t.width, t.height, x, y, w, h);
  g.restore();
}

function drawTiled(g, W, H, o) {
  const fs = Math.max(11, Math.sqrt(W * H) * o.size / 100);
  const D = Math.hypot(W, H);
  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(-o.angle * Math.PI / 180);
  g.font = `700 ${fs}px ${WM_FONT}`;
  g.textBaseline = 'middle';
  const text = o.text + '   ·   ';
  const tw = g.measureText(text).width;
  const rowStep = fs * (1.35 + (10 - o.density) * 0.42);

  if (o.lines) {
    g.globalAlpha = Math.min(1, o.opacity * 0.9);
    g.strokeStyle = o.color;
    g.lineWidth = Math.max(0.8, fs * 0.045);
    const amp = rowStep * 0.12, wl = fs * 5.5;
    for (let y = -D / 2, i = 0; y < D / 2 + rowStep; y += rowStep, i++) {
      const yy = y + rowStep / 2;
      g.beginPath();
      for (let x = -D / 2; x <= D / 2; x += fs * 0.35) g.lineTo(x, yy + Math.sin(x / wl * Math.PI * 2 + i) * amp);
      g.stroke();
    }
  }
  if (o.tile) {
    g.lineJoin = 'round';
    g.lineWidth = Math.max(1, fs * 0.09);
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.fillStyle = o.color;
    for (let y = -D / 2, row = 0; y < D / 2 + rowStep; y += rowStep, row++) {
      const shift = (row % 2) * tw / 2;
      for (let x = -D / 2 - tw + shift; x < D / 2; x += tw) {
        g.globalAlpha = o.opacity * 0.7;
        g.strokeText(text, x, y);
        g.globalAlpha = o.opacity;
        g.fillText(text, x, y);
      }
    }
  }
  g.restore();
}

function drawSeal(g, W, H, o) {
  const R = Math.min(W, H) * 0.14;
  const m = R * 1.25;
  const pos = {
    br: [W - m, H - m], bl: [m, H - m], tr: [W - m, m], tl: [m, m], c: [W / 2, H / 2],
  }[o.sealPos] || [W - m, H - m];
  g.save();
  g.translate(pos[0], pos[1]);
  g.rotate(-0.21);
  g.globalAlpha = Math.min(0.92, 0.35 + o.opacity * 1.3);
  g.strokeStyle = g.fillStyle = o.color;
  // anello esterno doppio
  g.lineWidth = R * 0.055; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
  g.lineWidth = R * 0.02; g.beginPath(); g.arc(0, 0, R * 0.9, 0, Math.PI * 2); g.stroke();
  g.lineWidth = R * 0.02; g.beginPath(); g.arc(0, 0, R * 0.62, 0, Math.PI * 2); g.stroke();
  // testo circolare
  const ring = 'COPIA UNICA • NON RIPRODUCIBILE • ' + (o.dest ? o.dest.toUpperCase().slice(0, 22) + ' • ' : '');
  circleText(g, ring, R * 0.76, R * 0.14);
  // centro
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 ${R * 0.2}px ${WM_FONT}`;
  g.fillText(o.code, 0, R * 0.02);
  g.font = `600 ${R * 0.115}px ${WM_FONT}`;
  g.fillText(o.date, 0, R * 0.27);
  g.fillText('★ SIGILLO ★', 0, -R * 0.26);
  g.restore();
}
function circleText(g, text, r, fs) {
  g.font = `700 ${fs}px ${WM_FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const circ = Math.PI * 2 * r;
  let full = text;
  while (g.measureText(full + text).width < circ) full += text;
  const total = g.measureText(full).width;
  const spacing = (circ - total) / full.length;
  let a = -Math.PI / 2;
  for (const ch of full) {
    const w = g.measureText(ch).width + spacing;
    a += (w / 2) / r;
    g.save(); g.rotate(a + Math.PI / 2); g.fillText(ch, 0, -r); g.restore();
    a += (w / 2) / r;
  }
}

/* ------------------------------------------------ marca invisibile (pixel)
 * 108 bit = 16 di sincronismo + 2 copie di (30 bit del codice + 16 di CRC).
 * I bit sono disposti in una griglia 12x9 di celle CxC ripetuta su tutta l'immagine:
 * ogni cella alza o abbassa la luminosità di MARK_DELTA. In lettura si somma il segnale
 * di tutte le ripetizioni, quindi il codice sopravvive a screenshot e ritagli parziali.
 * Decodifica: prima si confronta per correlazione con i codici del registro (molto
 * tollerante), poi si prova la lettura diretta con CRC e correzione dei bit più deboli. */
const MARK_SYNC = 0xB2C5, MARK_DELTA = 4, MARK_CELL = 4, GW = 12, GH = 9, NB = GW * GH;
const PAYLOAD = 46;

function crc16(bits) {
  let c = 0xFFFF;
  for (const b of bits) {
    const top = ((c >> 15) & 1) ^ b;
    c = (c << 1) & 0xFFFF;
    if (top) c ^= 0x1021;
  }
  return c;
}
function num2bits(n, len) { const a = []; for (let i = len - 1; i >= 0; i--) a.push((n >> i) & 1); return a; }
function codeToBits(code) {
  const data = [];
  for (const ch of code.replace(/^SG-/, '')) data.push(...num2bits(CODE_ALPHABET.indexOf(ch), 5));
  const payload = [...data, ...num2bits(crc16(data), 16)];
  return [...num2bits(MARK_SYNC, 16), ...payload, ...payload];
}
function payloadToCode(p) {
  const data = p.slice(0, 30);
  let crc = 0;
  for (let i = 30; i < 46; i++) crc = (crc << 1) | p[i];
  if (crc !== crc16(data)) return null;
  let out = 'SG-';
  for (let i = 0; i < 6; i++) {
    let v = 0;
    for (let j = 0; j < 5; j++) v = (v << 1) | data[i * 5 + j];
    out += CODE_ALPHABET[v];
  }
  return out;
}
function bitsToCode(bits) { return payloadToCode(bits.slice(16, 16 + PAYLOAD)); }

function embedMark(g, W, H, code) {
  const bits = codeToBits(code), C = MARK_CELL;
  const im = g.getImageData(0, 0, W, H), d = im.data;
  for (let y = 0; y < H; y++) {
    const row = (Math.floor(y / C) % GH) * GW;
    for (let x = 0; x < W; x++) {
      const delta = bits[row + (Math.floor(x / C) % GW)] ? MARK_DELTA : -MARK_DELTA;
      const i = (y * W + x) * 4;
      d[i] = clamp(d[i] + delta, 0, 255);
      d[i + 1] = clamp(d[i + 1] + delta, 0, 255);
      d[i + 2] = clamp(d[i + 2] + delta, 0, 255);
    }
  }
  g.putImageData(im, 0, 0);
}

function detectMark(canvas, knownCodes = []) {
  const W = canvas.width, H = canvas.height;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  // luminanza e filtro passa-alto (luminanza - media locale), via immagine integrale
  const N = W * H, L = new Float32Array(N);
  for (let i = 0, j = 0; i < N; i++, j += 4) L[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  const IW = W + 1, I = new Float64Array(IW * (H + 1));
  for (let y = 0; y < H; y++) {
    let run = 0;
    for (let x = 0; x < W; x++) { run += L[y * W + x]; I[(y + 1) * IW + x + 1] = I[y * IW + x + 1] + run; }
  }
  const R = 5, hp = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1);
      const s = I[y1 * IW + x1] - I[y0 * IW + x1] - I[y1 * IW + x0] + I[y0 * IW + x0];
      hp[y * W + x] = L[y * W + x] - s / ((x1 - x0) * (y1 - y0));
    }
  }
  const known = knownCodes.map(code => ({ code, e: codeToBits(code).map(b => b ? 1 : -1) }));
  const syncBits = num2bits(MARK_SYNC, 16);
  const v = new Float64Array(NB);
  let soft = null, hard = null;

  // dimensione cella: 4 = originale, 8 = screenshot su schermo retina (2x), gli altri per sicurezza
  for (const C of [4, 8, 2, 3, 5, 6, 12]) {
    const TW = GW * C, TH = GH * C;
    if (W < TW * 2 || H < TH * 2) continue;
    const A = new Float64Array(TW * TH);
    for (let y = 0; y < H; y++) {
      const base = (y % TH) * TW;
      for (let x = 0; x < W; x++) A[base + (x % TW)] += hp[y * W + x];
    }
    // somme prefisse sul tile raddoppiato (per leggere celle a cavallo del bordo)
    const PW = 2 * TW + 1, P = new Float64Array(PW * (2 * TH + 1));
    for (let y = 0; y < 2 * TH; y++) {
      let run = 0;
      for (let x = 0; x < 2 * TW; x++) { run += A[(y % TH) * TW + (x % TW)]; P[(y + 1) * PW + x + 1] = P[y * PW + x + 1] + run; }
    }
    const m = C >= 4 ? 1 : 0, s = C - 2 * m;
    for (let oy = 0; oy < TH; oy++) {
      for (let ox = 0; ox < TW; ox++) {
        let norm = 0;
        for (let k = 0; k < NB; k++) {
          const x0 = ox + (k % GW) * C + m, y0 = oy + ((k / GW) | 0) * C + m;
          const val = P[(y0 + s) * PW + x0 + s] - P[y0 * PW + x0 + s] - P[(y0 + s) * PW + x0] + P[y0 * PW + x0];
          v[k] = val; norm += val * val;
        }
        norm = Math.sqrt(norm * NB) || 1;
        // 1) confronto con i codici noti
        for (const kc of known) {
          let dot = 0;
          for (let k = 0; k < NB; k++) dot += v[k] * kc.e[k];
          const corr = dot / norm;
          if (!soft || corr > soft.corr) soft = { code: kc.code, corr, cell: C };
        }
        // 2) lettura diretta: sincronismo con al massimo 1 errore
        if (hard) continue;
        let syncErr = 0;
        for (let k = 0; k < 16 && syncErr < 2; k++) if ((v[k] > 0 ? 1 : 0) !== syncBits[k]) syncErr++;
        if (syncErr > 1) continue;
        const comb = new Array(PAYLOAD), bits = new Array(PAYLOAD);
        for (let i = 0; i < PAYLOAD; i++) { comb[i] = v[16 + i] + v[16 + PAYLOAD + i]; bits[i] = comb[i] > 0 ? 1 : 0; }
        const weak = [...comb.keys()].sort((a, b) => Math.abs(comb[a]) - Math.abs(comb[b])).slice(0, 4);
        for (let mask = 0; mask < 16 && !hard; mask++) {
          const b = bits.slice();
          weak.forEach((idx, j) => { if (mask & (1 << j)) b[idx] ^= 1; });
          const code = payloadToCode(b);
          if (code) hard = { code, cell: C, flips: mask ? mask.toString(2).replace(/0/g, '').length : 0 };
        }
      }
    }
    if (soft && soft.corr > 0.55) break;
  }
  if (soft && soft.corr > 0.55) return { code: soft.code, method: 'registro', corr: soft.corr, cell: soft.cell };
  if (hard) return { ...hard, method: 'diretta' };
  return null;
}

/* ---------------------------------------------------------------- anteprima */
const stage = $('#stage');
const sg = stage.getContext('2d');
let view = { s: 1, w: 1, h: 1 };
let raf = 0;

function schedule() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(draw);
}

function draw() {
  const o = opts();
  $('#wmPreview').textContent = o.text;
  $('#gdprText').value = gdprText(o);
  if (!S.src) return;
  if (S.mode === 'preview') {
    const r = renderOutput(o);
    S.preview = r.canvas; S.previewK = r.k;
    fitStage(r.canvas.width, r.canvas.height);
    sg.drawImage(r.canvas, 0, 0, stage.width, stage.height);
    if ($('#optCover').checked) {
      const px = view.s * dpr();
      S.covers.forEach((cv, i) => {
        const rr = coverToOut(cv);
        sg.save();
        sg.setLineDash(i === S.selCover ? [] : [6, 5]);
        sg.lineWidth = i === S.selCover ? 2.5 : 1.5;
        sg.strokeStyle = i === S.selCover ? '#ffcf4a' : 'rgba(255,207,74,.8)';
        sg.strokeRect(rr.x * px, rr.y * px, rr.w * px, rr.h * px);
        if (i === S.selCover) drawHandles(rr, px);
        sg.restore();
      });
    }
    $('#stageInfo').textContent = `${r.canvas.width}×${r.canvas.height}px`;
    $('#stageNote').textContent = $('#optCover').checked
      ? 'Trascina sull’anteprima per coprire un’area; clic su un rettangolo per selezionarlo, Canc per eliminarlo.'
      : 'Anteprima live: la filigrana attraversa tutto il documento e non si può ritagliare via.';
  } else {
    fitStage(S.src.width, S.src.height);
    const px = view.s * dpr(), cr = S.crop;
    sg.drawImage(S.src, 0, 0, stage.width, stage.height);
    sg.fillStyle = 'rgba(10,8,7,.62)';
    sg.beginPath();
    sg.rect(0, 0, stage.width, stage.height);
    sg.rect(cr.x * px, cr.y * px, cr.w * px, cr.h * px);
    sg.fill('evenodd');
    sg.strokeStyle = '#fff'; sg.lineWidth = 2;
    sg.strokeRect(cr.x * px, cr.y * px, cr.w * px, cr.h * px);
    sg.strokeStyle = 'rgba(255,255,255,.35)'; sg.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      sg.beginPath();
      sg.moveTo((cr.x + cr.w * i / 3) * px, cr.y * px); sg.lineTo((cr.x + cr.w * i / 3) * px, (cr.y + cr.h) * px);
      sg.moveTo(cr.x * px, (cr.y + cr.h * i / 3) * px); sg.lineTo((cr.x + cr.w) * px, (cr.y + cr.h * i / 3) * px);
      sg.stroke();
    }
    drawHandles(cr, px);
    $('#stageInfo').textContent = `ritaglio ${Math.round(cr.w)}×${Math.round(cr.h)}px`;
    $('#stageNote').textContent = 'Trascina gli angoli o disegna un nuovo riquadro. Poi passa ad Anteprima.';
  }
}
function drawHandles(r, px) {
  sg.fillStyle = '#fff'; sg.strokeStyle = '#000'; sg.lineWidth = 1;
  const hs = 10 * dpr();
  for (const [hx, hy] of handlePoints(r)) {
    sg.fillRect(hx * px - hs / 2, hy * px - hs / 2, hs, hs);
    sg.strokeRect(hx * px - hs / 2, hy * px - hs / 2, hs, hs);
  }
}
function dpr() { return window.devicePixelRatio || 1; }
function fitStage(w, h) {
  const wrap = $('#stageWrap');
  const cs = getComputedStyle(wrap);
  const maxW = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const maxH = Math.max(260, window.innerHeight * 0.74);
  const s = Math.min(maxW / w, maxH / h);
  const cw = Math.max(1, Math.floor(w * s)), ch = Math.max(1, Math.floor(h * s));
  if (stage.width !== Math.round(cw * dpr()) || stage.height !== Math.round(ch * dpr())) {
    stage.width = Math.round(cw * dpr()); stage.height = Math.round(ch * dpr());
    stage.style.width = cw + 'px'; stage.style.height = ch + 'px';
  }
  view = { s: cw / w, w, h };
}
function coverToOut(cv) {
  const cr = S.crop, k = S.previewK;
  return { x: (cv.x - cr.x) * k, y: (cv.y - cr.y) * k, w: cv.w * k, h: cv.h * k };
}
function outToSrc(r) {
  const cr = S.crop, k = S.previewK;
  return { x: r.x / k + cr.x, y: r.y / k + cr.y, w: r.w / k, h: r.h / k };
}

/* ----------------------------------------------- editor di rettangoli (drag) */
function handlePoints(r) {
  const { x, y, w, h } = r;
  return [[x, y, 'nw'], [x + w / 2, y, 'n'], [x + w, y, 'ne'], [x + w, y + h / 2, 'e'],
    [x + w, y + h, 'se'], [x + w / 2, y + h, 's'], [x, y + h, 'sw'], [x, y + h / 2, 'w']];
}
function hitRect(r, px, py, tol) {
  for (const [hx, hy, n] of handlePoints(r)) if (Math.abs(px - hx) <= tol && Math.abs(py - hy) <= tol) return n;
  if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return 'move';
  return null;
}
function dragRect(start, handle, dx, dy, W, H, ratio, minSize) {
  let { x, y, w, h } = start;
  if (handle === 'move') {
    return { x: clamp(x + dx, 0, W - w), y: clamp(y + dy, 0, H - h), w, h };
  }
  let x1 = x, y1 = y, x2 = x + w, y2 = y + h;
  if (handle.includes('w')) x1 = clamp(x1 + dx, 0, x2 - minSize);
  if (handle.includes('e')) x2 = clamp(x2 + dx, x1 + minSize, W);
  if (handle.includes('n')) y1 = clamp(y1 + dy, 0, y2 - minSize);
  if (handle.includes('s')) y2 = clamp(y2 + dy, y1 + minSize, H);
  if (ratio) {
    let nw = x2 - x1, nh = y2 - y1;
    if (handle === 'n' || handle === 's') nw = nh * ratio; else nh = nw / ratio;
    if (handle.includes('n')) y1 = y2 - nh; else y2 = y1 + nh;
    if (handle.includes('w')) x1 = x2 - nw; else x2 = x1 + nw;
    if (x1 < 0 || y1 < 0 || x2 > W || y2 > H) return start;
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
function freshRect([ax, ay], [bx, by], W, H, ratio) {
  bx = clamp(bx, 0, W); by = clamp(by, 0, H);
  let w = Math.abs(bx - ax), h = Math.abs(by - ay);
  if (ratio) { if (w / ratio > h) h = w / ratio; else w = h * ratio; }
  let x = bx < ax ? ax - w : ax, y = by < ay ? ay - h : ay;
  x = clamp(x, 0, W); y = clamp(y, 0, H);
  w = Math.min(w, W - x); h = Math.min(h, H - y);
  if (ratio) { if (w / ratio > h) w = h * ratio; else h = w / ratio; }
  return { x, y, w, h };
}
const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move' };

let drag = null;
function stagePoint(e) {
  const b = stage.getBoundingClientRect();
  return [(e.clientX - b.left) / view.s, (e.clientY - b.top) / view.s];
}
stage.addEventListener('pointerdown', e => {
  if (!S.src) return;
  const [px, py] = stagePoint(e);
  const tol = 12 / view.s;
  if (S.mode === 'crop') {
    let h = hitRect(S.crop, px, py, tol);
    // a ritaglio pieno "sposta" non ha senso: trascinare dentro disegna un nuovo riquadro
    if (h === 'move' && S.crop.w >= S.src.width - 1 && S.crop.h >= S.src.height - 1) h = null;
    drag = h
      ? { kind: 'crop', handle: h, start: { ...S.crop }, p0: [px, py] }
      : { kind: 'crop', fresh: true, prev: { ...S.crop }, p0: [px, py] };
  } else if ($('#optCover').checked) {
    let idx = -1, h = null;
    for (let i = S.covers.length - 1; i >= 0; i--) {
      h = hitRect(coverToOut(S.covers[i]), px, py, i === S.selCover ? tol : 0);
      if (h) { idx = i; break; }
    }
    if (idx >= 0) {
      S.selCover = idx;
      drag = { kind: 'cover', idx, handle: h, start: coverToOut(S.covers[idx]), p0: [px, py] };
    } else {
      S.covers.push({ x: 0, y: 0, w: 0, h: 0, type: S.coverType });
      S.selCover = S.covers.length - 1;
      drag = { kind: 'cover', idx: S.selCover, fresh: true, p0: [px, py] };
    }
    updateCoverButtons();
  } else return;
  stage.setPointerCapture(e.pointerId);
  e.preventDefault();
});
stage.addEventListener('pointermove', e => {
  if (!S.src) return;
  const [px, py] = stagePoint(e);
  if (!drag) {
    let h = null;
    if (S.mode === 'crop') h = hitRect(S.crop, px, py, 12 / view.s) || 'crosshair';
    else if ($('#optCover').checked) {
      for (let i = S.covers.length - 1; i >= 0 && !h; i--) h = hitRect(coverToOut(S.covers[i]), px, py, i === S.selCover ? 12 / view.s : 0);
      h = h || 'crosshair';
    }
    stage.style.cursor = CURSORS[h] || h || 'default';
    return;
  }
  const dx = px - drag.p0[0], dy = py - drag.p0[1];
  if (drag.fresh) {
    const lim = drag.kind === 'crop' ? [S.src.width, S.src.height] : [view.w, view.h];
    const r = freshRect(drag.p0, [px, py], lim[0], lim[1], drag.kind === 'crop' ? S.ratio : 0);
    if (drag.kind === 'crop') S.crop = r;
    else S.covers[drag.idx] = { ...outToSrc(r), type: S.covers[drag.idx].type };
  } else if (drag.kind === 'crop') {
    const r = dragRect(drag.start, drag.handle, dx, dy, S.src.width, S.src.height, S.ratio, 20);
    S.crop = r;
  } else {
    const r = dragRect(drag.start, drag.handle, dx, dy, view.w, view.h, 0, 4);
    S.covers[drag.idx] = { ...outToSrc(r), type: S.covers[drag.idx].type };
  }
  schedule();
});
function endDrag() {
  if (!drag) return;
  if (drag.kind === 'crop' && drag.fresh && (S.crop.w < 24 || S.crop.h < 24)) S.crop = drag.prev;
  if (drag.kind === 'cover') {
    const cv = S.covers[drag.idx];
    if (drag.fresh && (cv.w * S.previewK < 6 || cv.h * S.previewK < 6)) { S.covers.splice(drag.idx, 1); S.selCover = -1; }
  }
  drag = null;
  updateCoverButtons();
  schedule();
}
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

document.addEventListener('keydown', e => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.selCover >= 0 && S.mode === 'preview' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    S.covers.splice(S.selCover, 1); S.selCover = -1; updateCoverButtons(); schedule(); e.preventDefault();
  }
});
function updateCoverButtons() { $('#coverDel').disabled = S.selCover < 0; }

function setMode(m) {
  S.mode = m;
  $$('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  schedule();
}

/* ------------------------------------------------------------------- export */
async function exportCopy() {
  const o = opts();
  if (!o.dest || !o.fin) {
    toast('Indica destinatario e finalità: è quello che rende la copia inutilizzabile altrove.', 4000);
    (!o.dest ? $('#dest') : $('#fin')).focus();
    return;
  }
  const btn = $('#exportBtn');
  btn.disabled = true;
  try {
    const { canvas } = renderOutput(o, { invisible: true });
    let blob, ext;
    if (S.fmt === 'png') { blob = await toBlob(canvas, 'image/png'); ext = 'png'; }
    else if (S.fmt === 'jpg') { blob = await toBlob(canvas, 'image/jpeg', 0.92); ext = 'jpg'; }
    else { blob = makePdf(canvas, o); ext = 'pdf'; }
    const name = `copia-${slug(o.dest) || 'documento'}-${$('#date').value}-${o.code.replace('SG-', '')}.${ext}`;
    const hash = await sha256(blob);
    download(blob, name);
    addToRegistry({
      id: o.code, code: o.code, dest: o.dest, fin: o.fin, date: $('#date').value,
      created: new Date().toISOString(), format: ext, file: name, sha256: hash,
      mark: o.mark, thumb: thumb(canvas),
    });
    toast(`Scaricata e registrata: ${o.code}. Nuovo codice pronto per la prossima copia.`, 4000);
    $('#code').value = randomCode();
    schedule();
  } catch (err) {
    console.error(err);
    toast('Qualcosa è andato storto durante l’esportazione.');
  } finally {
    btn.disabled = false;
  }
}
function toBlob(c, type, q) { return new Promise(r => c.toBlob(r, type, q)); }
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function makePdf(canvas, o) {
  const { jsPDF } = window.jspdf;
  // pagina grande quanto l'immagine (1 px = 1 pt): renderizzata a scala 1 torna pixel per pixel
  const W = canvas.width, H = canvas.height;
  const doc = new jsPDF({ orientation: W > H ? 'l' : 'p', unit: 'pt', format: [W, H], compress: true });
  doc.setProperties({ title: `Copia per ${o.dest} – ${o.code}`, subject: `Solo per: ${o.fin}`, creator: 'Sigillo' });
  doc.addImage(canvas, 'PNG', 0, 0, W, H, undefined, 'FAST');
  return doc.output('blob');
}
function thumb(canvas) {
  const k = 240 / Math.max(canvas.width, canvas.height);
  const t = newCanvas(canvas.width * k, canvas.height * k);
  t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.7);
}

/* -------------------------------------------------------------------- GDPR */
function gdprText(o) {
  const dest = o.dest || '[destinatario]', fin = o.fin || '[finalità]';
  return `Gentile ${dest},

in allegato trovate la copia del mio documento d'identità, fornita esclusivamente per: ${fin}.
La copia è contrassegnata con il codice ${o.code} del ${o.date} e non può essere usata per finalità diverse né comunicata a terzi.

Ai sensi del Regolamento (UE) 2016/679 (GDPR) vi chiedo:
- l'informativa sul trattamento (art. 13), con base giuridica e periodo di conservazione;
- di poter accedere, su richiesta, ai dati personali che conservate su di me (art. 15);
- la cancellazione della copia appena esaurita la finalità indicata (art. 17), salvo obblighi di legge che ne impongano la conservazione.

Grazie,
`;
}

/* ---------------------------------------------------------------- registro */
function loadRegistry() {
  try { return JSON.parse(localStorage.getItem(REG_KEY)) || []; } catch { return []; }
}
function saveRegistry(list) {
  try { localStorage.setItem(REG_KEY, JSON.stringify(list)); return true; }
  catch { toast('Impossibile salvare il registro in questo browser: esportalo in JSON.', 4500); return false; }
}
function addToRegistry(entry) {
  const list = loadRegistry().filter(e => e.code !== entry.code);
  list.unshift(entry);
  if (!saveRegistry(list)) { entry.thumb = null; saveRegistry(list); }
  renderRegistry();
}
function regItemHtml(e, { actions = true, hit = false } = {}) {
  return `<article class="reg-item${hit ? ' hit' : ''}">
    ${e.thumb ? `<img src="${esc(e.thumb)}" alt="">` : '<img alt="">'}
    <div>
      <h3>${esc(e.dest)}</h3>
      <div class="reg-meta">Solo per: ${esc(e.fin)} · ${esc(fmtDate(e.date))} · ${esc((e.format || '').toUpperCase())}</div>
      <div class="reg-code">${esc(e.code)}${e.mark === false ? ' <span class="muted">(senza marca invisibile)</span>' : ''}</div>
      ${e.sha256 ? `<div class="reg-hash">SHA-256 ${esc(e.sha256)}</div>` : ''}
      <div class="reg-meta muted">Creata il ${esc(new Date(e.created).toLocaleString('it-IT'))}</div>
    </div>
    ${actions ? `<div class="reg-actions"><button class="btn btn-ghost" data-del="${esc(e.code)}">Elimina</button></div>` : ''}
  </article>`;
}
function renderRegistry() {
  const list = loadRegistry();
  $('#regCount').textContent = list.length || '';
  $('#regList').innerHTML = list.length
    ? list.map(e => regItemHtml(e)).join('')
    : `<div class="reg-empty"><p>Nessuna copia rilasciata finora.</p><button class="btn btn-dark" data-goto="crea">Crea la prima copia</button></div>`;
}
$('#regList').addEventListener('click', e => {
  const del = e.target.closest('[data-del]');
  if (del && confirm(`Eliminare ${del.dataset.del} dal registro? Non potrai più ricondurre quella copia al destinatario.`)) {
    saveRegistry(loadRegistry().filter(x => x.code !== del.dataset.del));
    renderRegistry();
  }
  const go = e.target.closest('[data-goto]');
  if (go) showTab(go.dataset.goto);
});
$('#regExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(loadRegistry(), null, 2)], { type: 'application/json' });
  download(blob, `sigillo-registro-${todayIso()}.json`);
});
$('#regImport').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const incoming = JSON.parse(await f.text());
    if (!Array.isArray(incoming)) throw 0;
    const map = new Map(loadRegistry().map(x => [x.code, x]));
    let n = 0;
    for (const x of incoming) if (x && typeof x.code === 'string' && !map.has(x.code)) { map.set(x.code, x); n++; }
    saveRegistry([...map.values()].sort((a, b) => String(b.created).localeCompare(String(a.created))));
    renderRegistry();
    toast(`Importate ${n} voci nel registro.`);
  } catch { toast('File JSON non valido.'); }
});

/* ---------------------------------------------------------------- verifica */
async function verifyFile(file) {
  const out = $('#verifyResult');
  out.innerHTML = '<div class="verdict"><p>Analisi in corso…</p></div>';
  await new Promise(r => setTimeout(r, 30));
  try {
    const hash = await sha256(file);
    const reg = loadRegistry();
    const byHash = hash && reg.find(e => e.sha256 === hash);
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    let found = null;
    if (isPdf) {
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
      for (let p = 1; p <= Math.min(pdf.numPages, 3) && !found; p++) {
        found = detectMark(await renderPdfPage(pdf, p, 0, 1), reg.map(e => e.code)); // scala 1: pixel per pixel
      }
    } else {
      found = detectMark(await loadImage(file), reg.map(e => e.code));
    }
    const entry = byHash || (found && reg.find(e => e.code === found.code));
    let html;
    if (byHash) {
      html = `<div class="verdict ok"><h3>È esattamente una copia che hai rilasciato</h3>
        <p>L'impronta SHA-256 del file coincide con quella registrata: il file non è stato modificato.</p>${regItemHtml(byHash, { actions: false, hit: true })}</div>`;
    } else if (found && entry) {
      html = `<div class="verdict ok"><h3>Marca invisibile trovata: ${esc(found.code)}</h3>
        <p>Questa copia l'avevi data a <b>${esc(entry.dest)}</b>. Il file però non è identico all'originale (screenshot, ritaglio o ri-salvataggio).</p>${regItemHtml(entry, { actions: false, hit: true })}</div>`;
    } else if (found) {
      html = `<div class="verdict warn"><h3>Marca invisibile trovata: ${esc(found.code)}</h3>
        <p>Il codice non è nel registro di questo browser. Importa il JSON del registro dal dispositivo su cui l'avevi creata.</p></div>`;
    } else {
      html = `<div class="verdict warn"><h3>Nessuna marca invisibile rilevata</h3>
        <p>La copia potrebbe essere stata ridimensionata, compressa molto o fotografata. Leggi il codice visibile nella filigrana (SG-XXXXXX) e cercalo qui sotto.</p></div>`;
    }
    out.innerHTML = html;
  } catch (err) {
    console.error(err);
    out.innerHTML = '<div class="verdict warn"><h3>Impossibile leggere il file</h3><p>Prova con un PNG, JPG o PDF.</p></div>';
  }
}
function verifyManual() {
  const code = normCode($('#manualCode').value);
  const out = $('#verifyResult');
  if (!code) { out.innerHTML = '<div class="verdict warn"><p>Il codice ha la forma SG-XXXXXX (6 caratteri).</p></div>'; return; }
  const e = loadRegistry().find(x => x.code === code);
  out.innerHTML = e
    ? `<div class="verdict ok"><h3>${esc(code)}: l'avevi data a ${esc(e.dest)}</h3>${regItemHtml(e, { actions: false, hit: true })}</div>`
    : `<div class="verdict warn"><h3>${esc(code)} non è nel registro</h3><p>Controlla di aver letto bene il codice o importa il registro da un altro dispositivo.</p></div>`;
}

/* ------------------------------------------------------------------ binding */
function showTab(name) {
  $$('.tab').forEach(t => { const on = t.dataset.tab === name; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'crea') schedule();
}
$$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

$('#fileInput').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });
$('#pdfPage').addEventListener('change', async e => {
  if (!S.pdf) return;
  setSource(await renderPdfPage(S.pdf, +e.target.value));
  setMode('crop');
});

function seg(selector, attr, fn) {
  $$(selector).forEach(b => b.addEventListener('click', () => {
    $$(selector).forEach(x => x.classList.toggle('active', x === b));
    fn(b.dataset[attr]);
  }));
}
seg('[data-ratio]', 'ratio', v => {
  S.ratio = +v;
  if (S.src) S.crop = fitRatio(S.crop, S.ratio, S.src.width, S.src.height);
  setMode('crop');
});
seg('[data-mode]', 'mode', setMode);
seg('[data-cover]', 'cover', v => {
  S.coverType = v;
  if (S.selCover >= 0) { S.covers[S.selCover].type = v; schedule(); }
});
seg('[data-fmt]', 'fmt', v => {
  S.fmt = v;
  $('#fmtHint').textContent = {
    png: 'Il PNG conserva al meglio la marca invisibile. I metadati EXIF (posizione, dispositivo) vengono sempre rimossi.',
    jpg: 'Il JPG è più leggero ma la compressione può indebolire la marca invisibile. EXIF sempre rimossi.',
    pdf: 'PDF a pagina singola, immagine senza perdita. Utile quando il destinatario chiede un PDF.',
  }[v];
});

$('#rotL').addEventListener('click', () => { if (!S.base) return; S.rotation = (S.rotation + 270) % 360; applyRotation(); setMode('crop'); });
$('#rotR').addEventListener('click', () => { if (!S.base) return; S.rotation = (S.rotation + 90) % 360; applyRotation(); setMode('crop'); });
$('#cropReset').addEventListener('click', () => {
  S.crop = fitRatio({ x: 0, y: 0, w: S.src.width, h: S.src.height }, S.ratio, S.src.width, S.src.height);
  setMode('crop');
});

['dest', 'fin', 'date', 'tpl', 'color', 'opacity', 'size', 'density', 'angle', 'sealPos'].forEach(id => $('#' + id).addEventListener('input', () => {
  updateOutputs();
  if (S.mode !== 'preview' && !['dest', 'fin', 'date', 'tpl'].includes(id)) setMode('preview'); else schedule();
}));
['optTile', 'optLines', 'optSeal', 'optMark', 'optBW'].forEach(id => $('#' + id).addEventListener('change', () => setMode('preview')));
$('#optCover').addEventListener('change', e => {
  $('#coverTools').hidden = !e.target.checked;
  if (!e.target.checked) S.selCover = -1;
  setMode('preview');
});
$('#coverDel').addEventListener('click', () => { if (S.selCover >= 0) { S.covers.splice(S.selCover, 1); S.selCover = -1; updateCoverButtons(); schedule(); } });
$('#coverClear').addEventListener('click', () => { S.covers = []; S.selCover = -1; updateCoverButtons(); schedule(); });
$('#newCode').addEventListener('click', () => { $('#code').value = randomCode(); schedule(); });
$('#exportBtn').addEventListener('click', exportCopy);
$('#gdprCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#gdprText').value); toast('Testo copiato.'); }
  catch { $('#gdprText').select(); document.execCommand('copy'); toast('Testo copiato.'); }
});

$('#verifyInput').addEventListener('change', e => { if (e.target.files[0]) verifyFile(e.target.files[0]); e.target.value = ''; });
$('#manualBtn').addEventListener('click', verifyManual);
$('#manualCode').addEventListener('keydown', e => { if (e.key === 'Enter') verifyManual(); });

function dropTarget(el, onFile) {
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag'));
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('drag'); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
}
dropTarget($('#stageWrap'), loadFile);
dropTarget($('#verifyDrop'), verifyFile);
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());
window.addEventListener('resize', schedule);

function updateOutputs() {
  $('#opacityOut').textContent = $('#opacity').value + '%';
  $('#sizeOut').textContent = $('#size').value;
  $('#densityOut').textContent = $('#density').value;
  $('#angleOut').textContent = $('#angle').value + '°';
}

/* -------------------------------------------------------------------- avvio */
$('#date').value = todayIso();
$('#code').value = randomCode();
updateOutputs();
renderRegistry();
setSource(makeDemo());
setMode('crop');

// esposto per i test in console
window.Sigillo = { S, renderOutput, opts, detectMark, embedMark, codeToBits, bitsToCode };
