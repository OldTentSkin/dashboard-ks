/* ──────────────────────────────────────────────
   Dashboard K-S — Auth Lock
   Zámek appky: PIN/heslo + volitelně otisk prstu (WebAuthn).
   Vloží se přes <script src="widgets/auth-lock.js"></script>
   na KAŽDOU stránku, kterou chceš chránit (index.html, settings.html).

   Důležité: Toto je ochrana proti běžnému nakukování (rodina,
   kolegové), NE kryptograficky bezpečné bankovní zabezpečení —
   appka nemá vlastní server, který by mohl nezávisle ověřovat
   otisk prstu. WebAuthn tady jen řekne "telefon otisk uznal / neuznal".
   ────────────────────────────────────────────── */

const KS_AUTH_ENABLED_KEY   = 'ks-auth-enabled';
const KS_AUTH_HASH_KEY      = 'ks-auth-hash';
const KS_AUTH_SALT_KEY      = 'ks-auth-salt';
const KS_AUTH_WEBAUTHN_KEY  = 'ks-auth-webauthn-id'; // base64 credential ID
const KS_AUTH_SESSION_KEY   = 'ks-auth-session-unlocked'; // sessionStorage — platí jen dokud je karta otevřená

// ── Pomocné: hash hesla (SHA-256, se solí) ──
async function ksAuthHash(password, saltB64) {
  const enc = new TextEncoder();
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), c => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const data = enc.encode(salt.join(',') + '::' + password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  const saltOut = btoa(String.fromCharCode(...salt));
  return { hash: hashB64, salt: saltOut };
}

function ksAuthIsSetup() {
  try { return localStorage.getItem(KS_AUTH_ENABLED_KEY) === '1' && !!localStorage.getItem(KS_AUTH_HASH_KEY); }
  catch { return false; }
}

async function ksAuthSetupPassword(password) {
  const { hash, salt } = await ksAuthHash(password);
  localStorage.setItem(KS_AUTH_HASH_KEY, hash);
  localStorage.setItem(KS_AUTH_SALT_KEY, salt);
  localStorage.setItem(KS_AUTH_ENABLED_KEY, '1');
}

async function ksAuthVerifyPassword(password) {
  const storedHash = localStorage.getItem(KS_AUTH_HASH_KEY);
  const salt = localStorage.getItem(KS_AUTH_SALT_KEY);
  if (!storedHash || !salt) return false;
  const { hash } = await ksAuthHash(password, salt);
  return hash === storedHash;
}

function ksAuthDisable() {
  localStorage.removeItem(KS_AUTH_ENABLED_KEY);
  localStorage.removeItem(KS_AUTH_HASH_KEY);
  localStorage.removeItem(KS_AUTH_SALT_KEY);
  localStorage.removeItem(KS_AUTH_WEBAUTHN_KEY);
  sessionStorage.removeItem(KS_AUTH_SESSION_KEY);
}

function ksAuthIsUnlockedThisSession() {
  try { return sessionStorage.getItem(KS_AUTH_SESSION_KEY) === '1'; } catch { return false; }
}
function ksAuthMarkUnlocked() {
  try { sessionStorage.setItem(KS_AUTH_SESSION_KEY, '1'); } catch {}
}

// ── WebAuthn (otisk prstu / Face ID) ──
function ksAuthWebAuthnSupported() {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

function ksAuthHasWebAuthn() {
  return !!localStorage.getItem(KS_AUTH_WEBAUTHN_KEY);
}

function randChallenge() {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function ksAuthRegisterWebAuthn() {
  if (!ksAuthWebAuthnSupported()) throw new Error('WebAuthn není podporováno');
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randChallenge(),
      rp: { name: 'Dashboard K-S' },
      user: { id: userId, name: 'ks-dashboard-user', displayName: 'K-S Dashboard' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000,
    }
  });
  if (!cred) throw new Error('Registrace zrušena');
  const idB64 = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
  localStorage.setItem(KS_AUTH_WEBAUTHN_KEY, idB64);
  return true;
}

async function ksAuthenticateWithWebAuthn() {
  const idB64 = localStorage.getItem(KS_AUTH_WEBAUTHN_KEY);
  if (!idB64) throw new Error('Otisk prstu není nastavený');
  const rawId = Uint8Array.from(atob(idB64), c => c.charCodeAt(0));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randChallenge(),
      allowCredentials: [{ id: rawId, type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
    }
  });
  return !!assertion; // úspěšné ověření prohlížečem = uznáno
}

function ksAuthRemoveWebAuthn() {
  localStorage.removeItem(KS_AUTH_WEBAUTHN_KEY);
}

// ══════════════════════════════════════════════
//  ZÁMKOVÁ OBRAZOVKA — vykreslí se, pokud je zámek
//  zapnutý a tahle karta ještě není odemčená
// ══════════════════════════════════════════════
function ksAuthShowLockScreen(onUnlock) {
  const overlay = document.createElement('div');
  overlay.id = 'ks-auth-overlay';
  overlay.innerHTML = `
    <style>
      #ks-auth-overlay {
        position: fixed; inset: 0; z-index: 999999;
        background: var(--page-bg, #030303);
        display: flex; align-items: center; justify-content: center;
        font-family: 'Share Tech Mono', monospace;
      }
      #ks-auth-box {
        width: 100%; max-width: 320px; padding: 30px 26px;
        border: 1px solid var(--gold-dim, rgba(200,160,60,0.3));
        border-radius: 16px;
        background: rgba(200,160,60,0.04);
        text-align: center;
      }
      #ks-auth-title {
        font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 20px;
        color: var(--gold, #c8a03c); letter-spacing: 1px; margin-bottom: 6px;
      }
      #ks-auth-sub { font-size: 11px; color: var(--text-dim, #6b5f3f); margin-bottom: 20px; }
      #ks-auth-input {
        width: 100%; background: rgba(0,0,0,0.35); border: 1px solid var(--gold-dim, rgba(200,160,60,0.3));
        color: var(--gold-text, #e8d9b0); font-family: inherit; font-size: 18px; letter-spacing: 6px;
        text-align: center; padding: 12px; border-radius: 8px; outline: none; margin-bottom: 14px;
      }
      #ks-auth-input:focus { border-color: var(--gold, #c8a03c); }
      #ks-auth-btn {
        width: 100%; background: rgba(200,160,60,0.15); border: 1px solid var(--gold-dim, rgba(200,160,60,0.3));
        color: var(--gold, #c8a03c); font-family: inherit; font-size: 13px; letter-spacing: 1px;
        padding: 10px; border-radius: 8px; cursor: pointer; margin-bottom: 10px;
      }
      #ks-auth-btn:hover { background: rgba(200,160,60,0.25); }
      #ks-auth-fp-btn {
        width: 100%; background: transparent; border: 1px solid var(--gold-dim, rgba(200,160,60,0.3));
        color: var(--gold-text, #e8d9b0); font-family: inherit; font-size: 12px; letter-spacing: 1px;
        padding: 10px; border-radius: 8px; cursor: pointer; margin-bottom: 10px;
      }
      #ks-auth-error { font-size: 11px; color: #d34a4a; min-height: 14px; margin-top: 4px; }
    </style>
    <div id="ks-auth-box">
      <div id="ks-auth-title">🔒 Uzamčeno</div>
      <div id="ks-auth-sub">Zadej PIN / heslo pro pokračování</div>
      <input type="password" id="ks-auth-input" inputmode="numeric" autocomplete="off" placeholder="••••">
      <button id="ks-auth-btn">Odemknout</button>
      <button id="ks-auth-fp-btn" style="display:none;">👆 Odemknout otiskem</button>
      <div id="ks-auth-error"></div>
    </div>
  `;
  document.documentElement.appendChild(overlay);

  const input = overlay.querySelector('#ks-auth-input');
  const btn = overlay.querySelector('#ks-auth-btn');
  const fpBtn = overlay.querySelector('#ks-auth-fp-btn');
  const errEl = overlay.querySelector('#ks-auth-error');

  if (ksAuthWebAuthnSupported() && ksAuthHasWebAuthn()) {
    fpBtn.style.display = 'block';
    fpBtn.addEventListener('click', async () => {
      errEl.textContent = '';
      try {
        const ok = await ksAuthenticateWithWebAuthn();
        if (ok) { overlay.remove(); ksAuthMarkUnlocked(); onUnlock(); }
      } catch (e) {
        errEl.textContent = 'Otisk nerozpoznán, zkus znovu nebo použij PIN.';
      }
    });
    // Nabídnout otisk rovnou při načtení, ať uživatel nemusí extra klikat
    fpBtn.click();
  }

  async function tryUnlock() {
    errEl.textContent = '';
    const ok = await ksAuthVerifyPassword(input.value);
    if (ok) { overlay.remove(); ksAuthMarkUnlocked(); onUnlock(); }
    else { errEl.textContent = 'Špatný PIN / heslo.'; input.value = ''; input.focus(); }
  }
  btn.addEventListener('click', tryUnlock);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
  setTimeout(() => input.focus(), 50);
}

// ══════════════════════════════════════════════
//  AUTO-SPUŠTĚNÍ: pokud je zámek zapnutý a tahle
//  karta ještě neprošla odemčením, schovej obsah
//  stránky a ukaž zámkovou obrazovku.
//  Pokud je appka propojená s cloudem, nejdřív si
//  počká na stažení dat (mohl v nich přijet PIN
//  nastavený na jiném zařízení).
// ══════════════════════════════════════════════
function ksAuthRunGuard() {
  if (!ksAuthIsSetup()) return;          // zámek vůbec nenastavený → nic neděláme
  if (ksAuthIsUnlockedThisSession()) return; // tahle karta je už odemčená

  // Schovej obsah stránky, dokud se neodemkne
  const style = document.createElement('style');
  style.id = 'ks-auth-hide-style';
  style.textContent = 'body > *:not(#ks-auth-overlay) { visibility: hidden !important; }';
  document.documentElement.appendChild(style);

  function reveal() {
    const s = document.getElementById('ks-auth-hide-style');
    if (s) s.remove();
  }

  if (document.body) {
    ksAuthShowLockScreen(reveal);
  } else {
    document.addEventListener('DOMContentLoaded', () => ksAuthShowLockScreen(reveal));
  }
}

(function ksAuthGuard() {
  const hasCloud = typeof ksIsCloudConnected === 'function' && ksIsCloudConnected();
  if (!hasCloud) { ksAuthRunGuard(); return; }

  // Cloud je připojený — počkej na první stažení dat (max 4 sekundy),
  // ať zámek vidí i PIN nastavený na jiném zařízení.
  let done = false;
  const finish = () => { if (done) return; done = true; ksAuthRunGuard(); };
  window.addEventListener('ks-cloud-sync-ready', finish, { once: true });
  setTimeout(finish, 4000); // pojistka, kdyby stahování selhalo/trvalo dlouho
})();
