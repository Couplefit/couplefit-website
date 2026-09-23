// header-loader.js
(function () {
  const mount = document.getElementById('header');
  if (!mount) return;

  const load = async () => {
    const url = `/header.html?cb=${Date.now()}`;
    const html = await fetch(url, { cache: 'no-store' }).then(r => r.text());
    mount.outerHTML = html;
  };

  load().catch(err => console.error('HEADER LOAD FAILED', err));
})();
