/* ──────────────────────────────────────────────
   Dashboard K-S — Cloud Sync
   Ukládá a načítá data appky (nastavení, úkoly, poznámky, deník...)
   do uživatelova vlastního cloud úložiště: Google Drive, OneDrive, Dropbox.
   Vloží se přes <script src="widgets/cloud-sync.js"></script>
   ────────────────────────────────────────────── */

const KS_STORAGE_PROVIDER_KEY = 'ks-storage-provider'; // 'gdrive' | 'onedrive' | 'dropbox' | 'local' | null
const KS_LAST_SYNC_HASH_KEY   = 'ks-last-sync-hash';
const KS_SYNC_FILE_NAME       = 'dashboard-ks-data.json';
const KS_SYNC_FOLDER_NAME     = 'Dashboard K-S';
const KS_SYNC_INTERVAL_MS     = 60000; // automatická synchronizace jednou za minutu, pokud se něco změnilo

// Přesně adresa, kterou máme zaregistrovanou jako "Redirect URI" u Google/Microsoft/Dropbox.
// Sem se prohlížeč vrátí po přihlášení — proto to musí být přesně tahle adresa.
const KS_OAUTH_REDIRECT_URI = 'https://bohemianworms.com/KS/';

const GOOGLE_CLIENT_ID   = '590854974762-t377le81vrh8ak3bee3oqgbbm94vk12o.apps.googleusercontent.com';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const KS_GDRIVE_TOKEN_KEY     = 'ks-gdrive-token';
const KS_GDRIVE_FILEID_KEY    = 'ks-gdrive-fileid';
const KS_GDRIVE_FOLDERID_KEY  = 'ks-gdrive-folderid';

const ONEDRIVE_CLIENT_ID = 'a55cd114-eaa7-489b-ace5-04919491ae0b';
const ONEDRIVE_SCOPE     = 'Files.ReadWrite offline_access User.Read';
const KS_ONEDRIVE_TOKEN_KEY = 'ks-onedrive-token'; // { accessToken, refreshToken, expires }

const DROPBOX_CLIENT_ID  = '6c2335rtwsutxku';
const KS_DROPBOX_TOKEN_KEY = 'ks-dropbox-token'; // { accessToken, refreshToken, expires }

let ksDriveTokenClient = null;
let ksSyncTimer = null;
let ksSyncInProgress = false;

// ── SBALENÍ / ROZBALENÍ DAT ──
const KS_SYNC_EXCLUDE_KEYS = new Set([
  KS_STORAGE_PROVIDER_KEY, KS_LAST_SYNC_HASH_KEY, 'ks-onboarding-done',
  KS_GDRIVE_TOKEN_KEY, KS_GDRIVE_FILEID_KEY, KS_GDRIVE_FOLDERID_KEY,
  KS_ONEDRIVE_TOKEN_KEY, KS_DROPBOX_TOKEN_KEY,
  'ks-auth-webauthn-id', // otisk prstu je vázaný na konkrétní zařízení, nesynchronizuje se
]);

function ksCollectAllData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('ks-')) continue;
    if (KS_SYNC_EXCLUDE_KEYS.has(key)) continue;
    data[key] = localStorage.getItem(key);
  }
  return data;
}

function ksApplyAllData(data) {
  if (!data || typeof data !== 'object') return;
  Object.entries(data).forEach(([key, value]) => {
    if (!key.startsWith('ks-') || KS_SYNC_EXCLUDE_KEYS.has(key)) return;
    try { localStorage.setItem(key, value); } catch (e) { console.warn('[cloud-sync] Nepodařilo se uložit', key, e); }
  });
}

function ksHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return String(h);
}

// ── STAV PŘIPOJENÍ ──
function ksGetStorageProvider() {
  try { return localStorage.getItem(KS_STORAGE_PROVIDER_KEY) || null; } catch { return null; }
}
function ksSetStorageProvider(provider) {
  try { localStorage.setItem(KS_STORAGE_PROVIDER_KEY, provider); } catch {}
}
function ksIsCloudConnected() {
  const provider = ksGetStorageProvider();
  if (provider === 'gdrive') return !!ksLoadDriveToken();
  if (provider === 'onedrive') return !!ksLoadGenericToken(KS_ONEDRIVE_TOKEN_KEY);
  if (provider === 'dropbox') return !!ksLoadGenericToken(KS_DROPBOX_TOKEN_KEY);
  return false;
}

// ══════════════════════════════════════════════
//  SPOLEČNÉ POMOCNÉ FUNKCE PRO PKCE PŘIHLÁŠENÍ
//  (používá OneDrive i Dropbox — Google má vlastní, jednodušší systém přes Google Identity Services)
// ══════════════════════════════════════════════

function ksPkceVerifier() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function ksPkceChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function ksLoadGenericToken(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { accessToken, expires } = JSON.parse(raw);
    if (Date.now() > expires) return null;
    return accessToken;
  } catch { return null; }
}

// Otevře přihlašovací okno (popup) a čeká, až appka dostane přihlašovací kód.
function ksOpenOAuthPopup(authUrl, expectedState) {
  return new Promise((resolve, reject) => {
    const popup = window.open(authUrl, 'ks_oauth_' + expectedState, 'width=500,height=650');
    if (!popup) { reject(new Error('popup blocked')); return; }

    let settled = false;
    function onMessage(e) {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.ksOAuthState !== expectedState) return;
      window.removeEventListener('message', onMessage);
      settled = true;
      if (e.data.ksOAuthCode) resolve(e.data.ksOAuthCode);
      else reject(new Error(e.data.ksOAuthError || 'přihlášení zrušeno'));
    }
    window.addEventListener('message', onMessage);

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        if (!settled) { window.removeEventListener('message', onMessage); reject(new Error('okno zavřeno')); }
      }
    }, 500);
  });
}

// Pokud je tahle stránka ve skutečnosti to malé přihlašovací popup okno (má "opener"
// a v adrese je "?code=..."), pošle kód zpátky do hlavního okna a zavře se.
(function ksHandleOAuthPopupReturn() {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    if (window.opener && (code || error)) {
      window.opener.postMessage({ ksOAuthState: state, ksOAuthCode: code, ksOAuthError: error }, window.location.origin);
      window.close();
    }
  } catch (e) {}
})();

// ══════════════════════════════════════════════
//  GOOGLE DRIVE
// ══════════════════════════════════════════════

function ksLoadDriveToken() {
  try {
    const raw = localStorage.getItem(KS_GDRIVE_TOKEN_KEY);
    if (!raw) return null;
    const { token, expires } = JSON.parse(raw);
    if (Date.now() > expires) return null;
    return token;
  } catch { return null; }
}

function ksInitDriveTokenClient(onReady) {
  if (typeof google === 'undefined' || !google.accounts) {
    setTimeout(() => ksInitDriveTokenClient(onReady), 300);
    return;
  }
  ksDriveTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_DRIVE_SCOPE,
    callback: (resp) => {
      if (resp.error) {
        console.warn('[cloud-sync] Přihlášení ke Google Drive selhalo', resp);
        if (onReady) onReady(false);
        return;
      }
      const expires = Date.now() + (resp.expires_in * 1000) - 60000;
      try { localStorage.setItem(KS_GDRIVE_TOKEN_KEY, JSON.stringify({ token: resp.access_token, expires })); } catch {}
      if (onReady) onReady(true);
    },
  });
}

function ksConnectGoogleDrive(callback) {
  ksInitDriveTokenClient((ok) => {
    if (!ok) { if (callback) callback(false); return; }
    ksSetStorageProvider('gdrive');
    ksDriveFindOrCreateFile((fileOk) => {
      if (callback) callback(fileOk);
      if (fileOk) ksStartAutoSync();
    });
  });
  ksDriveTokenClient.requestAccessToken({ prompt: 'consent' });
}

function ksDriveFindOrCreateFolder(callback) {
  const token = ksLoadDriveToken();
  if (!token) { callback(null); return; }

  const cachedId = (() => { try { return localStorage.getItem(KS_GDRIVE_FOLDERID_KEY); } catch { return null; } })();
  if (cachedId) { callback(cachedId); return; }

  const query = encodeURIComponent(
    `name='${KS_SYNC_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => r.json())
    .then(data => {
      if (data.files && data.files.length) {
        try { localStorage.setItem(KS_GDRIVE_FOLDERID_KEY, data.files[0].id); } catch {}
        callback(data.files[0].id);
      } else {
        fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: KS_SYNC_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
        })
          .then(r => r.json())
          .then(folder => {
            if (folder.id) {
              try { localStorage.setItem(KS_GDRIVE_FOLDERID_KEY, folder.id); } catch {}
              callback(folder.id);
            } else {
              console.warn('[cloud-sync] Nepodařilo se vytvořit složku na Drive', folder);
              callback(null);
            }
          })
          .catch(e => { console.warn('[cloud-sync] Chyba při vytváření složky na Drive', e); callback(null); });
      }
    })
    .catch(e => { console.warn('[cloud-sync] Chyba při hledání složky na Drive', e); callback(null); });
}

function ksDriveFindOrCreateFile(callback) {
  const token = ksLoadDriveToken();
  if (!token) { callback(false); return; }

  const cachedId = (() => { try { return localStorage.getItem(KS_GDRIVE_FILEID_KEY); } catch { return null; } })();
  if (cachedId) { callback(true); return; }

  ksDriveFindOrCreateFolder((folderId) => {
    if (!folderId) { callback(false); return; }

    const query = encodeURIComponent(`name='${KS_SYNC_FILE_NAME}' and trashed=false and '${folderId}' in parents`);
    fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.files && data.files.length) {
          try { localStorage.setItem(KS_GDRIVE_FILEID_KEY, data.files[0].id); } catch {}
          ksDriveDownload(() => callback(true));
        } else {
          ksDriveCreateFile(folderId, callback);
        }
      })
      .catch(e => { console.warn('[cloud-sync] Chyba při hledání souboru na Drive', e); callback(false); });
  });
}

function ksDriveCreateFile(folderId, callback) {
  const token = ksLoadDriveToken();
  if (!token) { callback(false); return; }

  const metadata = { name: KS_SYNC_FILE_NAME, mimeType: 'application/json', parents: [folderId] };
  const content = JSON.stringify(ksCollectAllData());
  const boundary = 'ks_boundary_' + Date.now();
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;

  fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
    .then(r => r.json())
    .then(data => {
      if (data.id) {
        try { localStorage.setItem(KS_GDRIVE_FILEID_KEY, data.id); } catch {}
        try { localStorage.setItem(KS_LAST_SYNC_HASH_KEY, ksHash(content)); } catch {}
        callback(true);
      } else {
        console.warn('[cloud-sync] Nepodařilo se vytvořit soubor na Drive', data);
        callback(false);
      }
    })
    .catch(e => { console.warn('[cloud-sync] Chyba při vytváření souboru na Drive', e); callback(false); });
}

function ksDriveUpload(callback) {
  const token = ksLoadDriveToken();
  const fileId = (() => { try { return localStorage.getItem(KS_GDRIVE_FILEID_KEY); } catch { return null; } })();
  if (!token || !fileId) { if (callback) callback(false); return; }

  const content = JSON.stringify(ksCollectAllData());
  const hash = ksHash(content);
  const lastHash = (() => { try { return localStorage.getItem(KS_LAST_SYNC_HASH_KEY); } catch { return null; } })();
  if (hash === lastHash) { if (callback) callback(true); return; }

  fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: content,
  })
    .then(r => {
      if (r.ok) {
        try { localStorage.setItem(KS_LAST_SYNC_HASH_KEY, hash); } catch {}
        if (callback) callback(true);
      } else {
        if (callback) callback(false);
      }
    })
    .catch(e => { console.warn('[cloud-sync] Chyba při nahrávání na Drive', e); if (callback) callback(false); });
}

function ksDriveDownload(callback) {
  const token = ksLoadDriveToken();
  const fileId = (() => { try { return localStorage.getItem(KS_GDRIVE_FILEID_KEY); } catch { return null; } })();
  if (!token || !fileId) { if (callback) callback(false); return; }

  fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data) {
        ksApplyAllData(data);
        try { localStorage.setItem(KS_LAST_SYNC_HASH_KEY, ksHash(JSON.stringify(data))); } catch {}
        if (callback) callback(true);
      } else {
        if (callback) callback(false);
      }
    })
    .catch(e => { console.warn('[cloud-sync] Chyba při stahování z Drive', e); if (callback) callback(false); });
}

// ══════════════════════════════════════════════
//  ONEDRIVE (Microsoft Graph)
// ══════════════════════════════════════════════

function ksOneDriveGetAccessToken() {
  return ksLoadGenericToken(KS_ONEDRIVE_TOKEN_KEY);
}

async function ksOneDriveRefreshIfNeeded() {
  const token = ksOneDriveGetAccessToken();
  if (token) return token;
  let saved;
  try { saved = JSON.parse(localStorage.getItem(KS_ONEDRIVE_TOKEN_KEY) || 'null'); } catch { saved = null; }
  if (!saved || !saved.refreshToken) return null;

  const body = new URLSearchParams({
    client_id: ONEDRIVE_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: saved.refreshToken,
    scope: ONEDRIVE_SCOPE,
  });
  try {
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    const data = await res.json();
    if (!data.access_token) return null;
    const expires = Date.now() + (data.expires_in * 1000) - 60000;
    const record = { accessToken: data.access_token, refreshToken: data.refresh_token || saved.refreshToken, expires };
    localStorage.setItem(KS_ONEDRIVE_TOKEN_KEY, JSON.stringify(record));
    return data.access_token;
  } catch (e) {
    console.warn('[cloud-sync] Obnovení OneDrive přihlášení selhalo', e);
    return null;
  }
}

async function ksConnectOneDrive(callback) {
  try {
    const verifier = ksPkceVerifier();
    const challenge = await ksPkceChallenge(verifier);
    const authUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' + new URLSearchParams({
      client_id: ONEDRIVE_CLIENT_ID,
      response_type: 'code',
      redirect_uri: KS_OAUTH_REDIRECT_URI,
      response_mode: 'query',
      scope: ONEDRIVE_SCOPE,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'onedrive',
    }).toString();

    const code = await ksOpenOAuthPopup(authUrl, 'onedrive');

    const tokenBody = new URLSearchParams({
      client_id: ONEDRIVE_CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: KS_OAUTH_REDIRECT_URI,
      code_verifier: verifier,
      scope: ONEDRIVE_SCOPE,
    });
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody,
    });
    const data = await res.json();
    if (!data.access_token) { console.warn('[cloud-sync] OneDrive token selhal', data); if (callback) callback(false); return; }

    const expires = Date.now() + (data.expires_in * 1000) - 60000;
    localStorage.setItem(KS_ONEDRIVE_TOKEN_KEY, JSON.stringify({
      accessToken: data.access_token, refreshToken: data.refresh_token, expires,
    }));
    ksSetStorageProvider('onedrive');

    ksOneDriveUpload(() => {
      if (callback) callback(true);
      ksStartAutoSync();
    });
  } catch (e) {
    console.warn('[cloud-sync] Přihlášení k OneDrive selhalo', e);
    if (callback) callback(false);
  }
}

function ksOneDrivePath() {
  return encodeURIComponent(`${KS_SYNC_FOLDER_NAME}/${KS_SYNC_FILE_NAME}`);
}

async function ksOneDriveUpload(callback) {
  const token = await ksOneDriveRefreshIfNeeded();
  if (!token) { if (callback) callback(false); return; }

  const content = JSON.stringify(ksCollectAllData());
  const hash = ksHash(content);
  const lastHash = (() => { try { return localStorage.getItem(KS_LAST_SYNC_HASH_KEY); } catch { return null; } })();
  if (hash === lastHash) { if (callback) callback(true); return; }

  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${ksOneDrivePath()}:/content`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: content,
    });
    if (res.ok) {
      try { localStorage.setItem(KS_LAST_SYNC_HASH_KEY, hash); } catch {}
      if (callback) callback(true);
    } else {
      if (callback) callback(false);
    }
  } catch (e) {
    console.warn('[cloud-sync] Chyba při nahrávání na OneDrive', e);
    if (callback) callback(false);
  }
}

async function ksOneDriveDownload(callback) {
  const token = await ksOneDriveRefreshIfNeeded();
  if (!token) { if (callback) callback(false); return; }

  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${ksOneDrivePath()}:/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { if (callback) callback(false); return; }
    const data = await res.json();
    ksApplyAllData(data);
    try { localStorage.setItem(KS_LAST_SYNC_HASH_KEY, ksHash(JSON.stringify(data))); } catch {}
    if (callback) callback(true);
  } catch (e) {
    console.warn('[cloud-sync] Chyba při stahování z OneDrive', e);
    if (callback) callback(false);
  }
}

// ══════════════════════════════════════════════
//  DROPBOX
// ══════════════════════════════════════════════

function ksDropboxGetAccessToken() {
  return ksLoadGenericToken(KS_DROPBOX_TOKEN_KEY);
}

async function ksDropboxRefreshIfNeeded() {
  const token = ksDropboxGetAccessToken();
  if (token) return token;
  let saved;
  try { saved = JSON.parse(localStorage.getItem(KS_DROPBOX_TOKEN_KEY) || 'null'); } catch { saved = null; }
  if (!saved || !saved.refreshToken) return null;

  const body = new URLSearchParams({
    client_id: DROPBOX_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: saved.refreshToken,
  });
  try {
    const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    const data = await res.json();
    if (!data.access_token) return null;
    const expires = Date.now() + (data.expires_in * 1000) - 60000;
    const record = { accessToken: data.access_token, refreshToken: saved.refreshToken, expires };
    localStorage.setItem(KS_DROPBOX_TOKEN_KEY, JSON.stringify(record));
    return data.access_token;
  } catch (e) {
    console.warn('[cloud-sync] Obnovení Dropbox přihlášení selhalo', e);
    return null;
  }
}

async function ksConnectDropbox(callback) {
  try {
    const verifier = ksPkceVerifier();
    const challenge = await ksPkceChallenge(verifier);
    const authUrl = 'https://www.dropbox.com/oauth2/authorize?' + new URLSearchParams({
      client_id: DROPBOX_CLIENT_ID,
      response_type: 'code',
      redirect_uri: KS_OAUTH_REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      token_access_type: 'offline',
      state: 'dropbox',
    }).toString();

    const code = await ksOpenOAuthPopup(authUrl, 'dropbox');

    const tokenBody = new URLSearchParams({
      client_id: DROPBOX_CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: KS_OAUTH_REDIRECT_URI,
      code_verifier: verifier,
    });
    const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody,
    });
    const data = await res.json();
    if (!data.access_token) { console.warn('[cloud-sync] Dropbox token selhal', data); if (callback) callback(false); return; }

    const expires = Date.now() + (data.expires_in * 1000) - 60000;
    localStorage.setItem(KS_DROPBOX_TOKEN_KEY, JSON.stringify({
      accessToken: data.access_token, refreshToken: data.refresh_token, expires,
    }));
    ksSetStorageProvider('dropbox');

    ksDropboxUpload(() => {
      if (callback) callback(true);
      ksStartAutoSync();
    });
  } catch (e) {
    console.warn('[cloud-sync] Přihlášení k Dropboxu selhalo', e);
    if (callback) callback(false);
  }
}

async function ksDropboxUpload(callback) {
  const token = await ksDropboxRefreshIfNeeded();
  if (!token) { if (callback) callback(false); return; }

  const content = JSON.stringify(ksCollectAllData());
  const hash = ksHash(content);
  const lastHash = (() => { try { return localStorage.getItem(KS_LAST_SYNC_HASH_KEY); } catch { return null; } })();
  if (hash === lastHash) { if (callback) callback(true); return; }

  try {
    const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path: `/${KS_SYNC_FILE_NAME}`, mode: 'overwrite' }),
      },
      body: content,
    });
    if (res.ok) {
      try { localStorage.setItem(KS_LAST_SYNC_HASH_KEY, hash); } catch {}
      if (callback) callback(true);
    } else {
      if (callback) callback(false);
    }
  } catch (e) {
    console.warn('[cloud-sync] Chyba při nahrávání na Dropbox', e);
    if (callback) callback(false);
  }
}

async function ksDropboxDownload(callback) {
  const token = await ksDropboxRefreshIfNeeded();
  if (!token) { if (callback) callback(false); return; }

  try {
    const res = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ path: `/${KS_SYNC_FILE_NAME}` }),
      },
    });
    if (!res.ok) { if (callback) callback(false); return; }
    const data = await res.json();
    ksApplyAllData(data);
    try { localStorage.setItem(KS_LAST_SYNC_HASH_KEY, ksHash(JSON.stringify(data))); } catch {}
    if (callback) callback(true);
  } catch (e) {
    console.warn('[cloud-sync] Chyba při stahování z Dropboxu', e);
    if (callback) callback(false);
  }
}

// ══════════════════════════════════════════════
//  ODPOJENÍ
// ══════════════════════════════════════════════

function ksDisconnectStorage() {
  const provider = ksGetStorageProvider();
  if (provider === 'gdrive') {
    const token = ksLoadDriveToken();
    if (token && typeof google !== 'undefined' && google.accounts) {
      google.accounts.oauth2.revoke(token, () => {});
    }
    try {
      localStorage.removeItem(KS_GDRIVE_TOKEN_KEY);
      localStorage.removeItem(KS_GDRIVE_FILEID_KEY);
      localStorage.removeItem(KS_GDRIVE_FOLDERID_KEY);
    } catch {}
  } else if (provider === 'onedrive') {
    try { localStorage.removeItem(KS_ONEDRIVE_TOKEN_KEY); } catch {}
  } else if (provider === 'dropbox') {
    try { localStorage.removeItem(KS_DROPBOX_TOKEN_KEY); } catch {}
  }
  try { localStorage.removeItem(KS_STORAGE_PROVIDER_KEY); } catch {}
  ksStopAutoSync();
}

// ══════════════════════════════════════════════
//  OBECNÝ ORCHESTRÁTOR
// ══════════════════════════════════════════════

function ksSyncNow(callback) {
  if (ksSyncInProgress) { if (callback) callback(false); return; }
  const provider = ksGetStorageProvider();
  ksSyncInProgress = true;
  const done = (ok) => { ksSyncInProgress = false; if (callback) callback(ok); };
  if (provider === 'gdrive') ksDriveUpload(done);
  else if (provider === 'onedrive') ksOneDriveUpload(done);
  else if (provider === 'dropbox') ksDropboxUpload(done);
  else done(false);
}

function ksStartAutoSync() {
  ksStopAutoSync();
  ksSyncTimer = setInterval(() => ksSyncNow(), KS_SYNC_INTERVAL_MS);
  window.addEventListener('visibilitychange', ksHandleVisibilityChange);
}
function ksStopAutoSync() {
  if (ksSyncTimer) { clearInterval(ksSyncTimer); ksSyncTimer = null; }
  window.removeEventListener('visibilitychange', ksHandleVisibilityChange);
}
function ksHandleVisibilityChange() {
  if (document.visibilityState === 'hidden') ksSyncNow();
}

// ── INIT ──
function ksInitCloudSync() {
  const provider = ksGetStorageProvider();
  if (provider === 'gdrive' && ksLoadDriveToken()) {
    ksDriveDownload(() => { window.dispatchEvent(new CustomEvent('ks-cloud-sync-ready')); ksStartAutoSync(); });
  } else if (provider === 'onedrive' && ksIsCloudConnected()) {
    ksOneDriveDownload(() => { window.dispatchEvent(new CustomEvent('ks-cloud-sync-ready')); ksStartAutoSync(); });
  } else if (provider === 'dropbox' && ksIsCloudConnected()) {
    ksDropboxDownload(() => { window.dispatchEvent(new CustomEvent('ks-cloud-sync-ready')); ksStartAutoSync(); });
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ksInitCloudSync);
} else {
  ksInitCloudSync();
}
