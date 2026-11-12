// Ophogen na elke wijziging in footer.html, zodat browsers de nieuwe versie laden
var FOOTER_VERSIE = 2;
fetch('/footer.html?v=' + FOOTER_VERSIE)
  .then(res => res.text())
  .then(html => {
    document.getElementById('footer').innerHTML = html;
  });
