/* ═══════════════════════════════════════════════════════════════════
   ALTEC VAE — main.ts
   Compile to main.js with:  npx tsc
   ═══════════════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════
   § 1 — LOADING OVERLAY
   ═══════════════════════════════════════════════ */

const loader  = document.getElementById('loader')  as HTMLDivElement | null;
const topbar  = document.getElementById('topbar')  as HTMLElement    | null;
let   loadingDone = false;

function finishLoading(): void {
  if (loadingDone) return;
  loadingDone = true;
  setTimeout(() => {
    loader?.classList.add('fade-out');
    topbar?.classList.add('visible');
    document.body.classList.add('loaded');
    setTimeout(() => { if (loader) loader.style.display = 'none'; }, 1000);
  }, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', finishLoading);
} else {
  finishLoading();
}
window.addEventListener('load', finishLoading);
setTimeout(finishLoading, 3000);


/* ═══════════════════════════════════════════════
   § 2 — HERO IMAGE CAROUSEL (true infinite loop)
   ───────────────────────────────────────────────
   Clones last slide before position 0, clones first
   slide after the last. After landing on a clone,
   silently jumps to the real counterpart.
   ═══════════════════════════════════════════════ */

(function initHeroCarousel(): void {
  const track    = document.getElementById('carouselTrack')    as HTMLElement | null;
  const dotsCont = document.getElementById('carouselDots')     as HTMLElement | null;
  const progress = document.getElementById('carouselProgress') as HTMLElement | null;
  const prevBtn  = document.getElementById('prevBtn')          as HTMLButtonElement | null;
  const nextBtn  = document.getElementById('nextBtn')          as HTMLButtonElement | null;
  const hero     = document.getElementById('hero')             as HTMLElement | null;

  if (!track || !dotsCont || !progress) return;

  const realSlides = Array.from(track.querySelectorAll<HTMLElement>('.carousel-slide'));
  const REAL = realSlides.length;
  if (REAL === 0) return;

  /* ── Build clones: clone-of-last prepended, clone-of-first appended ──
     Layout: [clone-last | slide1 | slide2 | ... | slideN | clone-first]
     Indices:      0          1       2              REAL      REAL+1     */
  const cloneFirst = realSlides[0].cloneNode(true)        as HTMLElement;
  const cloneLast  = realSlides[REAL - 1].cloneNode(true) as HTMLElement;
  cloneFirst.setAttribute('aria-hidden', 'true');
  cloneLast.setAttribute('aria-hidden', 'true');
  track.insertBefore(cloneLast, realSlides[0]); // pos 0
  track.appendChild(cloneFirst);                // pos REAL+1

  /* Flex layout — each of the (REAL+2) slides fills 1/(REAL+2) of track */
  const TOTAL = REAL + 2;
  track.style.cssText += `display:flex;width:${TOTAL * 100}%;transition:none;`;
  Array.from(track.querySelectorAll<HTMLElement>('.carousel-slide')).forEach(s => {
    s.style.width      = `${100 / TOTAL}%`;
    s.style.flexShrink = '0';
  });

  let pos       = 1;     // start on first real slide
  let animating = false;
  let autoTimer: number | undefined;

  /* Translate track so slide at `pos` fills the viewport */
  function moveTo(idx: number, anim: boolean): void {
    track!.style.transition = anim
      ? 'transform 1.05s cubic-bezier(0.77,0,0.18,1)'
      : 'none';
    track!.style.transform = `translateX(-${idx * (100 / TOTAL)}%)`;
  }

  /* Dots — one per real slide */
  const dots = realSlides.map((_, i) => {
    const d = document.createElement('button');
    d.className = 'dot' + (i === 0 ? ' active' : '');
    d.setAttribute('aria-label', `Slide ${i + 1}`);
    d.addEventListener('click', () => goTo(i + 1));
    dotsCont!.appendChild(d);
    return d;
  });

  /* Map current pos (including clone positions) to a real 0-based index */
  function realIdx(): number {
    if (pos <= 0)      return REAL - 1;   // on clone-of-last → last real
    if (pos >= REAL + 1) return 0;        // on clone-of-first → first real
    return pos - 1;                       // normal real slide
  }

  function syncDots(): void {
    const ri = realIdx();
    dots.forEach((d, i) => d.classList.toggle('active', i === ri));
  }

  function startProgress(): void {
    progress!.classList.remove('animating');
    progress!.style.width = '0%';
    void (progress as HTMLElement).offsetWidth;
    progress!.classList.add('animating');
  }

  function goTo(idx: number): void {
    if (animating) return;
    animating = true;
    pos = idx;
    moveTo(pos, true);
    syncDots();
    clearInterval(autoTimer);
    startProgress();
    autoTimer = window.setInterval(advance, 5000);
  }

  function advance(): void { goTo(pos + 1); }

  /* ── transitionend: silent jump clone → real ──
     Guard on e.target === track so child transitions don't trigger this.
     Use double-rAF so the browser never paints the intermediate state:
       rAF1: reposition (no transition)
       rAF2: restore visibility — by now layout is settled            */
  track.addEventListener('transitionend', (e: Event) => {
    if ((e as TransitionEvent).propertyName !== 'transform') return;
    if (e.target !== track) return;

    animating = false;

    const needsJump = pos <= 0 || pos >= REAL + 1;
    if (!needsJump) return;

    /* Hide the hero section during the instant reposition */
    if (hero) hero.style.visibility = 'hidden';

    requestAnimationFrame(() => {
      /* Correct pos to the mirrored real slide */
      if (pos <= 0)        pos = REAL;     // clone-of-last → last real
      else if (pos >= REAL + 1) pos = 1;  // clone-of-first → first real

      moveTo(pos, false);
      syncDots();

      /* Reveal after the repositioned frame is painted */
      requestAnimationFrame(() => {
        if (hero) hero.style.visibility = '';
      });
    });
  });

  prevBtn?.addEventListener('click', () => goTo(pos - 1));
  nextBtn?.addEventListener('click', () => goTo(pos + 1));

  moveTo(pos, false);
  syncDots();
  window.addEventListener('load', () => {
    startProgress();
    autoTimer = window.setInterval(advance, 5000);
  });
})();


/* ═══════════════════════════════════════════════
   § 3 — SCROLL-REVEAL helpers
   ═══════════════════════════════════════════════ */

function makeRevealObserver(threshold = 0.15, delay = 0): IntersectionObserver {
  const obs = new IntersectionObserver(
    (entries: IntersectionObserverEntry[]) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          setTimeout(() => (e.target as HTMLElement).classList.add('in-view'), delay);
          obs.unobserve(e.target);
        }
      });
    },
    { threshold },
  );
  return obs;
}

const contentText  = document.getElementById('contentText')  as HTMLElement | null;
const contentImage = document.getElementById('contentImage') as HTMLElement | null;
if (contentText) {
  makeRevealObserver(0.15).observe(contentText);
  /* Observe the IMAGE itself — add in-view to it when the text becomes visible */
  if (contentImage) {
    const imgObs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          setTimeout(() => contentImage!.classList.add('in-view'), 200);
          imgObs.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    imgObs.observe(contentText);
  }
}
const contentTitle2 = document.getElementById('contentTitle2') as HTMLElement | null;
const contentText2  = document.getElementById('contentText2')  as HTMLElement | null;
const contentImage2 = document.getElementById('contentImage2') as HTMLElement | null;
if (contentTitle2 && contentText2) {
  const o = makeRevealObserver(0.15);
  o.observe(contentTitle2);
  o.observe(contentText2);
  /* Observe the IMAGE itself — add in-view to it when the text becomes visible */
  if (contentImage2) {
    const imgObs2 = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          setTimeout(() => contentImage2!.classList.add('in-view'), 200);
          imgObs2.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    imgObs2.observe(contentText2);
  }
}


/* ═══════════════════════════════════════════════
   § 4 — FLOATING IMAGE PARALLAX
   ═══════════════════════════════════════════════ */

const floatImgWrap = document.getElementById('floatImgWrap')  as HTMLElement | null;
const floatSection = document.getElementById('float-section') as HTMLElement | null;
if (floatImgWrap && floatSection) {
  const inner = floatImgWrap.querySelector<HTMLElement>('.float-img-inner');
  new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) floatImgWrap.classList.add('in-view');
  }, { threshold: 0.2 }).observe(floatImgWrap);

  let lastY = window.scrollY, pY = 0, tY = 0, raf: number | null = null;
  const S = 0.5, MAX = 60, LF = 0.08;
  function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
  function tick() {
    pY = lerp(pY, tY, LF); tY = lerp(tY, 0, 0.06);
    if (inner) inner.style.transform = `translateY(${pY.toFixed(2)}px)`;
    if (Math.abs(pY) > 0.3 || Math.abs(tY) > 0.3) { raf = requestAnimationFrame(tick); }
    else { if (inner) inner.style.transform = 'translateY(0)'; pY = 0; tY = 0; raf = null; }
  }
  window.addEventListener('scroll', () => {
    const cur = window.scrollY, delta = cur - lastY; lastY = cur;
    const r = floatSection.getBoundingClientRect();
    if (r.top >= window.innerHeight || r.bottom <= 0) return;
    tY = Math.max(-MAX, Math.min(MAX, tY + delta * S));
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: true });
}


/* ═══════════════════════════════════════════════
   § 5 — SCROLL-TO-TOP
   ═══════════════════════════════════════════════ */

const scrollBtn = document.getElementById('scrollTop') as HTMLButtonElement | null;
if (scrollBtn) {
  window.addEventListener('scroll', () => scrollBtn.classList.toggle('visible', window.scrollY > 400));
  scrollBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}


/* ═══════════════════════════════════════════════
   § 6 — SOBRE NOSOTROS animations
   ═══════════════════════════════════════════════ */
(function (): void {
  const ids    = ['snText1','snText2','snText3'];
  const imgIds = ['snImg1','snImg2','snImg3'];
  if (!ids.some(id => document.getElementById(id))) return;
  const o  = makeRevealObserver(0.12);
  const oi = makeRevealObserver(0.12, 180);
  ids.forEach(id    => { const el = document.getElementById(id); if (el) o.observe(el);  });
  imgIds.forEach(id => { const el = document.getElementById(id); if (el) oi.observe(el); });
})();


/* ═══════════════════════════════════════════════
   § 7 — CATÁLOGO animations
   ═══════════════════════════════════════════════ */
(function (): void {
  const intro = document.getElementById('introLabel');
  const cards = document.querySelectorAll<HTMLElement>('.project-card');
  if (!intro && cards.length === 0) return;
  const o = makeRevealObserver(0.12);
  if (intro) o.observe(intro);
  cards.forEach(c => o.observe(c));
})();


/* ═══════════════════════════════════════════════
   § 8 — INSCRIPCIÓN DE ENCUESTA (Resend API)
   SETUP: resend.com — free 3 000 emails/month
   Fill in RESEND_API_KEY and FROM_ADDRESS below.
   ═══════════════════════════════════════════════ */
(function initNewsletter(): void {
  const RESEND_API_KEY = 're_YOUR_API_KEY_HERE';
  const FROM_ADDRESS   = 'ALTEC VAE <noreply@altecvae.cl>';

  const emailInput = document.getElementById('newsletterEmail') as HTMLInputElement  | null;
  const submitBtn  = document.getElementById('newsletterBtn')   as HTMLButtonElement | null;
  const msgEl      = document.getElementById('newsletterMsg')   as HTMLElement       | null;
  if (!emailInput || !submitBtn || !msgEl) return;

  function buildBody(to: string): string {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0d110d;font-family:Arial,sans-serif;color:#f0f4f0;padding:40px 16px}.wrap{max-width:620px;margin:0 auto}.hdr{background:#1a1d1a;border-bottom:2px solid #62c462;padding:32px 40px;text-align:center;border-radius:3px 3px 0 0}.logo{font-size:1.9rem;letter-spacing:.18em;text-transform:uppercase;color:#62c462;display:block;margin-bottom:6px}.tag{font-size:.82rem;color:#7a9178;letter-spacing:.32em;text-transform:uppercase}.body{background:#1e221e;padding:44px 40px}.ey{font-size:.68rem;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:#62c462;margin-bottom:14px}.txt{font-size:1.15rem;line-height:1.8;color:#c8d4c8;margin-bottom:28px}.rule{width:48px;height:2px;background:linear-gradient(to right,#3a7a3a,#62c462);margin-bottom:28px}.field{margin-bottom:16px}label{display:block;font-size:.72rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#9ab49a;margin-bottom:6px}input[type=text],input[type=tel]{width:100%;padding:12px 16px;background:rgba(98,196,98,.06);border:1px solid rgba(255,255,255,.12);border-radius:2px;color:#f0f4f0;font-size:1rem;outline:none}.btn{margin-top:8px;width:100%;padding:14px;background:#3a3a3a;border:none;border-radius:2px;color:#6a6a6a;font-size:.88rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;cursor:not-allowed;transition:background .3s,color .3s}.btn.ready{background:#62c462;color:#1a1d1a;cursor:pointer}.btn.sent{background:#2a5a2a;color:#62c462}.msg{font-size:.88rem;color:#62c462;margin-top:10px;text-align:center}.msg.error{color:#e05555}.ftr{background:#141614;border-top:1px solid #2a3a2a;padding:24px 40px;text-align:center;border-radius:0 0 3px 3px}.fbrand{font-size:.95rem;letter-spacing:.14em;text-transform:uppercase;color:#62c462;margin-bottom:8px}.finfo{font-size:.78rem;color:#6a8a6a;line-height:1.7}.finfo a{color:#9ab49a;text-decoration:none}.flegal{font-size:.70rem;color:#3a5a3a;margin-top:14px}</style></head><body><div class="wrap"><div class="hdr"><span class="logo">ALTEC VAE</span><span class="tag">Diseño · Construcción · Sustentabilidad</span></div><div class="body"><p class="ey">Confirmación de Inscripción</p><p class="txt">Gracias por inscribirte, si quieres empezar con los trabajos, rellena las casillas de abajo:</p><div class="rule"></div><form id="sf" novalidate><input type="hidden" name="email" value="${to}"/><div class="field"><label>Nombre</label><input type="text" name="nombre" placeholder="Tu nombre completo"/></div><div class="field"><label>Región</label><input type="text" name="region" placeholder="Ej: Metropolitana"/></div><div class="field"><label>Comuna</label><input type="text" name="comuna" placeholder="Ej: Colina"/></div><div class="field"><label>Número de Teléfono</label><input type="tel" name="telefono" placeholder="+56 9 XXXX XXXX"/></div><button type="button" class="btn" id="sb" disabled>Enviar</button><p class="msg" id="fm"></p></form></div><div class="ftr"><p class="fbrand">ALTEC VAE</p><p class="finfo">Av. Chicureo 3150, Colina · <a href="tel:+56995336660">+56 9 9533 6660</a> · <a href="mailto:contacto@construye.cl">contacto@construye.cl</a></p><p class="flegal">© 2024 ALTEC VAE. Todos los derechos reservados.</p></div></div><script>var f=document.getElementById('sf'),b=document.getElementById('sb'),m=document.getElementById('fm'),ins=f.querySelectorAll('input[type=text],input[type=tel]');function chk(){var ok=Array.from(ins).every(function(i){return i.value.trim()!=='';});b.disabled=!ok;b.classList.toggle('ready',ok);}ins.forEach(function(i){i.addEventListener('input',chk);});b.addEventListener('click',async function(){if(b.disabled)return;var p={email:'${to}',nombre:f.querySelector('[name=nombre]').value.trim(),region:f.querySelector('[name=region]').value.trim(),comuna:f.querySelector('[name=comuna]').value.trim(),telefono:f.querySelector('[name=telefono]').value.trim()};b.disabled=true;b.classList.remove('ready');b.textContent='Enviando…';m.textContent='';m.classList.remove('error');try{var r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer ${RESEND_API_KEY}'},body:JSON.stringify({from:'${FROM_ADDRESS}',to:'contacto@construye.cl',subject:'Nueva inscripción — '+p.nombre,html:'<table><tr><td>Nombre</td><td>'+p.nombre+'</td></tr><tr><td>Correo</td><td>'+p.email+'</td></tr><tr><td>Región</td><td>'+p.region+'</td></tr><tr><td>Comuna</td><td>'+p.comuna+'</td></tr><tr><td>Teléfono</td><td>'+p.telefono+'</td></tr></table>'})});if(r.ok){b.textContent='Enviado ✓';b.classList.add('sent');m.textContent='¡Gracias! Nos pondremos en contacto pronto.';ins.forEach(function(i){i.disabled=true;i.style.opacity='.5';});}else{throw new Error('API '+r.status);}}catch(e){m.textContent='No se pudo enviar. Intenta más tarde.';m.classList.add('error');b.disabled=false;b.classList.add('ready');b.textContent='Enviar';}})<\/script></body></html>`;
  }

  async function doSubscribe(): Promise<void> {
    const email = emailInput!.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      msgEl!.textContent = 'Por favor ingresa un correo válido.';
      msgEl!.classList.add('error');
      return;
    }
    submitBtn!.disabled = true; submitBtn!.textContent = 'Enviando…';
    msgEl!.textContent = ''; msgEl!.classList.remove('error');
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({ from: FROM_ADDRESS, to: email, subject: 'ALTEC VAE — Confirmación de Inscripción', html: buildBody(email) }),
      });
      if (res.ok) { msgEl!.textContent = '¡Listo! Revisa tu correo para continuar.'; emailInput!.value = ''; submitBtn!.textContent = 'Enviado ✓'; }
      else { throw new Error(`HTTP ${res.status}`); }
    } catch (err: unknown) {
      console.error('[Resend]', err);
      msgEl!.textContent = 'No se pudo enviar. Intenta de nuevo.';
      msgEl!.classList.add('error'); submitBtn!.disabled = false; submitBtn!.textContent = 'Suscribirse';
    }
  }

  submitBtn.addEventListener('click', doSubscribe);
  emailInput.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') void doSubscribe(); });
})();


/* ═══════════════════════════════════════════════
   § 9 — SERVICES CAROUSEL (true infinite loop)
   ───────────────────────────────────────────────
   Clone technique — same as hero carousel:
   · Prepend N_CLONES clones of the last N cards
   · Append  N_CLONES clones of the first N cards
   · render() centres pos over the stage midpoint:
       offsetX = stageW/2 - cardW/2 - pos*step
   · transitionend silently jumps clone→real so
     looping is seamless with no backtrack.
   ═══════════════════════════════════════════════ */

(function initServicesCarousels(): void {
  const N_CLONES = 2;

  function initCarousel(section: HTMLElement): void {
    const stage   = section.querySelector<HTMLElement>('.svc-stage');
    const track   = section.querySelector<HTMLElement>('.svc-track');
    const dotsWrap = section.querySelector<HTMLElement>('.svc-dots');
    const prevBtn = section.querySelector<HTMLButtonElement>('.svc-nav-btn.svc-prev');
    const nextBtn = section.querySelector<HTMLButtonElement>('.svc-nav-btn.svc-next');
    if (!stage || !track || !dotsWrap) return;

    const realCards = Array.from(track.querySelectorAll<HTMLElement>('.svc-card'));
    const REAL = realCards.length;
    if (REAL === 0) return;

    /* ── Prepend clones of last N_CLONES real cards ── */
    for (let i = N_CLONES - 1; i >= 0; i--) {
      const hc = realCards[REAL - 1 - (i % REAL)].cloneNode(true) as HTMLElement;
      hc.setAttribute('aria-hidden', 'true');
      hc.classList.add('svc-clone');
      track.insertBefore(hc, track.firstChild);
    }
    /* ── Append clones of first N_CLONES real cards ── */
    for (let i = 0; i < N_CLONES; i++) {
      const tc = realCards[i % REAL].cloneNode(true) as HTMLElement;
      tc.setAttribute('aria-hidden', 'true');
      tc.classList.add('svc-clone');
      track.appendChild(tc);
    }

    const all = Array.from(track.querySelectorAll<HTMLElement>('.svc-card'));
    let   pos = N_CLONES; // index of first real card in all[]
    let   busy = false;

    /* ── Dots (real cards only) ── */
    const dots = realCards.map((_, i) => {
      const d = document.createElement('button');
      d.className = 'svc-dot' + (i === 0 ? ' active' : '');
      d.setAttribute('aria-label', `Servicio ${i + 1}`);
      d.addEventListener('click', () => goTo(i + N_CLONES));
      dotsWrap.appendChild(d);
      return d;
    });

    /* ── render(): place the card at `pos` in the exact horizontal
       centre of the stage viewport.
       stageW/2          → pixel position of stage centre
       - cardW/2         → align card[0]'s centre to that point
       - pos * step      → scroll to the desired card index        ── */
    function render(animate: boolean): void {
      const stageW = stage!.offsetWidth;
      const cardW  = all[0].offsetWidth;
      const gap    = parseInt(window.getComputedStyle(track!).gap, 10) || 24;
      const step   = cardW + gap;
      const offsetX = stageW / 2 - cardW / 2 - pos * step;

      track!.style.transition = animate
        ? 'transform 0.9s cubic-bezier(0.77,0,0.18,1)'
        : 'none';
      track!.style.transform = `translateX(${offsetX}px)`;

      /* Visual states */
      all.forEach((card, i) => {
        const dist = Math.abs(i - pos);
        card.classList.remove('is-active', 'is-side', 'is-far');
        if      (dist === 0) card.classList.add('is-active');
        else if (dist === 1) card.classList.add('is-side');
        else                 card.classList.add('is-far');
      });

      /* Active dot — map pos back to real index */
      const ri = ((pos - N_CLONES) % REAL + REAL) % REAL;
      dots.forEach((d, i) => d.classList.toggle('active', i === ri));
    }

    /* ── After transition: silent jump from clone to real ──
       Guard: only fire on the track's own transform transition,
       not on child element transitions (opacity, filter, etc.).
       Double-rAF ensures the browser never paints the intermediate
       clone position — visibility is hidden for < 1 frame.         ── */
    track.addEventListener('transitionend', (e: Event) => {
      if ((e as TransitionEvent).propertyName !== 'transform') return;
      if (e.target !== track) return;

      busy = false;

      const needsJump = pos < N_CLONES || pos >= N_CLONES + REAL;
      if (!needsJump) return;

      stage!.style.visibility = 'hidden';

      requestAnimationFrame(() => {
        if (pos < N_CLONES)              pos += REAL;
        else if (pos >= N_CLONES + REAL) pos -= REAL;

        render(false);

        requestAnimationFrame(() => {
          stage!.style.visibility = '';
        });
      });
    });

    function goTo(idx: number): void {
      if (busy) return;
      busy = true;
      pos  = idx;
      render(true);
    }

    prevBtn?.addEventListener('click', () => goTo(pos - 1));
    nextBtn?.addEventListener('click', () => goTo(pos + 1));

    /* Click a side card to jump to it */
    all.forEach((card, i) => {
      card.addEventListener('click', () => {
        if (i !== pos && !busy) goTo(i);
      });
    });

    /* Touch / swipe */
    let touchX = 0;
    stage.addEventListener('touchstart', (e: TouchEvent) => {
      touchX = e.touches[0].clientX;
    }, { passive: true });
    stage.addEventListener('touchend', (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 40) goTo(pos + (dx < 0 ? 1 : -1));
    }, { passive: true });

    /* Recompute on window resize so stageW stays accurate */
    window.addEventListener('resize', () => render(false));

    /* First paint — wait one frame so layout is complete */
    requestAnimationFrame(() => render(false));
  }

  document.querySelectorAll<HTMLElement>('.svc-carousel-section').forEach(initCarousel);
})();