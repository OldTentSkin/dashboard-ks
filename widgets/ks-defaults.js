/**
 * K-S Dashboard — výchozí vzorová data
 * Spustí se jen jednou při prvním otevření.
 * Soubor: KS/widgets/ks-defaults.js
 */
(function() {
  if (localStorage.getItem('ks-defaults-loaded')) return;

  const today = new Date();
  const d = s => {
    const t = new Date(today.getTime() + s * 86400000);
    return t.toISOString().slice(0,10);
  };
  const ts = offset => Date.now() - offset * 86400000;

  // ── TO-DO ──
  if (!localStorage.getItem('ks-todo-v2')) {
    localStorage.setItem('ks-todo-v2', JSON.stringify({
      categories: [
        { id: 'tipy', name: 'Tipy' }
      ],
      todos: [
        { id: ts(3)+'1', text: '💡 Úkoly řadíš prioritami — P1 urgentní (červená), P2 normální (zlatá), P3 nízká (zelená). Vyzkoušej tlačítka vpravo dole!', priority: 'p2', category: 'tipy', done: false },
        { id: ts(2)+'2', text: '📝 Create categories to separate Work, Home and Personal tasks — use the arrows to switch between them.', priority: 'p3', category: 'tipy', done: false },
        { id: ts(1)+'3', text: '✅ Úlohy môžeš označiť ako hotové zaškrtnutím — splnené sa skryjú, ale môžeš ich kedykoľvek zobraziť.', priority: 'p3', category: 'tipy', done: false },
        { id: ts(0)+'4', text: '🎯 Tipp: Dringende Aufgaben mit P1 markieren — sie erscheinen immer ganz oben in der Liste.', priority: 'p1', category: 'tipy', done: false },
      ]
    }));
  }

  // ── POZNÁMKY ──
  if (!localStorage.getItem('ks-notes')) {
    localStorage.setItem('ks-notes', JSON.stringify({
      categories: [
        { id: 'obecne', name: 'Obecné' },
        { id: 'tipy',   name: 'Tipy' }
      ],
      notes: [
        { id: 'n_'+ts(3), cat: 'tipy', text: '📌 Připni tuto poznámku kliknutím na ikonu špendlíku — připnuté poznámky se vždy zobrazí nahoře.', color: '#c8a03c', pinned: true,  photo: null, created: d(-3) },
        { id: 'n_'+ts(2), cat: 'tipy', text: '🗂️ You can create multiple categories — Ideas, Work, Recipes — and switch between them with the arrows above.', color: '#4a9eff', pinned: false, photo: null, created: d(-2) },
        { id: 'n_'+ts(1), cat: 'tipy', text: '🔗 Skúste vložiť URL adresu — poznámka sa automaticky zmení na klikateľnú kartu s názvom stránky.', color: '#1faa77', pinned: false, photo: null, created: d(-1) },
        { id: 'n_'+ts(0), cat: 'tipy', text: '📸 Tipp: Du kannst auch Fotos zu Notizen hinzufügen — ideal für Quittungen, Visitenkarten oder Skizzen.', color: '#e05050', pinned: false, photo: null, created: d(0) },
      ]
    }));
  }

  // ── DENÍK ──
  if (!localStorage.getItem('ks-diary')) {
    const diary = {};
    diary[d(-3)] = { text: '📖 Deník si pamatuje každý den zvlášť. Piš cokoli — myšlenky, plány, nápady. Nikdo jiný to neuvidí, data jsou jen v tomto prohlížeči.', slider: 7, tags: ['Volno'] };
    diary[d(-2)] = { text: '📖 This is your private diary — entries are stored only in your browser. Use the mood slider and tags to track how your days feel over time.', slider: 6, tags: ['Volno'] };
    diary[d(-1)] = { text: '📖 Denník ti pomôže sledovať náladu a aktivity v čase. Skús každý deň napísať aspoň vetu — malé kroky, veľké zmeny.', slider: 8, tags: ['Volno'] };
    diary[d(0)]  = { text: '📖 Tipp: Nutze Tags wie "Arbeit", "Sport" oder "Familie" um deine Einträge zu kategorisieren und später zu filtern.', slider: 7, tags: ['Volno'] };
    localStorage.setItem('ks-diary', JSON.stringify(diary));
  }

  // ── ZÁRUKY ──
  if (!localStorage.getItem('ks-warranties')) {
    localStorage.setItem('ks-warranties', JSON.stringify([
      {
        id: 'w_demo1',
        name: '📺 Televize — přidej datum koupě a délku záruky',
        price: '12990', currency: 'Kč',
        purchaseDate: d(-30), months: 24,
        note: '💡 Tip: Dashboard tě upozorní, až se záruka blíží ke konci. Přidej vlastní spotřebiče a elektro.',
        photo: null, archived: false
      },
      {
        id: 'w_demo2',
        name: '💻 Laptop — track your warranty expiry date here',
        price: '899', currency: 'EUR',
        purchaseDate: d(-60), months: 36,
        note: '💡 Tip: You can upload a photo of your receipt — handy if you ever need to claim warranty.',
        photo: null, archived: false
      },
      {
        id: 'w_demo3',
        name: '🍳 Kuchynský robot — pridaj záruku a nikdy ju nestratíš',
        price: '299', currency: 'EUR',
        purchaseDate: d(-90), months: 24,
        note: '💡 Tip: Záruky môžeš archivovať po skončení — ostanú uložené pre prípad reklamácie.',
        photo: null, archived: false
      },
      {
        id: 'w_demo4',
        name: '🔧 Werkzeug — Garantiezeit nie wieder vergessen',
        price: '149', currency: 'EUR',
        purchaseDate: d(-15), months: 12,
        note: '💡 Tipp: Das Dashboard zeigt dir farblich an, wie viel Zeit noch übrig ist — grün, gelb, rot.',
        photo: null, archived: false
      },
    ]));
  }

  // ── NÁKUPY ──
  if (!localStorage.getItem('ks-shopping')) {
    localStorage.setItem('ks-shopping', JSON.stringify({
      categories: [{ id: 'tipy', name: 'Tipy' }],
      items: [
        { id: 's1', cat: 'tipy', text: '💡 Položky zaškrtni jako koupené — zmizí z aktivního seznamu, ale zůstanou v historii.', done: false, created: d(0) },
        { id: 's2', cat: 'tipy', text: '🛒 Create separate lists — Groceries, DIY, Gifts — and switch between them with the arrows.', done: false, created: d(0) },
        { id: 's3', cat: 'tipy', text: '📋 Zoznamy sa ukladajú len v tvojom prehliadači — nikto iný ich nevidí.', done: false, created: d(0) },
        { id: 's4', cat: 'tipy', text: '📦 Tipp: Erstelle eine Liste "Geschenke" und hake Erledigtes ab — so behältst du den Überblick.', done: false, created: d(0) },
        { id: 's5', cat: 'tipy', text: '🎨 Koupit nový motiv pro Dashboard K-S', done: false, created: d(0) },
      ]
    }));
  }

  // ── KALENDÁŘ ──
  if (!localStorage.getItem('ks-calendar')) {
    const calendar = {};
    calendar[d(365)] = [
      { id: 'e_demo1', title: '📅 Ukázková událost — takhle vypadá záznam v kalendáři', time: '', color: '#c8a03c' }
    ];
    localStorage.setItem('ks-calendar', JSON.stringify(calendar));
  }

  // ── RSS ZDROJE ──
  if (!localStorage.getItem('ks-rss-feeds')) {
    localStorage.setItem('ks-rss-feeds', JSON.stringify([
      { url: 'https://www.lupa.cz/rss/clanky/',         name: 'Lupa.cz',      color: '#4a9eff', flag: 'cz' },
      { url: 'https://www.root.cz/rss/clanky/',         name: 'Root.cz',      color: '#1faa77', flag: 'cz' },
      { url: 'https://feeds.arstechnica.com/arstechnica/index', name: 'Ars Technica', color: '#e05050', flag: 'gb' },
      { url: 'https://www.heise.de/rss/heise-atom.xml', name: 'Heise.de',     color: '#f0a030', flag: 'de' },
    ]));
  }

  localStorage.setItem('ks-defaults-loaded', '1');
  console.log('[K-S] Výchozí data načtena.');
})();
