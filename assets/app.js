/* ═══════════════════════════════════════════════════════════════
   Ekam Bhullar — portfolio runtime

   1. lattice   : a 2D wave equation solved live on a perspective
                  mesh. Leapfrog finite differences, Dirichlet edges.
   2. motion    : Motion (motion.dev) choreography, reduced-motion aware.
   3. viz       : per-project live canvas diagrams (projects.html only).
   4. router    : real URLs, no reload, lattice survives navigation.
   ═══════════════════════════════════════════════════════════════ */

const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const HAS_MOTION = () => typeof window.Motion === 'object';
const EASE = [.22, 1, .36, 1];
const lerp = (a, b, t) => a + (b - a) * t;

/* ───────────────────────────────────────────────────────────────
   1. THE LATTICE
   u_tt = c²∇²u  →  leapfrog update on a square grid:
   u[i,j]^{n+1} = 2u^n − u^{n−1} + r²(u[i±1,j] + u[i,j±1] − 4u[i,j])
   CFL in 2D requires r ≤ 1/√2. We run r = 0.5.
   Edges held at u = 0, so pulses reflect inverted.
   ─────────────────────────────────────────────────────────────── */
const Lattice = (() => {
  const cv = document.getElementById('lattice');
  if (!cv) return { pulse(){} };
  const ctx = cv.getContext('2d', { alpha: true });

  const NX = 64, NZ = 46;          // mesh resolution
  const R2 = 0.25;                 // r² with r = 0.5
  const DAMP = 0.9988;             // bleeds energy so it settles between pulses
  const SPAN = 3.2;                // world half-width
  const TILT = 1.02;               // camera pitch, radians
  const DIST = 3.05;               // camera distance
  const FOCAL = 1.5;
  const AMP = 0.46;                // vertical exaggeration

  const N = NX * NZ;
  let prev = new Float32Array(N);
  let curr = new Float32Array(N);
  let next = new Float32Array(N);
  const px = new Float32Array(N);  // projected screen coords
  const py = new Float32Array(N);
  const pd = new Float32Array(N);  // projected depth, for fade

  let W = 0, H = 0, dpr = 1, grad = null;
  const idx = (i, j) => j * NX + i;

  function pulse(ci, cj, strength = 1) {
    const sig = 2.4;
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const d2 = (i - ci) ** 2 + (j - cj) ** 2;
        if (d2 > 90) continue;
        const g = strength * Math.exp(-d2 / (2 * sig * sig));
        const k = idx(i, j);
        curr[k] += g;              // released from rest → symmetric splitting
        prev[k] += g;
      }
    }
  }

  function step() {
    for (let j = 1; j < NZ - 1; j++) {
      for (let i = 1; i < NX - 1; i++) {
        const k = idx(i, j);
        const lap = curr[k - 1] + curr[k + 1] + curr[k - NX] + curr[k + NX] - 4 * curr[k];
        next[k] = (2 * curr[k] - prev[k] + R2 * lap) * DAMP;
      }
    }
    // Dirichlet boundary: u = 0 on all four edges
    for (let i = 0; i < NX; i++) { next[idx(i, 0)] = 0; next[idx(i, NZ - 1)] = 0; }
    for (let j = 0; j < NZ; j++) { next[idx(0, j)] = 0; next[idx(NX - 1, j)] = 0; }
    const t = prev; prev = curr; curr = next; next = t;
  }

  function project() {
    const cosA = Math.cos(TILT), sinA = Math.sin(TILT);
    const cx = W * 0.5, cy = H * 0.58;
    const scale = Math.max(W, H) * 0.78;

    for (let j = 0; j < NZ; j++) {
      const z = (j / (NZ - 1) - 0.5) * SPAN * 1.55;
      for (let i = 0; i < NX; i++) {
        const k = idx(i, j);
        const x = (i / (NX - 1) - 0.5) * SPAN * 2.05;
        const y = curr[k] * AMP;

        const yr = y * cosA - z * sinA;
        const zr = y * sinA + z * cosA + DIST;
        const s = (FOCAL / Math.max(zr, 0.35)) * scale;

        px[k] = cx + x * s;
        py[k] = cy - yr * s;
        pd[k] = zr;
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    project();

    ctx.lineWidth = 1;
    ctx.strokeStyle = grad;
    ctx.beginPath();

    for (let j = 0; j < NZ; j++) {           // lines of constant z
      const k0 = idx(0, j);
      ctx.moveTo(px[k0], py[k0]);
      for (let i = 1; i < NX; i++) { const k = idx(i, j); ctx.lineTo(px[k], py[k]); }
    }
    for (let i = 0; i < NX; i++) {           // lines of constant x
      const k0 = idx(i, 0);
      ctx.moveTo(px[k0], py[k0]);
      for (let j = 1; j < NZ; j++) { const k = idx(i, j); ctx.lineTo(px[k], py[k]); }
    }
    ctx.stroke();

    // nodes carrying meaningful displacement — the wavefront reads as light
    for (let j = 1; j < NZ - 1; j++) {
      for (let i = 1; i < NX - 1; i++) {
        const k = idx(i, j);
        const a = Math.min(Math.abs(curr[k]) * 1.5, 1);
        if (a < 0.06) continue;
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = curr[k] > 0 ? '#e8ecef' : '#c9a769';
        const r = 1 + a * 1.4;
        ctx.fillRect(px[k] - r / 2, py[k] - r / 2, r, r);
      }
    }
    ctx.globalAlpha = 1;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,   'rgba(232,236,239,0.028)');  // far — near horizon
    grad.addColorStop(0.55,'rgba(232,236,239,0.062)');
    grad.addColorStop(1,   'rgba(232,236,239,0.105)');  // near
    if (REDUCE) draw();
  }

  let acc = 0, last = 0;
  function loop(ts) {
    if (!last) last = ts;
    acc += Math.min(ts - last, 64); last = ts;
    while (acc >= 16) { step(); acc -= 16; }   // fixed dt keeps the CFL bound honest
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();

  if (REDUCE) {
    pulse(NX * 0.5, NZ * 0.52, 1.1);
    for (let n = 0; n < 60; n++) step();
    draw();
  } else {
    pulse(NX * 0.5, NZ * 0.5, 1.15);
    requestAnimationFrame(loop);
    setInterval(() => {
      pulse(4 + Math.random() * (NX - 8), 4 + Math.random() * (NZ - 8), 0.55 + Math.random() * 0.4);
    }, 7000);
  }

  // clicking the empty page perturbs the field at that point
  window.addEventListener('pointerdown', (e) => {
    if (REDUCE) return;
    if (e.target.closest('a, button, nav')) return;
    let best = -1, bd = 1e9;
    for (let k = 0; k < N; k++) {
      const d = (px[k] - e.clientX) ** 2 + (py[k] - e.clientY) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    if (best >= 0 && bd < 40000) pulse(best % NX, Math.floor(best / NX), 0.95);
  }, { passive: true });

  return { pulse: () => pulse(NX * 0.5, NZ * 0.5, 0.8) };
})();

/* ───────────────────────────────────────────────────────────────
   2. MOTION
   ─────────────────────────────────────────────────────────────── */
let observer = null;

/* Motion's WAAPI-accelerated animations don't reliably commit their final
   value back to the element once finished (and .rv's own opacity:0 rule
   would win the cascade back if they don't) — so every animate() call below
   is paired with a timer that force-sets the end state directly. Belt and
   braces: the animation is cosmetic, this is what guarantees correctness. */
function commitAfter(targets, seconds, styles) {
  const els = targets && targets.length !== undefined ? [...targets] : [targets];
  setTimeout(() => {
    els.forEach(el => { if (el) Object.assign(el.style, styles); });
  }, seconds * 1000 + 40);
}

/* count a readout number up from 0 to its printed value, preserving
   any non-numeric suffix (×) and thousands separators */
function countUpNum(el) {
  const raw = el.textContent.trim();
  const m = raw.match(/^([\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return;
  const target = parseFloat(m[1].replace(/,/g, ''));
  const suffix = m[2];
  const decimals = (m[1].split('.')[1] || '').length;
  const grouped = m[1].includes(',');
  const format = n => (grouped ? Number(n).toLocaleString() : n) + suffix;
  Motion.animate(0, target, {
    duration: 1.1,
    ease: EASE,
    onUpdate: latest => { el.textContent = format(decimals ? latest.toFixed(decimals) : Math.round(latest)); }
  });
  setTimeout(() => { el.textContent = format(decimals ? target.toFixed(decimals) : Math.round(target)); }, 1140);
}

function revealOnScroll(root) {
  if (REDUCE || !HAS_MOTION()) {
    root.querySelectorAll('.rv').forEach(el => { el.style.opacity = 1; });
    return;
  }
  if (observer) observer.disconnect();
  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      Motion.animate(entry.target, { opacity: [0, 1], y: [16, 0] },
        { duration: .82, ease: EASE });
      commitAfter(entry.target, .82, { opacity: '1' });
      entry.target.querySelectorAll('.readout .num').forEach(countUpNum);
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });

  root.querySelectorAll('.sec .rv, .idx .rv, footer .rv').forEach(el => {
    if (el.dataset.seen) return;          // already handled by the entrance sequence
    observer.observe(el);
  });
}

/* spring-driven hover feedback — replaces the CSS transform transitions
   previously on .idx-item .arrow and .chan a (color transitions stay in CSS) */
function attachHoverSprings(root) {
  if (REDUCE || !HAS_MOTION()) return;
  const spring = { type: 'spring', stiffness: 300, damping: 20 };

  root.querySelectorAll('.idx-item').forEach(item => {
    const arrow = item.querySelector('.arrow');
    if (!arrow) return;
    item.addEventListener('pointerenter', () => Motion.animate(arrow, { x: 6 }, spring));
    item.addEventListener('pointerleave', () => Motion.animate(arrow, { x: 0 }, spring));
  });

  root.querySelectorAll('.chan a').forEach(link => {
    link.addEventListener('pointerenter', () => Motion.animate(link, { x: 10 }, spring));
    link.addEventListener('pointerleave', () => Motion.animate(link, { x: 0 }, spring));
  });
}

function enterPage(root, { firstLoad = false } = {}) {
  const hero = root.querySelector('.hero');

  if (REDUCE || !HAS_MOTION()) {
    root.querySelectorAll('.rv').forEach(el => { el.style.opacity = 1; });
    attachHoverSprings(root);
    initProjectVisualizations();
    return;
  }

  if (hero) {
    hero.querySelectorAll('.rv').forEach(el => { el.dataset.seen = '1'; });

    const tags = hero.querySelectorAll('.hero-tags .rv');
    const tagsDur = .7, tagsStagger = .06;
    Motion.animate(tags, { opacity: [0, 1], y: [8, 0] },
      { duration: tagsDur, delay: Motion.stagger(tagsStagger), ease: EASE });
    const tagsEnd = tagsDur + tagsStagger * Math.max(tags.length - 1, 0);
    commitAfter(tags, tagsEnd, { opacity: '1' });

    const letters = hero.querySelectorAll('.hero-name i');
    const nameDur = 1.15, nameStagger = .085;
    const nameStart = Math.max(tagsEnd - (firstLoad ? .45 : .52), 0);
    Motion.animate(letters, { opacity: [0, 1], y: ['110%', '0%'] },
      { duration: nameDur, delay: Motion.stagger(nameStagger, { startDelay: nameStart }), ease: EASE });
    const nameEnd = nameStart + nameDur + nameStagger * Math.max(letters.length - 1, 0);
    commitAfter(letters, nameEnd, { opacity: '1' });

    const line = hero.querySelector('.hero-line');
    const lineDur = .82;
    const lineStart = Math.max(nameEnd - .7, 0);
    if (line) Motion.animate(line, { opacity: [0, 1], y: [12, 0] },
      { duration: lineDur, delay: lineStart, ease: EASE });
    const lineEnd = lineStart + lineDur;
    commitAfter(line, lineEnd, { opacity: '1' });

    const foot = hero.querySelector('.hero-foot');
    const footDur = .7;
    const footStart = Math.max(lineEnd - .56, 0);
    if (foot) Motion.animate(foot, { opacity: [0, 1] },
      { duration: footDur, delay: footStart, ease: EASE });
    commitAfter(foot, footStart + footDur, { opacity: '1' });
  } else {
    const first = root.querySelectorAll('.sec:first-of-type .rv');
    first.forEach(el => { el.dataset.seen = '1'; });
    const firstDur = .88, firstStagger = .07;
    Motion.animate(first, { opacity: [0, 1], y: [18, 0] },
      { duration: firstDur, delay: Motion.stagger(firstStagger), ease: EASE });
    commitAfter(first, firstDur + firstStagger * Math.max(first.length - 1, 0), { opacity: '1' });
  }

  revealOnScroll(root);
  attachHoverSprings(root);
  initProjectVisualizations();
}

/* ───────────────────────────────────────────────────────────────
   3. PROJECT VISUALIZATIONS (projects.html only)

   Hand-rolled canvas, same technique as the lattice above. Unlike the
   lattice, these live inside <main> — the router replaces that whole
   subtree on navigation, so each loop checks canvas.isConnected and
   quietly stops once its element is gone, rather than piling up
   orphaned rAF loops every time projects.html is revisited.
   ─────────────────────────────────────────────────────────────── */
const VIZ_BONE = '#e8ecef', VIZ_DIM = '#7e8b96', VIZ_FAINT = '#465661', VIZ_RULE = '#1a2733', VIZ_SIGNAL = '#c9a769', VIZ_INK = '#0d1620';
const VIZ_MONO = "500 10px ui-monospace,'SF Mono',Consolas,monospace";

function vizMount(id) {
  const cv = document.getElementById(id);
  if (!cv || cv.dataset.mounted) return null;
  cv.dataset.mounted = '1';
  const ctx = cv.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.width, h = cv.height;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = w * dpr; cv.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { cv, ctx, w, h };
}

function initQuantumCircuit() {
  const m = vizMount('viz-quantum');
  if (!m) return;
  const { cv, ctx, w, h } = m;
  const lineY = [58, 115, 172];
  const LX = 60, RX = 390;
  const gates = [
    { x: 120, type: 'H', line: 0 },
    { x: 165, type: 'H', line: 2 },
    { x: 225, type: 'CNOT', control: 0, target: 1 },
    { x: 280, type: 'CNOT', control: 2, target: 0 },
  ];
  const meters = [{ x: 345, line: 0 }, { x: 345, line: 1 }, { x: 345, line: 2 }];
  const START_X = 90, END_X = 372, LOOP_MS = 3600;
  let elapsed = 0, trial = 0, bits = [null, null, null];

  const playheadX = () => lerp(START_X, END_X, Math.min(elapsed / LOOP_MS, 1));

  function step(dt) {
    elapsed += dt;
    const px = playheadX();
    meters.forEach((mt, i) => { if (bits[i] === null && px >= mt.x) bits[i] = Math.random() < 0.5 ? 0 : 1; });
    if (elapsed > LOOP_MS) { elapsed -= LOOP_MS; bits = [null, null, null]; trial++; }
  }

  function drawGateBox(x, y, label, glow) {
    ctx.fillStyle = glow ? VIZ_SIGNAL : VIZ_INK;
    ctx.strokeStyle = glow ? VIZ_SIGNAL : VIZ_DIM;
    ctx.lineWidth = 1.3;
    ctx.fillRect(x - 9, y - 9, 18, 18);
    ctx.strokeRect(x - 9, y - 9, 18, 18);
    ctx.font = "600 10px ui-monospace,Consolas,monospace";
    ctx.fillStyle = glow ? VIZ_INK : VIZ_BONE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const px = playheadX();

    ctx.strokeStyle = VIZ_FAINT; ctx.lineWidth = 1.2;
    lineY.forEach(y => { ctx.beginPath(); ctx.moveTo(LX, y); ctx.lineTo(RX, y); ctx.stroke(); });

    ctx.font = VIZ_MONO; ctx.fillStyle = VIZ_DIM; ctx.textAlign = 'left';
    lineY.forEach((y, i) => ctx.fillText('q' + i, 30, y + 4));

    gates.forEach(g => {
      const active = Math.abs(px - g.x) < 16;
      if (g.type === 'H') {
        drawGateBox(g.x, lineY[g.line], 'H', active);
      } else if (g.type === 'CNOT') {
        const y1 = lineY[g.control], y2 = lineY[g.target];
        ctx.strokeStyle = active ? VIZ_SIGNAL : VIZ_FAINT; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(g.x, y1); ctx.lineTo(g.x, y2); ctx.stroke();
        ctx.beginPath(); ctx.arc(g.x, y1, 4, 0, Math.PI * 2);
        ctx.fillStyle = active ? VIZ_SIGNAL : VIZ_BONE; ctx.fill();
        ctx.beginPath(); ctx.arc(g.x, y2, 8, 0, Math.PI * 2);
        ctx.strokeStyle = active ? VIZ_SIGNAL : VIZ_DIM; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(g.x - 8, y2); ctx.lineTo(g.x + 8, y2);
        ctx.moveTo(g.x, y2 - 8); ctx.lineTo(g.x, y2 + 8); ctx.stroke();
      }
    });

    meters.forEach((mt, i) => {
      const measured = bits[i] !== null;
      const y = lineY[mt.line];
      ctx.beginPath(); ctx.arc(mt.x, y, 10, Math.PI, 0);
      ctx.strokeStyle = measured ? VIZ_SIGNAL : VIZ_DIM; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mt.x, y); ctx.lineTo(mt.x + (measured ? 6 : 4), y - 7); ctx.stroke();
      if (measured) {
        ctx.font = "700 12px ui-monospace,Consolas,monospace";
        ctx.fillStyle = VIZ_SIGNAL; ctx.textAlign = 'left';
        ctx.fillText(String(bits[i]), mt.x + 16, y + 4);
      }
    });

    ctx.beginPath(); ctx.moveTo(px, 30); ctx.lineTo(px, 198);
    ctx.strokeStyle = VIZ_BONE; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;

    ctx.font = "500 9.5px ui-monospace,Consolas,monospace"; ctx.fillStyle = VIZ_FAINT; ctx.textAlign = 'left';
    ctx.fillText('H · CNOT · MEASURE', LX, 20);
    ctx.textAlign = 'right';
    ctx.fillText('TRIAL ' + String(trial % 10000).padStart(4, '0'), RX, 20);
  }

  if (REDUCE) { elapsed = LOOP_MS; bits = [1, 0, 1]; draw(); return; }
  let last = 0;
  function loop(t) {
    if (!cv.isConnected) return;
    if (!last) last = t;
    step(t - last); last = t; draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function initShellFlow() {
  const m = vizMount('viz-esh');
  if (!m) return;
  const { cv, ctx, w, h } = m;
  const nodes = [
    { x: 50, y: 115, label: 'SHELL' },
    { x: 160, y: 115, label: 'PROC A' },
    { x: 280, y: 115, label: 'PROC B' },
    { x: 390, y: 115, label: 'OUT' },
  ];
  let progress = 0, signalAt = -1, signalT = -1000, signalLabel = 'SIGINT';
  const SPEED = 0.00055;

  function step(t, dt) {
    const held = signalAt >= 0 && t - signalT < 500 && Math.abs(progress - signalAt) < 0.05;
    if (!held) progress += dt * SPEED;
    if (progress >= 3) progress -= 3;
    if (t - signalT > 4200) {
      signalT = t;
      signalAt = 1 + Math.floor(Math.random() * 2);
      signalLabel = Math.random() < 0.5 ? 'SIGINT' : 'SIGTSTP';
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = VIZ_FAINT; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < nodes.length - 1; i++) { ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[i + 1].x, nodes[i + 1].y); }
    ctx.stroke();

    ctx.font = "500 9px ui-monospace,Consolas,monospace"; ctx.fillStyle = VIZ_FAINT; ctx.textAlign = 'center';
    ctx.fillText('pipe', (nodes[1].x + nodes[2].x) / 2, nodes[1].y - 10);

    nodes.forEach((n, i) => {
      const flashing = signalAt === i && t - signalT < 650;
      ctx.beginPath(); ctx.arc(n.x, n.y, flashing ? 9 : 7, 0, Math.PI * 2);
      ctx.fillStyle = flashing ? VIZ_SIGNAL : VIZ_INK; ctx.strokeStyle = flashing ? VIZ_SIGNAL : VIZ_DIM; ctx.lineWidth = 1.4;
      ctx.fill(); ctx.stroke();
      if (flashing) {
        const ringT = (t - signalT) / 650;
        ctx.beginPath(); ctx.arc(n.x, n.y, 9 + ringT * 14, 0, Math.PI * 2);
        ctx.strokeStyle = VIZ_SIGNAL; ctx.globalAlpha = 1 - ringT; ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = VIZ_SIGNAL; ctx.font = "600 9.5px ui-monospace,Consolas,monospace";
        ctx.fillText(signalLabel, n.x, n.y - 20);
      }
      ctx.font = VIZ_MONO; ctx.fillStyle = VIZ_DIM; ctx.fillText(n.label, n.x, n.y + 26);
    });

    const seg = Math.floor(progress), f = progress - seg;
    const a = nodes[Math.min(seg, nodes.length - 1)], b = nodes[Math.min(seg + 1, nodes.length - 1)];
    ctx.beginPath(); ctx.arc(lerp(a.x, b.x, f), lerp(a.y, b.y, f), 4, 0, Math.PI * 2);
    ctx.fillStyle = VIZ_BONE; ctx.fill();

    ctx.font = "500 9.5px ui-monospace,Consolas,monospace"; ctx.fillStyle = VIZ_FAINT; ctx.textAlign = 'left';
    ctx.fillText('FORK · EXEC · PIPE · SIGNAL', 20, 20);
  }

  if (REDUCE) { signalAt = 1; signalT = 0; draw(650); return; }
  let last = 0;
  function loop(t) {
    if (!cv.isConnected) return;
    if (!last) last = t;
    const dt = t - last; last = t;
    step(t, dt); draw(t);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function initChatBroadcast() {
  const m = vizMount('viz-chat');
  if (!m) return;
  const { cv, ctx, w, h } = m;
  const cx = w / 2, cy = h / 2 + 6, R = 82;
  const CLIENTS = 5;
  const clients = Array.from({ length: CLIENTS }, (_, i) => {
    const a = -Math.PI / 2 + i * (2 * Math.PI / CLIENTS);
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  let phase = 'idle', sender = 0, t0 = 0;
  const IN_MS = 550, OUT_MS = 700, HOLD_MS = 900;

  function pickSender(t) { sender = Math.floor(Math.random() * CLIENTS); phase = 'toServer'; t0 = t; }

  function step(t) {
    if (phase === 'idle' && t - t0 > HOLD_MS) pickSender(t);
    else if (phase === 'toServer' && t - t0 > IN_MS) { phase = 'broadcast'; t0 = t; }
    else if (phase === 'broadcast' && t - t0 > OUT_MS) { phase = 'idle'; t0 = t; }
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = VIZ_RULE; ctx.lineWidth = 1.2;
    clients.forEach(c => { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(c.x, c.y); ctx.stroke(); });

    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fillStyle = VIZ_INK; ctx.strokeStyle = VIZ_SIGNAL; ctx.lineWidth = 1.6; ctx.fill(); ctx.stroke();
    ctx.font = "600 9.5px ui-monospace,Consolas,monospace"; ctx.fillStyle = VIZ_SIGNAL; ctx.textAlign = 'center';
    ctx.fillText('SERVER', cx, cy + 26);

    clients.forEach((c, i) => {
      const active = phase === 'toServer' && i === sender;
      ctx.beginPath(); ctx.arc(c.x, c.y, active ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = active ? VIZ_SIGNAL : VIZ_INK; ctx.strokeStyle = active ? VIZ_SIGNAL : VIZ_DIM; ctx.lineWidth = 1.3;
      ctx.fill(); ctx.stroke();
      ctx.font = VIZ_MONO; ctx.fillStyle = VIZ_DIM;
      ctx.fillText('C' + (i + 1), c.x, c.y + (c.y < cy ? -12 : 20));
    });

    if (phase === 'toServer') {
      const f = (t - t0) / IN_MS, s = clients[sender];
      ctx.beginPath(); ctx.arc(lerp(s.x, cx, f), lerp(s.y, cy, f), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = VIZ_BONE; ctx.fill();
    } else if (phase === 'broadcast') {
      const f = (t - t0) / OUT_MS;
      clients.forEach((c, i) => {
        if (i === sender) return;
        ctx.beginPath(); ctx.arc(lerp(cx, c.x, f), lerp(cy, c.y, f), 3.2, 0, Math.PI * 2);
        ctx.fillStyle = VIZ_BONE; ctx.globalAlpha = 1 - f * 0.3; ctx.fill(); ctx.globalAlpha = 1;
      });
    }

    ctx.font = "500 9.5px ui-monospace,Consolas,monospace"; ctx.fillStyle = VIZ_FAINT; ctx.textAlign = 'left';
    ctx.fillText('SELECT() · BROADCAST', 16, 20);
  }

  if (REDUCE) { sender = 0; phase = 'broadcast'; t0 = -350; draw(0); return; }
  let last = 0;
  function loop(t) {
    if (!cv.isConnected) return;
    if (!last) { last = t; t0 = t; }
    step(t); draw(t);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function initExoOrbits() {
  const m = vizMount('viz-exo');
  if (!m) return;
  const { cv, ctx, w, h } = m;
  const cx = w / 2, cy = h / 2 + 8, SY = 0.4;
  const radii = [26, 40, 55, 71, 88, 106, 124];
  const baseSpeed = (2 * Math.PI) / 4200;
  const colors = [VIZ_BONE, VIZ_SIGNAL, VIZ_DIM];
  const planets = radii.map((r, i) => ({
    r, size: 2 + (i % 3),
    speed: baseSpeed * Math.pow(radii[0] / r, 1.5),
    phase: Math.random() * Math.PI * 2,
    color: colors[i % colors.length],
  }));
  let elapsed = 0;

  function step(dt) { elapsed += dt; }

  function pos(p) {
    const a = p.phase + p.speed * elapsed;
    return { x: cx + p.r * Math.cos(a), y: cy + p.r * Math.sin(a) * SY, sin: Math.sin(a) };
  }

  function drawPlanet(p) {
    const q = pos(p);
    ctx.beginPath(); ctx.arc(q.x, q.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = VIZ_RULE; ctx.lineWidth = 1;
    radii.forEach(r => { ctx.beginPath(); ctx.ellipse(cx, cy, r, r * SY, 0, 0, Math.PI * 2); ctx.stroke(); });

    const withPos = planets.map(p => ({ p, q: pos(p) }));
    withPos.filter(o => o.q.sin < 0).forEach(o => drawPlanet(o.p));

    const starGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
    starGlow.addColorStop(0, VIZ_SIGNAL); starGlow.addColorStop(1, 'rgba(201,167,105,0)');
    ctx.fillStyle = starGlow; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fillStyle = VIZ_BONE; ctx.fill();

    withPos.filter(o => o.q.sin >= 0).forEach(o => drawPlanet(o.p));

    ctx.font = "500 9.5px ui-monospace,Consolas,monospace"; ctx.fillStyle = VIZ_FAINT; ctx.textAlign = 'left';
    ctx.fillText('RADIUS · PERIOD · DISCOVERY METHOD', 16, 20);
    ctx.textAlign = 'right';
    ctx.fillText('5,700 CONFIRMED', w - 16, 20);
  }

  if (REDUCE) { elapsed = 0; draw(); return; }
  let last = 0;
  function loop(t) {
    if (!cv.isConnected) return;
    if (!last) last = t;
    step(t - last); last = t; draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function initProjectVisualizations() {
  initQuantumCircuit();
  initShellFlow();
  initChatBroadcast();
  initExoOrbits();
}

/* ───────────────────────────────────────────────────────────────
   4. ROUTER — real URLs, no reload, lattice persists
   ─────────────────────────────────────────────────────────────── */
const curtain = document.getElementById('curtain');

function setNav(pathname) {
  document.querySelectorAll('.nav a').forEach(a => {
    const href = a.getAttribute('href');
    const dest = new URL(href, location.href).pathname;
    const match = dest === pathname ||
                  (dest.endsWith('/index.html') && (pathname === '/' || pathname.endsWith('/')));
    if (match) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

async function navigate(url, push = true) {
  const main = document.querySelector('main');
  if (!main) return;

  const fade = (opacity, duration) => new Promise(res => {
    if (REDUCE || !HAS_MOTION() || !curtain) return res();
    Motion.animate(curtain, { opacity }, { duration: duration / 1000, ease: [.4, 0, .2, 1] });
    // Timed independently of the animation's own completion signal, which
    // isn't guaranteed to fire promptly (e.g. a backgrounded tab) — the
    // router must never hang waiting on it.
    setTimeout(() => { curtain.style.opacity = opacity; res(); }, duration);
  });

  await fade(1, 260);

  let html;
  try {
    const res = await fetch(url, { headers: { 'X-Requested-With': 'router' } });
    if (!res.ok) throw new Error(res.status);
    html = await res.text();
  } catch (err) {
    window.location.href = url;   // fall back to a real navigation
    return;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const incoming = doc.querySelector('main');
  if (!incoming) { window.location.href = url; return; }

  main.replaceWith(incoming);
  document.title = doc.title;
  if (push) history.pushState({}, '', url);
  setNav(new URL(url, location.href).pathname);
  window.scrollTo(0, 0);
  Lattice.pulse();

  await fade(0, 380);
  enterPage(document);
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('http')) return;
  if (a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const dest = new URL(href, location.href);
  if (dest.pathname === location.pathname) return;
  navigate(dest.pathname + dest.search);
});

window.addEventListener('popstate', () => navigate(location.pathname, false));

/* boot */
document.addEventListener('DOMContentLoaded', () => {
  setNav(location.pathname);
  enterPage(document, { firstLoad: true });
});
