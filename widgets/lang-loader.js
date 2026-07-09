/* ──────────────────────────────────────────────
   Dashboard K-S — Lang Loader
   Sdílený soubor pro všechny widgety i hlavní stránku.
   Vloží se přes <script src="../lang-loader.js"></script>
   (stejně jako theme-loader.js, jen pro texty místo barev)
   ────────────────────────────────────────────── */

const KS_LANG_KEY = 'ks-lang'; // 'auto' | 'cz' | 'en' | 'sk' | 'de'

// Zjistí složku, ve které leží tento skript (lang-loader.js), aby cesty
// k JSON souborům fungovaly stejně, ať appku volá index.html, settings.html
// nebo kterýkoli widget uvnitř složky widgets/.
const KS_LANG_BASE = (() => {
  try {
    const scriptEl = document.currentScript || Array.from(document.getElementsByTagName('script'))
      .find(s => s.src && s.src.includes('lang-loader.js'));
    const src = scriptEl ? scriptEl.src : '';
    return src.replace(/lang-loader\.js(\?.*)?$/, '');
  } catch { return ''; }
})();

const KS_LANG_FILES = {
  cz: KS_LANG_BASE + 'lang/cz.json',
  en: KS_LANG_BASE + 'lang/en.json',
  sk: KS_LANG_BASE + 'lang/sk.json',
  de: KS_LANG_BASE + 'lang/de.json',
};
const KS_LANG_LABELS = {
  cz: 'Čeština',
  en: 'English',
  sk: 'Slovenčina',
  de: 'Deutsch',
};
const KS_SUPPORTED = ['cz', 'en', 'sk', 'de'];
const KS_FALLBACK_LANG = 'cz';

let KS_LANG_DATA = null;      // aktuálně načtený slovník textů
let KS_LANG_READY = null;     // Promise, který se splní, až jsou texty načtené

// Zjistí, jaký jazyk se má reálně použít (vyřeší 'auto' podle jazyka zařízení)
function ksResolveLang(pref) {
  if (pref && pref !== 'auto' && KS_SUPPORTED.includes(pref)) return pref;
  // auto-detekce podle jazyka prohlížeče/telefonu
  const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
  if (nav.startsWith('cs')) return 'cz';
  if (nav.startsWith('sk')) return 'sk';
  if (nav.startsWith('de')) return 'de';
  if (nav.startsWith('en')) return 'en';
  return KS_FALLBACK_LANG;
}

function ksGetLangPref() {
  try { return localStorage.getItem(KS_LANG_KEY) || 'auto'; } catch { return 'auto'; }
}

function ksSetLangPref(pref) {
  try { localStorage.setItem(KS_LANG_KEY, pref); } catch {}
  ksLoadLang(ksResolveLang(pref)).then(() => ksApplyLangToDom());
}

// Vrátí hodnotu z KS_LANG_DATA podle tečkované cesty, např. "todo.addTask"
function ksT(key, fallback) {
  if (!KS_LANG_DATA) return fallback ?? key;
  const parts = key.split('.');
  let node = KS_LANG_DATA;
  for (const p of parts) {
    if (node && typeof node === 'object' && p in node) node = node[p];
    else return fallback ?? key;
  }
  return node;
}

// Načte JSON soubor s texty pro daný jazyk (s fallbackem na cz při chybě)
async function ksLoadLang(langId) {
  const path = KS_LANG_FILES[langId] || KS_LANG_FILES[KS_FALLBACK_LANG];
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error('lang fetch failed');
    KS_LANG_DATA = await res.json();
  } catch (e) {
    console.warn('[lang-loader] Nepodařilo se načíst', path, '— používám češtinu.', e);
    if (langId !== KS_FALLBACK_LANG) {
      try {
        const res2 = await fetch(KS_LANG_FILES[KS_FALLBACK_LANG]);
        KS_LANG_DATA = await res2.json();
      } catch (e2) {
        KS_LANG_DATA = {};
      }
    } else {
      KS_LANG_DATA = {};
    }
  }
  document.documentElement.setAttribute('lang', langId === 'cz' ? 'cs' : langId);
  return KS_LANG_DATA;
}

// Projde DOM a dosadí texty do elementů s data-i18n / data-i18n-placeholder / data-i18n-title
function ksApplyLangToDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = ksT(key, el.textContent);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', ksT(key, el.getAttribute('placeholder')));
  });
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.setAttribute('title', ksT(key, el.getAttribute('title')));
  });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria');
    el.setAttribute('aria-label', ksT(key, el.getAttribute('aria-label')));
  });
  // Widgety si mohou samy poslouchat tuto událost a přerenderovat dynamický obsah
  // (např. seznamy úkolů, agendu...), který data-i18n nepokryje.
  window.dispatchEvent(new CustomEvent('ks-lang-applied'));
}

// Inicializace při načtení stránky/widgetu
KS_LANG_READY = ksLoadLang(ksResolveLang(ksGetLangPref())).then(() => {
  ksApplyLangToDom();
});

// Pokud uživatel změní jazyk v jiné záložce/widgetu (Nastavení), promítne se to i sem
window.addEventListener('storage', (e) => {
  if (e.key === KS_LANG_KEY) {
    ksLoadLang(ksResolveLang(e.newValue || 'auto')).then(() => ksApplyLangToDom());
  }
});
