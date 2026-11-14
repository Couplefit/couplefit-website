/* CoupleFit confetti – lichtgewicht, zonder externe library (14 nov 2026) */
(function () {
  /* alleen CoupleFit-kleuren: bordeaux (vaakst), navy, poederblauw, dusty blue */
  var COLORS = ['#5B1E2D', '#5B1E2D', '#5B1E2D', '#7A2A3D', '#1E2A44', '#1E2A44', '#B7C6D6', '#B7C6D6', '#7A8FAE'];
  function reduced() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function heart(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.3);
    ctx.bezierCurveTo(-s, -s * 0.4, -s * 0.45, -s * 1.1, 0, -s * 0.5);
    ctx.bezierCurveTo(s * 0.45, -s * 1.1, s, -s * 0.4, 0, s * 0.3);
    ctx.fill();
  }
  window.cfConfetti = function (originEl) {
    var calm = reduced();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2000';
    document.body.appendChild(c);
    var W = window.innerWidth, H = window.innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    var ctx = c.getContext('2d'); ctx.scale(dpr, dpr);

    var ox = W / 2, oy = H * 0.55;
    if (originEl && originEl.getBoundingClientRect) {
      var r = originEl.getBoundingClientRect();
      if (r.width) { ox = r.left + r.width / 2; oy = Math.min(Math.max(r.top + r.height / 2, 80), H - 40); }
    }
    var parts = [];
    var n = calm ? 36 : (W < 600 ? 110 : 170);
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95;
      var v = calm ? 5 + Math.random() * 4 : 9 + Math.random() * 10;
      var kind = Math.random();
      parts.push({
        x: ox, y: oy,
        vx: Math.cos(a) * v * (0.6 + Math.random() * 0.6),
        vy: Math.sin(a) * v,
        s: 5 + Math.random() * 6,
        rot: Math.random() * Math.PI, vr: calm ? 0 : (Math.random() - 0.5) * 0.3,
        tilt: Math.random() * Math.PI, vt: 0.05 + Math.random() * 0.1,
        col: kind < 0.12 ? '#5B1E2D' : COLORS[(Math.random() * COLORS.length) | 0],
        type: kind < 0.12 ? 'heart' : kind < 0.4 ? 'dot' : 'rect',
        life: 0
      });
    }
    var start = performance.now();
    function frame(t) {
      var el = t - start;
      ctx.clearRect(0, 0, W, H);
      var alive = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.vy += 0.28; p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.tilt += p.vt;
        if (p.y > H + 30) continue;
        alive++;
        var fade = el > 2200 ? Math.max(0, 1 - (el - 2200) / 900) : 1;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.col;
        if (p.type === 'heart') { heart(ctx, p.s * 0.9); }
        else if (p.type === 'dot') { ctx.beginPath(); ctx.arc(0, 0, p.s * 0.45, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.scale(1, Math.abs(Math.cos(p.tilt)) + 0.15); ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); }
        ctx.restore();
      }
      if (alive && el < 3200) requestAnimationFrame(frame); else c.remove();
    }
    requestAnimationFrame(frame);
  };
})();
