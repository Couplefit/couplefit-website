(function(){
  const header = document.querySelector('.site-header, header');
  const setHeaderVar = () => {
    const h = header ? header.offsetHeight : 120;
    document.documentElement.style.setProperty('--header-h', h + 'px');
  };
  window.addEventListener('load', setHeaderVar, { passive: true });
  window.addEventListener('resize', setHeaderVar, { passive: true });
  if (header && 'ResizeObserver' in window) {
    new ResizeObserver(setHeaderVar).observe(header);
  }
  setHeaderVar();
})();

// === Clean working FAQ ===
(function(){
  const cards = document.querySelectorAll(".faq-card");
  if (!cards.length) return;

  function closeAll(except) {
    cards.forEach((card) => {
      if (card !== except) {
        card.classList.remove("open");
        const a = card.querySelector(".faq-answer");
        if (a) a.style.maxHeight = null;
      }
    });
  }

  cards.forEach((card) => {
    const btn = card.querySelector(".faq-question");
    const ans = card.querySelector(".faq-answer");
    if (!btn || !ans) return;

    btn.addEventListener("click", () => {
      const isOpen = card.classList.contains("open");

      document.querySelectorAll(".faq-card.open").forEach((c) => {
        if (c !== card) {
          c.classList.remove("open");
          c.querySelector(".faq-answer").style.maxHeight = null;
        }
      });

      if (!isOpen) {
        card.classList.add("open");
        ans.style.maxHeight = ans.scrollHeight + "px";
      } else {
        card.classList.remove("open");
        ans.style.maxHeight = null;
      }
    });
  });
})();

/* ===== MOBIEL: Features vloeiende kleurovergang en diepte tijdens vegen ===== */
(function () {
  console.log('CoupleFit: features-effect v3 geladen');

  const colors = [
    [230, 236, 242], // Built for Two: zacht blauw
    [234, 221, 224], // Train Together: zachte burgundy-tint
    [220, 227, 235], // Eat Better Together: powder blue licht
    [234, 221, 224]  // Grow Together: zachte burgundy-tint
  ];
  const mobile = window.matchMedia('(max-width: 768px)');
  let ticking = false;
  let prepared = false;

  function prepare(track, card) {
    if (prepared) return;
    prepared = true;
    track.style.scrollBehavior = 'smooth';
    card.style.transition = 'background-color 0.35s ease';
    track.querySelectorAll('.feature-copy, .feature-visual').forEach(el => {
      el.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';
      el.style.willChange = 'transform, opacity';
    });
  }

  function update() {
    ticking = false;
    const track = document.querySelector('#features .cf-features-track');
    const card = document.getElementById('features');
    if (!track || !card) return;
    const rows = Array.from(track.querySelectorAll('.feature-row'));

    if (!mobile.matches) {
      card.style.removeProperty('background-color');
      rows.forEach(row => {
        row.querySelectorAll('.feature-copy, .feature-visual').forEach(el => {
          el.style.removeProperty('transform');
          el.style.removeProperty('opacity');
        });
      });
      return;
    }

    prepare(track, card);

    const progress = track.scrollLeft / (track.clientWidth || 1);
    const i = Math.max(0, Math.min(colors.length - 1, Math.floor(progress)));
    const j = Math.min(colors.length - 1, i + 1);
    const t = Math.min(1, Math.max(0, progress - i));
    const mix = colors[i].map((v, k) => Math.round(v + (colors[j][k] - v) * t));
    card.style.setProperty('background', 'none', 'important');
    card.style.setProperty('background-color', 'rgb(' + mix.join(',') + ')', 'important');

    rows.forEach((row, k) => {
      const d = Math.max(-1, Math.min(1, progress - k));
      const a = Math.abs(d);
      const copy = row.querySelector('.feature-copy');
      const visual = row.querySelector('.feature-visual');

      if (copy) {
        copy.style.setProperty('transform', 'translateX(' + (d * 60) + 'px)', 'important');
        copy.style.setProperty('opacity', String(1 - 0.85 * a), 'important');
      }
      if (visual) {
        visual.style.setProperty(
          'transform',
          'perspective(900px) translateX(' + (d * 90) + 'px) rotateY(' + (d * -18) + 'deg) scale(' + (1 - 0.14 * a) + ')',
          'important'
        );
        visual.style.setProperty('opacity', String(1 - 0.45 * a), 'important');
      }
    });
  }

  document.addEventListener('scroll', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('cf-features-track') && !ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, true);

  window.addEventListener('resize', update);
  window.addEventListener('load', update);
  setTimeout(update, 800);
})();

// Prijskaarten op mobiel: openen op Premium (de middelste kaart)
window.addEventListener('load', function () {
  if (!window.matchMedia('(max-width: 520px)').matches) return;
  var rij = document.querySelector('#cf-pricing .cf-plans');
  var premium = document.querySelector('#cf-pricing .cf-plan--pop');
  if (!rij || !premium) return;
  rij.scrollLeft += premium.getBoundingClientRect().left - rij.getBoundingClientRect().left;
});