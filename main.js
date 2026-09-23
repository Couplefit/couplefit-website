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
