// Theme-Override vor dem ersten Paint (CSP erlaubt kein Inline-Script). Siehe client/src/theme.ts.
(function () {
  try {
    var t = localStorage.getItem('benchbet.theme');
    if (t !== 'light' && t !== 'dark') return;
    document.documentElement.setAttribute('data-theme', t);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].parentNode.removeChild(metas[i]);
    var m = document.createElement('meta');
    m.name = 'theme-color';
    m.content = t === 'dark' ? '#101211' : '#f6f7f2';
    document.head.appendChild(m);
  } catch (e) {
    /* Speicher blockiert – System-Theme */
  }
})();
