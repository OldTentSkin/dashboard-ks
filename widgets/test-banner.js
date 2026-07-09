/**
 * test-banner.js
 * Zobrazí nápadný barevný banner nahoře na stránce, pokud appku otevřeš
 * lokálně (dvojklikem na soubor z počítače), aby bylo jasně vidět,
 * že se nekoukáš na živou verzi z webu.
 *
 * Na živém webu (https://kulhavysup.cz/...) se banner nezobrazí vůbec.
 */
(function() {
  // file:// protokol = otevřeno lokálně dvojklikem, ne přes web
  if (window.location.protocol !== 'file:') return;

  const banner = document.createElement('div');
  banner.textContent = '⚠ TESTOVACÍ VERZE — soubor otevřen lokálně, ne z webu';
  banner.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 99999;
    background: #c04040;
    color: #fff;
    font-family: 'Share Tech Mono', monospace;
    font-size: 12px;
    letter-spacing: 1px;
    text-align: center;
    padding: 6px 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.4);
  `;
  document.body.appendChild(banner);
})();
