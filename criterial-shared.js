// Criterial Shared JS — cursor, parallax, scroll reveal, page transition

document.addEventListener('DOMContentLoaded', () => {

  // ── CURSOR ──────────────────────────────────
  const dot  = document.getElementById('cursorDot');
  const ring = document.getElementById('cursorRing');

  if (dot && ring) {
    let mx = window.innerWidth/2, my = window.innerHeight/2;
    let rx = mx, ry = my;

    document.addEventListener('mousemove', e => {
      mx = e.clientX; my = e.clientY;
      dot.style.left = mx + 'px';
      dot.style.top  = my + 'px';
    });

    (function animRing() {
      rx += (mx - rx) * 0.13;
      ry += (my - ry) * 0.13;
      ring.style.left = rx + 'px';
      ring.style.top  = ry + 'px';
      requestAnimationFrame(animRing);
    })();

    document.querySelectorAll('a, button').forEach(el => {
      el.addEventListener('mouseenter', () => ring.classList.add('hovering'));
      el.addEventListener('mouseleave', () => ring.classList.remove('hovering'));
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
    window.addEventListener('pageshow', () => {
      pt.style.transition = 'none';
      pt.style.transform  = 'translateY(-100%)';
    });

    document.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href');
      if (href && href !== '#' && !href.startsWith('mailto') && !href.startsWith('http') && !href.startsWith('https')) {
        a.addEventListener('click', e => {
          e.preventDefault();
          const dest = a.href;
          pt.style.transition = 'transform 0.45s cubic-bezier(0.77,0,0.18,1)';
          pt.style.transform  = 'translateY(0)';
          setTimeout(() => window.location.href = dest, 460);
        });
      }
    });
  }

});
