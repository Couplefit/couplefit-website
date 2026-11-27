/* CoupleFit pricing: prijzen per valuta en de weergave op index.html en subscriptions.html.
   De bedragen hieronder komen exact uit Google Play Console (24 nov 2026).
   m = normaal per maand, y = normaal per jaar, fm = founding per maand, fy = founding per jaar.
   Wijzig je een prijs in de store, pas hem dan hier ook aan. */
(function () {
  var PRICES = {
    EUR: { sym: '€', premium: { m: 24.99, y: 179.99, fm: 16.99, fy: 124.99 }, elite: { m: 34.99, y: 379.99, fm: 23.99, fy: 264.99 },
           tax: 'All prices are in euros and include VAT.', fine: 'Prices in EUR include VAT.' },
    USD: { sym: '$', premium: { m: 22.99, y: 164.99, fm: 15.99, fy: 114.99 }, elite: { m: 31.99, y: 344.99, fm: 21.99, fy: 239.99 },
           tax: 'Prices are in US dollars and exclude sales tax.', fine: 'Prices in USD exclude sales tax.' },
    GBP: { sym: '£', premium: { m: 20.99, y: 149.99, fm: 14.49, fy: 104.99 }, elite: { m: 28.99, y: 314.99, fm: 19.99, fy: 219.99 },
           tax: 'Prices are in pounds and include VAT.', fine: 'Prices in GBP include VAT.' },
    CAD: { sym: '$', premium: { m: 31.99, y: 234.99, fm: 21.99, fy: 159.99 }, elite: { m: 44.99, y: 494.99, fm: 30.99, fy: 344.99 },
           tax: 'Prices are in Canadian dollars and exclude sales tax.', fine: 'Prices in CAD exclude sales tax.' },
    AUD: { sym: '$', premium: { m: 36.99, y: 269.99, fm: 24.99, fy: 184.99 }, elite: { m: 52.99, y: 549.99, fm: 35.99, fy: 379.99 },
           tax: 'Prices are in Australian dollars and include GST.', fine: 'Prices in AUD include GST.' }
  };
  var FINE_TAIL = " Founding prices are rounded to local store price points, so in some currencies your discount is slightly more than 30%. You'll see your exact local price in the App Store or Google Play.";

  var root = document.querySelector('.cf-price');
  if (!root) return;
  var toggle = root.querySelector('.cf-toggle');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var r2 = function (x) { return Math.round(x * 100 + 1e-9) / 100; };
  var money2 = function (sym, x) { return sym + r2(x).toFixed(2); };
  var pct = function (part, whole) { return Math.round((1 - part / whole) * 100); };

  function guessCurrency() {
    try {
      var saved = localStorage.getItem('cf_currency');
      if (saved && PRICES[saved]) return saved;
    } catch (e) {}
    var lang = (navigator.language || '').toLowerCase();
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    if (/-ca$/.test(lang) || /^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|Regina|St_Johns|Montreal)/.test(tz)) return 'CAD';
    if (/-au$/.test(lang) || /^Australia\//.test(tz)) return 'AUD';
    if (/-gb$/.test(lang) || tz === 'Europe/London') return 'GBP';
    if (lang === 'en-us' || /^America\//.test(tz)) return 'USD';
    return 'EUR';
  }
  var currency = guessCurrency();
  var period = root.getAttribute('data-period') || 'yearly';

  function tween(el, sym, to) {
    var from = parseFloat(el.textContent.replace(/[^0-9.]/g, '')) || 0;
    if (reduce || from === to) { el.textContent = sym + to.toFixed(2); return; }
    var start = null;
    function step(t) {
      if (!start) start = t;
      var p = Math.min((t - start) / 450, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = sym + (from + (to - from) * e).toFixed(2);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function set(card, sel, text) { var el = card.querySelector(sel); if (el) el.textContent = text; }

  function render(animate) {
    var c = PRICES[currency], s = c.sym, y = period === 'yearly';
    root.querySelectorAll('[data-free]').forEach(function (el) { el.textContent = s + '0'; });

    /* "Save x%" op de schakelaar: jaarprijs t.o.v. 12 x de maandprijs (Premium) */
    var save = root.querySelector('.cf-save');
    if (save) save.textContent = 'Save ' + pct(c.premium.y, c.premium.m * 12) + '%';

    root.querySelectorAll('.cf-plan[data-plan]').forEach(function (card) {
      var p = c[card.getAttribute('data-plan')];
      if (!p) return;
      var closed = !!window.cfFoundingClosed;          // founding vol: gewone prijzen tonen
      var amount = closed ? r2(y ? p.y / 12 : p.m) : r2(y ? p.fy / 12 : p.fm);
      var num = card.querySelector('.cf-amount__num');
      if (num) { if (animate) tween(num, s, amount); else num.textContent = s + amount.toFixed(2); }
      set(card, '.cf-amount__old', money2(s, y ? p.y / 12 : p.m));
      set(card, '.cf-regular', y
        ? 'Regular price after launch: ' + money2(s, p.y) + ' a year (' + money2(s, p.y / 12) + '/month)'
        : 'Regular price after launch: ' + money2(s, p.m) + ' a month');
      set(card, '.cf-person__text', 'Just ' + money2(s, amount / 2) + ' per person a month');
      set(card, '.cf-billing', closed
        ? (y ? 'Billed ' + money2(s, p.y) + ' a year for the two of you. You save ' + pct(p.y, p.m * 12) + '% compared with monthly.'
             : 'Billed ' + money2(s, p.m) + ' a month for the two of you. Cancel anytime.')
        : y
        ? 'Billed ' + money2(s, p.fy) + ' a year for the two of you. You save ' + money2(s, p.y - p.fy) + ' (' + pct(p.fy, p.y) + '%) every year.'
        : 'Billed ' + money2(s, p.fm) + ' a month for the two of you. You save ' + money2(s, p.m - p.fm) + ' (' + pct(p.fm, p.m) + '%) every month.');
    });

    var tax = document.getElementById('cf-tax-line'); if (tax) tax.textContent = c.tax;
    var fine = document.getElementById('cf-price-fine'); if (fine) fine.textContent = c.fine + (window.cfFoundingClosed ? " You'll see your exact local price in the App Store or Google Play." : FINE_TAIL);

    /* Losse prijzen in teksten, bv. <span data-cf-p="premium.m">. Sleutels: m, y, fm, fy, half (m/2), yhalf (y/12/2), fyhalf (fy/12/2) */
    document.querySelectorAll('[data-cf-p]').forEach(function (el) {
      var k = el.getAttribute('data-cf-p').split('.'), p = c[k[0]];
      if (!p) return;
      var v = k[1] === 'half' ? p.m / 2 : k[1] === 'yhalf' ? p.y / 24 : k[1] === 'fyhalf' ? p.fy / 24 : p[k[1]];
      if (typeof v === 'number') el.textContent = money2(s, v);
    });
  }

  function setPeriod(p) {
    period = p;
    root.setAttribute('data-period', p);
    if (toggle) {
      toggle.setAttribute('data-period', p);
      toggle.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-set') === p ? 'true' : 'false');
      });
    }
    render(true);
  }

  if (toggle) toggle.querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () { setPeriod(b.getAttribute('data-set')); });
  });

  var sel = document.getElementById('cf-currency');
  if (sel) {
    sel.value = currency;
    sel.addEventListener('change', function () {
      currency = sel.value;
      try { localStorage.setItem('cf_currency', currency); } catch (e) {}
      try { if (window.umami) umami.track('Currency', { currency: currency }); } catch (e) {}
      render(true);
    });
  }
  document.addEventListener('cf:founding', function () { render(false); });
  render(false);
})();
