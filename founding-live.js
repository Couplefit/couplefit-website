/* CoupleFit: live founding-teller.
   Haalt de stand op via /api/founding ({ issued, left, closed }) en ververst elke 60 seconden.
   Bij closed: de site schakelt om naar "alle plekken vergeven" en toont gewone prijzen.
   Lokaal testen (alleen op localhost): ?founding=137 of ?founding=closed */
(function () {
  var TOTAL = 500, MIN = 25;
  var box = document.getElementById('cf-spots');
  var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var mock = isLocal ? new URLSearchParams(location.search).get('founding') : null;
  var lastClosed = null, animated = false;

  function setText(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }

  function showCount(issued) {
    if (!box) return;
    var fill = document.getElementById('cf-spots-fill');
    if (issued >= MIN) {
      setText('cf-spots-label', issued + ' couples have joined');
      setText('cf-spots-left', Math.max(TOTAL - issued, 0) + ' of ' + TOTAL + ' spots left');
      box.classList.add('has-count');
    }
    var pct = issued >= MIN ? Math.min(issued / TOTAL * 100, 100) : 0;
    if (!fill) return;
    if (animated) { fill.style.width = pct + '%'; return; }
    var io = new IntersectionObserver(function (e) {
      if (e[0].isIntersecting) { fill.style.width = pct + '%'; animated = true; io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(box);
  }

  function showClosed() {
    document.documentElement.classList.add('cf-founding-closed');
    window.cfFoundingClosed = true;
    var t = document.getElementById('cf-founding-text');
    if (t) t.innerHTML = '<strong>All 500 Founding spots are taken.</strong> Thank you! Join the waitlist and we’ll let you know when CoupleFit launches.';
    setText('cf-join-head', 'Join the waitlist');
    setText('cf-signup-lead', 'All 500 Founding spots are taken. Join the waitlist and be the first to hear when CoupleFit launches.');
    setText('cf-signup-btn-text', 'Join the waitlist');
    setText('cf-spots-label', 'All 500 Founding spots are taken');
    setText('cf-spots-left', 'Thank you!');
    if (box) box.classList.remove('has-count');
    swapCtas(); setTimeout(swapCtas, 1000); setTimeout(swapCtas, 3000); // header laadt later in
    document.dispatchEvent(new CustomEvent('cf:founding', { detail: { closed: true } }));
  }

  /* Knoppen als "Become a Founding Couple" en "Reserve Premium" -> wachtlijst-tekst */
  function swapCtas() {
    var map = { 'Become a Founding Couple': 'Join the waitlist', 'Reserve Premium': 'Join the waitlist' };
    document.querySelectorAll('a, button, span').forEach(function (el) {
      if (el.children.length) return;
      var t = el.textContent.trim();
      if (map[t]) el.textContent = map[t];
    });
  }

  function apply(s) {
    if (!s || typeof s.issued !== 'number') return;
    if (s.closed) { if (lastClosed !== true) showClosed(); lastClosed = true; return; }
    lastClosed = false;
    showCount(s.issued);
  }

  function load() {
    if (mock) {
      var n = mock === 'closed' ? TOTAL : Math.max(0, parseInt(mock, 10) || 0);
      return apply({ issued: n, left: TOTAL - n, closed: mock === 'closed' || n >= TOTAL });
    }
    if (!window.fetch) return;
    fetch('/api/founding', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(apply)
      .catch(function () { /* vaste tekst blijft staan */ });
  }

  load();
  if (!mock) setInterval(function () { if (!document.hidden && lastClosed !== true) load(); }, 60000);
})();
