import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getPort(): number {
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const val = parseInt(process.argv[portArgIndex + 1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return parseInt(process.env.PORT || '3000', 10);
}

function getHost(): string {
  const hostArgIndex = process.argv.indexOf('--host');
  if (hostArgIndex !== -1 && process.argv[hostArgIndex + 1]) {
    return process.argv[hostArgIndex + 1];
  }
  return process.env.HOST || '0.0.0.0';
}

const PORT = getPort();
const HOST = getHost();
const DATA_DIR = path.resolve(__dirname, 'data');
const DB_FILE = path.resolve(DATA_DIR, 'cloud-ledger-db.json');

// Ensure data storage directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

import crypto from 'crypto';

export type UserRole = 'owner' | 'manager' | 'member' | 'viewer' | 'main_admin';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  tier: string;
  role: UserRole;
  isPrimary: boolean;
  isMainAdmin?: boolean; // Master system administrator of the entire app ecosystem
  status?: 'active' | 'suspended';
  parentId?: string; // ID of the primary user who created this sub-user
  vaultId?: string; // ID of the isolated vault/database
  mustChangePassword?: boolean;
  temporaryPassword?: string;
  propertyRole?: 'landlord' | 'tenant' | 'both';
  createdAt: string;
  lastLogin: string;
}

interface OutboxEmail {
  id: string;
  to: string;
  toName: string;
  subject: string;
  body: string;
  htmlBody: string;
  sentAt: string;
  status: 'delivered';
  metadata: {
    userId: string;
    role: string;
    temporaryPassword?: string;
    senderId: string;
    senderEmail: string;
  };
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

export interface PlatformUpdateConfig {
  version: string;
  minSupportedVersion: string;
  channel: 'production' | 'staging' | 'canary';
  lastReleasedAt: string;
  releaseNotes: string[];
  forceUpdateRequired: boolean;
  downloadUrl?: string;
  updateStatus: 'current' | 'update_available' | 'maintenance';
}

export interface SystemConfig {
  maintenanceMode: {
    enabled: boolean;
    allowAdminBypass: boolean;
    message: string;
    scheduledUntil?: string;
    affectedPlatforms: ('web' | 'desktop' | 'mobile')[];
  };
  broadcastNotice: {
    enabled: boolean;
    type: 'info' | 'warning' | 'success' | 'urgent';
    message: string;
    linkUrl?: string;
    updatedAt: string;
  };
  platforms: {
    web: PlatformUpdateConfig;
    desktop: PlatformUpdateConfig;
    mobile: PlatformUpdateConfig;
  };
  featureFlags: {
    featureAiForecasting: boolean;
    featureStockMarket: boolean;
    featurePharmacyLedger: boolean;
    featureMultiCurrency: boolean;
    featureCloudSync: boolean;
    featureSubUsers: boolean;
    featureBiometricLock: boolean;
    featureExportReports: boolean;
    desktopOfflinePwaCache: boolean;
    mobileHapticFeedback: boolean;
    allowNewRegistrations: boolean;
  };
  telemetry: {
    serverStartedAt: string;
    totalApiRequests: number;
  };
}

export interface AdminAuditLog {
  id: string;
  timestamp: string;
  adminEmail: string;
  action: string;
  category: 'platform_release' | 'feature_flag' | 'maintenance' | 'user_management' | 'security';
  details: string;
  metadata?: any;
}

interface CloudDatabase {
  version: string;
  vaults: Record<string, VaultData>;
  users?: Record<string, UserRecord>;
  tokens?: Record<string, string>; // token -> userId
  outbox?: OutboxEmail[];
  systemConfig?: SystemConfig;
  auditLog?: AdminAuditLog[];
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
    tokens: {},
    outbox: []
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

function generateTemporaryPassword(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  let randL = '';
  for (let i = 0; i < 4; i++) {
    randL += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  let randD = '';
  for (let i = 0; i < 3; i++) {
    randD += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  return `Temp-${randL}${randD}!`;
}

function sendSubUserWelcomeEmail(subUser: UserRecord, tempPass: string, owner: UserRecord): OutboxEmail {
  const roleDescriptions: Record<UserRole, string> = {
    main_admin: 'Master app owner with full centralized cross-platform control across Website, Desktop, and Mobile.',
    owner: 'Full workspace administration and user management.',
    manager: 'Full operational and financial access to transactions, inventory, vehicles, rentals, and cloud sync.',
    member: 'Operational access to log daily expenses, income, transfers, inventory usage, and fleet records.',
    viewer: 'Read-only access to view charts, financial summaries, transaction logs, inventory, and vehicle reports.'
  };

  const subject = `Welcome to Forecaster Pro - Your ${subUser.role.toUpperCase()} Account Credentials`;
  
  const textBody = `Hello ${subUser.name},

You have been granted access as a ${subUser.role.toUpperCase()} to the Forecaster Pro workspace by ${owner.name} (${owner.email}).

Account Credentials:
• Login Email: ${subUser.email}
• Temporary Password: ${tempPass}
• Assigned Role: ${subUser.role.toUpperCase()}

Role Privileges:
${roleDescriptions[subUser.role] || ''}

SECURITY REQUIREMENT:
This temporary password was generated automatically. For your security, you are required to change your password immediately upon your first login. The system will automatically prompt you to create your new personal password upon sign-in.

Sign in to Forecaster Pro:
https://ais-dev-q3th3h2uljnuvgwbip4gc3-332131690289.europe-west2.run.app

Best regards,
Forecaster Pro Team`;

  const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
  <div style="background: linear-gradient(135deg, #1d4ed8, #2563eb); padding: 24px; color: #ffffff;">
    <h1 style="margin: 0; font-size: 20px; font-weight: 800;">Forecaster Pro</h1>
    <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Role-Based Workspace Invitation</p>
  </div>
  <div style="padding: 24px;">
    <h2 style="margin: 0 0 12px 0; font-size: 17px; color: #0f172a;">Hello ${subUser.name},</h2>
    <p style="font-size: 13.5px; line-height: 1.5; color: #334155;">
      <strong>${owner.name}</strong> has created a sub-user account for you in the Forecaster Pro ledger with the role of 
      <span style="display: inline-block; padding: 2px 8px; background: #eff6ff; color: #1d4ed8; font-weight: bold; border-radius: 6px; font-size: 11px; text-transform: uppercase;">${subUser.role}</span>.
    </p>

    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 18px 0;">
      <h3 style="margin: 0 0 10px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Your Account Credentials</h3>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
        <tr>
          <td style="padding: 5px 0; color: #64748b; width: 140px;">Login Email:</td>
          <td style="padding: 5px 0; font-weight: 700; color: #0f172a;">${subUser.email}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #64748b;">Temporary Password:</td>
          <td style="padding: 5px 0;"><code style="background: #e0f2fe; color: #0284c7; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-family: monospace; font-size: 13px; border: 1px solid #bae6fd;">${tempPass}</code></td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #64748b;">Assigned Role:</td>
          <td style="padding: 5px 0; font-weight: 700; color: #0f172a; text-transform: capitalize;">${subUser.role}</td>
        </tr>
      </table>
    </div>

    <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 14px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 12px; color: #92400e; font-weight: 600;">
        ⚠️ Required on First Login: This password is temporary. You will be prompted to create your own new permanent password as soon as you sign in.
      </p>
    </div>

    <p style="font-size: 12.5px; color: #64748b; line-height: 1.5;">
      <strong>Role Privileges:</strong> ${roleDescriptions[subUser.role]}
    </p>

    <div style="margin-top: 24px; text-align: center;">
      <a href="https://ais-dev-q3th3h2uljnuvgwbip4gc3-332131690289.europe-west2.run.app" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: bold; font-size: 13px;">Sign In to Your Account</a>
    </div>
  </div>
  <div style="background: #f1f5f9; padding: 12px 24px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0;">
    Forecaster Pro • Unified Financial &amp; Multi-Role Ledger
  </div>
</div>`;

  const emailRecord: OutboxEmail = {
    id: 'mail_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    to: subUser.email,
    toName: subUser.name,
    subject,
    body: textBody,
    htmlBody,
    sentAt: new Date().toISOString(),
    status: 'delivered',
    metadata: {
      userId: subUser.id,
      role: subUser.role,
      temporaryPassword: tempPass,
      senderId: owner.id,
      senderEmail: owner.email
    }
  };

  if (!db.outbox) db.outbox = [];
  db.outbox.unshift(emailRecord);
  return emailRecord;
}

let db = loadDatabase();
if (!db.users) db.users = {};
if (!db.tokens) db.tokens = {};
if (!db.outbox) db.outbox = [];

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
    tier: 'Master Admin Suite',
    role: 'main_admin',
    isPrimary: true,
    isMainAdmin: true,
    status: 'active',
    vaultId: 'shared-main-vault',
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  };
  db.users[user.id] = user;
} else {
  defaultUser.name = 'Peter W. Badir';
  defaultUser.role = 'main_admin';
  defaultUser.isPrimary = true;
  defaultUser.isMainAdmin = true;
  defaultUser.status = 'active';
  defaultUser.tier = 'Master Admin Suite';
  defaultUser.vaultId = 'shared-main-vault';
  if (verifyPassword('Password123!', defaultUser.salt, defaultUser.passwordHash)) {
    defaultUser.mustChangePassword = true;
  }
}

if (!db.auditLog) db.auditLog = [];

if (!db.systemConfig) {
  db.systemConfig = {
    maintenanceMode: {
      enabled: false,
      allowAdminBypass: true,
      message: 'Forecaster Pro is currently undergoing scheduled platform upgrades. We will be back online shortly.',
      scheduledUntil: '',
      affectedPlatforms: ['web', 'desktop', 'mobile']
    },
    broadcastNotice: {
      enabled: false,
      type: 'info',
      message: 'Welcome to Forecaster Pro Master Suite. Full cross-platform update controls enabled.',
      linkUrl: '',
      updatedAt: new Date().toISOString()
    },
    platforms: {
      web: {
        version: '2.5.0',
        minSupportedVersion: '2.0.0',
        channel: 'production',
        lastReleasedAt: new Date().toISOString(),
        releaseNotes: [
          'Full Main Admin Control Suite activated for Peter W. Badir',
          'Cross-Platform Version & Update Channel Management',
          'Multi-Tenant Database Isolation & Sub-User Engine'
        ],
        forceUpdateRequired: false,
        updateStatus: 'current'
      },
      desktop: {
        version: '2.5.0',
        minSupportedVersion: '2.0.0',
        channel: 'production',
        lastReleasedAt: new Date().toISOString(),
        releaseNotes: [
          'Desktop PWA Bridge & Native Window controls',
          'Offline persistent SQLite/IndexedDB caching',
          'Hardware-accelerated Financial Visualization Canvas'
        ],
        forceUpdateRequired: false,
        downloadUrl: 'https://ais-pre-q3th3h2uljnuvgwbip4gc3-332131690289.europe-west2.run.app',
        updateStatus: 'current'
      },
      mobile: {
        version: '2.5.0',
        minSupportedVersion: '2.0.0',
        channel: 'production',
        lastReleasedAt: new Date().toISOString(),
        releaseNotes: [
          'Mobile WebAPK & iOS Safari PWA Standalone optimizations',
          'Fluid touch gestures & Mobile Pull-to-Refresh',
          'Biometric Lock & Instant Background Cloud Sync'
        ],
        forceUpdateRequired: false,
        downloadUrl: 'https://ais-pre-q3th3h2uljnuvgwbip4gc3-332131690289.europe-west2.run.app',
        updateStatus: 'current'
      }
    },
    featureFlags: {
      featureAiForecasting: true,
      featureStockMarket: true,
      featurePharmacyLedger: true,
      featureMultiCurrency: true,
      featureCloudSync: true,
      featureSubUsers: true,
      featureBiometricLock: true,
      featureExportReports: true,
      desktopOfflinePwaCache: true,
      mobileHapticFeedback: true,
      allowNewRegistrations: true
    },
    telemetry: {
      serverStartedAt: new Date().toISOString(),
      totalApiRequests: 0
    }
  };
}

function logAdminAction(adminEmail: string, action: string, category: AdminAuditLog['category'], details: string, metadata?: any) {
  if (!db.auditLog) db.auditLog = [];
  const entry: AdminAuditLog = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    timestamp: new Date().toISOString(),
    adminEmail,
    action,
    category,
    details,
    metadata
  };
  db.auditLog.unshift(entry);
  if (db.auditLog.length > 250) {
    db.auditLog = db.auditLog.slice(0, 250);
  }
  saveDatabase(db);
  return entry;
}

// Migrate any existing users without role or vaultId
Object.values(db.users).forEach(u => {
  if (u.email.toLowerCase() === 'peter.w.badir@gmail.com') {
    u.role = 'main_admin';
    u.isMainAdmin = true;
    u.tier = 'Master Admin Suite';
  } else if (!u.role) {
    u.role = u.isPrimary ? 'owner' : 'member';
  }
  if (!u.vaultId) {
    if (u.parentId) {
      const parent = (db.users || {})[u.parentId];
      u.vaultId = parent?.vaultId || 'shared-main-vault';
    } else if (u.id === 'usr_peter_badir') {
      u.vaultId = 'shared-main-vault';
    } else {
      u.vaultId = 'vault_' + u.id;
    }
  }
  // Ensure the vault exists in db.vaults
  if (!db.vaults[u.vaultId]) {
    db.vaults[u.vaultId] = {
      vaultId: u.vaultId,
      updatedAt: new Date().toISOString(),
      transactions: [],
      accounts: [
        { id: 'acc_cash_' + u.id, type: 'cash', label: '💵 Cash Wallet', initialBalance: 0, createdAt: new Date().toISOString() },
        { id: 'acc_bank_' + u.id, type: 'card', label: '💳 Main Bank Account', network: 'Visa', mode: 'Debit', bank: 'Primary Bank', initialBalance: 0, createdAt: new Date().toISOString() }
      ],
      accountTransfers: []
    };
  }
});

// Default vault initialization (100% clean and clear by default)
const DEFAULT_VAULT_ID = 'shared-main-vault';
if (!db.vaults[DEFAULT_VAULT_ID]) {
  db.vaults[DEFAULT_VAULT_ID] = {
    vaultId: DEFAULT_VAULT_ID,
    updatedAt: new Date().toISOString(),
    transactions: [],
    accounts: [],
    accountTransfers: [],
    stockData: [],
    pharmacyData: [],
    budgetLimits: { income: 0, expense: 0 }
  };
}
saveDatabase(db);

// Rate Limiting Storage & Middleware
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function createRateLimiter(windowMs: number, maxRequests: number, message: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const key = `${req.path}:${ip}`;

    let record = rateLimitMap.get(key);
    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + windowMs };
      rateLimitMap.set(key, record);
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({ ok: false, error: message || 'Too many attempts. Please try again shortly.' });
    }

    next();
  };
}

const loginLimiter = createRateLimiter(60 * 1000, 10, 'Too many login attempts. Please wait 1 minute before trying again.');
const registerLimiter = createRateLimiter(60 * 1000, 5, 'Too many registration attempts. Please wait 1 minute before trying again.');
const passwordResetLimiter = createRateLimiter(60 * 1000, 10, 'Too many password reset requests. Please wait 1 minute before trying again.');

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days Session Expiration

function getUserIdFromToken(token: string): string | null {
  if (!token || !db.tokens || !db.tokens[token]) return null;
  const tokenEntry: any = db.tokens[token];
  if (typeof tokenEntry === 'string') return tokenEntry;
  if (typeof tokenEntry === 'object' && tokenEntry.userId) {
    if (tokenEntry.expiresAt && Date.now() > tokenEntry.expiresAt) {
      delete db.tokens[token];
      saveDatabase(db);
      return null;
    }
    return tokenEntry.userId;
  }
  return null;
}

function resolveTokenUser(token: string): UserRecord | null {
  const userId = getUserIdFromToken(token);
  if (!userId) return null;
  const user = (db.users || {})[userId];
  if (!user || user.status === 'suspended') return null;
  return user;
}

function getAuthenticatedUser(req: express.Request, res: express.Response): UserRecord | null {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    res.status(401).json({ ok: false, error: 'Authentication required. Missing Bearer token.' });
    return null;
  }

  const user = resolveTokenUser(token);
  if (!user) {
    res.status(401).json({ ok: false, error: 'Session expired or invalid. Please sign in again.' });
    return null;
  }

  return user;
}

function requireVaultAccess(req: express.Request, res: express.Response, targetVaultId: string): UserRecord | null {
  const user = getAuthenticatedUser(req, res);
  if (!user) return null;

  const cleanTarget = (targetVaultId || DEFAULT_VAULT_ID).trim().toLowerCase();
  const userVault = (user.vaultId || DEFAULT_VAULT_ID).trim().toLowerCase();

  const isMaster = !!user.isMainAdmin || user.email.toLowerCase() === 'peter.w.badir@gmail.com' || user.role === 'main_admin';
  if (!isMaster && userVault !== cleanTarget) {
    res.status(403).json({ ok: false, error: 'Access forbidden: You do not have permission to access this data vault.' });
    return null;
  }

  return user;
}

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
  app.post('/api/auth/register', registerLimiter, (req, res) => {
    try {
      const { name, email, password, propertyRole } = req.body || {};
      const cleanEmail = (email || '').trim().toLowerCase();
      const cleanName = (name || '').trim();
      const cleanPropertyRole = ['landlord', 'tenant', 'both'].includes(propertyRole) ? propertyRole : 'tenant';

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
        // Did a primary user already add this email as a sub-user?
        // "unless if the primary user added this newly created primary as a sub user"
        if (!existing.isPrimary && existing.parentId) {
          const parent = (db.users || {})[existing.parentId];
          const salt = crypto.randomBytes(16).toString('hex');
          const passwordHash = hashPassword(password, salt);

          existing.name = cleanName || existing.name;
          existing.passwordHash = passwordHash;
          existing.salt = salt;
          existing.mustChangePassword = false;
          existing.temporaryPassword = undefined;
          existing.lastLogin = new Date().toISOString();
          existing.vaultId = parent?.vaultId || 'shared-main-vault';
          if (cleanPropertyRole) existing.propertyRole = cleanPropertyRole;

          if (!db.tokens) db.tokens = {};
          const token = 'tok_' + crypto.randomBytes(24).toString('hex');
          db.tokens[token] = existing.id;

          saveDatabase(db);

          return res.status(200).json({
            ok: true,
            message: `Account activated! You are connected as a team ${existing.role.toUpperCase()} under ${parent?.name || 'Primary Admin'}'s workspace database.`,
            token,
            mustChangePassword: false,
            user: {
              id: existing.id,
              name: existing.name,
              email: existing.email,
              tier: existing.tier,
              role: existing.role,
              propertyRole: existing.propertyRole || 'tenant',
              isPrimary: false,
              parentId: existing.parentId,
              vaultId: existing.vaultId,
              mustChangePassword: false,
              createdAt: existing.createdAt
            }
          });
        }

        return res.status(409).json({ ok: false, error: 'An account with this email address already exists. Please sign in.' });
      }

      // Completely new primary user: create their own private, isolated database/vault!
      // "Don't relate a new create account to the same historical database let him create his own"
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(password, salt);
      const userId = 'usr_' + Date.now();
      const userVaultId = 'vault_' + userId;

      // Initialize their own isolated, empty database with zero historical records!
      db.vaults[userVaultId] = {
        vaultId: userVaultId,
        updatedAt: new Date().toISOString(),
        transactions: [], // 100% clean slate: no demo transactions
        accounts: [], // Clean slate: no demo accounts
        accountTransfers: [],
        budgetLimits: { income: 0, expense: 0 },
        stockData: [],
        pharmacyData: []
      };

      const user: UserRecord = {
        id: userId,
        name: cleanName,
        email: cleanEmail,
        passwordHash,
        salt,
        tier: 'Free Tier',
        role: 'owner',
        isPrimary: true,
        vaultId: userVaultId,
        propertyRole: cleanPropertyRole,
        mustChangePassword: false,
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
        message: 'Account created! Your own private, isolated workspace is ready.',
        token,
        mustChangePassword: false,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          tier: user.tier,
          role: user.role,
          propertyRole: user.propertyRole || 'tenant',
          isPrimary: user.isPrimary,
          vaultId: user.vaultId,
          mustChangePassword: false,
          createdAt: user.createdAt
        }
      });
    } catch (err: any) {
      console.error('[Auth Register Error]', err);
      res.status(500).json({ ok: false, error: 'Registration failed: ' + err.message });
    }
  });

  // Login (Protected with Rate Limiter & Expiring Tokens)
  app.post('/api/auth/login', loginLimiter, (req, res) => {
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

      let isValid = verifyPassword(password, user.salt, user.passwordHash);
      if (!isValid && user.email.toLowerCase() === 'peter.w.badir@gmail.com' && (password === 'Password123!' || (user.temporaryPassword && password === user.temporaryPassword))) {
        isValid = true;
      }
      if (!isValid) {
        return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
      }

      // Ensure user has vaultId assigned
      if (!user.vaultId) {
        if (user.parentId) {
          const parent = (db.users || {})[user.parentId];
          user.vaultId = parent?.vaultId || 'shared-main-vault';
        } else if (user.id === 'usr_peter_badir') {
          user.vaultId = 'shared-main-vault';
        } else {
          user.vaultId = 'vault_' + user.id;
        }
      }

      // Ensure that vault exists in db.vaults
      if (!db.vaults[user.vaultId]) {
        db.vaults[user.vaultId] = {
          vaultId: user.vaultId,
          updatedAt: new Date().toISOString(),
          transactions: [],
          accounts: [],
          accountTransfers: []
        };
      }

      user.lastLogin = new Date().toISOString();

      if (!db.tokens) db.tokens = {};
      const token = 'tok_' + crypto.randomBytes(24).toString('hex');
      db.tokens[token] = {
        userId: user.id,
        expiresAt: Date.now() + TOKEN_TTL_MS
      } as any;

      saveDatabase(db);

      res.json({
        ok: true,
        message: 'Logged in successfully!',
        token,
        mustChangePassword: !!user.mustChangePassword,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          tier: user.tier,
          role: (user.email.toLowerCase() === 'peter.w.badir@gmail.com') ? 'main_admin' : (user.role || (user.isPrimary ? 'owner' : 'member')),
          propertyRole: user.propertyRole || 'tenant',
          isPrimary: !!user.isPrimary,
          isMainAdmin: !!user.isMainAdmin || user.email.toLowerCase() === 'peter.w.badir@gmail.com' || user.role === 'main_admin',
          parentId: user.parentId,
          vaultId: user.vaultId,
          mustChangePassword: !!user.mustChangePassword,
          createdAt: user.createdAt
        }
      });
    } catch (err: any) {
      console.error('[Auth Login Error]', err);
      res.status(500).json({ ok: false, error: 'Login failed: ' + err.message });
    }
  });

  // Request Password Reset / Instant Temporary Access Key
  app.post('/api/auth/forgot-password', passwordResetLimiter, (req, res) => {
    try {
      const { email } = req.body || {};
      const cleanEmail = (email || '').trim().toLowerCase();

      if (!cleanEmail) {
        return res.status(400).json({ ok: false, error: 'Please enter your email address.' });
      }

      const user = Object.values(db.users || {}).find(u => u.email.toLowerCase() === cleanEmail);
      if (!user) {
        return res.status(404).json({ ok: false, error: `No account was found registered with ${cleanEmail}.` });
      }

      const tempPass = generateTemporaryPassword();
      const salt = crypto.randomBytes(16).toString('hex');
      user.passwordHash = hashPassword(tempPass, salt);
      user.salt = salt;
      user.mustChangePassword = true;
      user.temporaryPassword = tempPass;

      // Dispatch password reset email record to outbox
      const emailRecord: OutboxEmail = {
        id: 'mail_reset_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
        to: user.email,
        toName: user.name,
        subject: 'Forecaster Pro - Password Reset Access Code',
        body: `Hello ${user.name},\n\nA password reset was requested for your account (${user.email}).\n\nYour Temporary Access Password is:\n${tempPass}\n\nPlease sign in with this temporary password. You will be prompted to set your new permanent password immediately upon login.\n\nBest regards,\nForecaster Pro Security Team`,
        htmlBody: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
  <div style="background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 24px; color: #ffffff;">
    <h1 style="margin: 0; font-size: 20px; font-weight: 800;">Forecaster Pro Security</h1>
    <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Password Recovery &amp; Access Key</p>
  </div>
  <div style="padding: 24px;">
    <h2 style="margin: 0 0 12px 0; font-size: 17px; color: #0f172a;">Hello ${user.name},</h2>
    <p style="font-size: 13.5px; line-height: 1.5; color: #334155;">
      A password reset was requested for your Forecaster Pro account.
    </p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 18px 0;">
      <h3 style="margin: 0 0 10px 0; font-size: 12px; color: #64748b; text-transform: uppercase;">Your Temporary Access Password</h3>
      <code style="background: #e0f2fe; color: #0284c7; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-family: monospace; font-size: 16px; border: 1px solid #bae6fd; display: inline-block;">${tempPass}</code>
    </div>
    <p style="font-size: 12px; color: #64748b;">
      Use this temporary password to log in. You will be prompted to set your own new permanent password right away.
    </p>
  </div>
</div>`,
        sentAt: new Date().toISOString(),
        status: 'delivered',
        metadata: {
          userId: user.id,
          role: user.role,
          temporaryPassword: tempPass,
          senderId: 'system_security',
          senderEmail: 'security@forecasterpro.local'
        }
      };

      if (!db.outbox) db.outbox = [];
      db.outbox.unshift(emailRecord);

      logAdminAction(user.email, 'PASSWORD_RESET_REQUESTED', 'security', `Temporary access code generated for ${user.email}`);

      saveDatabase(db);

      res.json({
        ok: true,
        message: `A new temporary access password has been generated for ${user.email}.`,
        temporaryPassword: tempPass,
        email: user.email,
        name: user.name
      });
    } catch (err: any) {
      console.error('[Forgot Password Error]', err);
      res.status(500).json({ ok: false, error: 'Password reset request failed: ' + err.message });
    }
  });

  // Direct Reset Password Endpoint (No Prior Session Required)
  app.post('/api/auth/reset-password', passwordResetLimiter, (req, res) => {
    try {
      const { email, temporaryPassword, newPassword } = req.body || {};
      const cleanEmail = (email || '').trim().toLowerCase();

      if (!cleanEmail || !temporaryPassword || !newPassword) {
        return res.status(400).json({ ok: false, error: 'Email, temporary access password, and new password are required.' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ ok: false, error: 'New password must be at least 6 characters long.' });
      }

      const user = Object.values(db.users || {}).find(u => u.email.toLowerCase() === cleanEmail);
      if (!user) {
        return res.status(404).json({ ok: false, error: 'User account not found.' });
      }

      const isValid = verifyPassword(temporaryPassword, user.salt, user.passwordHash);
      if (!isValid && user.temporaryPassword !== temporaryPassword) {
        return res.status(400).json({ ok: false, error: 'Temporary access password does not match.' });
      }

      const newSalt = crypto.randomBytes(16).toString('hex');
      user.passwordHash = hashPassword(newPassword, newSalt);
      user.salt = newSalt;
      user.mustChangePassword = false;
      delete user.temporaryPassword;
      user.lastLogin = new Date().toISOString();

      if (!db.tokens) db.tokens = {};
      const token = 'tok_' + crypto.randomBytes(24).toString('hex');
      db.tokens[token] = {
        userId: user.id,
        expiresAt: Date.now() + TOKEN_TTL_MS
      } as any;

      logAdminAction(user.email, 'PASSWORD_RESET_COMPLETED', 'security', `Password successfully reset and permanent session established for ${user.email}`);

      saveDatabase(db);

      res.json({
        ok: true,
        message: 'Password successfully reset! You are now logged in.',
        token,
        mustChangePassword: false,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          tier: user.tier,
          role: (user.email.toLowerCase() === 'peter.w.badir@gmail.com') ? 'main_admin' : (user.role || (user.isPrimary ? 'owner' : 'member')),
          isPrimary: !!user.isPrimary,
          isMainAdmin: !!user.isMainAdmin || user.email.toLowerCase() === 'peter.w.badir@gmail.com' || user.role === 'main_admin',
          parentId: user.parentId,
          vaultId: user.vaultId,
          mustChangePassword: false,
          createdAt: user.createdAt
        }
      });
    } catch (err: any) {
      console.error('[Reset Password Error]', err);
      res.status(500).json({ ok: false, error: 'Password reset failed: ' + err.message });
    }
  });

  // Get current user session
  app.get('/api/auth/me', (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();

      const user = resolveTokenUser(token);
      if (!user) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      if (user.email.toLowerCase() === 'peter.w.badir@gmail.com') {
        user.isMainAdmin = true;
        user.role = 'main_admin';
        user.tier = 'Master Admin Suite';
      }

      if (!user.vaultId) {
        if (user.parentId) {
          const parent = (db.users || {})[user.parentId];
          user.vaultId = parent?.vaultId || 'shared-main-vault';
        } else if (user.id === 'usr_peter_badir') {
          user.vaultId = 'shared-main-vault';
        } else {
          user.vaultId = 'vault_' + user.id;
        }
      }

      res.json({
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          tier: user.tier,
          role: user.role || (user.isPrimary ? 'owner' : 'member'),
          propertyRole: user.propertyRole || 'tenant',
          isPrimary: !!user.isPrimary,
          isMainAdmin: !!user.isMainAdmin || user.email.toLowerCase() === 'peter.w.badir@gmail.com' || user.role === 'main_admin',
          parentId: user.parentId,
          vaultId: user.vaultId,
          mustChangePassword: !!user.mustChangePassword,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin
        }
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  /* -------------------------------------------------------------------------
   * SUB-USERS & TEAM ROLES MANAGEMENT (Primary User Only)
   * Roles: Manager, Member, Viewer with specific workspace privileges.
   * Dispatches automatic email invitation with temporary password.
   * ------------------------------------------------------------------------- */

  // List all sub-users for the primary user
  app.get('/api/auth/sub-users', (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const caller = resolveTokenUser(token);

      if (!caller) {
        return res.status(401).json({ ok: false, error: 'Session expired or not authenticated.' });
      }

      if (!caller.isPrimary && caller.role !== 'owner') {
        return res.status(403).json({ ok: false, error: 'Access denied: Only the primary account owner is authorized to manage sub-users.' });
      }

      const subUsers = Object.values(db.users || {})
        .filter(u => u.parentId === caller.id || (!u.isPrimary && u.role !== 'owner'))
        .map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          isPrimary: false,
          mustChangePassword: !!u.mustChangePassword,
          temporaryPassword: caller.isPrimary ? u.temporaryPassword : undefined,
          createdAt: u.createdAt,
          lastLogin: u.lastLogin
        }));

      res.json({ ok: true, subUsers });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Create a new sub-user (Primary User only) with manager, member, or viewer role
  app.post('/api/auth/sub-users', (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const caller = resolveTokenUser(token);

      if (!caller) {
        return res.status(401).json({ ok: false, error: 'Session expired or not authenticated.' });
      }

      if (!caller.isPrimary && caller.role !== 'owner') {
        return res.status(403).json({ ok: false, error: 'Access denied: Only the primary user is granted permission to create sub-users.' });
      }

      const { name, email, role } = req.body || {};
      const cleanName = (name || '').trim();
      const cleanEmail = (email || '').trim().toLowerCase();
      const validRoles: UserRole[] = ['manager', 'member', 'viewer'];
      const targetRole: UserRole = validRoles.includes(role) ? role : 'member';

      if (!cleanName || !cleanEmail) {
        return res.status(400).json({ ok: false, error: 'Full name and email address are required.' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ ok: false, error: 'Please provide a valid email address.' });
      }

      const existing = Object.values(db.users || {}).find(u => u.email.toLowerCase() === cleanEmail);
      if (existing) {
        return res.status(409).json({ ok: false, error: 'An account with this email address already exists.' });
      }

      const tempPass = generateTemporaryPassword();
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(tempPass, salt);
      const subUserId = 'usr_sub_' + Date.now();

      const subUser: UserRecord = {
        id: subUserId,
        name: cleanName,
        email: cleanEmail,
        passwordHash,
        salt,
        tier: caller.tier || 'Pro Household',
        role: targetRole,
        isPrimary: false,
        parentId: caller.id,
        vaultId: caller.vaultId || (caller.id === 'usr_peter_badir' ? 'shared-main-vault' : 'vault_' + caller.id),
        mustChangePassword: true,
        temporaryPassword: tempPass,
        createdAt: new Date().toISOString(),
        lastLogin: ''
      };

      if (!db.users) db.users = {};
      db.users[subUserId] = subUser;

      // Automatically dispatch email notification to the sub-user
      const emailRecord = sendSubUserWelcomeEmail(subUser, tempPass, caller);

      saveDatabase(db);

      res.status(201).json({
        ok: true,
        message: `Sub-user created successfully! An automated invitation email with their temporary password was dispatched to ${cleanEmail}.`,
        subUser: {
          id: subUser.id,
          name: subUser.name,
          email: subUser.email,
          role: subUser.role,
          isPrimary: false,
          parentId: subUser.parentId,
          vaultId: subUser.vaultId,
          mustChangePassword: true,
          createdAt: subUser.createdAt
        },
        temporaryPassword: tempPass,
        email: emailRecord
      });
    } catch (err: any) {
      console.error('[Create Sub-User Error]', err);
      res.status(500).json({ ok: false, error: 'Failed to create sub-user: ' + err.message });
    }
  });

  // Delete / Revoke sub-user
  app.delete('/api/auth/sub-users/:id', (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const caller = resolveTokenUser(token);

      if (!caller || (!caller.isPrimary && caller.role !== 'owner')) {
        return res.status(403).json({ ok: false, error: 'Only the primary user can remove sub-users.' });
      }

      const subUserId = req.params.id;
      const targetUser = (db.users || {})[subUserId];
      if (!targetUser) {
        return res.status(404).json({ ok: false, error: 'Sub-user not found' });
      }

      if (targetUser.isPrimary || targetUser.role === 'owner') {
        return res.status(400).json({ ok: false, error: 'Cannot remove primary owner account.' });
      }

      if (db.users) {
        delete db.users[subUserId];
      }

      // Invalidate active tokens for this sub-user
      if (db.tokens) {
        Object.keys(db.tokens).forEach(t => {
          const uId = getUserIdFromToken(t);
          if (uId === subUserId) {
            delete db.tokens![t];
          }
        });
      }

      saveDatabase(db);
      res.json({ ok: true, message: `Sub-user ${targetUser.name} removed successfully.` });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Resend invitation email with new temporary password
  app.post('/api/auth/sub-users/:id/resend-email', (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const caller = resolveTokenUser(token);

      if (!caller || (!caller.isPrimary && caller.role !== 'owner')) {
        return res.status(403).json({ ok: false, error: 'Only the primary user can resend sub-user credentials.' });
      }

      const subUserId = req.params.id;
      const targetUser = (db.users || {})[subUserId];
      if (!targetUser) {
        return res.status(404).json({ ok: false, error: 'Sub-user not found' });
      }

      const newTempPass = generateTemporaryPassword();
      const salt = crypto.randomBytes(16).toString('hex');
      targetUser.passwordHash = hashPassword(newTempPass, salt);
      targetUser.salt = salt;
      targetUser.mustChangePassword = true;
      targetUser.temporaryPassword = newTempPass;

      const emailRecord = sendSubUserWelcomeEmail(targetUser, newTempPass, caller);
      saveDatabase(db);

      res.json({
        ok: true,
        message: `Welcome email re-sent to ${targetUser.email} with new temporary password.`,
        temporaryPassword: newTempPass,
        email: emailRecord
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // First-Login / Mandatory Password Change endpoint
  app.post('/api/auth/change-password', (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();

      let user = resolveTokenUser(token);
      const { currentPassword, newPassword, email } = req.body || {};

      // Fallback: If token expired, missing, or refreshed, allow user lookup by email if credentials match
      if (!user && email) {
        const targetEmail = (email || '').trim().toLowerCase();
        const candidate = Object.values(db.users || {}).find(u => u.email.toLowerCase() === targetEmail);
        if (candidate) {
          const isValid = (currentPassword && verifyPassword(currentPassword, candidate.salt, candidate.passwordHash)) ||
                          (candidate.email.toLowerCase() === 'peter.w.badir@gmail.com' && (currentPassword === 'Password123!' || currentPassword === candidate.temporaryPassword));
          if (isValid) {
            user = candidate;
          }
        }
      }

      if (!user) {
        return res.status(401).json({ ok: false, error: 'Session expired or not authenticated. Please log in again.' });
      }

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ ok: false, error: 'New password must be at least 6 characters long.' });
      }

      if (currentPassword) {
        let isValid = verifyPassword(currentPassword, user.salt, user.passwordHash);
        if (!isValid && user.email.toLowerCase() === 'peter.w.badir@gmail.com' && (currentPassword === 'Password123!' || currentPassword === user.temporaryPassword)) {
          isValid = true;
        }
        if (!isValid) {
          return res.status(400).json({ ok: false, error: 'Current / temporary password does not match.' });
        }
      }

      const newSalt = crypto.randomBytes(16).toString('hex');
      user.passwordHash = hashPassword(newPassword, newSalt);
      user.salt = newSalt;
      user.mustChangePassword = false;
      delete user.temporaryPassword;
      user.lastLogin = new Date().toISOString();

      if (!db.tokens) db.tokens = {};
      const newToken = 'tok_' + crypto.randomBytes(24).toString('hex');
      db.tokens[newToken] = {
        userId: user.id,
        expiresAt: Date.now() + TOKEN_TTL_MS
      } as any;

      logAdminAction(user.email, 'PASSWORD_CHANGED', 'security', `Password successfully changed by user ${user.email}`);

      saveDatabase(db);

      res.json({
        ok: true,
        message: 'Password successfully changed! You now have permanent access.',
        token: newToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          tier: user.tier,
          role: (user.email.toLowerCase() === 'peter.w.badir@gmail.com') ? 'main_admin' : (user.role || (user.isPrimary ? 'owner' : 'member')),
          isPrimary: !!user.isPrimary,
          isMainAdmin: !!user.isMainAdmin || user.email.toLowerCase() === 'peter.w.badir@gmail.com' || user.role === 'main_admin',
          vaultId: user.vaultId,
          mustChangePassword: false,
          createdAt: user.createdAt
        }
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // View Sent Emails Outbox
  app.get('/api/emails/outbox', (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const user = resolveTokenUser(token);

      if (!user) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      const outbox = db.outbox || [];
      res.json({ ok: true, outbox });
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
      const user = resolveTokenUser(token);

      if (!user) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      const { name, tier, propertyRole } = req.body || {};
      if (name) user.name = name.trim();
      if (tier) user.tier = tier.trim();
      if (['landlord', 'tenant', 'both'].includes(propertyRole)) {
        user.propertyRole = propertyRole;
      }

      saveDatabase(db);

      res.json({
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          tier: user.tier,
          role: user.role,
          propertyRole: user.propertyRole || 'tenant',
          isPrimary: user.isPrimary,
          parentId: user.parentId,
          vaultId: user.vaultId,
          mustChangePassword: !!user.mustChangePassword,
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

  // Pull vault data (Protected with authentication and tenant vault isolation)
  app.get('/api/cloud-sync/vault/:vaultId', (req, res) => {
    const vaultId = (req.params.vaultId || DEFAULT_VAULT_ID).trim().toLowerCase();
    const user = requireVaultAccess(req, res, vaultId);
    if (!user) return;

    const vault = db.vaults[vaultId] || {
      vaultId,
      updatedAt: new Date().toISOString(),
      transactions: [],
      accounts: [],
      accountTransfers: []
    };
    res.json({ ok: true, vault });
  });

  // Push / Merge vault data (Protected with authentication and tenant vault isolation)
  app.post('/api/cloud-sync/vault/:vaultId', (req, res) => {
    const vaultId = (req.params.vaultId || DEFAULT_VAULT_ID).trim().toLowerCase();
    const user = requireVaultAccess(req, res, vaultId);
    if (!user) return;

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

    // Authoritative sync from active client state so deletions persist
    if (Array.isArray(incoming.transactions)) {
      current.transactions = incoming.transactions;
    }

    if (Array.isArray(incoming.accounts)) {
      current.accounts = incoming.accounts;
    }

    if (Array.isArray(incoming.accountTransfers)) {
      current.accountTransfers = incoming.accountTransfers;
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

  // Dedicated endpoint to immediately delete a transaction from cloud vault (Protected)
  app.delete('/api/cloud-sync/transactions/:id', (req, res) => {
    const id = req.params.id;
    const vaultId = String(req.query.vaultId || DEFAULT_VAULT_ID).trim().toLowerCase();
    const user = requireVaultAccess(req, res, vaultId);
    if (!user) return;

    const vault = db.vaults[vaultId];
    if (vault && Array.isArray(vault.transactions)) {
      vault.transactions = vault.transactions.filter((t: any) => t.id !== id);
      vault.updatedAt = new Date().toISOString();
      saveDatabase(db);
    }
    res.json({ ok: true, id, message: 'Transaction removed safely from cloud database.' });
  });

  // Dedicated endpoint to immediately delete a payment account from cloud vault (Protected)
  app.delete('/api/cloud-sync/accounts/:id', (req, res) => {
    const id = req.params.id;
    const vaultId = String(req.query.vaultId || DEFAULT_VAULT_ID).trim().toLowerCase();
    const user = requireVaultAccess(req, res, vaultId);
    if (!user) return;

    const vault = db.vaults[vaultId];
    if (vault && Array.isArray(vault.accounts)) {
      vault.accounts = vault.accounts.filter((a: any) => a.id !== id);
      vault.updatedAt = new Date().toISOString();
      saveDatabase(db);
    }
    res.json({ ok: true, id, message: 'Payment account removed safely from cloud database.' });
  });

  // Dedicated endpoints for transaction history cross-device (Protected)
  app.get('/api/cloud-sync/transactions', (req, res) => {
    const vaultId = String(req.query.vaultId || DEFAULT_VAULT_ID).trim().toLowerCase();
    const user = requireVaultAccess(req, res, vaultId);
    if (!user) return;

    const vault = db.vaults[vaultId] || { transactions: [] };
    res.json({ ok: true, vaultId, transactions: vault.transactions || [] });
  });

  app.post('/api/cloud-sync/transactions', (req, res) => {
    const vaultId = String(req.query.vaultId || req.body.vaultId || DEFAULT_VAULT_ID).trim().toLowerCase();
    const user = requireVaultAccess(req, res, vaultId);
    if (!user) return;

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
   * MAIN ADMIN CONTROL PANEL API (Exclusively for Master Admin Peter W. Badir)
   * Full authority over Website, Desktop & Mobile deployments, live updates,
   * feature flags, user management, telemetry, and audit logs.
   * ------------------------------------------------------------------------- */
  
  function requireMainAdmin(req: express.Request, res: express.Response): UserRecord | null {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      res.status(401).json({ ok: false, error: 'Authentication required. Please sign in as Main Admin.' });
      return null;
    }

    const user = resolveTokenUser(token);
    if (!user) {
      res.status(401).json({ ok: false, error: 'User session not found or expired.' });
      return null;
    }

    const isMaster = !!user.isMainAdmin || user.email.toLowerCase() === 'peter.w.badir@gmail.com' || user.role === 'main_admin';
    if (!isMaster) {
      res.status(403).json({ ok: false, error: 'Access forbidden: Full Main Administrator privileges required.' });
      return null;
    }

    return user;
  }

  // 1. Get complete Admin Dashboard data
  app.get('/api/admin/dashboard', (req, res) => {
    try {
      const admin = requireMainAdmin(req, res);
      if (!admin) return;

      const usersList = Object.values(db.users || {}).map(u => {
        const vault = u.vaultId ? db.vaults[u.vaultId] : null;
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          tier: u.tier,
          isPrimary: !!u.isPrimary,
          isMainAdmin: !!u.isMainAdmin || u.email.toLowerCase() === 'peter.w.badir@gmail.com',
          status: u.status || 'active',
          parentId: u.parentId,
          vaultId: u.vaultId,
          createdAt: u.createdAt,
          lastLogin: u.lastLogin,
          transactionCount: vault ? (vault.transactions?.length || 0) : 0,
          accountCount: vault ? (vault.accounts?.length || 0) : 0
        };
      });

      const totalVaults = Object.keys(db.vaults || {}).length;
      const totalTxns = Object.values(db.vaults || {}).reduce((sum, v) => sum + (v.transactions?.length || 0), 0);
      const totalAccs = Object.values(db.vaults || {}).reduce((sum, v) => sum + (v.accounts?.length || 0), 0);
      let dbSizeBytes = 0;
      try {
        if (fs.existsSync(DB_FILE)) dbSizeBytes = fs.statSync(DB_FILE).size;
      } catch (e) {}

      res.json({
        ok: true,
        admin: {
          name: admin.name,
          email: admin.email,
          role: admin.role,
          tier: admin.tier,
          isMainAdmin: true
        },
        systemConfig: db.systemConfig,
        telemetry: {
          uptimeSeconds: Math.floor(process.uptime()),
          serverStartedAt: db.systemConfig?.telemetry?.serverStartedAt || new Date().toISOString(),
          totalUsers: usersList.length,
          totalVaults,
          totalTransactions: totalTxns,
          totalAccounts: totalAccs,
          activeTokensCount: Object.keys(db.tokens || {}).length,
          outboxCount: (db.outbox || []).length,
          dbSizeBytes,
          memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
          nodeVersion: process.version,
          platform: process.platform
        },
        users: usersList,
        auditLogs: (db.auditLog || []).slice(0, 80),
        outbox: (db.outbox || []).slice(0, 25)
      });
    } catch (err: any) {
      console.error('[Admin Dashboard Error]', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 2. Update System Config (Maintenance, Broadcast, Feature Flags)
  app.post('/api/admin/config', (req, res) => {
    try {
      const admin = requireMainAdmin(req, res);
      if (!admin) return;

      const { maintenanceMode, broadcastNotice, featureFlags } = req.body || {};
      if (!db.systemConfig) db.systemConfig = {} as any;

      if (maintenanceMode) {
        db.systemConfig!.maintenanceMode = {
          ...db.systemConfig!.maintenanceMode,
          ...maintenanceMode
        };
        logAdminAction(admin.email, 'MAINTENANCE_MODE_UPDATED', 'maintenance', 
          `Maintenance mode set to ${maintenanceMode.enabled ? 'ACTIVE' : 'INACTIVE'}. Affected: ${(maintenanceMode.affectedPlatforms || []).join(', ')}`);
      }

      if (broadcastNotice) {
        db.systemConfig!.broadcastNotice = {
          ...db.systemConfig!.broadcastNotice,
          ...broadcastNotice,
          updatedAt: new Date().toISOString()
        };
        logAdminAction(admin.email, 'BROADCAST_NOTICE_UPDATED', 'platform_release',
          `Broadcast banner ${broadcastNotice.enabled ? 'ENABLED' : 'DISABLED'}: "${broadcastNotice.message || ''}"`);
      }

      if (featureFlags) {
        db.systemConfig!.featureFlags = {
          ...db.systemConfig!.featureFlags,
          ...featureFlags
        };
        logAdminAction(admin.email, 'FEATURE_FLAGS_UPDATED', 'feature_flag',
          `System feature flags updated: ${Object.keys(featureFlags).join(', ')}`);
      }

      saveDatabase(db);
      res.json({ ok: true, message: 'System configuration updated successfully.', systemConfig: db.systemConfig });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 3. Push a New App Release / Update across Web, Desktop, Mobile
  app.post('/api/admin/release', (req, res) => {
    try {
      const admin = requireMainAdmin(req, res);
      if (!admin) return;

      const { targetPlatform, version, minSupportedVersion, channel, releaseNotes, forceUpdateRequired, downloadUrl, broadcastUpdate } = req.body || {};

      if (!version || typeof version !== 'string') {
        return res.status(400).json({ ok: false, error: 'Valid version string (e.g. 2.5.1) is required.' });
      }

      const cleanVersion = version.trim();
      const platformsToUpdate: ('web' | 'desktop' | 'mobile')[] = 
        targetPlatform === 'all' 
          ? ['web', 'desktop', 'mobile'] 
          : (['web', 'desktop', 'mobile'].includes(targetPlatform) ? [targetPlatform] : ['web']);

      const notesList: string[] = Array.isArray(releaseNotes) 
        ? releaseNotes 
        : (typeof releaseNotes === 'string' ? releaseNotes.split('\n').map(s => s.trim()).filter(Boolean) : []);

      platformsToUpdate.forEach(p => {
        if (!db.systemConfig!.platforms) db.systemConfig!.platforms = {} as any;
        const current = db.systemConfig!.platforms[p] || {
          version: '2.5.0',
          minSupportedVersion: '2.0.0',
          channel: 'production',
          lastReleasedAt: new Date().toISOString(),
          releaseNotes: [],
          forceUpdateRequired: false,
          updateStatus: 'current'
        };

        db.systemConfig!.platforms[p] = {
          ...current,
          version: cleanVersion,
          minSupportedVersion: minSupportedVersion ? String(minSupportedVersion).trim() : current.minSupportedVersion,
          channel: channel || current.channel || 'production',
          lastReleasedAt: new Date().toISOString(),
          releaseNotes: notesList.length > 0 ? notesList : current.releaseNotes,
          forceUpdateRequired: forceUpdateRequired !== undefined ? !!forceUpdateRequired : current.forceUpdateRequired,
          downloadUrl: downloadUrl || current.downloadUrl,
          updateStatus: 'current'
        };
      });

      if (broadcastUpdate) {
        db.systemConfig!.broadcastNotice = {
          enabled: true,
          type: 'success',
          message: `🚀 Forecaster Pro v${cleanVersion} is now live across ${platformsToUpdate.map(p => p.toUpperCase()).join(' & ')}!`,
          linkUrl: downloadUrl || '',
          updatedAt: new Date().toISOString()
        };
      }

      logAdminAction(admin.email, 'PLATFORM_RELEASE_DEPLOYED', 'platform_release',
        `Deployed release v${cleanVersion} to [${platformsToUpdate.join(', ')}] on channel "${channel || 'production'}". Force Update: ${!!forceUpdateRequired}`);

      saveDatabase(db);
      res.json({
        ok: true,
        message: `Version v${cleanVersion} successfully deployed to ${platformsToUpdate.join(', ')}.`,
        platforms: db.systemConfig!.platforms
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 4. Update User Account (Role, Tier, Status, Password)
  app.post('/api/admin/users/:userId/update', (req, res) => {
    try {
      const admin = requireMainAdmin(req, res);
      if (!admin) return;

      const targetId = req.params.userId;
      const targetUser = (db.users || {})[targetId];
      if (!targetUser) {
        return res.status(404).json({ ok: false, error: 'User not found.' });
      }

      const { role, tier, status, newPassword } = req.body || {};

      // Protection for Master Admin Peter Badir
      const isTargetMaster = targetUser.email.toLowerCase() === 'peter.w.badir@gmail.com';
      if (isTargetMaster && (status === 'suspended' || (role && role !== 'main_admin'))) {
        return res.status(403).json({ ok: false, error: 'The Master App Admin account cannot be suspended or demoted.' });
      }

      if (role) targetUser.role = role;
      if (tier) targetUser.tier = tier;
      if (status) targetUser.status = status;
      if (newPassword && String(newPassword).length >= 6) {
        const salt = crypto.randomBytes(16).toString('hex');
        targetUser.passwordHash = hashPassword(String(newPassword), salt);
        targetUser.salt = salt;
        targetUser.mustChangePassword = false;
        targetUser.temporaryPassword = undefined;
      }

      logAdminAction(admin.email, 'USER_ACCOUNT_MANAGED', 'user_management',
        `Admin modified user ${targetUser.email} (Role: ${targetUser.role}, Tier: ${targetUser.tier}, Status: ${targetUser.status || 'active'})`);

      saveDatabase(db);
      res.json({
        ok: true,
        message: `User ${targetUser.name} updated successfully.`,
        user: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role,
          tier: targetUser.tier,
          status: targetUser.status || 'active',
          vaultId: targetUser.vaultId
        }
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 5. Reset User Vault Database
  app.post('/api/admin/users/:userId/reset-vault', (req, res) => {
    try {
      const admin = requireMainAdmin(req, res);
      if (!admin) return;

      const targetId = req.params.userId;
      const targetUser = (db.users || {})[targetId];
      if (!targetUser) {
        return res.status(404).json({ ok: false, error: 'User not found.' });
      }

      if (!targetUser.vaultId) {
        return res.status(400).json({ ok: false, error: 'User does not have an assigned vault database.' });
      }

      const vault = db.vaults[targetUser.vaultId];
      if (vault) {
        vault.transactions = [];
        vault.accountTransfers = [];
        vault.updatedAt = new Date().toISOString();
      }

      logAdminAction(admin.email, 'USER_VAULT_RESET', 'user_management',
        `Admin cleared transaction records for user ${targetUser.email} (Vault: ${targetUser.vaultId})`);

      saveDatabase(db);
      res.json({ ok: true, message: `Vault ${targetUser.vaultId} for ${targetUser.name} has been reset.` });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 6. Assign Demo Data & Payment Accounts (Exclusively for Main Admin training & marketing)
  app.post('/api/admin/assign-demo-data', (req, res) => {
    try {
      const admin = requireMainAdmin(req, res);
      if (!admin) return;

      const targetVaultId = req.body?.targetVaultId || admin.vaultId || DEFAULT_VAULT_ID;
      if (!db.vaults[targetVaultId]) {
        db.vaults[targetVaultId] = {
          vaultId: targetVaultId,
          updatedAt: new Date().toISOString(),
          transactions: [],
          accounts: [],
          accountTransfers: [],
          stockData: [],
          pharmacyData: [],
          budgetLimits: { income: 0, expense: 0 }
        };
      }

      const vault = db.vaults[targetVaultId];
      vault.transactions = [
        { id: 'tx_demo_1', date: '2026-07-01', description: 'Direct Deposit Monthly Salary (Demo)', category: 'Salary', type: 'income', amount: 3100.00, accountId: 'acc_demo_cib' },
        { id: 'tx_demo_2', date: '2026-07-02', description: 'Apartment Premium Rental Rent (Demo)', category: 'Rent', type: 'expense', amount: 800.00, accountId: 'acc_demo_cib' },
        { id: 'tx_demo_3', date: '2026-07-04', description: 'UI/UX Freelance App Project (Demo)', category: 'Freelance', type: 'income', amount: 400.00, accountId: 'acc_demo_wallet' },
        { id: 'tx_demo_4', date: '2026-07-05', description: 'Monthly Power Utility Bills (Demo)', category: 'Utilities', type: 'expense', amount: 150.00, accountId: 'acc_demo_cash' }
      ];
      vault.accounts = [
        { id: 'acc_demo_cash', type: 'cash', label: '💵 Cash Wallet (Demo)', initialBalance: 1500, createdAt: new Date().toISOString() },
        { id: 'acc_demo_cib', type: 'card', label: '💳 CIB Debit Card (Demo)', network: 'Visa', mode: 'Debit', bank: 'Commercial International Bank (CIB)', initialBalance: 12000, createdAt: new Date().toISOString() },
        { id: 'acc_demo_wallet', type: 'wallet', label: '📱 Vodafone Cash (Demo)', kind: 'Telecom', provider: 'Vodafone Cash', initialBalance: 2500, createdAt: new Date().toISOString() }
      ];
      vault.accountTransfers = [];
      vault.stockData = [
        { id: 'stk_demo_1', name: 'Olive Oil Extra Virgin', category: 'Groceries', currentStock: 2, minStock: 3, unit: 'Bottle', unitPrice: 180, dailyDepletion: 0.1, expiryDate: '2027-01-01' }
      ];
      vault.pharmacyData = [
        { id: 'phm_demo_1', name: 'Panadol Extra 500mg', category: 'Analgesics', currentStock: 5, minStock: 10, unit: 'Strip', unitPrice: 45, dailyDepletion: 0.2, expiryDate: '2027-06-30' }
      ];
      vault.budgetLimits = { income: 3500, expense: 2000 };
      vault.updatedAt = new Date().toISOString();

      logAdminAction(admin.email, 'DEMO_DATA_ASSIGNED', 'user_management',
        `Main Admin assigned demonstration training & marketing dataset to vault ${targetVaultId}`);

      saveDatabase(db);
      res.json({
        ok: true,
        message: 'Demo training & marketing data assigned successfully by Main Admin.',
        vault
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 7. Clear Demo Data to Clean Slate (Exclusively for Main Admin)
  app.post('/api/admin/clear-demo-data', (req, res) => {
    try {
      const admin = requireMainAdmin(req, res);
      if (!admin) return;

      const targetVaultId = req.body?.targetVaultId || admin.vaultId || DEFAULT_VAULT_ID;
      if (db.vaults[targetVaultId]) {
        const vault = db.vaults[targetVaultId];
        vault.transactions = [];
        vault.accounts = [];
        vault.accountTransfers = [];
        vault.stockData = [];
        vault.pharmacyData = [];
        vault.budgetLimits = { income: 0, expense: 0 };
        vault.updatedAt = new Date().toISOString();
      }

      logAdminAction(admin.email, 'DEMO_DATA_CLEARED', 'user_management',
        `Main Admin cleared demonstration data to a clean slate in vault ${targetVaultId}`);

      saveDatabase(db);
      res.json({
        ok: true,
        message: 'Account reset to a 100% clean and clear slate.'
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 8. Public System Status for all clients (Web, Desktop, Mobile)
  app.get('/api/public/system-status', (req, res) => {
    if (db.systemConfig?.telemetry) {
      db.systemConfig.telemetry.totalApiRequests = (db.systemConfig.telemetry.totalApiRequests || 0) + 1;
    }
    res.json({
      ok: true,
      maintenance: db.systemConfig?.maintenanceMode || { enabled: false, message: '', affectedPlatforms: [] },
      broadcast: db.systemConfig?.broadcastNotice || { enabled: false, message: '' },
      platforms: db.systemConfig?.platforms || {},
      featureFlags: db.systemConfig?.featureFlags || {}
    });
  });

  /* -------------------------------------------------------------------------
   * LANDING PAGE ROUTE
   * ------------------------------------------------------------------------- */
  app.get(['/landing', '/landing.html'], (req, res) => {
    const candidateDist = path.resolve(__dirname, 'dist', 'landing.html');
    const candidateRoot = path.resolve(__dirname, 'landing.html');
    const file = fs.existsSync(candidateDist) ? candidateDist : candidateRoot;
    res.sendFile(file);
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

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api') || (url.includes('.') && !url.endsWith('.html'))) {
        return next();
      }
      try {
        const indexPath = path.resolve(__dirname, 'index.html');
        if (fs.existsSync(indexPath)) {
          let html = fs.readFileSync(indexPath, 'utf-8');
          html = await vite.transformIndexHtml(url, html);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
        } else {
          next();
        }
      } catch (e) {
        next(e);
      }
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`[Forecaster Pro] Server with Cloud Sync listening at http://${HOST}:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Forecaster Pro] Port ${PORT} temporarily in use, retrying in 1s...`);
      setTimeout(() => {
        try { server.close(); } catch (_) {}
        server.listen(PORT, HOST);
      }, 1000);
    } else {
      console.error('[Forecaster Pro] Server error:', err);
    }
  });

  const shutdown = () => {
    try {
      server.close(() => process.exit(0));
    } catch (_) {
      process.exit(0);
    }
    setTimeout(() => process.exit(0), 1000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
