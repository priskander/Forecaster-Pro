/**
 * FORECASTER PRO - GITHUB SYNC & CLOUD REPOSITORY ENGINE
 * Provides end-to-end encrypted push/pull sync to secret GitHub Gists or Repositories
 * using browser Web Crypto API (AES-256-GCM + PBKDF2-SHA256) and volatile session-only PATs.
 */
(function() {
  'use strict';

  const GITHUB_CONFIG_KEY = 'forecaster_github_sync_config';
  const DEFAULT_FILE_PATH = 'forecaster-data.json';
  const ENVELOPE_FORMAT = 'forecaster-pro-encrypted-snapshot';
  const ENVELOPE_VERSION = 1;
  const ENVELOPE_ALG = 'AES-256-GCM';
  const ENVELOPE_KDF = 'PBKDF2-SHA256';
  const DEFAULT_PBKDF2_ITERATIONS = 210000;
  const MIN_PBKDF2_ITERATIONS = 210000;
  const MAX_PBKDF2_ITERATIONS = 2000000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const MIN_CIPHERTEXT_BYTES = 16; // GCM tag size
  const MIN_PASSPHRASE_LENGTH = 10;
  const MAX_PASSPHRASE_LENGTH = 1024;

  const SECRET_CONFIG_KEYS = new Set([
    'token',
    'pat',
    'accesstoken',
    'access_token',
    'githubtoken',
    'github_token',
    'passphrase',
    'password',
    'secret',
    'encryptionkey',
    'encryption_key',
    'privatekey',
    'private_key',
    'apikey',
    'api_key',
    'key'
  ]);

  const DATASET_ARRAY_MAP = [
    ['transactions', 'pro_transactions', 'transactions'],
    ['stockData', 'pro_stock', 'stockData'],
    ['pharmacyData', 'pro_pharmacy', 'pharmacyData'],
    ['accounts', 'pro_accounts', 'accounts'],
    ['accountTransfers', 'pro_account_transfers', 'accountTransfers'],
    ['pro_vehicles', 'pro_vehicles', 'vehicles'],
    ['pro_vehicle_fuel', 'pro_vehicle_fuel', 'fuels'],
    ['pro_vehicle_maintenance', 'pro_vehicle_maintenance', 'maint'],
    ['pro_rental_contracts_v1', 'pro_rental_contracts_v1', null],
    ['pro_rental_properties_v1', 'pro_rental_properties_v1', null]
  ];

  // Volatile in-memory session storage ONLY (cleared on reload, logout, or Clear action).
  let volatileToken = '';

  function getWebCrypto() {
    const c = (typeof window !== 'undefined' && window.crypto)
      || (typeof globalThis !== 'undefined' && globalThis.crypto)
      || null;
    if (!c || !c.subtle || typeof c.getRandomValues !== 'function') {
      throw new Error('Web Crypto API (SubtleCrypto) is required for encryption and is unavailable in this environment.');
    }
    return c;
  }

  function isPlainObject(val) {
    return !!val && typeof val === 'object' && !Array.isArray(val);
  }

  function utf8ToBytes(str) {
    if (typeof str !== 'string') {
      throw new Error('Input must be a UTF-8 string.');
    }
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str);
    }
    throw new Error('TextEncoder is unavailable in this environment.');
  }

  function bytesToUtf8(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new Error('Input must be a Uint8Array.');
    }
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    throw new Error('TextDecoder is unavailable in this environment.');
  }

  function bytesToBase64(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new Error('Base64 encoding expects a Uint8Array.');
    }
    const encodeFn = (typeof btoa === 'function')
      ? btoa
      : (typeof window !== 'undefined' && typeof window.btoa === 'function' ? window.btoa : null);
    if (!encodeFn) {
      throw new Error('Base64 encoder (btoa) is unavailable in this environment.');
    }

    const CHUNK_SIZE = 0x8000;
    const chunks = [];
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const sub = bytes.subarray(i, i + CHUNK_SIZE);
      chunks.push(String.fromCharCode.apply(null, sub));
    }
    return encodeFn(chunks.join(''));
  }

  function base64ToBytes(input) {
    if (typeof input !== 'string') {
      throw new Error('Invalid base64 input: expected string.');
    }
    const stripped = input.replace(/\s+/g, '');
    if (!stripped) {
      throw new Error('Invalid base64 input: string is empty.');
    }

    // Reject characters outside standard/url base64 + optional trailing '=' padding
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(stripped)) {
      throw new Error('Invalid base64 input: contains illegal characters.');
    }
    if (stripped.includes('=')) {
      const firstPad = stripped.indexOf('=');
      if (firstPad < stripped.length - 2 || stripped.slice(firstPad).split('').some(ch => ch !== '=')) {
        throw new Error('Invalid base64 input: malformed padding.');
      }
    }

    let normalized = stripped.replace(/-/g, '+').replace(/_/g, '/');
    const mod = normalized.length % 4;
    if (mod === 1) {
      throw new Error('Invalid base64 input: invalid character length.');
    }
    if (mod === 2) normalized += '==';
    else if (mod === 3) normalized += '=';

    const decodeFn = (typeof atob === 'function')
      ? atob
      : (typeof window !== 'undefined' && typeof window.atob === 'function' ? window.atob : null);
    if (!decodeFn) {
      throw new Error('Base64 decoder (atob) is unavailable in this environment.');
    }

    let binaryStr;
    try {
      binaryStr = decodeFn(normalized);
    } catch (e) {
      throw new Error('Invalid base64 input: failed decoding.');
    }

    const out = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      out[i] = binaryStr.charCodeAt(i);
    }
    return out;
  }

  function utf8ToBase64(str) {
    return bytesToBase64(utf8ToBytes(str));
  }

  function base64ToUtf8(b64) {
    return bytesToUtf8(base64ToBytes(b64));
  }

  function parseOwnerFromRepo(repoStr) {
    if (typeof repoStr !== 'string') return '';
    const idx = repoStr.indexOf('/');
    return idx > 0 ? repoStr.slice(0, idx).trim() : '';
  }

  function sanitizeFilePath(pathStr) {
    if (typeof pathStr !== 'string') return DEFAULT_FILE_PATH;
    const trimmed = pathStr.trim().replace(/^\/+/, '');
    if (!trimmed || trimmed.includes('..') || /[\0\r\n?#]/.test(trimmed)) {
      return DEFAULT_FILE_PATH;
    }
    return trimmed;
  }

  function sanitizePersistentConfig(raw) {
    const src = isPlainObject(raw) ? raw : {};
    const repo = typeof src.repo === 'string' ? src.repo.trim() : '';
    const derivedOwner = parseOwnerFromRepo(repo);
    const owner = (typeof src.owner === 'string' && src.owner.trim()) ? src.owner.trim() : derivedOwner;
    return {
      mode: src.mode === 'repo' ? 'repo' : 'gist',
      gistId: typeof src.gistId === 'string' ? src.gistId.trim() : '',
      repo: repo,
      owner: owner,
      branch: (typeof src.branch === 'string' && src.branch.trim()) ? src.branch.trim() : 'main',
      filePath: sanitizeFilePath(src.filePath),
      lastSync: (typeof src.lastSync === 'string' && src.lastSync.trim()) ? src.lastSync.trim() : null,
      autoSync: !!src.autoSync
    };
  }

  function containsDisallowedKeys(obj) {
    if (!isPlainObject(obj)) return false;
    const allowed = new Set(['mode', 'gistId', 'repo', 'owner', 'branch', 'filePath', 'lastSync', 'autoSync']);
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (SECRET_CONFIG_KEYS.has(k.toLowerCase()) || !allowed.has(k)) {
        return true;
      }
    }
    return false;
  }

  function scrubLegacyStoredCredentials() {
    let rawStr = null;
    try {
      rawStr = localStorage.getItem(GITHUB_CONFIG_KEY);
    } catch (e) {
      return { scrubbed: false, config: sanitizePersistentConfig({}) };
    }
    if (!rawStr) {
      return { scrubbed: false, config: sanitizePersistentConfig({}) };
    }

    let parsed = null;
    try {
      parsed = JSON.parse(rawStr);
    } catch (e) {
      const cleanEmpty = sanitizePersistentConfig({});
      try {
        localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(cleanEmpty));
      } catch (_) {}
      return { scrubbed: true, config: cleanEmpty };
    }

    if (!isPlainObject(parsed)) {
      const cleanEmpty = sanitizePersistentConfig({});
      try {
        localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(cleanEmpty));
      } catch (_) {}
      return { scrubbed: true, config: cleanEmpty };
    }

    const sanitized = sanitizePersistentConfig(parsed);
    const hadDisallowed = containsDisallowedKeys(parsed);
    const sanitizedJson = JSON.stringify(sanitized);

    if (hadDisallowed || rawStr !== sanitizedJson) {
      try {
        localStorage.setItem(GITHUB_CONFIG_KEY, sanitizedJson);
      } catch (_) {}
    }

    return { scrubbed: hadDisallowed, config: sanitized };
  }

  function getStoredConfig() {
    return scrubLegacyStoredCredentials().config;
  }

  function saveStoredConfig(cfg) {
    const sanitized = sanitizePersistentConfig(cfg);
    localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(sanitized));
    return sanitized;
  }

  function clearDomSensitiveInputs() {
    if (typeof document === 'undefined') return;
    ['gh-sync-token', 'gh-sync-passphrase', 'gh-sync-passphrase-confirm'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  function setButtonLabel(btn, iconText, labelText) {
    if (!btn || typeof document === 'undefined') return;
    const iconSpan = document.createElement('span');
    iconSpan.textContent = iconText;
    const textNode = document.createTextNode(' ' + labelText);
    btn.replaceChildren(iconSpan, textNode);
  }

  function setSnapshotBanner(variant, message) {
    if (typeof document === 'undefined') return;
    const banner = document.getElementById('gh-sync-snapshot-banner');
    if (!banner) return;

    if (!variant || variant === 'hidden' || !message) {
      banner.className = 'hidden p-3 rounded-xl border text-xs font-semibold';
      banner.textContent = '';
      return;
    }

    if (variant === 'encrypted') {
      banner.className = 'p-3 rounded-xl border text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200';
    } else if (variant === 'legacy') {
      banner.className = 'p-3 rounded-xl border text-xs font-semibold bg-amber-50 dark:bg-amber-950/35 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200';
    } else {
      banner.className = 'p-3 rounded-xl border text-xs font-semibold bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200';
    }
    banner.textContent = String(message);
  }

  function validatePassphrase(passphrase, confirmPassphrase) {
    if (typeof passphrase !== 'string' || passphrase.trim().length === 0) {
      return { ok: false, error: 'Encryption passphrase is required and cannot be blank.' };
    }
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      return {
        ok: false,
        error: `Encryption passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters long.`
      };
    }
    if (passphrase.length > MAX_PASSPHRASE_LENGTH) {
      return {
        ok: false,
        error: `Encryption passphrase must not exceed ${MAX_PASSPHRASE_LENGTH} characters.`
      };
    }
    const lower = passphrase.trim().toLowerCase();
    if (/^(.)\1+$/.test(passphrase.trim()) ||
        lower === 'password123' ||
        lower === '1234567890' ||
        lower === 'qwertyuiop' ||
        lower === 'letmein123') {
      return { ok: false, error: 'Encryption passphrase is too weak or predictable. Choose a stronger passphrase.' };
    }

    let classes = 0;
    if (/[a-z]/.test(passphrase)) classes++;
    if (/[A-Z]/.test(passphrase)) classes++;
    if (/[0-9]/.test(passphrase)) classes++;
    if (/[^a-zA-Z0-9\s]/.test(passphrase)) classes++;

    const meetsStrength = classes >= 3 || (passphrase.length >= 14 && classes >= 2);
    if (!meetsStrength) {
      return {
        ok: false,
        error: 'Encryption passphrase must include at least 3 character types (uppercase, lowercase, number, symbol) or be at least 14 characters with 2+ types.'
      };
    }

    if (confirmPassphrase !== undefined && passphrase !== confirmPassphrase) {
      return { ok: false, error: 'Encryption passphrases do not match. Please confirm your passphrase.' };
    }

    return { ok: true };
  }

  async function deriveAesGcmKey(passphrase, saltBytes, iterations, usages) {
    const c = getWebCrypto();
    const passBytes = utf8ToBytes(passphrase);
    const keyMaterial = await c.subtle.importKey(
      'raw',
      passBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return c.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      usages
    );
  }

  async function encryptSnapshotPayload(payloadObj, passphrase) {
    if (!isPlainObject(payloadObj)) {
      throw new Error('Snapshot payload must be a JSON object.');
    }
    const policy = validatePassphrase(passphrase);
    if (!policy.ok) {
      throw new Error(policy.error);
    }

    const c = getWebCrypto();
    const salt = new Uint8Array(SALT_BYTES);
    const iv = new Uint8Array(IV_BYTES);
    c.getRandomValues(salt);
    c.getRandomValues(iv);

    const plaintextStr = JSON.stringify(payloadObj);
    const plaintextBytes = utf8ToBytes(plaintextStr);
    const aesKey = await deriveAesGcmKey(passphrase, salt, DEFAULT_PBKDF2_ITERATIONS, ['encrypt']);

    const cipherBuffer = await c.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128
      },
      aesKey,
      plaintextBytes
    );

    return {
      encrypted: true,
      format: ENVELOPE_FORMAT,
      version: ENVELOPE_VERSION,
      alg: ENVELOPE_ALG,
      kdf: ENVELOPE_KDF,
      iterations: DEFAULT_PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(cipherBuffer))
    };
  }

  function isEncryptedEnvelope(obj) {
    if (!isPlainObject(obj)) return false;
    return obj.encrypted === true ||
      obj.format === ENVELOPE_FORMAT ||
      (typeof obj.ciphertext === 'string' && typeof obj.iv === 'string' && typeof obj.salt === 'string');
  }

  function validateEncryptedEnvelope(envelope) {
    if (!isPlainObject(envelope)) {
      throw new Error('Invalid encrypted envelope: expected object.');
    }
    if (envelope.encrypted !== true) {
      throw new Error('Invalid encrypted envelope: encrypted flag must be true.');
    }
    if (envelope.format !== ENVELOPE_FORMAT) {
      throw new Error(`Unsupported encrypted snapshot format: ${String(envelope.format || 'unknown')}`);
    }
    if (envelope.version !== ENVELOPE_VERSION) {
      throw new Error(`Unsupported encrypted snapshot version: ${String(envelope.version)}`);
    }
    if (envelope.alg !== ENVELOPE_ALG) {
      throw new Error(`Unsupported encryption algorithm: ${String(envelope.alg || 'unknown')}`);
    }
    if (envelope.kdf !== ENVELOPE_KDF) {
      throw new Error(`Unsupported key derivation function: ${String(envelope.kdf || 'unknown')}`);
    }
    if (!Number.isInteger(envelope.iterations) ||
        envelope.iterations < MIN_PBKDF2_ITERATIONS ||
        envelope.iterations > MAX_PBKDF2_ITERATIONS) {
      throw new Error(`Invalid PBKDF2 iteration count: expected ${MIN_PBKDF2_ITERATIONS}-${MAX_PBKDF2_ITERATIONS}.`);
    }

    const saltBytes = base64ToBytes(envelope.salt);
    if (saltBytes.length < SALT_BYTES || saltBytes.length > 64) {
      throw new Error(`Invalid encrypted envelope salt length (${saltBytes.length} bytes).`);
    }

    const ivBytes = base64ToBytes(envelope.iv);
    if (ivBytes.length !== IV_BYTES) {
      throw new Error(`Invalid encrypted envelope IV length (${ivBytes.length} bytes; expected ${IV_BYTES}).`);
    }

    const cipherBytes = base64ToBytes(envelope.ciphertext);
    if (cipherBytes.length < MIN_CIPHERTEXT_BYTES) {
      throw new Error('Invalid encrypted envelope ciphertext: payload is truncated.');
    }

    return { saltBytes, ivBytes, cipherBytes, iterations: envelope.iterations };
  }

  async function decryptSnapshotEnvelope(envelope, passphrase) {
    const validated = validateEncryptedEnvelope(envelope);
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      throw new Error('Decryption passphrase is required to unlock this encrypted snapshot.');
    }

    const c = getWebCrypto();
    const aesKey = await deriveAesGcmKey(
      passphrase,
      validated.saltBytes,
      validated.iterations,
      ['decrypt']
    );

    let plainBuffer;
    try {
      plainBuffer = await c.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: validated.ivBytes,
          tagLength: 128
        },
        aesKey,
        validated.cipherBytes
      );
    } catch (e) {
      throw new Error('Decryption failed: incorrect passphrase or modified/corrupted ciphertext.');
    }

    let plainStr;
    try {
      plainStr = bytesToUtf8(new Uint8Array(plainBuffer));
    } catch (e) {
      throw new Error('Decrypted data failed UTF-8 validation.');
    }

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(plainStr);
    } catch (e) {
      throw new Error('Decrypted snapshot content is not valid JSON.');
    }

    return validateSnapshotPayload(parsedPayload);
  }

  function validateSnapshotPayload(payload) {
    if (!isPlainObject(payload)) {
      throw new Error('Invalid snapshot payload: expected JSON object.');
    }
    if (isEncryptedEnvelope(payload)) {
      throw new Error('Invalid snapshot payload: nested encrypted envelope cannot be applied directly.');
    }

    let recognizedFields = 0;
    for (let i = 0; i < DATASET_ARRAY_MAP.length; i++) {
      const payloadKey = DATASET_ARRAY_MAP[i][0];
      if (Object.prototype.hasOwnProperty.call(payload, payloadKey) && payload[payloadKey] !== undefined) {
        if (!Array.isArray(payload[payloadKey])) {
          throw new Error(`Invalid snapshot schema: "${payloadKey}" must be an array.`);
        }
        recognizedFields++;
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'budgetLimits') && payload.budgetLimits !== undefined) {
      if (payload.budgetLimits !== null && !isPlainObject(payload.budgetLimits)) {
        throw new Error('Invalid snapshot schema: "budgetLimits" must be an object or null.');
      }
      recognizedFields++;
    }

    if (recognizedFields === 0) {
      throw new Error('Invalid snapshot payload: missing recognized Forecaster Pro dataset collections.');
    }

    // Build sanitized payload excluding profile PII or any credential keys
    const sanitized = {
      version: typeof payload.version === 'string' ? payload.version : 'ForecasterPro-snapshot',
      exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : null
    };
    for (let i = 0; i < DATASET_ARRAY_MAP.length; i++) {
      const payloadKey = DATASET_ARRAY_MAP[i][0];
      if (Array.isArray(payload[payloadKey])) {
        sanitized[payloadKey] = payload[payloadKey];
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'budgetLimits')) {
      sanitized.budgetLimits = payload.budgetLimits;
    }

    return sanitized;
  }

  function validateGitHubTarget(cfg) {
    if (cfg.mode === 'repo') {
      if (!cfg.repo || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(cfg.repo)) {
        throw new Error('Valid GitHub repository (owner/repo) is required.');
      }
      if (!cfg.branch || /[\r\n?#]/.test(cfg.branch)) {
        throw new Error('Invalid GitHub branch name.');
      }
    } else if (cfg.gistId && !/^[A-Za-z0-9_-]+$/.test(cfg.gistId)) {
      throw new Error('Invalid GitHub Gist ID format.');
    }
  }

  async function requestLegacyConfirmation(options) {
    const warningMessage =
      'WARNING: This GitHub snapshot is in legacy plaintext format and is NOT end-to-end encrypted. ' +
      'Your local workspace data will be replaced by this imported data, and the remote GitHub file will remain unmodified. ' +
      'Do you want to proceed with importing this unencrypted legacy snapshot?';

    if (options && typeof options.confirmLegacyImport === 'function') {
      return !!(await options.confirmLegacyImport({ encrypted: false, warning: warningMessage }));
    }
    if (options && options.confirmLegacy === true) {
      return true;
    }
    if (typeof window !== 'undefined' && window.ForecasterAuth && typeof window.ForecasterAuth.showAdminConfirm === 'function') {
      return !!(await window.ForecasterAuth.showAdminConfirm(
        'Unencrypted Legacy Snapshot Warning',
        warningMessage,
        'Import Unencrypted Snapshot',
        true
      ));
    }
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      return !!window.confirm(warningMessage);
    }
    return false;
  }

  // Scrub any legacy stored PAT immediately upon script initialization
  scrubLegacyStoredCredentials();

  window.ForecasterGitHubSync = {
    CONFIG_KEY: GITHUB_CONFIG_KEY,
    ENVELOPE_FORMAT: ENVELOPE_FORMAT,
    ENVELOPE_VERSION: ENVELOPE_VERSION,
    PBKDF2_ITERATIONS: DEFAULT_PBKDF2_ITERATIONS,
    MIN_PASSPHRASE_LENGTH: MIN_PASSPHRASE_LENGTH,
    _lastError: null,
    _lastSnapshotStatus: null,

    // Pure helpers exposed for verification and interoperability
    crypto: {
      utf8ToBytes,
      bytesToUtf8,
      bytesToBase64,
      base64ToBytes,
      utf8ToBase64,
      base64ToUtf8,
      validatePassphrase,
      encryptSnapshotPayload,
      isEncryptedEnvelope,
      validateEncryptedEnvelope,
      decryptSnapshotEnvelope,
      validateSnapshotPayload
    },

    scrubLegacyStoredCredentials: function() {
      return scrubLegacyStoredCredentials();
    },

    hasSessionToken: function() {
      return Boolean(volatileToken && volatileToken.trim().length > 0);
    },

    setSessionToken: function(token) {
      if (typeof token === 'string' && token.trim().length > 0) {
        volatileToken = token.trim();
      }
      this.updateUI();
      return this.hasSessionToken();
    },

    clearCredentials: function(options) {
      volatileToken = '';
      clearDomSensitiveInputs();
      scrubLegacyStoredCredentials();
      setSnapshotBanner('hidden', '');
      this._lastError = null;
      this.updateUI();

      if ((!options || !options.silent) && typeof window.triggerToast === 'function') {
        window.triggerToast('GitHub session credentials cleared from volatile memory.', 'info');
      }
      return true;
    },

    getConfig: function() {
      const clean = getStoredConfig();
      return Object.assign({}, clean, {
        hasSessionToken: this.hasSessionToken()
      });
    },

    exportSettings: function() {
      const clean = getStoredConfig();
      return {
        format: 'forecaster-pro-github-settings',
        exportedAt: new Date().toISOString(),
        settings: clean
      };
    },

    saveConfig: function(cfg) {
      const src = isPlainObject(cfg) ? cfg : {};
      // Accept volatile PAT in memory only if explicitly provided; NEVER store to localStorage or return it
      if (typeof src.token === 'string' && src.token.trim().length > 0) {
        volatileToken = src.token.trim();
      }
      const current = getStoredConfig();
      const nextRepo = typeof src.repo === 'string' ? src.repo.trim() : current.repo;
      const mergedInput = Object.assign({}, current, src);
      if (typeof src.repo === 'string' && nextRepo !== current.repo && typeof src.owner !== 'string') {
        mergedInput.owner = parseOwnerFromRepo(nextRepo);
      }
      const merged = sanitizePersistentConfig(mergedInput);
      saveStoredConfig(merged);
      this.updateUI();
      return Object.assign({}, merged, {
        hasSessionToken: this.hasSessionToken()
      });
    },

    populateForm: function() {
      const cfg = this.getConfig();
      const tokenInput = document.getElementById('gh-sync-token');
      const passInput = document.getElementById('gh-sync-passphrase');
      const passConfirmInput = document.getElementById('gh-sync-passphrase-confirm');
      const modeSelect = document.getElementById('gh-sync-mode');
      const gistInput = document.getElementById('gh-sync-gist-id');
      const repoInput = document.getElementById('gh-sync-repo');
      const branchInput = document.getElementById('gh-sync-branch');
      const autoSyncCheck = document.getElementById('gh-sync-autosync');

      // Never repopulate credential or passphrase inputs with secrets
      if (tokenInput) {
        tokenInput.value = '';
        tokenInput.placeholder = this.hasSessionToken()
          ? 'Session PAT loaded in memory (enter only to replace)'
          : 'ghp_xxxxxxxxxxxxxxxxxxxx';
      }
      if (passInput) passInput.value = '';
      if (passConfirmInput) passConfirmInput.value = '';
      if (modeSelect) {
        modeSelect.value = cfg.mode || 'gist';
        this.toggleModeFields(cfg.mode || 'gist');
      }
      if (gistInput) gistInput.value = cfg.gistId || '';
      if (repoInput) repoInput.value = cfg.repo || '';
      if (branchInput) branchInput.value = cfg.branch || 'main';
      if (autoSyncCheck) autoSyncCheck.checked = !!cfg.autoSync;

      this.updateUI();
    },

    openModal: function() {
      this.populateForm();
      if (window.ForecasterAuth && typeof window.ForecasterAuth.openMainAdminPanel === 'function') {
        window.ForecasterAuth.openMainAdminPanel('sync');
      }
    },

    closeModal: function() {
      const modal = document.getElementById('github-sync-modal');
      if (modal) modal.classList.add('hidden');
    },

    toggleModeFields: function(mode) {
      const gistWrap = document.getElementById('gh-sync-gist-wrap');
      const repoWrap = document.getElementById('gh-sync-repo-wrap');
      if (gistWrap) gistWrap.classList.toggle('hidden', mode !== 'gist');
      if (repoWrap) repoWrap.classList.toggle('hidden', mode !== 'repo');
    },

    updateUI: function() {
      const cfg = this.getConfig();
      const statusEl = document.getElementById('gh-sync-status-badge');
      const lastSyncEl = document.getElementById('gh-sync-last-time');
      const tokenStatusEl = document.getElementById('gh-sync-token-status');
      const tokenInput = document.getElementById('gh-sync-token');

      const hasToken = this.hasSessionToken();
      const isConnected = hasToken && ((cfg.mode === 'gist') || (cfg.mode === 'repo' && !!cfg.repo));

      if (statusEl && typeof document !== 'undefined') {
        statusEl.className = isConnected
          ? 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
          : 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';

        const dot = document.createElement('span');
        dot.className = isConnected
          ? 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse'
          : 'w-2 h-2 rounded-full bg-slate-400';
        const labelText = document.createTextNode(
          isConnected
            ? ' Session PAT Active'
            : (hasToken ? ' Session PAT Loaded' : ' Disconnected (PAT Required)')
        );
        statusEl.replaceChildren(dot, labelText);
      }

      if (tokenStatusEl) {
        tokenStatusEl.textContent = hasToken
          ? 'Loaded in volatile memory'
          : 'Session-only (not saved)';
        tokenStatusEl.className = hasToken
          ? 'text-[10px] font-bold text-emerald-600 dark:text-emerald-400'
          : 'text-[10px] font-bold text-slate-500 dark:text-slate-400';
      }

      if (tokenInput) {
        tokenInput.placeholder = hasToken
          ? 'Session PAT loaded in memory (enter only to replace)'
          : 'ghp_xxxxxxxxxxxxxxxxxxxx';
      }

      if (lastSyncEl) {
        lastSyncEl.textContent = cfg.lastSync ? new Date(cfg.lastSync).toLocaleString() : 'Never';
      }
    },

    getPayload: function() {
      const A = (k) => {
        try {
          const v = JSON.parse(localStorage.getItem(k) || '[]');
          return Array.isArray(v) ? v : [];
        } catch (e) {
          return [];
        }
      };
      const O = (k) => {
        try {
          const v = JSON.parse(localStorage.getItem(k) || 'null');
          return isPlainObject(v) ? v : null;
        } catch (e) {
          return null;
        }
      };

      // Deliberately exclude forecaster_profile_user, auth tokens, and local GitHub config
      return {
        transactions: Array.isArray(window.transactions) ? window.transactions : A('pro_transactions'),
        stockData: Array.isArray(window.stockData) ? window.stockData : A('pro_stock'),
        pharmacyData: Array.isArray(window.pharmacyData) ? window.pharmacyData : A('pro_pharmacy'),
        budgetLimits: (typeof window.budgetLimits !== 'undefined' && isPlainObject(window.budgetLimits))
          ? window.budgetLimits
          : O('pro_budget_limits'),
        accounts: Array.isArray(window.accounts) ? window.accounts : A('pro_accounts'),
        accountTransfers: Array.isArray(window.accountTransfers) ? window.accountTransfers : A('pro_account_transfers'),
        pro_vehicles: Array.isArray(window.vehicles) ? window.vehicles : A('pro_vehicles'),
        pro_vehicle_fuel: Array.isArray(window.fuels) ? window.fuels : A('pro_vehicle_fuel'),
        pro_vehicle_maintenance: Array.isArray(window.maint) ? window.maint : A('pro_vehicle_maintenance'),
        pro_rental_contracts_v1: A('pro_rental_contracts_v1'),
        pro_rental_properties_v1: A('pro_rental_properties_v1'),
        version: 'ForecasterPro-v1.06.12-github-sync',
        exportedAt: new Date().toISOString()
      };
    },

    syncConfigFromForm: function() {
      const form = document.getElementById('github-sync-form');
      if (!form) return this.getConfig();

      const tokenInput = document.getElementById('gh-sync-token');
      const enteredToken = (tokenInput?.value || '').trim();
      if (enteredToken) {
        volatileToken = enteredToken;
        tokenInput.value = '';
      }

      const mode = document.getElementById('gh-sync-mode')?.value || 'gist';
      const gistId = (document.getElementById('gh-sync-gist-id')?.value || '').trim();
      const repo = (document.getElementById('gh-sync-repo')?.value || '').trim();
      const branch = (document.getElementById('gh-sync-branch')?.value || '').trim() || 'main';
      const autoSync = !!document.getElementById('gh-sync-autosync')?.checked;

      return this.saveConfig({ mode, gistId, repo, branch, autoSync });
    },

    pushToGitHub: async function(options) {
      const opts = isPlainObject(options) ? options : {};
      const cfg = this.syncConfigFromForm();
      const activeToken = (typeof opts.token === 'string' && opts.token.trim())
        ? opts.token.trim()
        : volatileToken;

      if (typeof opts.token === 'string' && opts.token.trim()) {
        volatileToken = opts.token.trim();
      }

      this._lastError = null;
      const syncBtn = document.getElementById('gh-push-btn');
      if (syncBtn) {
        syncBtn.disabled = true;
        setButtonLabel(syncBtn, '⏳', 'Encrypting & Pushing...');
      }

      try {
        if (!activeToken) {
          throw new Error('Please provide a GitHub Personal Access Token for this session.');
        }
        validateGitHubTarget(cfg);

        const passEl = typeof document !== 'undefined' ? document.getElementById('gh-sync-passphrase') : null;
        const confirmEl = typeof document !== 'undefined' ? document.getElementById('gh-sync-passphrase-confirm') : null;
        const hasExplicitPass = typeof opts.passphrase === 'string';
        const passphrase = hasExplicitPass ? opts.passphrase : (passEl ? passEl.value : '');
        const confirmPassphrase = hasExplicitPass
          ? (typeof opts.confirmPassphrase === 'string' ? opts.confirmPassphrase : undefined)
          : (confirmEl ? confirmEl.value : undefined);

        const policy = validatePassphrase(passphrase, confirmPassphrase);
        if (!policy.ok) {
          throw new Error(policy.error);
        }

        // Build and encrypt snapshot BEFORE any upload request; NEVER fall back to plaintext
        const payload = this.getPayload();
        const envelope = await encryptSnapshotPayload(payload, passphrase);
        const contentStr = JSON.stringify(envelope, null, 2);
        const targetPath = sanitizeFilePath(cfg.filePath);

        if (cfg.mode === 'gist') {
          let url = 'https://api.github.com/gists';
          let method = 'POST';

          const body = {
            description: 'Forecaster Pro Encrypted Cloud Backup (AES-256-GCM)',
            public: false,
            files: {
              [targetPath]: { content: contentStr }
            }
          };

          if (cfg.gistId) {
            url = `https://api.github.com/gists/${encodeURIComponent(cfg.gistId)}`;
            method = 'PATCH';
          }

          const res = await fetch(url, {
            method: method,
            headers: {
              'Authorization': `token ${activeToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${res.status}`);
          }

          const gist = await res.json();
          this.saveConfig({ gistId: gist.id, lastSync: new Date().toISOString() });
          this._lastSnapshotStatus = 'encrypted';
          setSnapshotBanner('encrypted', '🔒 Snapshot encrypted locally (AES-256-GCM) and uploaded to secret GitHub Gist.');
          if (typeof window.triggerToast === 'function') {
            window.triggerToast('Encrypted snapshot uploaded to secret GitHub Gist!', 'success');
          }
          return true;
        } else {
          const branchRef = encodeURIComponent(cfg.branch || 'main');
          const getUrl = `https://api.github.com/repos/${cfg.repo}/contents/${targetPath}?ref=${branchRef}`;

          let sha = null;
          const getRes = await fetch(getUrl, {
            headers: {
              'Authorization': `token ${activeToken}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });
          if (getRes.ok) {
            const fileInfo = await getRes.json();
            sha = fileInfo.sha;
          }

          const putUrl = `https://api.github.com/repos/${cfg.repo}/contents/${targetPath}`;
          const putBody = {
            message: `Update Forecaster Pro Encrypted Snapshot: ${new Date().toISOString()}`,
            content: utf8ToBase64(contentStr),
            branch: cfg.branch || 'main'
          };
          if (sha) putBody.sha = sha;

          const putRes = await fetch(putUrl, {
            method: 'PUT',
            headers: {
              'Authorization': `token ${activeToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(putBody)
          });

          if (!putRes.ok) {
            const err = await putRes.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${putRes.status}`);
          }

          this.saveConfig({ lastSync: new Date().toISOString() });
          this._lastSnapshotStatus = 'encrypted';
          setSnapshotBanner('encrypted', `🔒 Snapshot encrypted locally (AES-256-GCM) and uploaded to ${cfg.repo}.`);
          if (typeof window.triggerToast === 'function') {
            window.triggerToast(`Encrypted snapshot synced to GitHub repo (${cfg.repo})!`, 'success');
          }
          return true;
        }
      } catch (err) {
        const safeMsg = err && err.message ? String(err.message) : 'GitHub push failed.';
        this._lastError = safeMsg;
        console.error('[GitHub Sync Error]', safeMsg);
        setSnapshotBanner('error', `GitHub Push Failed: ${safeMsg}`);
        if (typeof window.triggerToast === 'function') {
          window.triggerToast(`GitHub Sync Failed: ${safeMsg}`, 'error');
        }
        return false;
      } finally {
        clearDomSensitiveInputs();
        if (syncBtn) {
          syncBtn.disabled = false;
          setButtonLabel(syncBtn, '🔒', 'Encrypt & Push to GitHub');
        }
        this.updateUI();
      }
    },

    pullFromGitHub: async function(options) {
      const opts = isPlainObject(options) ? options : {};
      const cfg = this.syncConfigFromForm();
      const activeToken = (typeof opts.token === 'string' && opts.token.trim())
        ? opts.token.trim()
        : volatileToken;

      if (typeof opts.token === 'string' && opts.token.trim()) {
        volatileToken = opts.token.trim();
      }

      this._lastError = null;
      this._lastSnapshotStatus = null;
      const pullBtn = document.getElementById('gh-pull-btn');
      if (pullBtn) {
        pullBtn.disabled = true;
        setButtonLabel(pullBtn, '⏳', 'Pulling from Cloud...');
      }

      try {
        if (!activeToken) {
          throw new Error('Please provide a GitHub Personal Access Token for this session.');
        }
        validateGitHubTarget(cfg);
        const targetPath = sanitizeFilePath(cfg.filePath);

        let contentStr = '';
        if (cfg.mode === 'gist') {
          if (!cfg.gistId) {
            throw new Error('No Gist ID configured yet. Push first or enter an existing Gist ID.');
          }
          const url = `https://api.github.com/gists/${encodeURIComponent(cfg.gistId)}`;
          const res = await fetch(url, {
            headers: {
              'Authorization': `token ${activeToken}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const gist = await res.json();
          const file = (gist && gist.files && (gist.files[targetPath] || gist.files[DEFAULT_FILE_PATH] || Object.values(gist.files)[0])) || null;
          if (!file || typeof file.content !== 'string') {
            throw new Error('No valid snapshot file content found in Gist.');
          }
          contentStr = file.content;
        } else {
          const branchRef = encodeURIComponent(cfg.branch || 'main');
          const url = `https://api.github.com/repos/${cfg.repo}/contents/${targetPath}?ref=${branchRef}`;
          const res = await fetch(url, {
            headers: {
              'Authorization': `token ${activeToken}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const fileInfo = await res.json();
          if (!fileInfo || typeof fileInfo.content !== 'string') {
            throw new Error('Repository response did not contain file content.');
          }
          if (fileInfo.encoding && fileInfo.encoding !== 'base64') {
            throw new Error(`Unsupported GitHub content encoding: ${String(fileInfo.encoding)}`);
          }
          contentStr = base64ToUtf8(fileInfo.content);
        }

        let remoteObj;
        try {
          remoteObj = JSON.parse(contentStr);
        } catch (e) {
          throw new Error('Invalid remote snapshot: content is not valid JSON.');
        }

        let validatedSnapshot;
        let isEncryptedPull = false;

        if (isEncryptedEnvelope(remoteObj)) {
          isEncryptedPull = true;
          this._lastSnapshotStatus = 'encrypted';
          setSnapshotBanner('encrypted', '🔒 Encrypted snapshot detected — verifying envelope and decrypting...');

          validateEncryptedEnvelope(remoteObj);

          const passEl = typeof document !== 'undefined' ? document.getElementById('gh-sync-passphrase') : null;
          const passphrase = typeof opts.passphrase === 'string'
            ? opts.passphrase
            : (passEl ? passEl.value : '');

          // Strict decryption — NEVER fall back to plaintext if decryption fails
          validatedSnapshot = await decryptSnapshotEnvelope(remoteObj, passphrase);
          setSnapshotBanner('encrypted', '🔒 Encrypted snapshot decrypted & verified (AES-256-GCM).');
        } else {
          isEncryptedPull = false;
          this._lastSnapshotStatus = 'legacy-plaintext';
          validatedSnapshot = validateSnapshotPayload(remoteObj);
          setSnapshotBanner(
            'legacy',
            '⚠️ Legacy Unencrypted Snapshot Detected: This remote snapshot is NOT end-to-end encrypted. Confirmation required before import.'
          );

          const confirmed = await requestLegacyConfirmation(opts);
          if (!confirmed) {
            this._lastError = 'Legacy unencrypted snapshot import cancelled by user.';
            if (typeof window.triggerToast === 'function') {
              window.triggerToast('Unencrypted legacy snapshot import cancelled. Local data preserved.', 'info');
            }
            return false;
          }
        }

        // Apply validated datasets cleanly (without modifying remote snapshot or importing profile PII)
        for (let i = 0; i < DATASET_ARRAY_MAP.length; i++) {
          const [payloadKey, storageKey, windowKey] = DATASET_ARRAY_MAP[i];
          if (Array.isArray(validatedSnapshot[payloadKey])) {
            localStorage.setItem(storageKey, JSON.stringify(validatedSnapshot[payloadKey]));
            if (windowKey) {
              window[windowKey] = validatedSnapshot[payloadKey];
            }
          }
        }
        if (validatedSnapshot.budgetLimits) {
          localStorage.setItem('pro_budget_limits', JSON.stringify(validatedSnapshot.budgetLimits));
          window.budgetLimits = validatedSnapshot.budgetLimits;
        }

        this.saveConfig({ lastSync: new Date().toISOString() });
        if (typeof window.triggerToast === 'function') {
          window.triggerToast(
            isEncryptedPull
              ? 'Encrypted snapshot decrypted & restored from GitHub! Reloading workspace...'
              : 'Legacy unencrypted snapshot restored. Consider pushing an encrypted snapshot.',
            isEncryptedPull ? 'success' : 'info'
          );
        }
        if (!opts.skipReload && typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
          setTimeout(() => window.location.reload(), 450);
        }
        return true;
      } catch (err) {
        const safeMsg = err && err.message ? String(err.message) : 'GitHub pull failed.';
        this._lastError = safeMsg;
        console.error('[GitHub Pull Error]', safeMsg);
        setSnapshotBanner('error', `Pull Failed: ${safeMsg}`);
        if (typeof window.triggerToast === 'function') {
          window.triggerToast(`Pull Failed: ${safeMsg}`, 'error');
        }
        return false;
      } finally {
        clearDomSensitiveInputs();
        if (pullBtn) {
          pullBtn.disabled = false;
          setButtonLabel(pullBtn, '⬇️', 'Pull & Restore');
        }
        this.updateUI();
      }
    }
  };

  function bindUiEvents() {
    window.ForecasterGitHubSync.scrubLegacyStoredCredentials();
    window.ForecasterGitHubSync.populateForm();

    const form = document.getElementById('github-sync-form');
    if (form && !form.dataset.ghBound) {
      form.dataset.ghBound = 'true';
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        window.ForecasterGitHubSync.syncConfigFromForm();
        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Non-secret GitHub sync settings saved (PAT kept in session memory only).', 'success');
        }
      });
    }

    const clearBtn = document.getElementById('gh-clear-credentials-btn');
    if (clearBtn && !clearBtn.dataset.ghBound) {
      clearBtn.dataset.ghBound = 'true';
      clearBtn.addEventListener('click', function() {
        window.ForecasterGitHubSync.clearCredentials();
      });
    }
  }

  window.addEventListener('DOMContentLoaded', bindUiEvents);
  window.addEventListener('forecaster:logout', function() {
    if (window.ForecasterGitHubSync && typeof window.ForecasterGitHubSync.clearCredentials === 'function') {
      window.ForecasterGitHubSync.clearCredentials({ silent: true });
    }
  });
})();
