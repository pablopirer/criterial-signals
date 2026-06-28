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
