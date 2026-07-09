/* ──────────────────────────────────────────────
   Dashboard K-S — Theme Loader
   Sdílený soubor pro všechny widgety i hlavní stránku.
   Vloží se přes <script src="../theme-loader.js"></script>
   ────────────────────────────────────────────── */

const KS_THEME_KEY = 'ks-theme';

const KS_THEMES = {
  gold: {
    label: 'Zlatý (výchozí)',
    premium: false,
    vars: {
      '--gold': '#c8a03c',
      '--gold-dim': 'rgba(200,160,60,0.3)',
      '--gold-glow': 'rgba(200,160,60,0.22)',
      '--gold-text': '#e8d9b0',
      '--text-dim': '#6b5f3f',
      '--ok': '#1faa77',
      '--warn': '#c8a03c',
      '--crit': '#c04040',
    },
    cardBg: 'radial-gradient(ellipse at 0% 0%, #c89820 0%, #6a4a00 30%, #1a1000 60%, #000000 100%)',
    pageBg: '#030303',
  },
  matrix: {
    label: 'Matrix',
    premium: true,
    vars: {
      '--gold': '#39d353',
      '--gold-dim': 'rgba(57,211,83,0.3)',
      '--gold-glow': 'rgba(57,211,83,0.22)',
      '--gold-text': '#c6f6c8',
      '--text-dim': '#3a5f3f',
      '--ok': '#39d353',
      '--warn': '#c8c83c',
      '--crit': '#d34a4a',
    },
    cardBg: 'radial-gradient(ellipse at 0% 0%, #1f9c3a 0%, #0e4a1c 30%, #051a09 60%, #000000 100%)',
    pageBg: '#020602',
  },
  neon: {
    label: 'Neon',
    premium: true,
    vars: {
      '--gold': '#ff2fd0',
      '--gold-dim': 'rgba(255,47,208,0.3)',
      '--gold-glow': 'rgba(255,47,208,0.22)',
      '--gold-text': '#f0c8ff',
      '--text-dim': '#5f3f6b',
      '--ok': '#2fe0ff',
      '--warn': '#ff2fd0',
      '--crit': '#ff4060',
    },
    cardBg: 'radial-gradient(ellipse at 0% 0%, #c820c0 0%, #4a006a 30%, #100020 60%, #000000 100%)',
    pageBg: '#05010a',
  },
  crimson: {
    label: 'Crimson',
    premium: true,
    vars: {
      '--gold': '#d34a4a',
      '--gold-dim': 'rgba(211,74,74,0.3)',
      '--gold-glow': 'rgba(211,74,74,0.22)',
      '--gold-text': '#f0c0c0',
      '--text-dim': '#6b3f3f',
      '--ok': '#c8a03c',
      '--warn': '#d39a4a',
      '--crit': '#ff3030',
    },
    cardBg: 'radial-gradient(ellipse at 0% 0%, #c82020 0%, #6a0a0a 30%, #1a0000 60%, #000000 100%)',
    pageBg: '#030000',
  },
  solar: {
    label: 'Solar',
    premium: true,
    vars: {
      '--gold': '#ff9020',
      '--gold-dim': 'rgba(255,144,32,0.3)',
      '--gold-glow': 'rgba(255,144,32,0.22)',
      '--gold-text': '#f0d8b0',
      '--text-dim': '#6b5530',
      '--ok': '#1faa77',
      '--warn': '#ff9020',
      '--crit': '#c04040',
    },
    cardBg: 'radial-gradient(ellipse at 0% 0%, #e08020 0%, #7a3a00 30%, #1f0d00 60%, #000000 100%)',
    pageBg: '#050200',
  },
  azure: {
    label: 'Azurová',
    premium: true,
    vars: {
      '--gold': '#60e0ff',
      '--gold-dim': 'rgba(96,224,255,0.3)',
      '--gold-glow': 'rgba(96,224,255,0.22)',
      '--gold-text': '#d0f4ff',
      '--text-dim': '#2a5060',
      '--ok': '#00ffaa',
      '--warn': '#60e0ff',
      '--crit': '#ff4060',
    },
    cardBg: 'radial-gradient(ellipse at 0% 0%, #0099dd 0%, #004470 30%, #000f20 60%, #000000 100%)',
    pageBg: '#00050c',
  },
};

function ksApplyTheme(themeId) {
  const theme = KS_THEMES[themeId] || KS_THEMES.gold;
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));
  root.style.setProperty('--card-bg', theme.cardBg);
  root.style.setProperty('--page-bg', theme.pageBg);
}

function ksGetTheme() {
  try { return localStorage.getItem(KS_THEME_KEY) || 'gold'; } catch { return 'gold'; }
}

function ksSetTheme(themeId) {
  try { localStorage.setItem(KS_THEME_KEY, themeId); } catch {}
  ksApplyTheme(themeId);
}

// Automaticky aplikovat motiv při načtení stránky/widgetu
ksApplyTheme(ksGetTheme());

// Pokud uživatel změní motiv v jiné záložce/widgetu, promítne se to i sem
window.addEventListener('storage', (e) => {
  if (e.key === KS_THEME_KEY) ksApplyTheme(e.newValue || 'gold');
});
