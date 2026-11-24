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
  const GITHUB_PRE_RESTORE_RECOVERY_KEY = 'forecaster_github_pre_restore_recovery_v1';
  const GITHUB_PRE_RESTORE_STAGING_KEY = 'forecaster_github_pre_restore_recovery_staging_v1';
  const GITHUB_PRE_RESTORE_FORMAT = 'forecaster-pro-github-pre-restore-recovery';

  const RESTORE_STATUS = Object.freeze({
    RESTORE_SUCCESS: 'RESTORE_SUCCESS',
    RESTORE_FAILED_ROLLED_BACK: 'RESTORE_FAILED_ROLLED_BACK',
    RESTORE_FAILED_RECOVERY_REQUIRED: 'RESTORE_FAILED_RECOVERY_REQUIRED'
  });

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

  function assertValidJsonSerializableValue(value, pathLabel, seen) {
    if (value === null) return;
    const valType = typeof value;
    if (valType === 'string' || valType === 'boolean') return;
    if (valType === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid snapshot data: non-finite number detected at "${pathLabel}".`);
      }
      return;
    }
    if (valType === 'undefined' || valType === 'function' || valType === 'symbol' || valType === 'bigint') {
      throw new Error(`Invalid snapshot data: unsupported value type "${valType}" detected at "${pathLabel}".`);
    }
    if (valType === 'object') {
      const tracker = seen || new Set();
      if (tracker.has(value)) {
        throw new Error(`Invalid snapshot data: circular reference detected at "${pathLabel}".`);
      }
      tracker.add(value);
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (!Object.prototype.hasOwnProperty.call(value, i)) {
            throw new Error(`Invalid snapshot data: sparse array hole detected at "${pathLabel}[${i}]".`);
          }
          assertValidJsonSerializableValue(value[i], `${pathLabel}[${i}]`, tracker);
        }
      } else if (isPlainObject(value)) {
        const keys = Object.keys(value);
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          assertValidJsonSerializableValue(value[k], `${pathLabel}.${k}`, tracker);
        }
      } else {
        throw new Error(`Invalid snapshot data: unsupported object instance at "${pathLabel}".`);
      }
      tracker.delete(value);
    }
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
      if (Object.prototype.hasOwnProperty.call(payload, payloadKey)) {
        if (!Array.isArray(payload[payloadKey])) {
          throw new Error(`Invalid snapshot schema: "${payloadKey}" must be an array.`);
        }
        assertValidJsonSerializableValue(payload[payloadKey], payloadKey);
        recognizedFields++;
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'budgetLimits')) {
      if (payload.budgetLimits === undefined || (payload.budgetLimits !== null && !isPlainObject(payload.budgetLimits))) {
        throw new Error('Invalid snapshot schema: "budgetLimits" must be an object or null.');
      }
      if (isPlainObject(payload.budgetLimits)) {
        assertValidJsonSerializableValue(payload.budgetLimits, 'budgetLimits');
        recognizedFields++;
      }
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

  function checkLocalStorageAvailability() {
    if (typeof localStorage === 'undefined' || !localStorage) {
      throw new Error('Browser localStorage is unavailable.');
    }
    if (
      typeof localStorage.getItem !== 'function' ||
      typeof localStorage.setItem !== 'function' ||
      typeof localStorage.removeItem !== 'function'
    ) {
      throw new Error('Browser localStorage API (getItem/setItem/removeItem) is unavailable or blocked.');
    }
    // Probe non-mutating read access to detect SecurityError/blocked storage before writes
    try {
      localStorage.getItem(GITHUB_CONFIG_KEY);
    } catch (e) {
      throw new Error('Browser localStorage read access is blocked.');
    }
  }

  function isValidRecoveryArtifactRaw(rawStr) {
    if (typeof rawStr !== 'string' || rawStr.length === 0) return false;
    try {
      const parsed = JSON.parse(rawStr);
      if (
        !isPlainObject(parsed) ||
        parsed.format !== GITHUB_PRE_RESTORE_FORMAT ||
        parsed.version !== 1 ||
        typeof parsed.createdAt !== 'string' ||
        !Array.isArray(parsed.originals)
      ) {
        return false;
      }
      for (let i = 0; i < parsed.originals.length; i++) {
        const entry = parsed.originals[i];
        if (
          !isPlainObject(entry) ||
          typeof entry.storageKey !== 'string' ||
          typeof entry.existed !== 'boolean'
        ) {
          return false;
        }
        if (entry.existed && typeof entry.rawValue !== 'string') {
          return false;
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function verifyRecoveryJsonMatches(rawStr, expectedJson, expectedKeysCount) {
    if (typeof rawStr !== 'string' || rawStr !== expectedJson) return false;
    if (!isValidRecoveryArtifactRaw(rawStr)) return false;
    try {
      const parsed = JSON.parse(rawStr);
      return Array.isArray(parsed.originals) && parsed.originals.length === expectedKeysCount;
    } catch (e) {
      return false;
    }
  }

  function createRecoveryError(message, recoveryRequired, failedKey) {
    const err = new Error(message);
    err.recoveryRequired = !!recoveryRequired;
    if (failedKey) err.failedRecoveryKey = failedKey;
    return err;
  }

  function safeReadStorageKey(key) {
    try {
      return { ok: true, value: localStorage.getItem(key), error: null };
    } catch (e) {
      return { ok: false, value: null, error: e };
    }
  }

  function restoreRecoveryKeyToOriginal(key, existed, originalRaw) {
    const readCheck = safeReadStorageKey(key);
    if (readCheck.ok) {
      if (!existed && readCheck.value === null) {
        return { ok: true, error: null };
      }
      if (existed && readCheck.value === originalRaw) {
        return { ok: true, error: null };
      }
    }

    try {
      if (!existed) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, originalRaw);
      }
    } catch (e) {
      return { ok: false, error: e && e.message ? String(e.message) : 'Storage operation threw during recovery restoration.' };
    }

    const verifyCheck = safeReadStorageKey(key);
    if (!verifyCheck.ok) {
      return { ok: false, error: 'Read-back verification threw after recovery restoration.' };
    }
    if (!existed && verifyCheck.value !== null) {
      return { ok: false, error: 'Absent recovery key could not be verified as removed.' };
    }
    if (existed && verifyCheck.value !== originalRaw) {
      return { ok: false, error: 'Restored recovery key failed read-back equality check.' };
    }
    return { ok: true, error: null };
  }

  function createStagedPreRestoreRecovery(originals, targetId) {
    const priorActiveCheck = safeReadStorageKey(GITHUB_PRE_RESTORE_RECOVERY_KEY);
    const priorStagingCheck = safeReadStorageKey(GITHUB_PRE_RESTORE_STAGING_KEY);
    if (!priorActiveCheck.ok || !priorStagingCheck.ok) {
      throw createRecoveryError('Unable to read existing pre-restore recovery state from localStorage.', false);
    }

    const priorActiveRaw = priorActiveCheck.value;
    const priorStagingRaw = priorStagingCheck.value;
    const priorActiveExisted = priorActiveRaw !== null;
    const priorStagingExisted = priorStagingRaw !== null;
    const priorStagingIsValid = isValidRecoveryArtifactRaw(priorStagingRaw);

    const record = {
      format: GITHUB_PRE_RESTORE_FORMAT,
      version: 1,
      createdAt: new Date().toISOString(),
      targetId: (typeof targetId === 'string' && targetId.trim()) ? targetId.trim() : null,
      affectedKeys: originals.map((o) => o.storageKey),
      originals: originals.map((o) => ({
        storageKey: o.storageKey,
        existed: o.existed,
        rawValue: o.existed ? o.rawValue : null
      }))
    };

    let recoveryJson;
    try {
      recoveryJson = JSON.stringify(record);
    } catch (e) {
      throw createRecoveryError('Failed to serialize pre-restore recovery snapshot.', false);
    }
    if (typeof recoveryJson !== 'string' || recoveryJson.length === 0) {
      throw createRecoveryError('Pre-restore recovery serialization produced empty output.', false);
    }

    // Step 1: Write to staging key first so prior active recovery key is not destroyed on failure
    let stagingWriteErr = null;
    try {
      localStorage.setItem(GITHUB_PRE_RESTORE_STAGING_KEY, recoveryJson);
    } catch (e) {
      stagingWriteErr = e;
    }

    const stagedReadCheck = !stagingWriteErr ? safeReadStorageKey(GITHUB_PRE_RESTORE_STAGING_KEY) : { ok: false, value: null };
    const stagingVerified = !stagingWriteErr &&
      stagedReadCheck.ok &&
      verifyRecoveryJsonMatches(stagedReadCheck.value, recoveryJson, originals.length);

    if (!stagingVerified) {
      const curStagingCheck = safeReadStorageKey(GITHUB_PRE_RESTORE_STAGING_KEY);
      const curActiveCheck = safeReadStorageKey(GITHUB_PRE_RESTORE_RECOVERY_KEY);
      const activeStillValid = curActiveCheck.ok && isValidRecoveryArtifactRaw(curActiveCheck.value);
      const stagingAlreadyValid = curStagingCheck.ok && isValidRecoveryArtifactRaw(curStagingCheck.value);

      // Only preserve unexpected valid staging content if active lacks any valid recovery copy and staging had not originally existed
      const shouldPreserveExistingOnStaging = !priorStagingExisted && !activeStillValid && stagingAlreadyValid;
      if (!shouldPreserveExistingOnStaging) {
        const rbStaging = restoreRecoveryKeyToOriginal(
          GITHUB_PRE_RESTORE_STAGING_KEY,
          priorStagingExisted,
          priorStagingRaw
        );
        if (!rbStaging.ok) {
          throw createRecoveryError(
            `CRITICAL RECOVERY REQUIRED: Pre-restore staging failed and original staging state could not be verified (${rbStaging.error}). Existing usable recovery artifacts have been preserved.`,
            true,
            GITHUB_PRE_RESTORE_STAGING_KEY
          );
        }
      }

      throw createRecoveryError(
        stagingWriteErr
          ? 'Unable to stage pre-restore recovery snapshot in localStorage (storage quota or permission error).'
          : 'Pre-restore recovery staging verification failed; existing recovery and workspace state preserved.',
        false
      );
    }

    // Step 2: Promote staged recovery copy to active recovery key
    let activeWriteErr = null;
    try {
      localStorage.setItem(GITHUB_PRE_RESTORE_RECOVERY_KEY, recoveryJson);
    } catch (e) {
      activeWriteErr = e;
    }

    const promotedReadCheck = !activeWriteErr ? safeReadStorageKey(GITHUB_PRE_RESTORE_RECOVERY_KEY) : { ok: false, value: null };
    const activeVerified = !activeWriteErr &&
      promotedReadCheck.ok &&
      verifyRecoveryJsonMatches(promotedReadCheck.value, recoveryJson, originals.length);

    if (!activeVerified) {
      const rbActive = restoreRecoveryKeyToOriginal(
        GITHUB_PRE_RESTORE_RECOVERY_KEY,
        priorActiveExisted,
        priorActiveRaw
      );

      // Base staging restoration ONLY on positively verified current active state, never historical prior flags
      const postRestoreActiveCheck = safeReadStorageKey(GITHUB_PRE_RESTORE_RECOVERY_KEY);
      const activeCurrentlyVerified = rbActive.ok &&
        postRestoreActiveCheck.ok &&
        isValidRecoveryArtifactRaw(postRestoreActiveCheck.value);

      const curStagingNow = safeReadStorageKey(GITHUB_PRE_RESTORE_STAGING_KEY);
      const stagingHasNewVerifiedCopy = curStagingNow.ok &&
        verifyRecoveryJsonMatches(curStagingNow.value, recoveryJson, originals.length);
      const stagingHasAnyValidCopy = curStagingNow.ok && isValidRecoveryArtifactRaw(curStagingNow.value);

      let rbStaging = { ok: true, error: null };
      if (activeCurrentlyVerified) {
        // Safe to restore prior staging state because another valid active recovery copy is positively verified on disk
        rbStaging = restoreRecoveryKeyToOriginal(
          GITHUB_PRE_RESTORE_STAGING_KEY,
          priorStagingExisted,
          priorStagingRaw
        );
      } else if (stagingHasNewVerifiedCopy || stagingHasAnyValidCopy) {
        // Active key is absent, malformed, or failed restoration/verification: preserve verified staging copy untouched
        rbStaging = { ok: true, error: null };
      } else if (priorStagingIsValid) {
        rbStaging = restoreRecoveryKeyToOriginal(
          GITHUB_PRE_RESTORE_STAGING_KEY,
          true,
          priorStagingRaw
        );
      } else {
        rbStaging = { ok: false, error: 'Neither active nor staging recovery copy could be verified.' };
      }

      if (!rbActive.ok || !rbStaging.ok) {
        const failedKey = !rbActive.ok ? GITHUB_PRE_RESTORE_RECOVERY_KEY : GITHUB_PRE_RESTORE_STAGING_KEY;
        const reason = !rbActive.ok ? rbActive.error : rbStaging.error;
        throw createRecoveryError(
          `CRITICAL RECOVERY REQUIRED: Active recovery promotion failed and recovery-key restoration could not be verified for "${failedKey}" (${reason}). Remaining usable recovery artifacts have been preserved.`,
          true,
          failedKey
        );
      }

      throw createRecoveryError(
        activeWriteErr
          ? 'Unable to promote pre-restore recovery snapshot to active storage (storage quota or permission error).'
          : 'Active pre-restore recovery verification failed after promotion; existing workspace preserved.',
        false
      );
    }

    // Step 3: Remove staging key only after establishing verified active copy exists
    const finalActiveCheck = safeReadStorageKey(GITHUB_PRE_RESTORE_RECOVERY_KEY);
    if (finalActiveCheck.ok && verifyRecoveryJsonMatches(finalActiveCheck.value, recoveryJson, originals.length)) {
      try {
        localStorage.removeItem(GITHUB_PRE_RESTORE_STAGING_KEY);
      } catch (_) {
        // Non-fatal: active recovery key is already promoted and verified
      }
    }

    return {
      ok: true,
      recoveryKey: GITHUB_PRE_RESTORE_RECOVERY_KEY,
      affectedKeyCount: originals.length
    };
  }

  function prepareStagedRestoreTargets(validatedSnapshot, options) {
    const opts = isPlainObject(options) ? options : {};
    const overrideMap = isPlainObject(opts._overrideStagedSerialized) ? opts._overrideStagedSerialized : null;
    const stagedTargets = [];

    for (let i = 0; i < DATASET_ARRAY_MAP.length; i++) {
      const [payloadKey, storageKey, windowKey] = DATASET_ARRAY_MAP[i];
      if (Object.prototype.hasOwnProperty.call(validatedSnapshot, payloadKey)) {
        const val = validatedSnapshot[payloadKey];
        if (!Array.isArray(val)) {
          throw new Error(`Invalid staged dataset "${payloadKey}": expected array.`);
        }
        assertValidJsonSerializableValue(val, payloadKey);
        const serialized = (overrideMap && Object.prototype.hasOwnProperty.call(overrideMap, storageKey))
          ? overrideMap[storageKey]
          : JSON.stringify(val);

        if (typeof serialized !== 'string' || serialized.length === 0) {
          throw new Error(`Serialization failed for dataset "${storageKey}": empty or non-string output.`);
        }
        let reparsed;
        try {
          reparsed = JSON.parse(serialized);
        } catch (e) {
          throw new Error(`Staged JSON verification failed for dataset "${storageKey}".`);
        }
        if (!Array.isArray(reparsed)) {
          throw new Error(`Staged type verification failed for dataset "${storageKey}": expected JSON array.`);
        }
        stagedTargets.push({
          payloadKey,
          storageKey,
          windowKey,
          expectedType: 'array',
          value: reparsed,
          serialized
        });
      }
    }

    if (isPlainObject(validatedSnapshot.budgetLimits)) {
      assertValidJsonSerializableValue(validatedSnapshot.budgetLimits, 'budgetLimits');
      const serializedBudget = (overrideMap && Object.prototype.hasOwnProperty.call(overrideMap, 'pro_budget_limits'))
        ? overrideMap.pro_budget_limits
        : JSON.stringify(validatedSnapshot.budgetLimits);

      if (typeof serializedBudget !== 'string' || serializedBudget.length === 0) {
        throw new Error('Serialization failed for dataset "pro_budget_limits": empty or non-string output.');
      }
      let reparsedBudget;
      try {
        reparsedBudget = JSON.parse(serializedBudget);
      } catch (e) {
        throw new Error('Staged JSON verification failed for dataset "pro_budget_limits".');
      }
      if (!isPlainObject(reparsedBudget)) {
        throw new Error('Staged type verification failed for dataset "pro_budget_limits": expected JSON object.');
      }
      stagedTargets.push({
        payloadKey: 'budgetLimits',
        storageKey: 'pro_budget_limits',
        windowKey: 'budgetLimits',
        expectedType: 'object',
        value: reparsedBudget,
        serialized: serializedBudget
      });
    }

    if (stagedTargets.length === 0) {
      throw new Error('No restorable datasets found in staged restore batch.');
    }

    return stagedTargets;
  }

  function applySnapshotAtomic(snapshotObj, options) {
    const opts = isPlainObject(options) ? options : {};
    let originals = [];
    let stagedTargets = [];

    // -----------------------------------------------------------------------
    // PHASE A: PREPARATION (Zero dataset mutations allowed in this phase)
    // -----------------------------------------------------------------------
    try {
      checkLocalStorageAvailability();
      const validatedSnapshot = validateSnapshotPayload(snapshotObj);
      stagedTargets = prepareStagedRestoreTargets(validatedSnapshot, opts);

      // Capture exact per-key original states before touching any dataset or recovery artifact
      originals = stagedTargets.map((target) => {
        const storageKey = target.storageKey;
        const rawValue = localStorage.getItem(storageKey);
        const existed = rawValue !== null;
        const winAvailable = typeof window !== 'undefined' && !!window;
        const windowKey = target.windowKey;
        const windowExisted = !!(winAvailable && windowKey && Object.prototype.hasOwnProperty.call(window, windowKey));
        const windowValue = (winAvailable && windowKey) ? window[windowKey] : undefined;

        return {
          storageKey,
          windowKey,
          existed,
          wasEmpty: rawValue === '',
          rawValue,
          windowExisted,
          windowValue
        };
      });

      // Stage & verify non-secret pre-restore recovery snapshot safely before any write
      createStagedPreRestoreRecovery(originals, opts.targetId);
    } catch (prepErr) {
      const safePrepMsg = prepErr && prepErr.message ? String(prepErr.message) : 'Restore preparation failed.';
      const isRecoveryRequired = !!(prepErr && prepErr.recoveryRequired === true);
      const prepOutcome = {
        ok: false,
        status: isRecoveryRequired
          ? RESTORE_STATUS.RESTORE_FAILED_RECOVERY_REQUIRED
          : RESTORE_STATUS.RESTORE_FAILED_ROLLED_BACK,
        datasetsTouched: false,
        rolledBack: !isRecoveryRequired,
        rolledBackKeys: [],
        rollbackFailures: isRecoveryRequired
          ? [{ storageKey: prepErr.failedRecoveryKey || GITHUB_PRE_RESTORE_RECOVERY_KEY, reason: safePrepMsg }]
          : [],
        recoveryArtifactPreserved: true,
        message: isRecoveryRequired
          ? safePrepMsg
          : `${safePrepMsg} Local workspace data was not modified.`
      };
      if (typeof window !== 'undefined' && window.ForecasterGitHubSync) {
        window.ForecasterGitHubSync._lastRestoreOutcome = prepOutcome;
      }
      return prepOutcome;
    }

    // -----------------------------------------------------------------------
    // PHASE B: COMMIT + IMMEDIATE READ-BACK VERIFICATION
    // -----------------------------------------------------------------------
    const touchedTargets = [];
    let commitFailure = null;

    for (let i = 0; i < stagedTargets.length; i++) {
      const target = stagedTargets[i];
      const orig = originals[i];
      // Record target as touched before write attempt so Phase C verifies/restores it on failure
      touchedTargets.push({ target, orig });

      try {
        localStorage.setItem(target.storageKey, target.serialized);

        const readBack = localStorage.getItem(target.storageKey);
        if (typeof readBack !== 'string' || readBack !== target.serialized) {
          throw new Error(`Read-back verification mismatch for "${target.storageKey}".`);
        }
        const parsedBack = JSON.parse(readBack);
        const validType = target.expectedType === 'array' ? Array.isArray(parsedBack) : isPlainObject(parsedBack);
        if (!validType) {
          throw new Error(`Read-back type check failed for "${target.storageKey}".`);
        }
      } catch (writeErr) {
        commitFailure = {
          storageKey: target.storageKey,
          message: writeErr && writeErr.message ? String(writeErr.message) : 'Storage write or verification failed.'
        };
        break;
      }
    }

    if (!commitFailure) {
      try {
        // Update in-memory window references ONLY after all keys succeeded write + read-back verification
        if (typeof window !== 'undefined' && window) {
          for (let i = 0; i < stagedTargets.length; i++) {
            const target = stagedTargets[i];
            if (target.windowKey) {
              window[target.windowKey] = target.value;
            }
          }
        }
      } catch (inMemErr) {
        commitFailure = {
          storageKey: 'in-memory',
          inMemoryFailure: true,
          message: inMemErr && inMemErr.message
            ? `In-memory reference update failed: ${String(inMemErr.message)}`
            : 'In-memory reference update failed.'
        };
      }
    }

    if (!commitFailure) {
      const successOutcome = {
        ok: true,
        status: RESTORE_STATUS.RESTORE_SUCCESS,
        restoredKeys: stagedTargets.map((t) => t.storageKey),
        verificationPassed: true,
        recoveryArtifactPreserved: true,
        rollbackFailures: [],
        message: `Restored and read-back verified ${stagedTargets.length} dataset collections cleanly.`
      };
      if (typeof window !== 'undefined' && window.ForecasterGitHubSync) {
        window.ForecasterGitHubSync._lastRestoreOutcome = successOutcome;
      }
      return successOutcome;
    }

    // -----------------------------------------------------------------------
    // PHASE C: RECOVERY / ROLLBACK + VERIFICATION
    // -----------------------------------------------------------------------
    const rollbackFailures = [];
    const rolledBackKeys = [];
    const seenRollbackKeys = new Set();

    // Reverse order restores space first (removing/shrinking later keys before restoring earlier ones)
    for (let i = touchedTargets.length - 1; i >= 0; i--) {
      const { orig } = touchedTargets[i];
      seenRollbackKeys.add(orig.storageKey);

      try {
        if (!orig.existed) {
          localStorage.removeItem(orig.storageKey);
          const verifiedAfterRemove = localStorage.getItem(orig.storageKey);
          if (verifiedAfterRemove !== null) {
            throw new Error('Absent key could not be verified as removed.');
          }
        } else {
          const currentVal = localStorage.getItem(orig.storageKey);
          if (currentVal !== orig.rawValue) {
            localStorage.setItem(orig.storageKey, orig.rawValue);
          }
          const verifiedAfterRestore = localStorage.getItem(orig.storageKey);
          if (verifiedAfterRestore !== orig.rawValue) {
            throw new Error('Restored value failed read-back equality check.');
          }
        }
        rolledBackKeys.push(orig.storageKey);
      } catch (rbErr) {
        rollbackFailures.push({
          storageKey: orig.storageKey,
          reason: rbErr && rbErr.message ? String(rbErr.message) : 'Rollback write or verification failed.'
        });
      }
    }

    // Defensive check across any remaining untouched affected keys
    for (let i = 0; i < originals.length; i++) {
      const orig = originals[i];
      if (seenRollbackKeys.has(orig.storageKey)) continue;
      try {
        const curVal = localStorage.getItem(orig.storageKey);
        const matchesOrig = !orig.existed ? curVal === null : curVal === orig.rawValue;
        if (!matchesOrig) {
          if (!orig.existed) {
            localStorage.removeItem(orig.storageKey);
            if (localStorage.getItem(orig.storageKey) !== null) {
              throw new Error('Untouched absent key deviated and removal failed verification.');
            }
          } else {
            localStorage.setItem(orig.storageKey, orig.rawValue);
            if (localStorage.getItem(orig.storageKey) !== orig.rawValue) {
              throw new Error('Untouched key deviated and restore failed verification.');
            }
          }
        }
        rolledBackKeys.push(orig.storageKey);
      } catch (verifyErr) {
        rollbackFailures.push({
          storageKey: orig.storageKey,
          reason: verifyErr && verifyErr.message ? String(verifyErr.message) : 'Post-failure state verification failed.'
        });
      }
    }

    // Restore and verify original in-memory references
    if (typeof window !== 'undefined' && window) {
      for (let i = 0; i < originals.length; i++) {
        const orig = originals[i];
        if (!orig.windowKey) continue;
        try {
          if (orig.windowExisted) {
            if (window[orig.windowKey] !== orig.windowValue) {
              window[orig.windowKey] = orig.windowValue;
            }
            if (window[orig.windowKey] !== orig.windowValue) {
              throw new Error('Restored in-memory reference failed equality check.');
            }
          } else {
            if (Object.prototype.hasOwnProperty.call(window, orig.windowKey)) {
              delete window[orig.windowKey];
            }
            if (Object.prototype.hasOwnProperty.call(window, orig.windowKey)) {
              throw new Error('Absent in-memory reference could not be verified as removed.');
            }
          }
        } catch (inMemRbErr) {
          rollbackFailures.push({
            storageKey: `window.${orig.windowKey}`,
            reason: inMemRbErr && inMemRbErr.message
              ? String(inMemRbErr.message)
              : 'In-memory reference rollback failed.'
          });
        }
      }
    }

    if (rollbackFailures.length === 0) {
      const rolledBackOutcome = {
        ok: false,
        status: RESTORE_STATUS.RESTORE_FAILED_ROLLED_BACK,
        failedKey: commitFailure.storageKey,
        datasetsTouched: true,
        rolledBack: true,
        rolledBackKeys,
        rollbackFailures: [],
        recoveryArtifactPreserved: true,
        message: `Restore failed on "${commitFailure.storageKey}" (${commitFailure.message}). All affected local storage keys were rolled back and verified intact.`
      };
      if (typeof window !== 'undefined' && window.ForecasterGitHubSync) {
        window.ForecasterGitHubSync._lastRestoreOutcome = rolledBackOutcome;
      }
      return rolledBackOutcome;
    }

    const failedKeyNames = rollbackFailures.map((f) => f.storageKey).join(', ');
    const recoveryRequiredOutcome = {
      ok: false,
      status: RESTORE_STATUS.RESTORE_FAILED_RECOVERY_REQUIRED,
      failedKey: commitFailure.storageKey,
      datasetsTouched: true,
      rolledBack: false,
      rolledBackKeys,
      rollbackFailures,
      recoveryArtifactPreserved: true,
      message:
        `CRITICAL RECOVERY REQUIRED: Restore failed on "${commitFailure.storageKey}" and rollback verification failed for [${failedKeyNames}]. ` +
        `Do NOT continue normal data operations until workspace recovery is completed using your preserved pre-restore recovery snapshot (${GITHUB_PRE_RESTORE_RECOVERY_KEY}).`
    };
    if (typeof window !== 'undefined' && window.ForecasterGitHubSync) {
      window.ForecasterGitHubSync._lastRestoreOutcome = recoveryRequiredOutcome;
    }
    return recoveryRequiredOutcome;
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
    RESTORE_STATUS: RESTORE_STATUS,
    RECOVERY_STORAGE_KEYS: Object.freeze({
      ACTIVE: GITHUB_PRE_RESTORE_RECOVERY_KEY,
      STAGING: GITHUB_PRE_RESTORE_STAGING_KEY
    }),
    _lastError: null,
    _lastSnapshotStatus: null,
    _lastRestoreOutcome: null,

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

    applySnapshotAtomic: function(snapshotObj, options) {
      return applySnapshotAtomic(snapshotObj, options);
    },

    getPreRestoreRecoverySnapshot: function() {
      try {
        const raw = localStorage.getItem(GITHUB_PRE_RESTORE_RECOVERY_KEY);
        if (!isValidRecoveryArtifactRaw(raw)) return null;
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
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
      this._lastRestoreOutcome = null;
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
          setSnapshotBanner('encrypted', '🔒 Encrypted snapshot decrypted & verified (AES-256-GCM) — preparing atomic local restore...');
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

        // Apply validated datasets via 3-phase atomic-equivalent restore (Prepare -> Commit+Verify -> Rollback+Verify)
        const targetIdentifier = cfg.mode === 'repo' ? `repo:${cfg.repo}` : `gist:${cfg.gistId}`;
        const restoreOutcome = applySnapshotAtomic(validatedSnapshot, {
          targetId: targetIdentifier,
          _overrideStagedSerialized: opts._overrideStagedSerialized
        });
        this._lastRestoreOutcome = restoreOutcome;

        if (!restoreOutcome || !restoreOutcome.ok || restoreOutcome.status !== RESTORE_STATUS.RESTORE_SUCCESS) {
          const failureMsg = (restoreOutcome && restoreOutcome.message)
            ? restoreOutcome.message
            : 'Snapshot restore failed and was rolled back.';
          this._lastError = failureMsg;
          console.error('[GitHub Pull Error]', failureMsg);

          const bannerMsg = (restoreOutcome && restoreOutcome.status === RESTORE_STATUS.RESTORE_FAILED_RECOVERY_REQUIRED)
            ? failureMsg
            : `Pull Failed: ${failureMsg}`;
          setSnapshotBanner('error', bannerMsg);
          if (typeof window.triggerToast === 'function') {
            window.triggerToast(
              (restoreOutcome && restoreOutcome.status === RESTORE_STATUS.RESTORE_FAILED_RECOVERY_REQUIRED)
                ? failureMsg
                : `Pull Failed: ${failureMsg}`,
              'error'
            );
          }
          return false;
        }

        // Only update sync metadata, success banner/toast, and reload AFTER full Phase B read-back verification succeeds
        this.saveConfig({ lastSync: new Date().toISOString() });
        setSnapshotBanner(
          isEncryptedPull ? 'encrypted' : 'legacy',
          isEncryptedPull
            ? '🔒 Encrypted snapshot decrypted & verified (AES-256-GCM). All target datasets restored and read-back verified.'
            : '⚠️ Legacy unencrypted snapshot restored and read-back verified. Consider pushing an encrypted snapshot.'
        );
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
