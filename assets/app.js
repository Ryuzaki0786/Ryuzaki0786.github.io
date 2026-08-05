/* ═══════════════════════════════════════════════════════════════
   Ekam Bhullar — portfolio runtime

   1. lattice   : a 2D wave equation solved live on a perspective
                  mesh. Leapfrog finite differences, Dirichlet edges.
   2. router    : real URLs, no reload, lattice survives navigation.
   3. motion    : Motion (motion.dev) choreography, reduced-motion aware.
   ═══════════════════════════════════════════════════════════════ */

const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const HAS_MOTION = () => typeof window.Motion === 'object';
const EASE = [.22, 1, .36, 1];

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
        ctx.fillStyle = curr[k] > 0 ? '#e9e7e2' : '#b7a98b';
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
    grad.addColorStop(0,   'rgba(233,231,226,0.028)');  // far — near horizon
    grad.addColorStop(0.55,'rgba(233,231,226,0.062)');
    grad.addColorStop(1,   'rgba(233,231,226,0.105)');  // near
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
}

/* ───────────────────────────────────────────────────────────────
   3. ROUTER — real URLs, no reload, lattice persists
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
