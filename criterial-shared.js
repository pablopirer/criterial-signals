// Criterial Shared JS — cursor, parallax, scroll reveal, page transition

document.addEventListener('DOMContentLoaded', () => {

  // ── CURSOR ──────────────────────────────────
  const dot  = document.getElementById('cursorDot');
  const ring = document.getElementById('cursorRing');
  if (dot && ring) {
    let mx, my, rx, ry;
    let cursorActive = false;

    document.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      if (!cursorActive) {
        cursorActive = true;
        dot.style.display  = 'block';
        ring.style.display = 'block';
        mx = rx = e.clientX;
        my = ry = e.clientY;
        dot.style.left  = mx + 'px';
        dot.style.top   = my + 'px';
        ring.style.left = rx + 'px';
        ring.style.top  = ry + 'px';
        (function animRing() {
          rx += (mx - rx) * 0.13;
          ry += (my - ry) * 0.13;
          ring.style.left = rx + 'px';
          ring.style.top  = ry + 'px';
          requestAnimationFrame(animRing);
        })();
      }
      mx = e.clientX; my = e.clientY;
      dot.style.left = mx + 'px';
      dot.style.top  = my + 'px';
      ring.classList.toggle('hovering', !!e.target.closest('a, button'));
    });
  }

  // ── HEADER SCROLL ───────────────────────────
  const header = document.getElementById('siteHeader');
  if (header && !header.classList.contains('light-header')) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 56);
    }, { passive: true });
  }

  // ── PARALLAX ────────────────────────────────
  const heroImg   = document.getElementById('heroImg');
  const imageImgs = document.querySelectorAll('.image-section-img');

  if (heroImg || imageImgs.length) {
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      if (heroImg) heroImg.style.transform = `translateY(${y * 0.35}px)`;
      imageImgs.forEach(img => {
        const rect = img.closest('.image-section').getBoundingClientRect();
        img.style.transform = `translateY(${-rect.top * 0.22}px)`;
      });
    }, { passive: true });
  }

  // ── SCROLL REVEAL ────────────────────────────
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.1 });
    reveals.forEach(r => io.observe(r));
  }

  // ── PAGE TRANSITION ──────────────────────────
  const pt = document.getElementById('pageTransition');
  if (pt) {
    pt.style.opacity = '0';
    pt.style.transform = 'none';
    window.addEventListener('pageshow', () => {
      pt.style.transition = 'none';
      pt.style.opacity = '0';
    });
    document.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href');
      if (href && href !== '#' && !href.startsWith('mailto') && !href.startsWith('http') && !href.startsWith('https')) {
        a.addEventListener('click', e => {
          e.preventDefault();
          const dest = a.href;
          pt.style.transition = 'opacity 0.28s ease';
          pt.style.opacity = '1';
          setTimeout(() => window.location.href = dest, 290);
        });
      }
    });
  }

  // ── MOBILE NAV (hamburger) ───────────────────
  const navHeader = document.getElementById('siteHeader');
  const navMenu = navHeader ? navHeader.querySelector('.nav') : null;
  if (navHeader && navMenu && !navHeader.querySelector('.nav-toggle')) {
    const toggle = document.createElement('button');
    toggle.className = 'nav-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Abrir menú');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span></span><span></span><span></span>';
    navHeader.appendChild(toggle);
    const setNav = (open) => {
      navHeader.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      document.body.style.overflow = open ? 'hidden' : '';
    };
    toggle.addEventListener('click', () => setNav(!navHeader.classList.contains('nav-open')));
    navMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setNav(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNav(false); });
  }

});

// ── PUBLICATION INTERACTIVE WIDGETS ──────────────────────────────
// window.hydratePubWidgets(root): finds <div class="pub-map" data-mapa="<base64>">
// placeholders inside a just-rendered publication body and turns each into an
// interactive positioning map. The data rides inside the stored HTML as base64
// (see generate-content), so the map works wherever body_markdown is rendered
// (archive reader, admin preview) without any extra DB plumbing. Defensive: any
// malformed map hides its own section and never breaks the publication.
(function () {
  function fromB64Utf8(b64) {
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch (e) { return null; }
  }

  const MOMENTUM = {
    creciente:   { label: "Creciente",   bg: "#e1efe9", color: "#1d7a5f" },
    estable:     { label: "Estable",     bg: "#efedea", color: "#9a958a" },
    enfriandose: { label: "Enfriándose", bg: "#f3e7e1", color: "#b06a4e" }
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function clamp(v, lo, hi) { v = Number(v); if (!isFinite(v)) return lo; return Math.max(lo, Math.min(hi, v)); }
  // Split a sector label into at most two balanced lines. The break is chosen to
  // minimise the longer line (the old [firstWord, rest] split produced badly
  // lopsided pairs), and a separator is kept on the first line so a line never
  // opens with a stray "/".
  function labelLines(label) {
    const txt = String(label || "").trim();
    if (!txt) return [""];
    if (txt.length <= 13) return [txt];
    const words = txt.split(/\s+/).filter(Boolean);
    if (words.length <= 1) return [txt];
    let best = 1, bestScore = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
      const score = Math.max(a.length, b.length) + (b[0] === "/" ? 2 : 0);
      if (score <= bestScore) { bestScore = score; best = i; }
    }
    let a = words.slice(0, best).join(" "), b = words.slice(best).join(" ");
    if (b[0] === "/") { a += " /"; b = b.slice(1).trim(); }
    return b ? [a, b] : [a];
  }

  function buildMap(container, mapa) {
    if (!mapa || !Array.isArray(mapa.nodos)) return false;
    const nodos = mapa.nodos.filter(n =>
      n && n.id != null && isFinite(Number(n.x)) && isFinite(Number(n.y)));
    if (nodos.length < 3) return false;

    const mobile = !!(window.matchMedia && window.matchMedia("(max-width: 600px)").matches);
    const W = mobile ? 430 : 640, H = mobile ? 480 : 400;
    // Plot frame. Quadrant labels live OUTSIDE this frame (top/bottom gutters) and
    // every bubble's CENTRE is clamped so the whole circle stays INSIDE the frame,
    // so a corner label and a bubble can never collide.
    const padL = mobile ? 46 : 72, padR = 24, padTop = 24, padBottom = 52;
    const left = padL, right = W - padR, top = padTop, bottom = H - padBottom;
    const midX = (left + right) / 2, midY = (top + bottom) / 2;
    const px = (x) => left + clamp(x, 0, 1) * (right - left);
    const py = (y) => bottom - clamp(y, 0, 1) * (bottom - top);
    const fit = (v, r, lo, hi) => Math.max(lo + r, Math.min(hi - r, v));
    const ejeX = esc(mapa.eje_x || "Actividad");
    const ejeY = esc(mapa.eje_y || "Valoración");
    const topLabelY = top - 10, bottomLabelY = bottom + 18;

    nodos.forEach(n => {
      n._r = (mobile ? 12 : 14) + clamp(n.size, 1, 3) * (mobile ? 5 : 6);
    });

    // De-overlap: push apart only the bubbles whose circles collide, with a weak
    // pull back toward each bubble's true (data) position so displacement stays
    // small and the map keeps its analytical honesty. Applied independently to the
    // current and trajectory position sets, both clamped inside the frame.
    const relax = (pts) => {
      for (let iter = 0; iter < 80; iter++) {
        let moved = false;
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            const a = pts[i], b = pts[j];
            let dx = b.x - a.x, dy = b.y - a.y;
            let d = Math.hypot(dx, dy);
            if (d === 0) { dx = 1; dy = 0; d = 1; }
            const min = a.r + b.r + 3;
            if (d < min) {
              const push = (min - d) / 2;
              a.x -= (dx / d) * push; a.y -= (dy / d) * push;
              b.x += (dx / d) * push; b.y += (dy / d) * push;
              moved = true;
            }
          }
        }
        for (const p of pts) {
          p.x += (p.ax - p.x) * 0.03;
          p.y += (p.ay - p.y) * 0.03;
          p.x = Math.max(left + p.r, Math.min(right - p.r, p.x));
          p.y = Math.max(top + p.r, Math.min(bottom - p.r, p.y));
        }
        if (!moved) break;
      }
      return pts;
    };

    // The "other" position set: for the Monthly tracker it's LAST MONTH (xprev/yprev);
    // for the Weekly it's the expected TRAJECTORY (x2/y2). Tracker mode is detected by
    // the presence of xprev/yprev on any node and only changes the toggle labels.
    const isTracker = nodos.some(n => isFinite(Number(n.xprev)) || isFinite(Number(n.yprev)));
    const otherX = (n) => isFinite(Number(n.xprev)) ? n.xprev : (isFinite(Number(n.x2)) ? n.x2 : n.x);
    const otherY = (n) => isFinite(Number(n.yprev)) ? n.yprev : (isFinite(Number(n.y2)) ? n.y2 : n.y);

    const cur = relax(nodos.map(n => {
      const x = fit(px(n.x), n._r, left, right), y = fit(py(n.y), n._r, top, bottom);
      return { x, y, ax: x, ay: y, r: n._r };
    }));
    const tra = relax(nodos.map(n => {
      const x = fit(px(otherX(n)), n._r, left, right);
      const y = fit(py(otherY(n)), n._r, top, bottom);
      return { x, y, ax: x, ay: y, r: n._r };
    }));
    nodos.forEach((n, i) => {
      n._x = cur[i].x; n._y = cur[i].y;
      n._x2 = tra[i].x; n._y2 = tra[i].y;
    });
    const hasTrajectory = nodos.some(n =>
      Number(otherX(n)) !== Number(n.x) || Number(otherY(n)) !== Number(n.y));

    // The label sits OUTSIDE the circle: a multi-word sector name never fits
    // inside a 40-64px bubble, and drawing it at the centre is what made the text
    // spill past the edge. Placing it always below is not enough either — in a
    // cluster the label lands on a neighbouring bubble. So try below → above →
    // right → left and keep the first side that is clear of every other bubble,
    // of the labels already placed and of the frame; if every side collides, keep
    // the one that overlaps least. Widths are measured with the real font, so the
    // decision is made before the SVG is built (no second layout pass).
    const LH = 11, GAP = 11, PAD = 4;
    const measure = (() => {
      let ctx = null;
      try {
        ctx = document.createElement("canvas").getContext("2d");
        ctx.font = "500 10.5px Inter, Helvetica, Arial, sans-serif";
      } catch (e) { ctx = null; }
      return (s) => ctx ? ctx.measureText(String(s)).width : String(s).length * 5.8;
    })();
    const overlap = (a, b) =>
      Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
      Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

    nodos.forEach(n => {
      n._lines = labelLines(n.label);
      n._lw = Math.max.apply(null, n._lines.map(measure));
      n._lh = (n._lines.length - 1) * LH;
    });
    // Choose each label's side for a GIVEN layout (the "Ahora" positions or the
    // "Hace un mes" ones). The best side depends on where every bubble sits, so a
    // side that is clear in one layout can be covered by a moved bubble in the
    // other. We therefore solve the placement once PER layout (getX/getY select
    // it) and the toggle swaps the offsets along with the transform, so labels
    // never end up under a bubble after the tracker moves.
    const placeLabels = (getX, getY) => {
      const cboxes = nodos.map(n => ({ x0: getX(n) - n._r, x1: getX(n) + n._r, y0: getY(n) - n._r, y1: getY(n) + n._r }));
      const placed = [];
      return nodos.map((n, idx) => {
        const x = getX(n), y = getY(n), w = n._lw, bh = n._lh, r = n._r;
        const cands = [
          { anchor: "middle", tx: 0,          ty: r + GAP,               x0: -w / 2,          x1: w / 2,          y0: r + GAP - 9,             y1: r + GAP + bh + 3 },
          { anchor: "middle", tx: 0,          ty: -(r + GAP - 2 + bh),   x0: -w / 2,          x1: w / 2,          y0: -(r + GAP + bh + 7),     y1: -(r + GAP - 5) },
          { anchor: "start",  tx: r + 6,      ty: -bh / 2 + 3.5,         x0: r + 6,           x1: r + 6 + w,      y0: -bh / 2 - 6,             y1: bh / 2 + 6 },
          { anchor: "end",    tx: -(r + 6),   ty: -bh / 2 + 3.5,         x0: -(r + 6) - w,    x1: -(r + 6),       y0: -bh / 2 - 6,             y1: bh / 2 + 6 }
        ];
        let best = cands[0], bestCost = Infinity;
        for (const c of cands) {
          // Test with a clearance margin: the rendered glyphs carry a 3px white
          // halo, and a label that merely grazes a neighbouring bubble still reads
          // as cramped. PAD buys breathing room on top of the raw text metrics.
          const box = { x0: x + c.x0 - PAD, x1: x + c.x1 + PAD, y0: y + c.y0 - PAD, y1: y + c.y1 + PAD };
          let cost = 0;
          for (let j = 0; j < cboxes.length; j++) if (j !== idx) cost += overlap(box, cboxes[j]);
          for (const p of placed) cost += overlap(box, p);
          cost += (Math.max(0, left - box.x0) + Math.max(0, box.x1 - right) +
                   Math.max(0, top - box.y0) + Math.max(0, box.y1 - bottom)) * 40;
          if (cost < bestCost) { bestCost = cost; best = c; }
          if (cost === 0) break;
        }
        placed.push({ x0: x + best.x0, x1: x + best.x1, y0: y + best.y0, y1: y + best.y1 });
        return best;
      });
    };
    const lpCur  = placeLabels(n => n._x,  n => n._y);
    const lpPrev = placeLabels(n => n._x2, n => n._y2);
    nodos.forEach((n, i) => { n._lp = lpCur[i]; n._lpPrev = lpPrev[i]; });

    const bubbleSvg = (n) => {
      const m = MOMENTUM[n.momentum] || MOMENTUM.estable;
      const p = n._lp;
      const text = n._lines.map((ln, i) =>
        `<text class="pub-map-bl" x="${p.tx}" y="${p.ty + i * LH}" text-anchor="${p.anchor}">${esc(ln)}</text>`).join("");
      const al = esc((n.label || "sector") + " — " + m.label);
      return `<g class="pub-map-bub" data-k="${esc(n.id)}" data-rx="${n._x}" data-ry="${n._y}" data-ex="${n._x2}" data-ey="${n._y2}" transform="translate(${n._x},${n._y})" tabindex="0" role="button" aria-label="${al}"><circle r="${n._r}" fill="${m.bg}" stroke="${m.color}" stroke-width="1.75"></circle>${text}</g>`;
    };
    const bubbles = nodos.map(bubbleSvg).join("");

    const q = (mapa.cuadrantes && typeof mapa.cuadrantes === "object") ? mapa.cuadrantes : {};
    const corner = (txt, x, y, anchor) =>
      txt ? `<text class="pub-map-corner" x="${x}" y="${y}" text-anchor="${anchor}">${esc(txt)}</text>` : "";
    const corners =
      corner(q.tl, left, topLabelY, "start") +
      corner(q.tr, right, topLabelY, "end") +
      corner(q.bl, left, bottomLabelY, "start") +
      corner(q.br, right, bottomLabelY, "end");

    const svg =
      `<svg viewBox="0 0 ${W} ${H}" width="100%" role="group" aria-label="Mapa de posicionamiento de sectores por ${ejeX.toLowerCase()} y ${ejeY.toLowerCase()}">` +
      `<desc>Sectores situados por ${ejeX.toLowerCase()} y ${ejeY.toLowerCase()}; tamaño por volumen, color por momentum.</desc>` +
      `<rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="#fff" stroke="#E2DED8"></rect>` +
      `<line x1="${midX}" y1="${top}" x2="${midX}" y2="${bottom}" stroke="#ECE7DE" stroke-dasharray="4 4"></line>` +
      `<line x1="${left}" y1="${midY}" x2="${right}" y2="${midY}" stroke="#ECE7DE" stroke-dasharray="4 4"></line>` +
      corners +
      `<text class="pub-map-axb" x="${midX}" y="${H - 10}" text-anchor="middle">${ejeX} →</text>` +
      `<text class="pub-map-axb" x="14" y="${midY}" text-anchor="middle" transform="rotate(-90 14 ${midY})">${ejeY} →</text>` +
      bubbles + `</svg>`;

    const otherLabel = isTracker ? "Hace un mes" : "Trayectoria";
    const nowLabel = isTracker ? "Ahora" : "Posición actual";
    const toggleHtml = hasTrajectory
      ? `<div class="pub-map-toggle"><button class="pub-map-tg on" data-mode="r" type="button">${nowLabel}</button><button class="pub-map-tg" data-mode="e" type="button">${otherLabel}</button></div>`
      : "";

    container.innerHTML =
      `<div class="pub-map-bar">` +
        `<div class="pub-map-legend">` +
          `<span><span class="pub-map-sw" style="background:#1d7a5f"></span>Creciente</span>` +
          `<span><span class="pub-map-sw" style="background:#9a958a"></span>Estable</span>` +
          `<span><span class="pub-map-sw" style="background:#b06a4e"></span>Enfriándose</span>` +
          `<span style="color:#a59f93">· tamaño = volumen</span>` +
        `</div>` + toggleHtml +
      `</div>` +
      svg +
      `<div class="pub-map-detail">` +
        `<div class="pub-map-detail-h"><p class="pub-map-detail-t"></p><span class="pub-map-detail-m"></span></div>` +
        `<p class="pub-map-detail-b"></p><div class="pub-map-detail-c"></div>` +
        `<p class="pub-map-src"></p>` +
      `</div>` +
      `<p class="pub-map-note">Pasa el cursor o toca un sector` + (hasTrajectory ? " · alterna la trayectoria prevista" : "") + `</p>`;

    const byId = {};
    nodos.forEach(n => { byId[n.id] = n; });
    const detT = container.querySelector(".pub-map-detail-t");
    const detM = container.querySelector(".pub-map-detail-m");
    const detB = container.querySelector(".pub-map-detail-b");
    const detC = container.querySelector(".pub-map-detail-c");
    const detS = container.querySelector(".pub-map-src");
    function showDetail(id) {
      const n = byId[id];
      if (!n) return;
      const mom = MOMENTUM[n.momentum] || MOMENTUM.estable;
      detT.textContent = n.label || "";
      detM.textContent = mom.label;
      detM.style.color = mom.color;
      detB.textContent = n.cuerpo || "";
      const chips = Array.isArray(n.chips) ? n.chips.slice(0, 4) : [];
      // Join on whitespace, not "". The chips are separated visually by their
      // own margin, but with no text node between the spans the panel's
      // textContent ran them together ("Fondo Meridiano IIICerámicas Duero"):
      // that is what a screen reader announces and what a copy-paste yields.
      detC.innerHTML = chips.map(c => `<span class="pub-map-chip">${esc(c)}</span>`).join(" ");
      detS.textContent = n.fuente ? "Fuente: " + n.fuente : "";
    }
    container.querySelectorAll(".pub-map-bub").forEach(g => {
      const id = g.getAttribute("data-k");
      g.addEventListener("mouseenter", () => showDetail(id));
      g.addEventListener("click", () => showDetail(id));
      g.addEventListener("focus", () => showDetail(id));
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showDetail(id); }
      });
    });
    const bubs = container.querySelectorAll(".pub-map-bub");
    const btns = container.querySelectorAll(".pub-map-tg");
    btns.forEach(b => b.addEventListener("click", () => {
      const mode = b.getAttribute("data-mode");
      bubs.forEach(g => {
        const x = g.getAttribute(mode === "r" ? "data-rx" : "data-ex");
        const y = g.getAttribute(mode === "r" ? "data-ry" : "data-ey");
        g.setAttribute("transform", `translate(${x},${y})`);
        // Re-place the label for the target layout so it doesn't end up under a
        // bubble that moved (the placement is layout-specific — see placeLabels).
        const n = byId[g.getAttribute("data-k")];
        const lp = n && (mode === "r" ? n._lp : n._lpPrev);
        if (lp) g.querySelectorAll(".pub-map-bl").forEach((t, i) => {
          t.setAttribute("x", lp.tx);
          t.setAttribute("y", lp.ty + i * LH);
          t.setAttribute("text-anchor", lp.anchor);
        });
      });
      btns.forEach(x => x.classList.toggle("on", x === b));
    }));

    const def = nodos.find(n => n.momentum === "creciente") || nodos[0];
    showDetail(def.id);
    return true;
  }

  // "El mes en cifras" (Monthly Brief): horizontal bars scaled to the largest
  // figure. Each metric is focusable and exposes its source. Defensive: fewer
  // than 2 valid figures → caller hides the section. Same base64 + hydration
  // plumbing as buildMap, so it renders wherever a publication body is injected.
  function buildMetrics(container, cifras) {
    if (!Array.isArray(cifras)) return false;
    const items = cifras.filter(c => c && c.label != null && isFinite(Number(c.n)));
    if (items.length < 2) return false;
    const max = Math.max.apply(null, items.map(c => Math.abs(Number(c.n)))) || 1;
    const rows = items.map(c => {
      const pct = Math.max(4, Math.round(Math.abs(Number(c.n)) / max * 100));
      const val = esc(c.valor != null ? c.valor : c.n);
      const src = c.fuente ? `<span class="pub-metric-src">${esc(c.fuente)}</span>` : "";
      const al = `${esc(c.label)}: ${val}${c.fuente ? ` (${esc(c.fuente)})` : ""}`;
      return `<div class="pub-metric" tabindex="0" role="group" aria-label="${al}">` +
        `<div class="pub-metric-top"><span class="pub-metric-label">${esc(c.label)}</span>` +
        `<span class="pub-metric-val">${val}</span></div>` +
        `<div class="pub-metric-track"><div class="pub-metric-fill" style="width:${pct}%"></div></div>` +
        src +
      `</div>`;
    }).join("");
    container.innerHTML = `<div class="pub-metrics-inner">${rows}</div>`;
    return true;
  }

  window.hydratePubWidgets = function (root) {
    if (!root || !root.querySelectorAll) return;
    const hideSectionOf = (el) => {
      const sec = el.closest(".pub-section-new") || el;
      sec.style.display = "none";
    };
    root.querySelectorAll(".pub-map[data-mapa]").forEach(el => {
      if (el.dataset.hydrated) return;
      const json = fromB64Utf8(el.getAttribute("data-mapa"));
      if (!json) { hideSectionOf(el); return; }
      let mapa;
      try { mapa = JSON.parse(json); } catch (e) { hideSectionOf(el); return; }
      try {
        if (buildMap(el, mapa)) { el.dataset.hydrated = "1"; }
        else { hideSectionOf(el); }
      } catch (e) { hideSectionOf(el); }
    });
    root.querySelectorAll(".pub-metrics[data-metrics]").forEach(el => {
      if (el.dataset.hydrated) return;
      const json = fromB64Utf8(el.getAttribute("data-metrics"));
      if (!json) { hideSectionOf(el); return; }
      let cifras;
      try { cifras = JSON.parse(json); } catch (e) { hideSectionOf(el); return; }
      try {
        if (buildMetrics(el, cifras)) { el.dataset.hydrated = "1"; }
        else { hideSectionOf(el); }
      } catch (e) { hideSectionOf(el); }
    });
  };
})();
