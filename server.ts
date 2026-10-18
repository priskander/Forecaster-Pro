import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = path.resolve(__dirname, 'data');
const DB_FILE = path.resolve(DATA_DIR, 'cloud-ledger-db.json');

// Ensure data storage directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

import crypto from 'crypto';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  tier: string;
  createdAt: string;
  lastLogin: string;
}

interface VaultData {
  vaultId: string;
  updatedAt: string;
  transactions: any[];
  accounts: any[];
  accountTransfers: any[];
  budgetLimits?: any;
  stockData?: any[];
  pharmacyData?: any[];
  profileUser?: any;
}

interface CloudDatabase {
  version: string;
  vaults: Record<string, VaultData>;
  users?: Record<string, UserRecord>;
  tokens?: Record<string, string>; // token -> userId
}

// In-memory cache + persistent disk store
function loadDatabase(): CloudDatabase {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[CloudSync DB] Error reading database file:', err);
  }
  return {
    version: '1.0.0',
    vaults: {},
    users: {},
    tokens: {}
  };
}

function saveDatabase(db: CloudDatabase): void {
  try {
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('[CloudSync DB] Error writing database file:', err);
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  try {
    const checkHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(checkHash, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch (err) {
    return false;
  }
}

let db = loadDatabase();
if (!db.users) db.users = {};
if (!db.tokens) db.tokens = {};

// Seed default demo user if not present
const defaultEmail = 'peter.w.badir@gmail.com';
let defaultUser = Object.values(db.users).find(u => u.email.toLowerCase() === defaultEmail.toLowerCase());
if (!defaultUser) {
  const salt = crypto.randomBytes(16).toString('hex');
  const user: UserRecord = {
    id: 'usr_peter_badir',
    name: 'Peter W. Badir',
    email: defaultEmail,
    passwordHash: hashPassword('Password123!', salt),
    salt,
    tier: 'Pro Household',
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  };
  db.users[user.id] = user;
}

// Seed default vault if empty
const DEFAULT_VAULT_ID = 'shared-main-vault';
if (!db.vaults[DEFAULT_VAULT_ID]) {
  db.vaults[DEFAULT_VAULT_ID] = {
    vaultId: DEFAULT_VAULT_ID,
    updatedAt: new Date().toISOString(),
    transactions: [
      { id: 'tx_init_1', date: '2026-07-01', description: 'Direct Deposit Monthly Salary', category: 'Salary', type: 'income', amount: 3100.00, accountId: 'acc_bank_cib' },
      { id: 'tx_init_2', date: '2026-07-02', description: 'Apartment Premium Rental Rent', category: 'Rent', type: 'expense', amount: 800.00, accountId: 'acc_bank_cib' },
      { id: 'tx_init_3', date: '2026-07-04', description: 'UI/UX Freelance App Project', category: 'Freelance', type: 'income', amount: 400.00, accountId: 'acc_wallet_vodafone' },
      { id: 'tx_init_4', date: '2026-07-05', description: 'Monthly Power Utility Bills', category: 'Utilities', type: 'expense', amount: 150.00, accountId: 'acc_cash_main' }
    ],
    accounts: [
      { id: 'acc_cash_main', type: 'cash', label: '💵 Cash Wallet', initialBalance: 1500, createdAt: '2026-07-01T00:00:00.000Z' },
      { id: 'acc_bank_cib', type: 'card', label: '💳 CIB Debit Card', network: 'Visa', mode: 'Debit', bank: 'Commercial International Bank (CIB)', initialBalance: 12000, createdAt: '2026-07-01T00:00:00.000Z' },
      { id: 'acc_wallet_vodafone', type: 'wallet', label: '📱 Vodafone Cash', kind: 'Telecom', provider: 'Vodafone Cash', initialBalance: 2500, createdAt: '2026-07-01T00:00:00.000Z' }
    ],
    accountTransfers: []
  };
}
saveDatabase(db);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // CORS headers for flexible cross-device PWA access
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  /* -------------------------------------------------------------------------
   * SECURE USER AUTHENTICATION API (Sign Up, Login, Session, Profile)
   * ------------------------------------------------------------------------- */

  // Sign Up / Register
  app.post('/api/auth/register', (req, res) => {
    try {
      const { name, email, password } = req.body || {};
      const cleanEmail = (email || '').trim().toLowerCase();
      const cleanName = (name || '').trim();

      if (!cleanName || !cleanEmail || !password) {
        return res.status(400).json({ ok: false, error: 'Full name, email address, and password are required.' });
      }

      if (password.length < 6) {
        return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters long.' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
      }

      // Check if user already exists
      const existing = Object.values(db.users || {}).find(u => u.email.toLowerCase() === cleanEmail);
      if (existing) {
        return res.status(409).json({ ok: false, error: 'An account with this email address already exists. Please sign in.' });
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(password, salt);
      const userId = 'usr_' + Date.now();

      const user: UserRecord = {
        id: userId,
        name: cleanName,
        email: cleanEmail,
        passwordHash,
        salt,
        tier: 'Free Tier',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };

      if (!db.users) db.users = {};
      if (!db.tokens) db.tokens = {};

      db.users[userId] = user;

      // Generate session token
      const token = 'tok_' + crypto.randomBytes(24).toString('hex');
      db.tokens[token] = userId;

      saveDatabase(db);

      res.status(201).json({
        ok: true,
        message: 'Account created successfully!',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          tier: user.tier,
          createdAt: user.createdAt
        }
      });
    } catch (err: any) {
      console.error('[Auth Register Error]', err);
      res.status(500).json({ ok: false, error: 'Registration failed: ' + err.message });
    }
  });

  // Login
  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body || {};
      const cleanEmail = (email || '').trim().toLowerCase();

      if (!cleanEmail || !password) {
        return res.status(400).json({ ok: false, error: 'Email and password are required.' });
      }

      const user = Object.values(db.users || {}).find(u => u.email.toLowerCase() === cleanEmail);
      if (!user) {
        return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
      }

      const isValid = verifyPassword(password, user.salt, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
      }

      user.lastLogin = new Date().toISOString();

      if (!db.tokens) db.tokens = {};
      const token = 'tok_' + crypto.randomBytes(24).toString('hex');
      db.tokens[token] = user.id;

      saveDatabase(db);

      res.json({
        ok: true,
        message: 'Logged in successfully!',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          tier: user.tier,
          createdAt: user.createdAt
        }
      });
    } catch (err: any) {
      console.error('[Auth Login Error]', err);
      res.status(500).json({ ok: false, error: 'Login failed: ' + err.message });
    }
  });

  // Get current user session
  app.get('/api/auth/me', (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();

      if (!token || !db.tokens || !db.tokens[token]) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      const userId = db.tokens[token];
      const user = (db.users || {})[userId];

      if (!user) {
        return res.status(401).json({ ok: false, error: 'User not found' });
      }

      res.json({
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          tier: user.tier,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin
        }
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Logout
  app.post('/api/auth/logout', (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();

      if (token && db.tokens && db.tokens[token]) {
        delete db.tokens[token];
        saveDatabase(db);
      }

      res.json({ ok: true, message: 'Logged out successfully' });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Update profile
  app.put('/api/auth/profile', (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();

      if (!token || !db.tokens || !db.tokens[token]) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      const userId = db.tokens[token];
      const user = (db.users || {})[userId];
      if (!user) {
        return res.status(401).json({ ok: false, error: 'User not found' });
      }

      const { name, tier } = req.body || {};
      if (name) user.name = name.trim();
      if (tier) user.tier = tier.trim();

      saveDatabase(db);

      res.json({
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          tier: user.tier,
          createdAt: user.createdAt
        }
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  /* -------------------------------------------------------------------------
   * CLOUD SYNC API ROUTES (Lightweight Cross-Device Database)
   * ------------------------------------------------------------------------- */
  
  // Health & Status
  app.get('/api/cloud-sync/status', (req, res) => {
    const vaultCount = Object.keys(db.vaults).length;
    let totalTxns = 0;
    Object.values(db.vaults).forEach(v => {
      totalTxns += (v.transactions || []).length;
    });

    res.json({
      ok: true,
      service: 'Forecaster Pro Cloud Sync Service',
      version: db.version,
      vaultCount,
      totalTxns,
      serverTime: new Date().toISOString()
    });
  });

  // Pull vault data
  app.get('/api/cloud-sync/vault/:vaultId', (req, res) => {
    const vaultId = (req.params.vaultId || DEFAULT_VAULT_ID).trim().toLowerCase();
    const vault = db.vaults[vaultId] || {
      vaultId,
      updatedAt: new Date().toISOString(),
      transactions: [],
      accounts: [],
      accountTransfers: []
    };
    res.json({ ok: true, vault });
  });

  // Push / Merge vault data
  app.post('/api/cloud-sync/vault/:vaultId', (req, res) => {
    const vaultId = (req.params.vaultId || DEFAULT_VAULT_ID).trim().toLowerCase();
    const incoming = req.body || {};

    let current = db.vaults[vaultId];
    if (!current) {
      current = {
        vaultId,
        updatedAt: new Date().toISOString(),
        transactions: [],
        accounts: [],
        accountTransfers: []
      };
      db.vaults[vaultId] = current;
    }

    // Smart merge transactions (deduplicate by id, keep latest or merge)
    if (Array.isArray(incoming.transactions)) {
      const txnMap = new Map();
      (current.transactions || []).forEach(t => { if (t && t.id) txnMap.set(t.id, t); });
      incoming.transactions.forEach((t: any) => { if (t && t.id) txnMap.set(t.id, t); });
      current.transactions = Array.from(txnMap.values());
    }

    // Smart merge accounts (deduplicate by id)
    if (Array.isArray(incoming.accounts)) {
      const accMap = new Map();
      (current.accounts || []).forEach(a => { if (a && a.id) accMap.set(a.id, a); });
      incoming.accounts.forEach((a: any) => { if (a && a.id) accMap.set(a.id, a); });
      current.accounts = Array.from(accMap.values());
    }

    // Smart merge transfers (deduplicate by id)
    if (Array.isArray(incoming.accountTransfers)) {
      const trMap = new Map();
      (current.accountTransfers || []).forEach(tr => { if (tr && tr.id) trMap.set(tr.id, tr); });
      incoming.accountTransfers.forEach((tr: any) => { if (tr && tr.id) trMap.set(tr.id, tr); });
      current.accountTransfers = Array.from(trMap.values());
    }

    if (incoming.budgetLimits) current.budgetLimits = incoming.budgetLimits;
    if (Array.isArray(incoming.stockData)) current.stockData = incoming.stockData;
    if (Array.isArray(incoming.pharmacyData)) current.pharmacyData = incoming.pharmacyData;
    if (incoming.profileUser) current.profileUser = incoming.profileUser;

    current.updatedAt = new Date().toISOString();
    saveDatabase(db);

    res.json({
      ok: true,
      vaultId,
      updatedAt: current.updatedAt,
      transactionCount: current.transactions.length,
      accountCount: current.accounts.length,
      transferCount: current.accountTransfers.length,
      vault: current
    });
  });

  // Dedicated endpoints for transaction history cross-device
  app.get('/api/cloud-sync/transactions', (req, res) => {
    const vaultId = String(req.query.vaultId || DEFAULT_VAULT_ID).trim().toLowerCase();
    const vault = db.vaults[vaultId] || { transactions: [] };
    res.json({ ok: true, vaultId, transactions: vault.transactions || [] });
  });

  app.post('/api/cloud-sync/transactions', (req, res) => {
    const vaultId = String(req.query.vaultId || req.body.vaultId || DEFAULT_VAULT_ID).trim().toLowerCase();
    const newTxns = Array.isArray(req.body.transactions) ? req.body.transactions : (req.body.transaction ? [req.body.transaction] : []);

    let vault = db.vaults[vaultId];
    if (!vault) {
      vault = {
        vaultId,
        updatedAt: new Date().toISOString(),
        transactions: [],
        accounts: [],
        accountTransfers: []
      };
      db.vaults[vaultId] = vault;
    }

    const txnMap = new Map();
    (vault.transactions || []).forEach(t => { if (t && t.id) txnMap.set(t.id, t); });
    newTxns.forEach((t: any) => { if (t && t.id) txnMap.set(t.id, t); });
    vault.transactions = Array.from(txnMap.values());
    vault.updatedAt = new Date().toISOString();
    saveDatabase(db);

    res.json({ ok: true, count: vault.transactions.length, transactions: vault.transactions });
  });

  /* -------------------------------------------------------------------------
   * VITE MIDDLEWARE / STATIC ASSETS
   * ------------------------------------------------------------------------- */
  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(__dirname, 'dist'))) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Forecaster Pro] Server with Cloud Sync listening at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
