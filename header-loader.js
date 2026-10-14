// header-loader.js
// Laadt header.html in de pagina. De browser mag de header onthouden (sneller bij een volgend bezoek).
// Heb je header.html aangepast? Hoog dan HEADER_VERSIE hieronder op (bijv. 2 → 3),
// anders zien bezoekers nog tot een uur de oude header.
var HEADER_VERSIE = 2;

(function () {
  const mount = document.getElementById('header');
  if (!mount) return;

  const load = async () => {
    const html = await fetch('/header.html?v=' + HEADER_VERSIE).then(r => r.text());
    mount.outerHTML = html;
  };

  load().catch(err => console.error('HEADER LOAD FAILED', err));
})();
