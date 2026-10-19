// Prijskaarten op mobiel: openen op Premium (de middelste kaart)
window.addEventListener('load', function () {
  if (!window.matchMedia('(max-width: 520px)').matches) return;
  var rij = document.querySelector('#cf-pricing .cf-plans');
  var premium = document.querySelector('#cf-pricing .cf-plan--pop');
  if (!rij || !premium) return;
  rij.scrollLeft += premium.getBoundingClientRect().left - rij.getBoundingClientRect().left;
});
