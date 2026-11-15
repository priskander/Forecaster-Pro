/**
 * Forecaster Pro Security Remediation Automated Test Suite (Phases 1.1 – 1.3)
 * Runs 100% isolated against ephemeral server instances & temporary DB_FILEs in os.tmpdir().
 * Never touches or modifies production users, real credentials, or data/cloud-ledger-db.json.
 */

import { execFileSync, spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import {
  inspectTarEntries,
  inspectZipEntries,
  packageSourceArchives,
  verifyArchiveFile,
  writeTarArchive,
  writeZipArchive
} from './package-source';
import { startIsolatedTestServer } from './test-harness';

let activeBaseUrl = '';

async function request(
  reqPath: string,
  options: RequestInit = {},
  baseUrlOverride?: string
): Promise<{ status: number; body: any; headers: Headers }> {
  const url = `${baseUrlOverride || activeBaseUrl}${reqPath}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });
  let body: any = null;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    if (details) console.error(`     Details: ${details}`);
    throw new Error(`Test failed: ${testName} - ${details || ''}`);
  }
}

async function runSecurityTestSuite() {
  console.log('\n🔒 Starting Forecaster Pro Security Remediation Verification Suite (Isolated Temp DB)...\n');

  const mainServer = await startIsolatedTestServer();
  activeBaseUrl = mainServer.baseUrl;

  try {
    // =========================================================================
    // 1. Remove hardcoded administrator passwords and insecure authentication fallbacks
    // =========================================================================
    console.log('--- Test Category 1: Hardcoded Administrator Password Removal & Authentication Fallbacks ---');

    const syntheticAdminEmail = `synth_admin_${Date.now()}@synthetic-test.local`;

    const fakeLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: syntheticAdminEmail, password: 'Password123!' })
    });
    assert(
      fakeLogin.status === 401 && fakeLogin.body.ok === false,
      'Vulnerability 1.1: Fallback login with hardcoded "Password123!" rejected with HTTP 401',
      `Received status: ${fakeLogin.status}`
    );

    const unauthProfile = await request('/api/auth/profile', {
      method: 'PUT',
      headers: { 'x-user-email': syntheticAdminEmail },
      body: JSON.stringify({ name: 'Hacked User' })
    });
    assert(
      unauthProfile.status === 401 && unauthProfile.body.ok === false,
      'Vulnerability 1.2: Unauthenticated profile update fallback rejected with HTTP 401',
      `Received status: ${unauthProfile.status}`
    );

    const unauthChangePass = await request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        email: syntheticAdminEmail,
        currentPassword: 'Password123!',
        newPassword: 'AttackerNewPassword123!'
      })
    });
    assert(
      unauthChangePass.status === 401 && unauthChangePass.body.ok === false,
      'Vulnerability 1.3: Unauthenticated change-password fallback rejected with HTTP 401',
      `Received status: ${unauthChangePass.status}`
    );

    // =========================================================================
    // 2. Secure Initial Administrator Provisioning & Restart Non-Overwrite Lifecycle
    // =========================================================================
    console.log('\n--- Test Category 2: Secure Initial Administrator Provisioning & Restart Lifecycle ---');

    // 2.0a Missing secret skips admin creation safely
    const noAdminRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@forecasterpro.com', password: 'Password123!' })
    });
    assert(
      noAdminRes.status === 401,
      'Provisioning 2.0a: Missing INITIAL_ADMIN_PASSWORD skips bootstrap safely (no default admin login)'
    );

    // 2.0b Weak INITIAL_ADMIN_PASSWORD rejected safely during bootstrap
    const weakBootServer = await startIsolatedTestServer({
      env: {
        INITIAL_ADMIN_EMAIL: 'weak-boot@testcorp.local',
        INITIAL_ADMIN_PASSWORD: 'weak'
      }
    });
    try {
      const weakBootLogin = await request(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email: 'weak-boot@testcorp.local', password: 'weak' }) },
        weakBootServer.baseUrl
      );
      assert(
        weakBootLogin.status === 401,
        'Provisioning 2.0b: Weak INITIAL_ADMIN_PASSWORD is skipped during bootstrap and cannot log in'
      );
    } finally {
      await weakBootServer.stop(true);
    }

    // 2.0c Strong INITIAL_ADMIN_PASSWORD provisions admin, custom password persists across restart
    const bootAdminEmail = 'boot-admin@testcorp.local';
    const bootAdminInitialPass = 'StrongAdminBootstrap#2026!';
    const bootAdminRotatedPass = 'CustomAdminPermanent#2026!';
    const sharedBootDir = path.join(os.tmpdir(), `forecaster_boot_${Date.now()}`);
    const sharedBootDb = path.join(sharedBootDir, 'boot-test-db.json');

    const bootServer1 = await startIsolatedTestServer({
      dataDir: sharedBootDir,
      dbFile: sharedBootDb,
      env: {
        INITIAL_ADMIN_EMAIL: bootAdminEmail,
        INITIAL_ADMIN_PASSWORD: bootAdminInitialPass
      }
    });

    let masterAdminToken = '';
    try {
      const bootLogin = await request(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email: bootAdminEmail, password: bootAdminInitialPass }) },
        bootServer1.baseUrl
      );
      assert(
        bootLogin.status === 200 && bootLogin.body.user?.isMainAdmin === true,
        'Provisioning 2.0c: Strong configured INITIAL_ADMIN_EMAIL/INITIAL_ADMIN_PASSWORD provisions main_admin'
      );

      const rotateAdminRes = await request(
        '/api/auth/change-password',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${bootLogin.body.token}` },
          body: JSON.stringify({ currentPassword: bootAdminInitialPass, newPassword: bootAdminRotatedPass })
        },
        bootServer1.baseUrl
      );
      assert(rotateAdminRes.status === 200, 'Provisioning 2.0d: Initial admin can rotate password to permanent custom secret');
    } finally {
      // Preserve temp DB to simulate server restart
      await bootServer1.stop(false);
    }

    const bootServer2 = await startIsolatedTestServer({
      dataDir: sharedBootDir,
      dbFile: sharedBootDb,
      env: {
        INITIAL_ADMIN_EMAIL: bootAdminEmail,
        INITIAL_ADMIN_PASSWORD: bootAdminInitialPass
      }
    });
    try {
      const oldInitialLoginAfterRestart = await request(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email: bootAdminEmail, password: bootAdminInitialPass }) },
        bootServer2.baseUrl
      );
      assert(
        oldInitialLoginAfterRestart.status === 401,
        'Provisioning 2.0e: Server restart does NOT overwrite custom admin password back to INITIAL_ADMIN_PASSWORD'
      );

      const rotatedLoginAfterRestart = await request(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email: bootAdminEmail, password: bootAdminRotatedPass }) },
        bootServer2.baseUrl
      );
      assert(
        rotatedLoginAfterRestart.status === 200 && rotatedLoginAfterRestart.body.user?.isMainAdmin === true,
        'Provisioning 2.0f: Custom admin password continues authenticating after server restart'
      );
      masterAdminToken = rotatedLoginAfterRestart.body.token;

      // Also test Master Admin privileges on /api/admin/dashboard & /api/admin/users/:id/update validation
      const adminDashRes = await request(
        '/api/admin/dashboard',
        { headers: { Authorization: `Bearer ${masterAdminToken}` } },
        bootServer2.baseUrl
      );
      assert(adminDashRes.status === 200 && adminDashRes.body.ok === true, 'Provisioning 2.0g: Configured Main Admin accesses /api/admin/dashboard (HTTP 200)');

      const targetReg = await request(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({ name: 'Target Member', email: 'target@testcorp.local', password: 'TargetUserPass#2026!' })
        },
        bootServer2.baseUrl
      );
      const targetUserId = targetReg.body.user.id;
      const weakAdminSet = await request(
        `/api/admin/users/${targetUserId}/update`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${masterAdminToken}` },
          body: JSON.stringify({ newPassword: 'weak' })
        },
        bootServer2.baseUrl
      );
      assert(weakAdminSet.status === 400, 'Provisioning 2.0h: Admin user password reset rejects weak passwords (HTTP 400)');

      const strongAdminSet = await request(
        `/api/admin/users/${targetUserId}/update`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${masterAdminToken}` },
          body: JSON.stringify({ newPassword: 'AdminSetStrong#2026!' })
        },
        bootServer2.baseUrl
      );
      assert(strongAdminSet.status === 200, 'Provisioning 2.0i: Admin user password reset accepts valid strong passwords (HTTP 200)');
    } finally {
      await bootServer2.stop(true);
      try { fs.rmSync(sharedBootDir, { recursive: true, force: true }); } catch {}
    }

    // Standard primary owner password lifecycle on main isolated server
    const synthOwnerEmail = `synth_owner_${Date.now()}@testcorp.local`;
    const initialSecret = 'StrongSecret#2026!';
    const regSynth = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Synthetic Primary Owner', email: synthOwnerEmail, password: initialSecret })
    });
    assert(
      (regSynth.status === 200 || regSynth.status === 201) && regSynth.body.ok === true && !!regSynth.body.token,
      'Provisioning 2.1: Primary workspace owner securely registered and authenticated'
    );
    const synthToken = regSynth.body.token;

    const newSecret = 'UpdatedPermanentPass#2026!';
    const changePassRes = await request('/api/auth/change-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${synthToken}` },
      body: JSON.stringify({ currentPassword: initialSecret, newPassword: newSecret })
    });
    assert(changePassRes.status === 200 && changePassRes.body.ok === true, 'Provisioning 2.2: User can change password to custom secret');
    const updatedToken = changePassRes.body.token;

    const customLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: synthOwnerEmail, password: newSecret })
    });
    assert(customLogin.status === 200 && customLogin.body.ok === true, 'Provisioning 2.3: Custom permanent password persists and authenticates');

    const oldLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: synthOwnerEmail, password: initialSecret })
    });
    assert(oldLogin.status === 401, 'Provisioning 2.4: Previous password invalidated after change');

    // =========================================================================
    // 3. Complete Role-Based Access Control (RBAC Permission Matrix)
    // =========================================================================
    console.log('\n--- Test Category 3: Server-Side Role-Based Access Control (RBAC) Matrix ---');

    const workspaceVaultId = regSynth.body.user.vaultId;

    // Seed initial baseline workspace state via Owner so payload protection tests have baseline records
    const ownerSeedPayload = {
      transactions: [{ id: 'tx_owner_1', date: '2026-11-10', amount: 250, type: 'expense', category: 'Utilities', description: 'Baseline Tx' }],
      accounts: [
        { id: 'acc_owner_1', type: 'bank', label: 'Primary Bank', initialBalance: 5000 },
        { id: 'acc_owner_2', type: 'cash', label: 'Petty Cash', initialBalance: 500 }
      ],
      accountTransfers: [],
      budgetLimits: { income: 5000, expense: 2000 },
      allocationsMode: 'auto',
      customCategories: ['Operations'],
      stockData: [{ id: 'stk_owner_1', name: 'Baseline Part', currentStock: 10 }],
      pharmacyData: [{ id: 'phm_owner_1', name: 'Baseline Med', currentStock: 20 }],
      vehicles: [{ id: 'veh_owner_1', make: 'Toyota', model: 'Hiace', plate: 'OPS-101' }],
      fuels: [],
      maint: [],
      rentalProperties: [{ id: 'prop_owner_1', title: 'Warehouse Unit A' }],
      rentalContracts: [{ id: 'cntr_owner_1', propertyId: 'prop_owner_1', rentAmount: 1500 }],
      userSettings: { theme: 'light', autoSync: true }
    };
    const seedOwnerRes = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${updatedToken}` },
      body: JSON.stringify(ownerSeedPayload)
    });
    assert(seedOwnerRes.status === 200, 'Setup 3.0: Owner seeds baseline multi-module workspace state');
    const baselineVault = seedOwnerRes.body.vault;

    // Owner creates Viewer, Member, Manager
    const createViewerRes = await request('/api/auth/sub-users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${updatedToken}` },
      body: JSON.stringify({ name: 'Synthetic Viewer', email: `viewer_${Date.now()}@testcorp.local`, role: 'viewer' })
    });
    assert(createViewerRes.status === 201, 'Setup 3.1: Owner creates Viewer sub-user');
    const viewerLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: createViewerRes.body.subUser.email, password: createViewerRes.body.temporaryPassword })
    });
    const viewerToken = viewerLogin.body.token;

    const createMemberRes = await request('/api/auth/sub-users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${updatedToken}` },
      body: JSON.stringify({ name: 'Synthetic Member', email: `member_${Date.now()}@testcorp.local`, role: 'member' })
    });
    assert(createMemberRes.status === 201, 'Setup 3.2: Owner creates Member sub-user');
    const memberLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: createMemberRes.body.subUser.email, password: createMemberRes.body.temporaryPassword })
    });
    const memberToken = memberLogin.body.token;

    const createManagerRes = await request('/api/auth/sub-users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${updatedToken}` },
      body: JSON.stringify({ name: 'Synthetic Manager', email: `manager_${Date.now()}@testcorp.local`, role: 'manager' })
    });
    assert(createManagerRes.status === 201, 'Setup 3.3: Owner creates Manager sub-user');
    const managerLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: createManagerRes.body.subUser.email, password: createManagerRes.body.temporaryPassword })
    });
    const managerToken = managerLogin.body.token;

    // --- VIEWER TESTS ---
    const viewerRead = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
      headers: { Authorization: `Bearer ${viewerToken}` }
    });
    assert(viewerRead.status === 200, 'RBAC 3.1: Read-only viewer authorized to read workspace vault (HTTP 200)');

    const viewerMutate = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${viewerToken}` },
      body: JSON.stringify({ transactions: [{ id: 'tx_viewer_hack', amount: 999 }] })
    });
    assert(viewerMutate.status === 403, 'RBAC 3.2: Read-only viewer FORBIDDEN from mutating vault (HTTP 403)');

    const viewerPostTxn = await request(`/api/cloud-sync/transactions?vaultId=${workspaceVaultId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${viewerToken}` },
      body: JSON.stringify({ transactions: [{ id: 'tx_viewer_post', amount: 50, type: 'expense', date: '2026-11-10' }] })
    });
    assert(viewerPostTxn.status === 403, 'RBAC 3.3: Read-only viewer FORBIDDEN from posting transactions (HTTP 403)');

    const viewerDelTxn = await request(`/api/cloud-sync/transactions/tx_owner_1?vaultId=${workspaceVaultId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${viewerToken}` }
    });
    assert(viewerDelTxn.status === 403, 'RBAC 3.4: Read-only viewer FORBIDDEN from deleting transactions (HTTP 403)');

    const viewerRestore = await request('/api/backup/restore', {
      method: 'POST',
      headers: { Authorization: `Bearer ${viewerToken}` },
      body: JSON.stringify({ vaultId: workspaceVaultId, backupData: {}, mode: 'merge' })
    });
    assert(viewerRestore.status === 403, 'RBAC 3.5: Read-only viewer FORBIDDEN from restoring backup (HTTP 403)');

    // --- MEMBER TESTS ---
    const memberRead = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
      headers: { Authorization: `Bearer ${memberToken}` }
    });
    assert(memberRead.status === 200, 'RBAC 3.6: Member authorized to read workspace vault (HTTP 200)');

    const testTxId = `tx_member_${Date.now()}`;
    const memberPostTxn = await request(`/api/cloud-sync/transactions?vaultId=${workspaceVaultId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({
        transactions: [{ id: testTxId, amount: 120, type: 'expense', date: '2026-11-10', category: 'Fuel' }]
      })
    });
    assert(memberPostTxn.status === 200, 'RBAC 3.7: Member authorized to create operational transactions (HTTP 200)');

    const memberDelTxn = await request(`/api/cloud-sync/transactions/${testTxId}?vaultId=${workspaceVaultId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${memberToken}` }
    });
    assert(memberDelTxn.status === 403, 'RBAC 3.8: Member FORBIDDEN from deleting transactions (HTTP 403)');

    const memberDelAcc = await request(`/api/cloud-sync/accounts/acc_owner_1?vaultId=${workspaceVaultId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${memberToken}` }
    });
    assert(memberDelAcc.status === 403, 'RBAC 3.9: Member FORBIDDEN from deleting payment accounts (HTTP 403)');

    const memberRestore = await request('/api/backup/restore', {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({ vaultId: workspaceVaultId, backupData: {}, mode: 'merge' })
    });
    assert(memberRestore.status === 403, 'RBAC 3.10: Member FORBIDDEN from restoring backups (HTTP 403)');

    // Vault push payload RBAC enforcement for Member
    const memberTamperAccounts = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({ accounts: [{ id: 'acc_rogue', type: 'cash', label: 'Hacked Account' }] })
    });
    assert(memberTamperAccounts.status === 403, 'RBAC 3.10a: Member FORBIDDEN from altering accounts via vault sync (HTTP 403)');

    const memberTamperBudgets = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({ budgetLimits: { income: 99999, expense: 1 } })
    });
    assert(memberTamperBudgets.status === 403, 'RBAC 3.10b: Member FORBIDDEN from altering budgets via vault sync (HTTP 403)');

    const memberTamperRentals = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({ rentalContracts: [] })
    });
    assert(memberTamperRentals.status === 403, 'RBAC 3.10c: Member FORBIDDEN from altering rental contracts via vault sync (HTTP 403)');

    const memberTamperSettings = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({ userSettings: { theme: 'dark', autoSync: false } })
    });
    assert(memberTamperSettings.status === 403, 'RBAC 3.10d: Member FORBIDDEN from altering organization settings via vault sync (HTTP 403)');

    const memberWipeTxns = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({ transactions: [] })
    });
    assert(memberWipeTxns.status === 403, 'RBAC 3.10e: Member FORBIDDEN from wiping existing transactions via vault sync (HTTP 403)');

    // Member legitimate operational append via vault sync (canonical key-order agnostic)
    const memberLegitSync = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({
        accounts: baselineVault.accounts,
        budgetLimits: { expense: baselineVault.budgetLimits.expense, income: baselineVault.budgetLimits.income },
        fuels: [{ id: 'fuel_member_1', vehicleId: 'veh_owner_1', liters: 30, cost: 45, date: '2026-11-11' }]
      })
    });
    assert(memberLegitSync.status === 200, 'RBAC 3.10f: Member allowed non-destructive operational sync (fuel/stock/txn) when restricted keys unchanged (HTTP 200)');

    // --- MANAGER TESTS ---
    const managerDelTxn = await request(`/api/cloud-sync/transactions/${testTxId}?vaultId=${workspaceVaultId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert(managerDelTxn.status === 200, 'RBAC 3.11: Manager authorized to delete transactions (HTTP 200)');

    const managerDelAcc = await request(`/api/cloud-sync/accounts/acc_owner_2?vaultId=${workspaceVaultId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert(managerDelAcc.status === 403, 'RBAC 3.12: Manager FORBIDDEN from deleting payment accounts (HTTP 403)');

    const managerDelAccViaSync = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ accounts: [baselineVault.accounts[0]] })
    });
    assert(managerDelAccViaSync.status === 403, 'RBAC 3.12a: Manager FORBIDDEN from deleting accounts via vault sync (HTTP 403)');

    const managerAlterSettings = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ userSettings: { theme: 'dark', autoSync: false } })
    });
    assert(managerAlterSettings.status === 403, 'RBAC 3.12b: Manager FORBIDDEN from altering org settings via vault sync (HTTP 403)');

    const managerAllowedBudgets = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({
        budgetLimits: { income: 6000, expense: 2500 },
        rentalContracts: baselineVault.rentalContracts
      })
    });
    assert(managerAllowedBudgets.status === 200, 'RBAC 3.12c: Manager authorized to manage budgets & rental contracts (HTTP 200)');

    const managerRestore = await request('/api/backup/restore', {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ vaultId: workspaceVaultId, backupData: {}, mode: 'merge' })
    });
    assert(managerRestore.status === 403, 'RBAC 3.13: Manager FORBIDDEN from restoring backups (HTTP 403)');

    const managerExport = await request(`/api/backup/export?vaultId=${workspaceVaultId}`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert(managerExport.status === 200, 'RBAC 3.14: Manager authorized to export backups (HTTP 200)');

    const managerValidate = await request('/api/backup/validate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ vaultId: workspaceVaultId, backupData: { schemaVersion: '2.0.0', modules: {} } })
    });
    assert(managerValidate.status === 200, 'RBAC 3.15: Manager authorized to validate backups (HTTP 200)');

    const managerCreateSub = await request('/api/auth/sub-users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ name: 'Manager Rogue Sub', email: 'rogue@sub.local', role: 'viewer' })
    });
    assert(managerCreateSub.status === 403, 'RBAC 3.16: Manager FORBIDDEN from creating sub-users (HTTP 403)');

    const managerListSub = await request('/api/auth/sub-users', {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert(managerListSub.status === 200, 'RBAC 3.17: Manager authorized to view sub-users (HTTP 200)');

    const memberExport = await request(`/api/backup/export?vaultId=${workspaceVaultId}`, {
      headers: { Authorization: `Bearer ${memberToken}` }
    });
    assert(memberExport.status === 403, 'RBAC 3.18: Member FORBIDDEN from exporting backups (HTTP 403)');

    const memberValidate = await request('/api/backup/validate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({ vaultId: workspaceVaultId, backupData: {} })
    });
    assert(memberValidate.status === 403, 'RBAC 3.19: Member FORBIDDEN from validating backups (HTTP 403)');

    const memberListSub = await request('/api/auth/sub-users', {
      headers: { Authorization: `Bearer ${memberToken}` }
    });
    assert(memberListSub.status === 403, 'RBAC 3.20: Member FORBIDDEN from viewing sub-users (HTTP 403)');

    const viewerExport = await request(`/api/backup/export?vaultId=${workspaceVaultId}`, {
      headers: { Authorization: `Bearer ${viewerToken}` }
    });
    assert(viewerExport.status === 403, 'RBAC 3.21: Viewer FORBIDDEN from exporting backups (HTTP 403)');

    const viewerListSub = await request('/api/auth/sub-users', {
      headers: { Authorization: `Bearer ${viewerToken}` }
    });
    assert(viewerListSub.status === 403, 'RBAC 3.22: Viewer FORBIDDEN from viewing sub-users (HTTP 403)');

    // --- OWNER TESTS ---
    const ownerDelAcc = await request(`/api/cloud-sync/accounts/non_existent_acc?vaultId=${workspaceVaultId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${updatedToken}` }
    });
    assert(ownerDelAcc.status === 200, 'RBAC 3.23: Owner authorized to manage/delete payment accounts (HTTP 200)');

    const ownerAlterSettings = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${updatedToken}` },
      body: JSON.stringify({ userSettings: { theme: 'dark', autoSync: true } })
    });
    assert(ownerAlterSettings.status === 200, 'RBAC 3.24: Owner authorized to modify organization settings (HTTP 200)');

    // =========================================================================
    // 4. Multi-Tenant Data & Organization Isolation
    // =========================================================================
    console.log('\n--- Test Category 4: Multi-Tenant Data & Organization Isolation ---');

    const owner2Email = `tenant2_${Date.now()}@tenantcorp.local`;
    const reg2 = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Tenant Two Owner', email: owner2Email, password: 'Password123#Tenant2' })
    });
    assert(reg2.status === 200 || reg2.status === 201, 'Setup 4.1: Register Tenant 2');
    const token2 = reg2.body.token;
    const vaultId2 = reg2.body.user.vaultId;

    const createSub2 = await request('/api/auth/sub-users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` },
      body: JSON.stringify({ name: 'Sub-User 2', email: `sub2_${Date.now()}@tenantcorp.local`, role: 'member' })
    });
    assert(createSub2.status === 201, 'Setup 4.2: Owner 2 creates Sub-user 2');
    const subUser2Id = createSub2.body.subUser.id;

    const owner1SubUsers = await request('/api/auth/sub-users', {
      headers: { Authorization: `Bearer ${updatedToken}` }
    });
    const leakedSubUser = owner1SubUsers.body.subUsers.find((u: any) => u.id === subUser2Id);
    assert(!leakedSubUser, 'Isolation 4.1: Cross-tenant sub-user leakage prevented');

    const crossDelete = await request(`/api/auth/sub-users/${subUser2Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${updatedToken}` }
    });
    assert(crossDelete.status === 403, 'Isolation 4.2: Cross-tenant sub-user deletion strictly FORBIDDEN (HTTP 403)');

    const crossReset = await request(`/api/auth/sub-users/${subUser2Id}/resend-email`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${updatedToken}` }
    });
    assert(crossReset.status === 403, 'Isolation 4.3: Cross-tenant credential reset strictly FORBIDDEN (HTTP 403)');

    const crossVault = await request(`/api/cloud-sync/vault/${vaultId2}`, {
      headers: { Authorization: `Bearer ${updatedToken}` }
    });
    assert(crossVault.status === 403, 'Isolation 4.4: Cross-tenant vault data access strictly FORBIDDEN (HTTP 403)');

    const outbox1 = await request('/api/emails/outbox', {
      headers: { Authorization: `Bearer ${updatedToken}` }
    });
    assert(outbox1.status === 200, 'Isolation 4.5: Tenant 1 retrieves own outbox successfully');
    const hasTenant2Email = outbox1.body.outbox.some((e: any) => e.to === createSub2.body.subUser.email);
    assert(!hasTenant2Email, 'Isolation 4.6: Outbox emails of other organizations NOT exposed');

    // =========================================================================
    // 5. Session Creation, Validation, Expiration & Revocation
    // =========================================================================
    console.log('\n--- Test Category 5: Session Creation, Validation & Revocation ---');

    const sessionUserEmail = `session_${Date.now()}@testcorp.local`;
    const regSession = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Session User', email: sessionUserEmail, password: 'InitialSessionPass#1' })
    });
    const sessionToken1 = regSession.body.token;

    const sessionTest1 = await request('/api/auth/profile', {
      headers: { Authorization: `Bearer ${sessionToken1}` }
    });
    assert(sessionTest1.status === 200, 'Session 5.1: Token 1 authenticates successfully');

    const sessionChange = await request('/api/auth/change-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken1}` },
      body: JSON.stringify({ currentPassword: 'InitialSessionPass#1', newPassword: 'SecondSessionPass#2' })
    });
    assert(sessionChange.status === 200, 'Session 5.2: Password changed successfully');
    const sessionToken2 = sessionChange.body.token;

    const sessionTestOld = await request('/api/auth/profile', {
      headers: { Authorization: `Bearer ${sessionToken1}` }
    });
    assert(sessionTestOld.status === 401, 'Session 5.3: Previous Token 1 immediately REVOKED upon password change (HTTP 401)');

    const sessionTestNew = await request('/api/auth/profile', {
      headers: { Authorization: `Bearer ${sessionToken2}` }
    });
    assert(sessionTestNew.status === 200, 'Session 5.4: Fresh Token 2 authenticates successfully (HTTP 200)');

    const bulkRevoke = await request('/api/auth/revoke-all-sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken2}` },
      body: JSON.stringify({ scope: 'organization' })
    });
    assert(bulkRevoke.status === 200 && bulkRevoke.body.revokedCount > 0, 'Session 5.5: Bulk revocation invalidates org tokens');

    const sessionAfterRevoke = await request('/api/auth/profile', {
      headers: { Authorization: `Bearer ${sessionToken2}` }
    });
    assert(sessionAfterRevoke.status === 401, 'Session 5.6: Revoked session returns HTTP 401 after bulk revocation');

    // =========================================================================
    // 6. Sensitive Endpoints & Demo Account Confinement
    // =========================================================================
    console.log('\n--- Test Category 6: Sensitive Endpoints & Demo Account Confinement ---');

    const unauthAdmin = await request('/api/admin/dashboard');
    assert(unauthAdmin.status === 401, 'Sensitive 6.1: Unauthenticated request to /api/admin/dashboard returns HTTP 401');

    const nonAdminReq = await request('/api/admin/dashboard', {
      headers: { Authorization: `Bearer ${updatedToken}` }
    });
    assert(nonAdminReq.status === 403, 'Sensitive 6.2: Non-admin user request to /api/admin/dashboard returns HTTP 403');

    // 6.3 Disabled demo mode rejection on default server + isolated demo confinement verification
    const defaultDemoEndpointRes = await request('/api/auth/demo-login', { method: 'POST' });
    assert(
      defaultDemoEndpointRes.status === 403,
      'Demo 6.0a: /api/auth/demo-login is disabled by default (HTTP 403)'
    );

    const legacyDemoPwdLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'demo@forecasterpro.com', password: 'DemoPassword123!' })
    });
    assert(
      legacyDemoPwdLogin.status === 401 || legacyDemoPwdLogin.status === 403,
      'Demo 6.0b: Legacy hardcoded demo password is never provisioned or accepted by default'
    );

    const demoConfineServer = await startIsolatedTestServer({
      env: { ENABLE_DEMO_MODE: 'true' }
    });
    try {
      const demoLogin = await request('/api/auth/demo-login', { method: 'POST' }, demoConfineServer.baseUrl);
      assert(
        demoLogin.status === 200 &&
        demoLogin.body.user?.isDemo === true &&
        demoLogin.body.user?.isPrimary === false &&
        demoLogin.body.user?.isMainAdmin === false &&
        demoLogin.body.user?.vaultId === 'demo-showcase-vault',
        'Demo 6.1: Opt-in demo user authenticates into isolated demo-showcase-vault without owner or primary flags'
      );
      const demoToken = demoLogin.body.token;

      const demoAdminReq = await request('/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${demoToken}` }
      }, demoConfineServer.baseUrl);
      assert(demoAdminReq.status === 403, 'Demo 6.2: Demo user FORBIDDEN from administrator dashboard (HTTP 403)');

      const demoVaultHack = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
        headers: { Authorization: `Bearer ${demoToken}` }
      }, demoConfineServer.baseUrl);
      assert(demoVaultHack.status === 403, 'Demo 6.3: Demo user FORBIDDEN from accessing production workspaces (HTTP 403)');

      const demoSubUserHack = await request('/api/auth/sub-users', {
        method: 'POST',
        headers: { Authorization: `Bearer ${demoToken}` },
        body: JSON.stringify({ name: 'Demo Hack Sub', email: 'hack@demo.local', role: 'member' })
      }, demoConfineServer.baseUrl);
      assert(demoSubUserHack.status === 403, 'Demo 6.4: Demo user FORBIDDEN from managing sub-users (HTTP 403)');

      const demoRevokeHack = await request('/api/auth/revoke-all-sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${demoToken}` },
        body: JSON.stringify({ scope: 'all' })
      }, demoConfineServer.baseUrl);
      assert(demoRevokeHack.status === 403, 'Demo 6.5: Demo user FORBIDDEN from bulk session revocation (HTTP 403)');
    } finally {
      await demoConfineServer.stop(true);
    }

    // =========================================================================
    // 7. Strict Configurable CORS, Production Fail-Closed & CSRF Protection
    // =========================================================================
    console.log('\n--- Test Category 7: Strict CORS (No Google-Subdomain Wildcards), Fail-Closed Prod & CSRF ---');

    const blockedWildcards = [
      'https://malicious-attacker.com',
      'https://untrusted.run.app',
      'https://untrusted.googleusercontent.com',
      'https://untrusted.aistudio.google.com'
    ];
    for (const origin of blockedWildcards) {
      const optRes = await request('/api/cloud-sync/status', {
        method: 'OPTIONS',
        headers: { Origin: origin }
      });
      assert(optRes.status === 403, `CORS 7.1: Untrusted/wildcard origin rejected with HTTP 403 (${origin})`);
    }

    const loopbackCorsOptions = await request('/api/cloud-sync/status', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3000' }
    });
    assert(
      loopbackCorsOptions.status === 204 && loopbackCorsOptions.headers.get('access-control-allow-origin') === 'http://localhost:3000',
      'CORS 7.2: Non-production local origin succeeds with HTTP 204 and exact Access-Control-Allow-Origin'
    );

    const csrfAttack = await request('/api/auth/register', {
      method: 'POST',
      headers: { Origin: 'https://evil-phishing.org' },
      body: JSON.stringify({ name: 'CSRF Attack', email: 'csrf@evil.org', password: 'Password123!' })
    });
    assert(csrfAttack.status === 403, 'CORS 7.3: Mutation request from untrusted origin blocked by CSRF check (HTTP 403)');

    const secHeadersReq = await request('/api/public/system-status');
    assert(
      secHeadersReq.headers.get('x-content-type-options') === 'nosniff' &&
      secHeadersReq.headers.get('x-frame-options') === 'SAMEORIGIN',
      'CORS 7.4: Defense-in-depth headers (nosniff, SAMEORIGIN) enforced'
    );

    // 7.5 Spawn Production server WITHOUT ALLOWED_ORIGINS -> fail closed on ALL cross-origin requests
    const prodFailClosedServer = await startIsolatedTestServer({
      env: { NODE_ENV: 'production' }
    });
    try {
      const prodLocalhostOpt = await request(
        '/api/cloud-sync/status',
        { method: 'OPTIONS', headers: { Origin: 'http://localhost:3000' } },
        prodFailClosedServer.baseUrl
      );
      assert(prodLocalhostOpt.status === 403, 'CORS 7.5a: Production fails closed (HTTP 403) on localhost when ALLOWED_ORIGINS unset');

      const prodSubdomainOpt = await request(
        '/api/cloud-sync/status',
        { method: 'OPTIONS', headers: { Origin: 'https://any-app.run.app' } },
        prodFailClosedServer.baseUrl
      );
      assert(prodSubdomainOpt.status === 403, 'CORS 7.5b: Production fails closed (HTTP 403) on *.run.app when ALLOWED_ORIGINS unset');

      // 7.5c Production permits genuine same-origin POST (Origin matching request Host or X-Forwarded-Host)
      const sameOriginPost = await request(
        '/api/auth/register',
        {
          method: 'POST',
          headers: {
            Origin: prodFailClosedServer.baseUrl,
            'Sec-Fetch-Site': 'same-origin'
          },
          body: JSON.stringify({
            name: 'Prod Same Origin User',
            email: `sameorigin_${Date.now()}@testcorp.local`,
            password: `ProdStrong#${Date.now()}!`
          })
        },
        prodFailClosedServer.baseUrl
      );
      assert(
        sameOriginPost.status === 201 && sameOriginPost.body.ok === true,
        'CORS 7.5c: Production allows verified same-origin browser mutation (HTTP 201)'
      );

      // 7.5d Reverse-proxy forwarded same-origin host allowed unless Sec-Fetch-Site is cross-site
      const proxiedSameOrigin = await request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: {
            Origin: 'https://ais-pre-example.europe-west2.run.app',
            'X-Forwarded-Host': 'ais-pre-example.europe-west2.run.app',
            'X-Forwarded-Proto': 'https',
            'Sec-Fetch-Site': 'same-origin'
          },
          body: JSON.stringify({ email: 'nonexistent@testcorp.local', password: 'SomePassword#2026!' })
        },
        prodFailClosedServer.baseUrl
      );
      assert(
        proxiedSameOrigin.status === 401,
        'CORS 7.5d: Reverse-proxied same-origin mutation passes CSRF guard (reaches auth 401 instead of 403)'
      );

      const crossSiteBlocked = await request(
        '/api/auth/register',
        {
          method: 'POST',
          headers: {
            Origin: 'https://ais-pre-example.europe-west2.run.app',
            'X-Forwarded-Host': 'ais-pre-example.europe-west2.run.app',
            'X-Forwarded-Proto': 'https',
            'Sec-Fetch-Site': 'cross-site'
          },
          body: JSON.stringify({
            name: 'Cross Site Attacker',
            email: `crosssite_${Date.now()}@evil.local`,
            password: `ProdStrong#${Date.now()}!`
          })
        },
        prodFailClosedServer.baseUrl
      );
      assert(
        crossSiteBlocked.status === 403,
        'CORS 7.5e: Sec-Fetch-Site: cross-site mutation blocked by CSRF guard (HTTP 403)'
      );
    } finally {
      await prodFailClosedServer.stop(true);
    }

    // 7.6 Spawn Production server WITH explicit ALLOWED_ORIGINS -> allows ONLY configured exact origin
    const prodConfiguredServer = await startIsolatedTestServer({
      env: {
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://app.forecasterpro.com'
      }
    });
    try {
      const prodAllowExact = await request(
        '/api/cloud-sync/status',
        { method: 'OPTIONS', headers: { Origin: 'https://app.forecasterpro.com' } },
        prodConfiguredServer.baseUrl
      );
      assert(
        prodAllowExact.status === 204 && prodAllowExact.headers.get('access-control-allow-origin') === 'https://app.forecasterpro.com',
        'CORS 7.6a: Production permits exact configured ALLOWED_ORIGINS entry (HTTP 204)'
      );

      const prodRejectOther = await request(
        '/api/cloud-sync/status',
        { method: 'OPTIONS', headers: { Origin: 'https://other.run.app' } },
        prodConfiguredServer.baseUrl
      );
      assert(prodRejectOther.status === 403, 'CORS 7.6b: Production blocks non-configured origins (HTTP 403)');
    } finally {
      await prodConfiguredServer.stop(true);
    }

    // =========================================================================
    // 8. Password Policy & Brute-Force Lockout
    // =========================================================================
    console.log('\n--- Test Category 8: Strong Password Policy & Brute-Force Lockout ---');

    const shortPassRes = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Short Pass User', email: `short_${Date.now()}@test.local`, password: 'Short1!' })
    });
    assert(shortPassRes.status === 400, 'Password 8.1: Password shorter than 8 characters rejected (HTTP 400)');

    const noUpperRes = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'No Upper User', email: `noupper_${Date.now()}@test.local`, password: 'password123!' })
    });
    assert(noUpperRes.status === 400, 'Password 8.2: Password missing uppercase letter rejected (HTTP 400)');

    const noDigitRes = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'No Digit User', email: `nodigit_${Date.now()}@test.local`, password: 'Password!@#' })
    });
    assert(noDigitRes.status === 400, 'Password 8.3: Password missing numeric digit rejected (HTTP 400)');

    const noSpecialRes = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'No Special User', email: `nospecial_${Date.now()}@test.local`, password: 'Password123' })
    });
    assert(noSpecialRes.status === 400, 'Password 8.4: Password missing special character rejected (HTTP 400)');

    const lockoutTargetEmail = `lockout_target_${Date.now()}@lockout.local`;
    const validStrongPass = 'SecureTargetPass#2026!';
    const strongRegRes = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Lockout Target', email: lockoutTargetEmail, password: validStrongPass })
    });
    assert(strongRegRes.status === 200 || strongRegRes.status === 201, 'Password 8.5: Valid strong password succeeds (HTTP 201)');

    for (let attempt = 1; attempt <= 4; attempt++) {
      const failRes = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: lockoutTargetEmail, password: 'WrongPassword#999!' })
      });
      assert(failRes.status === 401, `Lockout 8.6a: Failed attempt #${attempt} returns HTTP 401`);
    }

    const lockTriggerRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: lockoutTargetEmail, password: 'WrongPassword#999!' })
    });
    assert(lockTriggerRes.status === 423, 'Lockout 8.6b: 5th consecutive failed attempt triggers lockout (HTTP 423)');

    const lockedWithCorrectPass = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: lockoutTargetEmail, password: validStrongPass })
    });
    assert(lockedWithCorrectPass.status === 423, 'Lockout 8.7: Locked account rejects valid password during lockout (HTTP 423)');

    // =========================================================================
    // 9. Password Reset Hardening (Non-Enumeration, Expiry Validation, Single-Use, Revocation)
    // =========================================================================
    console.log('\n--- Test Category 9: Password Reset Hardening ---');

    const forgotExisting = await request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: synthOwnerEmail })
    });
    const forgotMissing = await request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: `nonexistent_${Date.now()}@testcorp.local` })
    });
    assert(
      forgotExisting.status === 200 &&
      forgotMissing.status === 200 &&
      forgotExisting.body.message === forgotMissing.body.message &&
      forgotExisting.body.emailConfigured === false &&
      forgotMissing.body.emailConfigured === false &&
      forgotExisting.body.temporaryPassword === undefined,
      'Reset 9.1: /api/auth/forgot-password is non-enumerating, reports emailConfigured status identically, and never leaks temporary credentials in HTTP response'
    );

    // 9.1b End-to-end SMTP protocol delivery test with ephemeral local SMTP listener
    let receivedSmtpPayload = '';
    const smtpServer = net.createServer((socket) => {
      let inDataMode = false;
      let buffer = '';
      socket.write('220 localhost ESMTP MockSMTP\r\n');
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (inDataMode) {
          const endIdx = buffer.indexOf('\r\n.\r\n');
          if (endIdx !== -1) {
            receivedSmtpPayload += buffer.slice(0, endIdx);
            buffer = buffer.slice(endIdx + 5);
            inDataMode = false;
            socket.write('250 2.0.0 Ok: queued\r\n');
          }
          return;
        }
        let nlIdx: number;
        while ((nlIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nlIdx).replace(/\r$/, '');
          buffer = buffer.slice(nlIdx + 1);
          const upper = line.toUpperCase();
          if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
            socket.write('250-localhost\r\n250 OK\r\n');
          } else if (upper.startsWith('MAIL FROM') || upper.startsWith('RCPT TO')) {
            socket.write('250 2.1.0 Ok\r\n');
          } else if (upper === 'DATA') {
            inDataMode = true;
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
            break;
          } else if (upper === 'QUIT') {
            socket.write('221 2.0.0 Bye\r\n');
            socket.end();
          } else {
            socket.write('250 Ok\r\n');
          }
        }
      });
    });

    await new Promise<void>((resolve) => smtpServer.listen(0, '127.0.0.1', () => resolve()));
    const smtpAddr = smtpServer.address() as net.AddressInfo;
    const smtpTestSrv = await startIsolatedTestServer({
      env: {
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(smtpAddr.port),
        SMTP_SECURE: 'false',
        SMTP_ALLOW_UNAUTH: 'true',
        SMTP_FROM: 'security@testcorp.local'
      }
    });
    try {
      const smtpStatus = await request('/api/public/system-status', {}, smtpTestSrv.baseUrl);
      assert(smtpStatus.status === 200 && smtpStatus.body.emailConfigured === true, 'Reset 9.1b: system-status detects configured SMTP transport');

      const smtpTargetEmail = `smtp_user_${Date.now()}@testcorp.local`;
      const regSmtp = await request(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({ name: 'SMTP Recovery User', email: smtpTargetEmail, password: 'InitialSmtpPass#2026!' })
        },
        smtpTestSrv.baseUrl
      );
      assert(regSmtp.status === 201, 'Reset 9.1c: Test user registered on SMTP-enabled server');

      const forgotViaSmtp = await request(
        '/api/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ email: smtpTargetEmail })
        },
        smtpTestSrv.baseUrl
      );
      assert(
        forgotViaSmtp.status === 200 && forgotViaSmtp.body.emailConfigured === true,
        'Reset 9.1d: /api/auth/forgot-password dispatches recovery email when SMTP is configured'
      );

      const codeMatch = receivedSmtpPayload.match(/Temp-[A-Z0-9]+!/);
      const deliveredCode = codeMatch ? codeMatch[0] : '';
      assert(!!deliveredCode, 'Reset 9.1e: SMTP server received real email containing single-use recovery code');

      const outboxDisk = JSON.parse(fs.readFileSync(smtpTestSrv.dbFile, 'utf-8')).outbox || [];
      assert(
        outboxDisk.length > 0 &&
        outboxDisk[0].status === 'delivered' &&
        !JSON.stringify(outboxDisk).includes(deliveredCode),
        'Reset 9.1f: Stored outbox record preserves status=delivered while redacting recovery code'
      );

      const completeSmtpReset = await request(
        '/api/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({
            email: smtpTargetEmail,
            temporaryPassword: deliveredCode,
            newPassword: 'RecoveredSmtpPass#2026!'
          })
        },
        smtpTestSrv.baseUrl
      );
      assert(
        completeSmtpReset.status === 200 && !!completeSmtpReset.body.token,
        'Reset 9.1g: User completes password recovery end-to-end using SMTP-delivered code'
      );
    } finally {
      await smtpTestSrv.stop(true);
      await new Promise<void>((resolve) => smtpServer.close(() => resolve()));
    }

    // Prepare isolated DB snapshot with known scrypt-hashed reset credentials to test missing/expired/single-use paths cleanly
    const resetTestDir = path.join(os.tmpdir(), `forecaster_reset_${Date.now()}`);
    fs.mkdirSync(resetTestDir, { recursive: true });
    const resetDbFile = path.join(resetTestDir, 'reset-test-db.json');

    const recoveryCode = 'Temp-RST999!';
    const makeUser = (id: string, email: string, expiryValue: any) => {
      const salt = crypto.randomBytes(16).toString('hex');
      const rSalt = crypto.randomBytes(16).toString('hex');
      const u: any = {
        id,
        name: `User ${id}`,
        email,
        passwordHash: crypto.scryptSync('OriginalPass#2026!', salt, 64).toString('hex'),
        salt,
        tier: 'Free Tier',
        role: 'owner',
        isPrimary: true,
        vaultId: `vault_${id}`,
        mustChangePassword: false,
        resetTempPasswordHash: crypto.scryptSync(recoveryCode, rSalt, 64).toString('hex'),
        resetTempPasswordSalt: rSalt,
        resetCredentialUsed: false,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      if (expiryValue !== undefined) {
        u.resetTokenExpiresAt = expiryValue;
      }
      return u;
    };

    const seedResetDb = {
      version: '1.0.0',
      vaults: {
        vault_missing_exp: { vaultId: 'vault_missing_exp', updatedAt: new Date().toISOString(), transactions: [], accounts: [], accountTransfers: [] },
        vault_past_exp: { vaultId: 'vault_past_exp', updatedAt: new Date().toISOString(), transactions: [], accounts: [], accountTransfers: [] },
        vault_valid_exp: { vaultId: 'vault_valid_exp', updatedAt: new Date().toISOString(), transactions: [], accounts: [], accountTransfers: [] }
      },
      users: {
        usr_missing_exp: makeUser('usr_missing_exp', 'missing-exp@reset.local', undefined),
        usr_past_exp: makeUser('usr_past_exp', 'past-exp@reset.local', Date.now() - 60000),
        usr_valid_exp: makeUser('usr_valid_exp', 'valid-exp@reset.local', Date.now() + 10 * 60 * 1000)
      },
      tokens: {
        tok_prior_active_session: { userId: 'usr_valid_exp', createdAt: Date.now(), expiresAt: Date.now() + 3600000 }
      },
      outbox: []
    };
    fs.writeFileSync(resetDbFile, JSON.stringify(seedResetDb, null, 2), 'utf-8');

    const resetServer = await startIsolatedTestServer({
      dataDir: resetTestDir,
      dbFile: resetDbFile
    });
    try {
      const resetMissingExp = await request(
        '/api/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({ email: 'missing-exp@reset.local', temporaryPassword: recoveryCode, newPassword: 'BrandNewPass#2026!' })
        },
        resetServer.baseUrl
      );
      assert(resetMissingExp.status === 400, 'Reset 9.2: /api/auth/reset-password rejects records missing resetTokenExpiresAt (HTTP 400)');

      const resetExpired = await request(
        '/api/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({ email: 'past-exp@reset.local', temporaryPassword: recoveryCode, newPassword: 'BrandNewPass#2026!' })
        },
        resetServer.baseUrl
      );
      assert(resetExpired.status === 400, 'Reset 9.3: /api/auth/reset-password rejects expired resetTokenExpiresAt (HTTP 400)');

      // Prior active session works before reset
      const preResetSession = await request(
        '/api/auth/profile',
        { headers: { Authorization: 'Bearer tok_prior_active_session' } },
        resetServer.baseUrl
      );
      assert(preResetSession.status === 200, 'Reset 9.4a: Prior session active before reset');

      // Valid reset succeeds
      const validReset = await request(
        '/api/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({ email: 'valid-exp@reset.local', temporaryPassword: recoveryCode, newPassword: 'BrandNewPass#2026!' })
        },
        resetServer.baseUrl
      );
      assert(validReset.status === 200 && !!validReset.body.token, 'Reset 9.4b: Valid non-expired recovery credential succeeds (HTTP 200)');

      // Prior active session is now revoked
      const postResetOldSession = await request(
        '/api/auth/profile',
        { headers: { Authorization: 'Bearer tok_prior_active_session' } },
        resetServer.baseUrl
      );
      assert(postResetOldSession.status === 401, 'Reset 9.4c: All prior sessions revoked immediately upon password reset (HTTP 401)');

      // Replaying the same recovery code a 2nd time fails (single-use)
      const replayReset = await request(
        '/api/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({ email: 'valid-exp@reset.local', temporaryPassword: recoveryCode, newPassword: 'AnotherNewPass#2026!' })
        },
        resetServer.baseUrl
      );
      assert(replayReset.status === 400, 'Reset 9.5: Replay of already-used reset credential strictly rejected (HTTP 400 single-use)');
    } finally {
      await resetServer.stop(true);
      try { fs.rmSync(resetTestDir, { recursive: true, force: true }); } catch {}
    }

    // =========================================================================
    // 10. Phase 1.1.1: Database Static Protection, Expired Tokens, Logout & Account Revocation
    // =========================================================================
    console.log('\n--- Test Category 10: Database Access Protection, Session Expiration, Logout & Revocation ---');

    // 10.1 Public static / Vite middleware must NEVER expose database, backups, env, or server source files
    const blockedStaticRoutes = [
      '/data/cloud-ledger-db.json',
      '/data/cloud-ledger-db.json?raw',
      '/%64ata/cloud-ledger-db.json',
      '/backups/snapshot.json',
      '/.env',
      '/.env.example',
      '/server.ts',
      '/scripts/test-security-remediation.ts',
      '/package.json',
      '/@fs/app/applet/data/cloud-ledger-db.json'
    ];
    for (const staticPath of blockedStaticRoutes) {
      const staticRes = await request(staticPath, { method: 'GET' });
      assert(
        staticRes.status === 403,
        `DB-Protect 10.1: Protected path blocked over public static/Vite routes (HTTP 403) -> ${staticPath}`
      );
    }

    // 10.2 Legitimate frontend scripts under /scripts/*.js remain accessible (HTTP 200)
    const legitScriptRes = await fetch(`${activeBaseUrl}/scripts/auth-manager.js`);
    assert(legitScriptRes.status === 200, 'DB-Protect 10.2: Legitimate client asset /scripts/auth-manager.js stays accessible (HTTP 200)');

    // 10.3 Unauthenticated backup & vault endpoints reject with HTTP 401 and include no-store cache headers
    const unauthExport = await request('/api/backup/export?vaultId=shared-main-vault');
    assert(unauthExport.status === 401, 'Backup-Auth 10.3a: Unauthenticated /api/backup/export rejected (HTTP 401)');
    assert(
      (unauthExport.headers.get('cache-control') || '').includes('no-store'),
      'Headers 10.3b: API routes enforce Cache-Control: no-store'
    );

    const unauthValidate = await request('/api/backup/validate', { method: 'POST', body: JSON.stringify({}) });
    assert(unauthValidate.status === 401, 'Backup-Auth 10.3c: Unauthenticated /api/backup/validate rejected (HTTP 401)');

    const unauthRestore = await request('/api/backup/restore', { method: 'POST', body: JSON.stringify({}) });
    assert(unauthRestore.status === 401, 'Backup-Auth 10.3d: Unauthenticated /api/backup/restore rejected (HTTP 401)');

    const unauthVault = await request('/api/cloud-sync/vault/shared-main-vault');
    assert(unauthVault.status === 401, 'DB-Auth 10.3e: Unauthenticated /api/cloud-sync/vault/:id rejected (HTTP 401)');

    // 10.4 Logout server-side session invalidation (single session & allSessions)
    const logoutEmail = `logout_user_${Date.now()}@testcorp.local`;
    const regLogout = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Logout Test User', email: logoutEmail, password: 'LogoutStrong#2026!' })
    });
    const logoutTok1 = regLogout.body.token;
    const logoutVaultId = regLogout.body.user.vaultId;

    const loginSecond = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: logoutEmail, password: 'LogoutStrong#2026!' })
    });
    const logoutTok2 = loginSecond.body.token;

    const logoutRes = await request('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${logoutTok1}` }
    });
    assert(logoutRes.status === 200 && logoutRes.body.ok === true, 'Logout 10.4a: POST /api/auth/logout succeeds (HTTP 200)');

    const reuseAfterLogoutMe = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${logoutTok1}` }
    });
    assert(reuseAfterLogoutMe.status === 401, 'Logout 10.4b: Logged-out token rejected on /api/auth/me (HTTP 401)');

    const reuseAfterLogoutVault = await request(`/api/cloud-sync/vault/${logoutVaultId}`, {
      headers: { Authorization: `Bearer ${logoutTok1}` }
    });
    assert(reuseAfterLogoutVault.status === 401, 'Logout 10.4c: Logged-out token rejected on /api/cloud-sync/vault (HTTP 401)');

    const tok2StillValid = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${logoutTok2}` }
    });
    assert(tok2StillValid.status === 200, 'Logout 10.4d: Other independent session remains valid on single-device logout (HTTP 200)');

    // Create 3rd session then logout with allSessions: true
    const loginThird = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: logoutEmail, password: 'LogoutStrong#2026!' })
    });
    const logoutTok3 = loginThird.body.token;
    await request('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${logoutTok2}` },
      body: JSON.stringify({ allSessions: true })
    });
    const reuseTok3 = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${logoutTok3}` }
    });
    assert(reuseTok3.status === 401, 'Logout 10.4e: Logout with allSessions: true revokes all active user sessions (HTTP 401)');

    // 10.5 Sub-user deletion immediately revokes active sub-user session
    const subDelOwner = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'SubDel Owner', email: `subdel_own_${Date.now()}@testcorp.local`, password: 'OwnerStrong#2026!' })
    });
    const subDelOwnerTok = subDelOwner.body.token;
    const subDelCreate = await request('/api/auth/sub-users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${subDelOwnerTok}` },
      body: JSON.stringify({ name: 'Sub To Delete', email: `subdel_target_${Date.now()}@testcorp.local`, role: 'member' })
    });
    const subDelLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: subDelCreate.body.subUser.email, password: subDelCreate.body.temporaryPassword })
    });
    const subDelTok = subDelLogin.body.token;
    assert((await request('/api/auth/me', { headers: { Authorization: `Bearer ${subDelTok}` } })).status === 200, 'Revoke 10.5a: Sub-user active before removal');

    const delSubRes = await request(`/api/auth/sub-users/${subDelCreate.body.subUser.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${subDelOwnerTok}` }
    });
    assert(delSubRes.status === 200, 'Revoke 10.5b: Owner deletes sub-user (HTTP 200)');
    const subAfterDel = await request('/api/auth/me', { headers: { Authorization: `Bearer ${subDelTok}` } });
    assert(subAfterDel.status === 401, 'Revoke 10.5c: Deleted sub-user session immediately rejected (HTTP 401)');

    // 10.6 Expired tokens rejected & pruned while valid active tokens are preserved across server boot; Admin suspension & revokeSessions
    const sessionTestDir = path.join(os.tmpdir(), `forecaster_sess_${Date.now()}`);
    fs.mkdirSync(sessionTestDir, { recursive: true });
    const sessionDbFile = path.join(sessionTestDir, 'session-test-db.json');

    const adminSalt = crypto.randomBytes(16).toString('hex');
    const userSalt = crypto.randomBytes(16).toString('hex');
    const seedSessDb = {
      version: '1.0.0',
      vaults: {
        'shared-main-vault': { vaultId: 'shared-main-vault', updatedAt: new Date().toISOString(), transactions: [], accounts: [], accountTransfers: [] },
        vault_sess_user: { vaultId: 'vault_sess_user', updatedAt: new Date().toISOString(), transactions: [], accounts: [], accountTransfers: [] }
      },
      users: {
        usr_sess_admin: {
          id: 'usr_sess_admin',
          name: 'Sess Admin',
          email: 'sess-admin@test.local',
          passwordHash: crypto.scryptSync('AdminSessPass#2026!', adminSalt, 64).toString('hex'),
          salt: adminSalt,
          tier: 'Master Admin Suite',
          role: 'main_admin',
          isPrimary: true,
          isMainAdmin: true,
          status: 'active',
          vaultId: 'shared-main-vault',
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString()
        },
        usr_sess_user: {
          id: 'usr_sess_user',
          name: 'Sess User',
          email: 'sess-user@test.local',
          passwordHash: crypto.scryptSync('UserSessPass#2026!', userSalt, 64).toString('hex'),
          salt: userSalt,
          tier: 'Free Tier',
          role: 'owner',
          isPrimary: true,
          status: 'active',
          vaultId: 'vault_sess_user',
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString()
        }
      },
      tokens: {
        tok_expired_1: { userId: 'usr_sess_user', createdAt: Date.now() - 200000, expiresAt: Date.now() - 1000 },
        tok_legacy_str: 'usr_sess_user',
        tok_valid_user: { userId: 'usr_sess_user', createdAt: Date.now(), expiresAt: Date.now() + 3600000 },
        tok_valid_admin: { userId: 'usr_sess_admin', createdAt: Date.now(), expiresAt: Date.now() + 3600000 }
      },
      outbox: []
    };
    fs.writeFileSync(sessionDbFile, JSON.stringify(seedSessDb, null, 2), 'utf-8');

    const sessServer = await startIsolatedTestServer({
      dataDir: sessionTestDir,
      dbFile: sessionDbFile
    });
    try {
      const expiredRes = await request('/api/auth/me', { headers: { Authorization: 'Bearer tok_expired_1' } }, sessServer.baseUrl);
      assert(expiredRes.status === 401, 'Session 10.6a: Expired session token rejected (HTTP 401)');

      const legacyStrRes = await request('/api/auth/me', { headers: { Authorization: 'Bearer tok_legacy_str' } }, sessServer.baseUrl);
      assert(legacyStrRes.status === 401, 'Session 10.6b: Legacy unexpiring string token rejected (HTTP 401)');

      const validUserRes = await request('/api/auth/me', { headers: { Authorization: 'Bearer tok_valid_user' } }, sessServer.baseUrl);
      assert(validUserRes.status === 200, 'Session 10.6c: Legitimate unexpired session preserved across server boot (HTTP 200)');

      // Controlled Admin-approved per-user revocation
      const adminRevokeUser = await request(
        '/api/admin/users/usr_sess_user/update',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer tok_valid_admin' },
          body: JSON.stringify({ revokeSessions: true })
        },
        sessServer.baseUrl
      );
      assert(adminRevokeUser.status === 200, 'Session 10.6d: Admin controlled revokeSessions succeeded (HTTP 200)');

      const userAfterAdminRevoke = await request('/api/auth/me', { headers: { Authorization: 'Bearer tok_valid_user' } }, sessServer.baseUrl);
      assert(userAfterAdminRevoke.status === 401, 'Session 10.6e: Session rejected immediately after controlled admin revocation (HTTP 401)');

      // Re-login then suspend user -> session revoked automatically
      const reLogin = await request(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email: 'sess-user@test.local', password: 'UserSessPass#2026!' }) },
        sessServer.baseUrl
      );
      const reTok = reLogin.body.token;
      await request(
        '/api/admin/users/usr_sess_user/update',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer tok_valid_admin' },
          body: JSON.stringify({ status: 'suspended' })
        },
        sessServer.baseUrl
      );
      const suspendedCheck = await request('/api/auth/me', { headers: { Authorization: `Bearer ${reTok}` } }, sessServer.baseUrl);
      assert(suspendedCheck.status === 401, 'Session 10.6f: Suspended user session immediately invalidated (HTTP 401)');
    } finally {
      await sessServer.stop(true);
      try { fs.rmSync(sessionTestDir, { recursive: true, force: true }); } catch {}
    }

    // =========================================================================
    // 11. Phase 1.1.1 Final Hardening: Startup DB Safety, Interrupted Cleanup Recovery & Dev/Prod Frontend Compatibility
    // =========================================================================
    console.log('\n--- Test Category 11: Startup Database Safety, Integrity Regression & Dev/Prod Frontend Compatibility ---');

    const safetyDir = path.join(os.tmpdir(), `forecaster_safety_${Date.now()}`);
    fs.mkdirSync(safetyDir, { recursive: true });
    const safetyDbFile = path.join(safetyDir, 'safety-db.json');
    const safetyUserSalt = crypto.randomBytes(16).toString('hex');
    const nowMs = Date.now();

    const preCleanupSeed = {
      version: '1.0.0',
      vaults: {
        'shared-main-vault': {
          vaultId: 'shared-main-vault',
          updatedAt: '2026-11-01T00:00:00.000Z',
          transactions: [],
          accounts: [],
          accountTransfers: []
        },
        vault_safety_owner: {
          vaultId: 'vault_safety_owner',
          updatedAt: '2026-11-10T10:00:00.000Z',
          transactions: [
            { id: 'tx_safe_1', date: '2026-11-01', description: 'Consulting Revenue', category: 'Salary', type: 'income', amount: 8500, accountId: 'acc_safe_1' },
            { id: 'tx_safe_2', date: '2026-11-02', description: 'Office Supplies', category: 'Operations', type: 'expense', amount: 420, accountId: 'acc_safe_1' }
          ],
          accounts: [
            { id: 'acc_safe_1', type: 'card', label: 'Primary Treasury Card', initialBalance: 25000 }
          ],
          accountTransfers: [
            { id: 'trf_safe_1', fromId: 'acc_safe_1', toId: 'acc_safe_1', amount: 100, date: '2026-11-03' }
          ],
          budgetLimits: { income: 10000, expense: 4000 },
          stockData: [
            { id: 'stk_safe_1', name: 'Printer Paper A4', category: 'Supplies', currentStock: 12, minStock: 3, unit: 'Ream', unitPrice: 95 }
          ],
          pharmacyData: [
            { id: 'phm_safe_1', name: 'Vitamin D3', category: 'Supplements', currentStock: 30, minStock: 5, unit: 'caps', unitPrice: 150 }
          ],
          vehicles: [
            { id: 'veh_safe_1', make: 'Nissan', model: 'Sunny', year: 2025, plate: 'SAF 100', odometer: 12000 }
          ],
          fuels: [
            { id: 'fuel_safe_1', vehicleId: 'veh_safe_1', dateTime: '2026-11-05T09:00', odometer: 11800, liters: 35, cost: 490 }
          ],
          maint: [
            { id: 'mnt_safe_1', vehicleId: 'veh_safe_1', date: '2026-11-04', odometer: 11000, description: '10k Inspection', totalCost: 900 }
          ],
          rentalProperties: [
            { id: 'prop_safe_1', name: 'Unit 4B Downtown', monthlyRent: 1800 }
          ],
          rentalContracts: [
            { id: 'cnt_safe_1', propertyId: 'prop_safe_1', tenantName: 'Alex Tenant', rentAmount: 1800, status: 'active' }
          ],
          rentalNotifications: [
            { id: 'rnt_safe_1', message: 'Rent due on 1st', read: false }
          ],
          userSettings: { currency: 'EGP', theme: 'dark' }
        }
      },
      users: {
        usr_safety_owner: {
          id: 'usr_safety_owner',
          name: 'Safety Owner',
          email: 'safety-owner@test.local',
          passwordHash: crypto.scryptSync('SafetyPass#2026!', safetyUserSalt, 64).toString('hex'),
          salt: safetyUserSalt,
          tier: 'Free Tier',
          role: 'owner',
          isPrimary: true,
          status: 'active',
          vaultId: 'vault_safety_owner',
          createdAt: '2026-11-01T00:00:00.000Z',
          lastLogin: '2026-11-10T00:00:00.000Z'
        }
      },
      tokens: {
        tok_safe_expired_1: { userId: 'usr_safety_owner', createdAt: nowMs - 500000, expiresAt: nowMs - 10000 },
        tok_safe_expired_2: { userId: 'usr_safety_owner', createdAt: nowMs - 300000, expiresAt: nowMs - 1 },
        tok_safe_legacy_str: 'usr_safety_owner',
        tok_safe_malformed_obj: { userId: '', expiresAt: nowMs + 3600000 },
        tok_safe_active_1: { userId: 'usr_safety_owner', createdAt: nowMs - 1000, expiresAt: nowMs + 3600000 },
        tok_safe_active_2: { userId: 'usr_safety_owner', createdAt: nowMs - 500, expiresAt: nowMs + 7200000 }
      },
      outbox: [
        { id: 'mail_safe_1', to: 'safety-owner@test.local', toName: 'Safety Owner', subject: 'Welcome', body: 'ok', htmlBody: '<p>ok</p>', sentAt: '2026-11-01T00:00:00.000Z', status: 'delivered', metadata: { userId: 'usr_safety_owner', role: 'owner', senderId: 'usr_safety_owner', senderEmail: 'safety-owner@test.local' } }
      ],
      auditLog: [
        { id: 'log_safe_1', timestamp: '2026-11-01T00:00:00.000Z', adminEmail: 'admin@test.local', action: 'INIT', category: 'security', details: 'Seeded log' }
      ]
    };

    fs.writeFileSync(safetyDbFile, JSON.stringify(preCleanupSeed, null, 2), 'utf-8');
    const staleTmpFile = path.join(safetyDir, `.${path.basename(safetyDbFile)}.99999.deadbeef.tmp`);
    fs.writeFileSync(staleTmpFile, '{"partial": true', 'utf-8');

    const safetyServer = await startIsolatedTestServer({
      dataDir: safetyDir,
      dbFile: safetyDbFile
    });
    try {
      const snapshotFile = `${safetyDbFile}.pre-cleanup.bak`;
      assert(fs.existsSync(snapshotFile), 'Safety 11.1a: Pre-cleanup recoverable snapshot created before startup cleanup');

      const snapJson = JSON.parse(fs.readFileSync(snapshotFile, 'utf-8'));
      assert(
        Object.keys(snapJson.tokens || {}).length === 6 && !!snapJson.tokens.tok_safe_expired_1,
        'Safety 11.1b: Pre-cleanup snapshot preserves original pre-cleanup tokens verbatim'
      );

      assert(!fs.existsSync(staleTmpFile), 'Safety 11.1c: Stale interrupted .tmp partial file cleaned safely on startup');

      const postCleanupDb = JSON.parse(fs.readFileSync(safetyDbFile, 'utf-8'));
      const postTokenKeys = Object.keys(postCleanupDb.tokens || {});
      assert(
        postTokenKeys.length === 2 &&
        postTokenKeys.includes('tok_safe_active_1') &&
        postTokenKeys.includes('tok_safe_active_2') &&
        !postCleanupDb.tokens.tok_safe_expired_1 &&
        !postCleanupDb.tokens.tok_safe_expired_2 &&
        !postCleanupDb.tokens.tok_safe_legacy_str &&
        !postCleanupDb.tokens.tok_safe_malformed_obj,
        'Safety 11.1d: Startup cleanup removed ONLY expired/malformed tokens and kept all active sessions'
      );

      assert(
        JSON.stringify(postCleanupDb.vaults.vault_safety_owner) === JSON.stringify(preCleanupSeed.vaults.vault_safety_owner),
        'Safety 11.1e: All financial, budget, inventory, pharmacy, vehicle, fuel, maintenance, rental & settings records unchanged after cleanup'
      );
      assert(
        JSON.stringify(postCleanupDb.users.usr_safety_owner) === JSON.stringify(preCleanupSeed.users.usr_safety_owner),
        'Safety 11.1f: User account records unchanged after cleanup'
      );
      assert(
        JSON.stringify(postCleanupDb.outbox) === JSON.stringify(preCleanupSeed.outbox) &&
        JSON.stringify(postCleanupDb.auditLog) === JSON.stringify(preCleanupSeed.auditLog),
        'Safety 11.1g: Outbox and audit log unchanged after cleanup'
      );

      const activeAuthRes = await request('/api/auth/me', { headers: { Authorization: 'Bearer tok_safe_active_1' } }, safetyServer.baseUrl);
      assert(activeAuthRes.status === 200, 'Safety 11.1h: Active session remains valid after cleanup (HTTP 200)');

      const activeVaultRes = await request('/api/cloud-sync/vault/vault_safety_owner', { headers: { Authorization: 'Bearer tok_safe_active_1' } }, safetyServer.baseUrl);
      assert(
        activeVaultRes.status === 200 &&
        activeVaultRes.body.vault?.transactions?.length === 2 &&
        activeVaultRes.body.vault?.vehicles?.length === 1 &&
        activeVaultRes.body.vault?.rentalContracts?.length === 1,
        'Safety 11.1i: Vault API returns intact financial, fleet & rental records post-cleanup'
      );

      const expiredAfterRes = await request('/api/auth/me', { headers: { Authorization: 'Bearer tok_safe_expired_1' } }, safetyServer.baseUrl);
      assert(expiredAfterRes.status === 401, 'Safety 11.1j: Expired session rejected after cleanup (HTTP 401)');

      // Protected snapshot extension must never be exposed over HTTP
      const snapHttpRes = await request(`/${path.basename(snapshotFile)}`, { method: 'GET' }, safetyServer.baseUrl);
      assert(snapHttpRes.status === 403, 'Safety 11.1k: .pre-cleanup.bak snapshot blocked over HTTP (HTTP 403)');
    } finally {
      await safetyServer.stop(false);
    }

    // 11.2 Simulate interrupted write / corrupted primary DB recovery from valid pre-cleanup snapshot
    fs.writeFileSync(safetyDbFile, '{"version":"1.0.0","vaults": CORRUPTED_TRUNCATED_WRITE', 'utf-8');
    const interruptedTmp = path.join(safetyDir, `.${path.basename(safetyDbFile)}.77777.ab12cd34.tmp`);
    fs.writeFileSync(interruptedTmp, '{"incomplete":true', 'utf-8');

    const recoveryServer = await startIsolatedTestServer({
      dataDir: safetyDir,
      dbFile: safetyDbFile
    });
    try {
      const recoveredVaultRes = await request(
        '/api/cloud-sync/vault/vault_safety_owner',
        { headers: { Authorization: 'Bearer tok_safe_active_1' } },
        recoveryServer.baseUrl
      );
      assert(
        recoveredVaultRes.status === 200 &&
        recoveredVaultRes.body.vault?.transactions?.length === 2 &&
        recoveredVaultRes.body.vault?.stockData?.length === 1,
        'Safety 11.2a: Interrupted/corrupted DB automatically recovered from pre-cleanup snapshot'
      );
      const corruptBackups = fs.readdirSync(safetyDir).filter(f => f.includes('.corrupt.') && f.endsWith('.bak'));
      assert(corruptBackups.length >= 1, 'Safety 11.2b: Corrupt file preserved for forensic inspection without data loss');
      assert(!fs.existsSync(interruptedTmp), 'Safety 11.2c: Partial interrupted .tmp file removed after recovery');
    } finally {
      await recoveryServer.stop(true);
      try { fs.rmSync(safetyDir, { recursive: true, force: true }); } catch {}
    }

    // 11.3 Unavailable / corrupted database without snapshot must not crash server or overwrite existing DB file
    const corruptNoSnapDir = path.join(os.tmpdir(), `forecaster_nosnap_${Date.now()}`);
    fs.mkdirSync(corruptNoSnapDir, { recursive: true });
    const corruptDbFile = path.join(corruptNoSnapDir, 'corrupt-nosnap-db.json');
    const originalCorruptBytes = 'CORRUPTED_UNPARSEABLE_PRIMARY_DB_DO_NOT_OVERWRITE';
    fs.writeFileSync(corruptDbFile, originalCorruptBytes, 'utf-8');

    const safeFallbackServer = await startIsolatedTestServer({
      dataDir: corruptNoSnapDir,
      dbFile: corruptDbFile
    });
    try {
      const statusRes = await request('/api/cloud-sync/status', { method: 'GET' }, safeFallbackServer.baseUrl);
      assert(statusRes.status === 200 && statusRes.body.ok === true, 'Safety 11.3a: Server remains operational when DB is corrupted/unavailable without snapshot');
      const diskAfter = fs.readFileSync(corruptDbFile, 'utf-8');
      assert(
        diskAfter === originalCorruptBytes,
        'Safety 11.3b: Server operates write-protected and NEVER overwrites unreadable/corrupt DB file with empty state'
      );
    } finally {
      await safeFallbackServer.stop(true);
      try { fs.rmSync(corruptNoSnapDir, { recursive: true, force: true }); } catch {}
    }

    // 11.4 Frontend Compatibility in Vite Dev & HMR mode (dashboard, tabs, JS/TS modules, PWA, static assets)
    const devCompatChecks = [
      '/',
      '/landing',
      '/manifest.webmanifest',
      '/manifest.json',
      '/sw.js',
      '/registerSW.js',
      '/workbox-7e5eb42b.js',
      '/favicon.ico',
      '/icon.svg',
      '/apple-touch-icon.png',
      '/pwa-192x192.png',
      '/pwa-512x512.png',
      '/pwa-maskable-512x512.png',
      '/styles/forecaster.css',
      '/scripts/app-core.js',
      '/scripts/app-modules.js',
      '/scripts/extended-features.js',
      '/scripts/pwa-bridge.js',
      '/scripts/github-sync.js',
      '/scripts/saas-subscription.js',
      '/scripts/cloud-sync.js',
      '/scripts/auth-manager.js',
      '/@vite/client',
      '/@vite/env',
      '/src/main.tsx',
      '/src/App.tsx',
      '/src/index.css'
    ];
    for (const assetPath of devCompatChecks) {
      const assetRes = await fetch(`${activeBaseUrl}${assetPath}`);
      assert(
        assetRes.status === 200,
        `Compat-Dev 11.4a: Legitimate asset/module loads cleanly (HTTP 200) -> ${assetPath}`,
        `Received status: ${assetRes.status}`
      );
    }

    // Check Vite HMR-enabled server compatibility + TypeScript module path rule
    const hmrServer = await startIsolatedTestServer({ env: { DISABLE_HMR: 'false' } });
    try {
      const viteClientRes = await fetch(`${hmrServer.baseUrl}/@vite/client`);
      const viteClientText = await viteClientRes.text();
      assert(
        viteClientRes.status === 200 && viteClientText.includes('createHotContext'),
        'Compat-HMR 11.4b: Vite HMR client loads cleanly when HMR is enabled (HTTP 200)'
      );
      const htmlRes = await fetch(`${hmrServer.baseUrl}/`);
      const htmlBody = await htmlRes.text();
      for (const tabId of ['dashboard', 'insights', 'transactions', 'rentals', 'vehicles', 'stock', 'accounts', 'reports']) {
        assert(
          htmlBody.includes(`switchView('${tabId}'`),
          `Compat-Dev 11.4c: Navigation tab "${tabId}" preserved in dashboard HTML`
        );
      }
      assert(
        htmlBody.includes('auth-manager.js') && htmlBody.includes('manifest.webmanifest'),
        'Compat-Dev 11.4d: Auth/profile scripts and PWA manifest links present in HTML'
      );
      // Verify server-side .ts stays blocked while frontend /src/ TS paths stay unblocked by guard
      const blockedRootTs = await request('/vite.config.ts', { method: 'GET' }, hmrServer.baseUrl);
      assert(blockedRootTs.status === 403, 'Compat-Dev 11.4e: Root config vite.config.ts stays blocked (HTTP 403)');
    } finally {
      await hmrServer.stop(true);
    }

    // 11.5 Frontend & Security Compatibility in Production Mode (NODE_ENV=production serving dist/)
    if (fs.existsSync(path.resolve(process.cwd(), 'dist', 'index.html'))) {
      const prodServer = await startIsolatedTestServer({
        env: { NODE_ENV: 'production' }
      });
      try {
        const prodAssetChecks = [
          '/',
          '/landing',
          '/manifest.webmanifest',
          '/manifest.json',
          '/sw.js',
          '/registerSW.js',
          '/favicon.ico',
          '/icon.svg',
          '/pwa-192x192.png',
          '/styles/forecaster.css',
          '/scripts/app-core.js',
          '/scripts/auth-manager.js',
          '/scripts/cloud-sync.js',
          '/scripts/pwa-bridge.js'
        ];
        for (const prodPath of prodAssetChecks) {
          const pRes = await fetch(`${prodServer.baseUrl}${prodPath}`);
          assert(
            pRes.status === 200,
            `Compat-Prod 11.5a: Production asset loads cleanly (HTTP 200) -> ${prodPath}`,
            `Received status: ${pRes.status}`
          );
        }

        for (const blockedProdPath of ['/data/cloud-ledger-db.json', '/backups/snap.json', '/.env', '/server.ts', '/package.json', '/data/test.pre-cleanup.bak']) {
          const bRes = await request(blockedProdPath, { method: 'GET' }, prodServer.baseUrl);
          assert(
            bRes.status === 403,
            `Compat-Prod 11.5b: Protected resource blocked in production (HTTP 403) -> ${blockedProdPath}`
          );
        }

        // End-to-end Auth, Profile, Settings & Logout cycle in production mode
        const prodEmail = `prod_compat_${Date.now()}@testcorp.local`;
        const prodReg = await request('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name: 'Prod Compat User', email: prodEmail, password: 'ProdStrong#2026!' })
        }, prodServer.baseUrl);
        assert(prodReg.status === 201 && !!prodReg.body.token, 'Compat-Prod 11.5c: Registration works in production mode');
        const prodTok = prodReg.body.token;

        const prodProf = await request('/api/auth/profile', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${prodTok}` },
          body: JSON.stringify({ name: 'Prod Updated Name' })
        }, prodServer.baseUrl);
        assert(prodProf.status === 200 && prodProf.body.user?.name === 'Prod Updated Name', 'Compat-Prod 11.5d: Profile update works in production mode');

        const prodLogout = await request('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${prodTok}` }
        }, prodServer.baseUrl);
        assert(prodLogout.status === 200, 'Compat-Prod 11.5e: Logout works in production mode');

        const prodPostLogout = await request('/api/auth/me', {
          headers: { Authorization: `Bearer ${prodTok}` }
        }, prodServer.baseUrl);
        assert(prodPostLogout.status === 401, 'Compat-Prod 11.5f: Logged-out token rejected in production mode (HTTP 401)');
      } finally {
        await prodServer.stop(true);
      }
    }

    // =========================================================================
    // 12. Source Archive Data Protection, Production Build Validation & Path Bypass Resistance
    // =========================================================================
    console.log('\n--- Test Category 12: Source ZIP/TAR Protection, Production Startup Validation & Path Guard ---');

    // 12.1 Isolated synthetic project packaging test (ZIP & TAR exclusions, self-exclusion, live DB untouched)
    const pkgTestRoot = path.join(os.tmpdir(), `forecaster_pkg_${Date.now()}`);
    const pkgOutDir = path.join(pkgTestRoot, 'archive-out');
    fs.mkdirSync(path.join(pkgTestRoot, 'data'), { recursive: true });
    fs.mkdirSync(path.join(pkgTestRoot, 'backups'), { recursive: true });
    fs.mkdirSync(path.join(pkgTestRoot, 'exports'), { recursive: true });
    fs.mkdirSync(path.join(pkgTestRoot, 'tmp'), { recursive: true });
    fs.mkdirSync(path.join(pkgTestRoot, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(pkgTestRoot, 'node_modules', 'pkg'), { recursive: true });
    fs.mkdirSync(path.join(pkgTestRoot, '.git'), { recursive: true });
    fs.mkdirSync(path.join(pkgTestRoot, 'src'), { recursive: true });
    fs.mkdirSync(pkgOutDir, { recursive: true });

    const synthDbContent = JSON.stringify({ version: '1.0.0', vaults: { v1: { transactions: [{ id: 'synth_1', amount: 123 }] } } }, null, 2);
    const synthDbPath = path.join(pkgTestRoot, 'data', 'cloud-ledger-db.json');
    fs.writeFileSync(synthDbPath, synthDbContent, 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, 'data', 'cloud-ledger-db.json.pre-cleanup.bak'), synthDbContent, 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, 'backups', 'org-backup.json'), '{"secret":"backup"}', 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, 'exports', 'financial.csv'), 'secret,100', 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, 'tmp', 'scratch.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, 'session-store.json'), '{"tok":"secret"}', 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, '.env'), 'INITIAL_ADMIN_PASSWORD=SyntheticSecret#2026!', 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, '.env.local'), 'SECRET=1', 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, '.env.production'), 'SECRET=2', 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, '.env.example'), 'INITIAL_ADMIN_PASSWORD="REPLACE_ME"\n', 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, 'private.key'), 'PRIVATE KEY', 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, 'dist', 'index.html'), '<html></html>', 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;', 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, 'package.json'), '{"name":"synth"}', 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, 'server.ts'), 'console.log("ok");', 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, 'src', 'App.tsx'), 'export default function App() { return null; }', 'utf-8');
    // Pre-existing generated archives inside source dir must also be excluded on subsequent runs
    fs.writeFileSync(path.join(pkgTestRoot, 'forecaster-pro-source.zip'), 'old-zip', 'utf-8');
    fs.writeFileSync(path.join(pkgTestRoot, 'forecaster-pro-source.tar.gz'), 'old-tar', 'utf-8');

    try {
      const preSynthDbSha = crypto.createHash('sha256').update(fs.readFileSync(synthDbPath)).digest('hex');

      // Run packaging inside pkgTestRoot itself (so outDir === sourceDir tests self-exclusion too)
      const pkgReport1 = packageSourceArchives({ sourceDir: pkgTestRoot, outDir: pkgTestRoot, format: 'both' });
      assert(pkgReport1.archives.length === 2, 'Archive 12.1a: Both .zip and .tar.gz archives created & verified');
      assert(pkgReport1.liveDbPreserved === true, 'Archive 12.1b: Report confirms live DB preserved during packaging');

      const postSynthDbSha1 = crypto.createHash('sha256').update(fs.readFileSync(synthDbPath)).digest('hex');
      assert(
        postSynthDbSha1 === preSynthDbSha && fs.existsSync(synthDbPath),
        'Archive 12.1c: Synthetic runtime data/cloud-ledger-db.json remains byte-identical on disk'
      );

      const zipEntries = inspectZipEntries(path.join(pkgTestRoot, 'forecaster-pro-source.zip'));
      const tarEntries = inspectTarEntries(path.join(pkgTestRoot, 'forecaster-pro-source.tar.gz'));

      // Cross-verify standard ZIP compatibility with system unzip -t
      execFileSync('unzip', ['-t', path.join(pkgTestRoot, 'forecaster-pro-source.zip')], { stdio: 'pipe' });
      assert(true, 'Archive 12.1d: Generated ZIP passes system unzip -t integrity verification');

      for (const [label, entries] of [['ZIP', zipEntries], ['TAR', tarEntries]] as const) {
        assert(!entries.some(e => e.includes('cloud-ledger-db')), `Archive 12.1e (${label}): Excludes data/cloud-ledger-db.json and snapshots`);
        assert(!entries.some(e => e.startsWith('data/') || e.startsWith('backups/') || e.startsWith('exports/') || e.startsWith('tmp/')), `Archive 12.1f (${label}): Excludes data/, backups/, exports/, tmp/`);
        assert(!entries.some(e => e === '.env' || e === '.env.local' || e === '.env.production' || e.includes('session-store') || e.endsWith('.key')), `Archive 12.1g (${label}): Excludes private .env*, session stores & keys`);
        assert(!entries.some(e => e.startsWith('dist/') || e.startsWith('node_modules/') || e.startsWith('.git/') || e.endsWith('.zip') || e.endsWith('.tar.gz')), `Archive 12.1h (${label}): Excludes dist/, node_modules/, .git/ & nested archives`);
        assert(entries.includes('.env.example') && entries.includes('server.ts') && entries.includes('src/App.tsx'), `Archive 12.1i (${label}): Preserves .env.example template and source code`);
      }

      // Run packaging a second time into same directory -> confirms newly created archives are not nested into next run
      const pkgReport2 = packageSourceArchives({ sourceDir: pkgTestRoot, outDir: pkgTestRoot, format: 'both' });
      assert(pkgReport2.archives.every(a => a.valid && a.entryCount === pkgReport1.archives[0].entryCount), 'Archive 12.1j: Repeated packaging excludes prior generated archives deterministically');

      // 12.2 Negative test: verifier MUST FAIL and remove archive when a protected file is injected into ZIP or TAR
      const poisonedZip = path.join(pkgOutDir, 'poisoned.zip');
      writeZipArchive(pkgTestRoot, ['package.json', 'data/cloud-ledger-db.json'], poisonedZip);
      let poisonedZipFailed = false;
      try {
        verifyArchiveFile(poisonedZip, { deleteOnFailure: true });
      } catch (err: any) {
        poisonedZipFailed = String(err?.message || '').includes('data/cloud-ledger-db.json');
      }
      assert(poisonedZipFailed && !fs.existsSync(poisonedZip), 'Archive 12.2a: Verifier FAILS and deletes ZIP if data/cloud-ledger-db.json is included');

      const poisonedTar = path.join(pkgOutDir, 'poisoned.tar.gz');
      writeTarArchive(pkgTestRoot, ['package.json', '.env'], poisonedTar);
      let poisonedTarFailed = false;
      try {
        verifyArchiveFile(poisonedTar, { deleteOnFailure: true });
      } catch (err: any) {
        poisonedTarFailed = String(err?.message || '').includes('.env');
      }
      assert(poisonedTarFailed && !fs.existsSync(poisonedTar), 'Archive 12.2b: Verifier FAILS and deletes TAR if private .env is included');
    } finally {
      try { fs.rmSync(pkgTestRoot, { recursive: true, force: true }); } catch {}
    }

    // 12.3 Production Startup Validation (missing dist, dist with only favicon.ico, incomplete dist, valid dist)
    const prodValBase = path.join(os.tmpdir(), `forecaster_prod_val_${Date.now()}`);
    const tsxBin = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');

    const runProdBootExpectFail = (distPath: string, dbPath: string) => {
      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: 'production',
        DIST_DIR: distPath,
        DATA_DIR: path.dirname(dbPath),
        DB_FILE: dbPath,
        PORT: '0',
        HOST: '127.0.0.1'
      };
      return spawnSync(process.execPath, [tsxBin, 'server.ts'], {
        cwd: process.cwd(),
        env: childEnv,
        encoding: 'utf-8',
        timeout: 15000
      });
    };

    try {
      // 12.3a Missing dist directory completely
      const missingDist = path.join(prodValBase, 'missing-dist');
      const missingDb = path.join(prodValBase, 'db-missing', 'test.json');
      const missingRes = runProdBootExpectFail(missingDist, missingDb);
      assert(
        missingRes.status !== 0 && (missingRes.stderr || '').includes('PRODUCTION STARTUP ABORTED'),
        'ProdBoot 12.3a: Production startup refuses to run when DIST_DIR is missing'
      );

      // 12.3b dist containing ONLY favicon.ico (missing dist/index.html) - exact issue from Nov 13 review
      const faviconOnlyDist = path.join(prodValBase, 'favicon-only-dist');
      fs.mkdirSync(faviconOnlyDist, { recursive: true });
      fs.writeFileSync(path.join(faviconOnlyDist, 'favicon.ico'), 'fake-ico', 'utf-8');
      const favDb = path.join(prodValBase, 'db-fav', 'test.json');
      const favRes = runProdBootExpectFail(faviconOnlyDist, favDb);
      assert(
        favRes.status !== 0 &&
        (favRes.stderr || '').includes('index.html') &&
        (favRes.stderr || '').includes('npm run build'),
        'ProdBoot 12.3b: Production startup aborts with clear error when dist/ contains favicon.ico without dist/index.html'
      );

      // 12.3c Incomplete build (has dist/index.html + landing.html but missing required JS/PWA assets)
      const incompleteDist = path.join(prodValBase, 'incomplete-dist');
      fs.mkdirSync(incompleteDist, { recursive: true });
      fs.writeFileSync(path.join(incompleteDist, 'index.html'), '<!doctype html><html><body></body></html>', 'utf-8');
      fs.writeFileSync(path.join(incompleteDist, 'landing.html'), '<!doctype html><html><body></body></html>', 'utf-8');
      const incDb = path.join(prodValBase, 'db-inc', 'test.json');
      const incRes = runProdBootExpectFail(incompleteDist, incDb);
      assert(
        incRes.status !== 0 && (incRes.stderr || '').includes('Missing required production artifact'),
        'ProdBoot 12.3c: Production startup aborts when required built frontend/PWA assets are missing'
      );

      // 12.3d Valid dist/ starts cleanly in production mode
      if (fs.existsSync(path.resolve(process.cwd(), 'dist', 'index.html'))) {
        const validProd = await startIsolatedTestServer({ env: { NODE_ENV: 'production' } });
        try {
          const validRoot = await fetch(`${validProd.baseUrl}/`);
          const validLanding = await fetch(`${validProd.baseUrl}/landing`);
          assert(validRoot.status === 200 && validLanding.status === 200, 'ProdBoot 12.3d: Production startup succeeds with valid dist/ and serves / and /landing (HTTP 200)');
        } finally {
          await validProd.stop(true);
        }
      }
    } finally {
      try { fs.rmSync(prodValBase, { recursive: true, force: true }); } catch {}
    }

    // 12.4 Raw HTTP Security Regression for URL-encoding, double-encoding, traversal, backslashes & case variations
    const sendRawHttpGet = (baseUrl: string, rawPath: string): Promise<{ status: number; body: string }> => {
      return new Promise((resolve, reject) => {
        const parsed = new URL(baseUrl);
        const req = http.request(
          {
            hostname: parsed.hostname,
            port: Number(parsed.port),
            path: rawPath,
            method: 'GET'
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', c => chunks.push(Buffer.from(c)));
            res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf-8') }));
          }
        );
        req.on('error', reject);
        req.end();
      });
    };

    const adversarialRawPaths = [
      // URL-encoded
      '/%64ata/cloud-ledger-db.json',
      '/data%2fcloud-ledger-db.json',
      '/%2eenv',
      '/%2eenv.example',
      // Double-encoded
      '/%2564ata/cloud-ledger-db.json',
      '/data%252fcloud-ledger-db.json',
      '/%252eenv',
      '/%252e%252e/data/cloud-ledger-db.json',
      // Path traversal
      '/public/../data/cloud-ledger-db.json',
      '/scripts/../../.env',
      '/assets/..%2f..%2fdata/cloud-ledger-db.json',
      '/src/../data/cloud-ledger-db.json',
      '/foo/bar/../../server.ts',
      // Backslash separators
      '/data%5ccloud-ledger-db.json',
      '/data%255ccloud-ledger-db.json',
      '/scripts%5c..%5cdata%5ccloud-ledger-db.json',
      '/backups%5csnapshot.json',
      '/data\\cloud-ledger-db.json',
      // Case variations
      '/DATA/CLOUD-LEDGER-DB.JSON',
      '/Backups/Snapshot.JSON',
      '/Server.TS',
      '/.ENV',
      '/Package.JSON',
      '/Scripts/Test-Security-Remediation.TS',
      '/@FS/app/applet/DATA/cloud-ledger-db.json'
    ];

    for (const rawAttackPath of adversarialRawPaths) {
      const atkRes = await sendRawHttpGet(activeBaseUrl, rawAttackPath);
      assert(
        atkRes.status === 403,
        `PathGuard 12.4a: Adversarial request blocked (HTTP 403) -> ${rawAttackPath}`,
        `Received status: ${atkRes.status}`
      );
    }

    for (const validAsset of ['/', '/landing', '/scripts/app-core.js', '/scripts/auth-manager.js', '/styles/forecaster.css', '/manifest.webmanifest', '/sw.js', '/favicon.ico', '/src/main.tsx', '/@vite/client']) {
      const okRes = await sendRawHttpGet(activeBaseUrl, validAsset);
      assert(okRes.status === 200, `PathGuard 12.4b: Legitimate frontend asset accessible (HTTP 200) -> ${validAsset}`);
    }

    // =========================================================================
    // 13. Phase 1.1.2: Secure Administrator & Demo Account Provisioning
    // =========================================================================
    console.log('\n--- Test Category 13: Phase 1.1.2 Secure Administrator & Demo Provisioning ---');

    const randomStrongSecret = () =>
      `Sec#${crypto.randomBytes(8).toString('hex')}!A9`;

    // 13.1 Missing admin credentials
    const missingAdminSrv = await startIsolatedTestServer();
    try {
      const dbRaw = JSON.parse(fs.readFileSync(missingAdminSrv.dbFile, 'utf-8'));
      const adminUsers = Object.values(dbRaw.users || {}).filter(
        (u: any) => !u.isDemo && (u.isMainAdmin || u.role === 'main_admin')
      );
      assert(
        adminUsers.length === 0,
        'AdminProv 13.1a: Missing env credentials provisions ZERO administrator accounts'
      );
      const statusMissing = await request('/api/public/system-status', {}, missingAdminSrv.baseUrl);
      assert(
        statusMissing.status === 200 && statusMissing.body.demoModeEnabled === false,
        'DemoSec 13.6a: Demo mode reports disabled by default in system status'
      );
      assert(
        !dbRaw.users?.['usr_demo_showcase'] && !dbRaw.vaults?.['demo-showcase-vault'],
        'DemoSec 13.6b: Disabled demo mode neither seeds usr_demo_showcase nor demo-showcase-vault'
      );
    } finally {
      await missingAdminSrv.stop(true);
    }

    // 13.2 Weak admin passwords rejected
    for (const weakPwd of ['short!A1', 'alllowercase123!', 'NO_LOWER_CASE_123!', 'NoDigitsHere!Aa', 'NoSymbolHere123A']) {
      const weakAdminSrv = await startIsolatedTestServer({
        env: {
          INITIAL_ADMIN_EMAIL: 'weak-check@testcorp.local',
          INITIAL_ADMIN_PASSWORD: weakPwd
        }
      });
      try {
        const dbWeak = JSON.parse(fs.readFileSync(weakAdminSrv.dbFile, 'utf-8'));
        const admins = Object.values(dbWeak.users || {}).filter(
          (u: any) => !u.isDemo && (u.isMainAdmin || u.role === 'main_admin')
        );
        assert(
          admins.length === 0,
          `AdminProv 13.2: Weak INITIAL_ADMIN_PASSWORD refused cleanly (case ${weakPwd.length} chars)`
        );
      } finally {
        await weakAdminSrv.stop(true);
      }
    }

    // 13.3 - 13.5 First-time provisioning, repeated provisioning refusal, existing admin protection, password hashing & log redaction
    const p1Email = `admin_one_${Date.now()}@testcorp.local`;
    const p1Pass = randomStrongSecret();
    const p1CustomPass = randomStrongSecret();
    const p2Email = `admin_two_${Date.now()}@testcorp.local`;
    const p2Pass = randomStrongSecret();

    const adminProvDir = path.join(os.tmpdir(), `forecaster_p112_admin_${Date.now()}`);
    fs.mkdirSync(adminProvDir, { recursive: true });
    const adminProvDb = path.join(adminProvDir, 'admin-prov.json');

    let p1Token = '';
    const provSrv1 = await startIsolatedTestServer({
      dataDir: adminProvDir,
      dbFile: adminProvDb,
      env: {
        INITIAL_ADMIN_EMAIL: p1Email,
        INITIAL_ADMIN_PASSWORD: p1Pass
      }
    });
    try {
      // Check logs do not leak secret
      const combinedLogs = provSrv1.stdout.join('') + provSrv1.stderr.join('');
      assert(
        !combinedLogs.includes(p1Pass),
        'HashLog 13.9a: Server startup logs never emit plaintext administrator password'
      );

      const diskDb = JSON.parse(fs.readFileSync(adminProvDb, 'utf-8'));
      const provisionedAdmin: any = Object.values(diskDb.users || {}).find(
        (u: any) => u.email === p1Email
      );
      assert(
        !!provisionedAdmin &&
        provisionedAdmin.role === 'main_admin' &&
        provisionedAdmin.isMainAdmin === true &&
        provisionedAdmin.mustChangePassword === true &&
        typeof provisionedAdmin.passwordHash === 'string' &&
        provisionedAdmin.passwordHash.length === 128 &&
        typeof provisionedAdmin.salt === 'string' &&
        provisionedAdmin.salt.length === 32 &&
        provisionedAdmin.passwordHash !== p1Pass &&
        provisionedAdmin.temporaryPassword === undefined,
        'HashLog 13.9b: Provisioned admin password is stored with per-user scrypt hash + 16-byte salt (no plaintext)'
      );

      const firstLogin = await request(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email: p1Email, password: p1Pass }) },
        provSrv1.baseUrl
      );
      assert(
        firstLogin.status === 200 &&
        firstLogin.body.mustChangePassword === true &&
        firstLogin.body.user?.isMainAdmin === true &&
        !JSON.stringify(firstLogin.body).includes(p1Pass),
        'AdminProv 13.3: Initial administrator logs in securely with mustChangePassword=true and no secret echo'
      );
      p1Token = firstLogin.body.token;

      // Rotate to custom password before restart
      const rotRes = await request(
        '/api/auth/change-password',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${p1Token}` },
          body: JSON.stringify({ currentPassword: p1Pass, newPassword: p1CustomPass })
        },
        provSrv1.baseUrl
      );
      assert(rotRes.status === 200, 'AdminProv 13.5a: Initial administrator rotates password');
    } finally {
      await provSrv1.stop(false);
    }

    // 13.4 & 13.5b Restart with DIFFERENT INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD when admin already exists
    const provSrv2 = await startIsolatedTestServer({
      dataDir: adminProvDir,
      dbFile: adminProvDb,
      env: {
        INITIAL_ADMIN_EMAIL: p2Email,
        INITIAL_ADMIN_PASSWORD: p2Pass
      }
    });
    try {
      const diskAfterRestart = JSON.parse(fs.readFileSync(adminProvDb, 'utf-8'));
      const allAdmins = Object.values(diskAfterRestart.users || {}).filter(
        (u: any) => !u.isDemo && (u.isMainAdmin || u.role === 'main_admin')
      );
      assert(
        allAdmins.length === 1 && (allAdmins[0] as any).email === p1Email,
        'AdminProv 13.4a: Repeated startup with different INITIAL_ADMIN_* refuses creating a 2nd admin'
      );

      const p2Login = await request(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email: p2Email, password: p2Pass }) },
        provSrv2.baseUrl
      );
      assert(p2Login.status === 401, 'AdminProv 13.4b: Second env-configured admin cannot authenticate (HTTP 401)');

      const customLoginRes = await request(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email: p1Email, password: p1CustomPass }) },
        provSrv2.baseUrl
      );
      assert(
        customLoginRes.status === 200 && customLoginRes.body.user?.isMainAdmin === true,
        'AdminProv 13.5b: Existing administrator custom password preserved across restart'
      );
      const liveAdminTok = customLoginRes.body.token;

      // Guarded HTTP /api/admin/provision blocks repeated provisioning even by authenticated admin (409)
      const repeatHttpProv = await request(
        '/api/admin/provision',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${liveAdminTok}` },
          body: JSON.stringify({ email: p2Email, password: p2Pass })
        },
        provSrv2.baseUrl
      );
      assert(
        repeatHttpProv.status === 409,
        'AdminProv 13.4c: POST /api/admin/provision fails closed (HTTP 409) once an admin exists'
      );

      // 13.8 Unauthorized provisioning & role escalation protection
      const unauthProv = await request(
        '/api/admin/provision',
        {
          method: 'POST',
          body: JSON.stringify({ email: p2Email, password: p2Pass })
        },
        provSrv2.baseUrl
      );
      assert(unauthProv.status === 401, 'UnauthProv 13.8a: Unauthenticated POST /api/admin/provision returns HTTP 401');

      const regEscalation = await request(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            name: 'Escalation Prober',
            email: `esc_${Date.now()}@testcorp.local`,
            password: randomStrongSecret(),
            role: 'main_admin',
            isMainAdmin: true
          })
        },
        provSrv2.baseUrl
      );
      assert(
        regEscalation.status === 201 &&
        regEscalation.body.user?.role === 'owner' &&
        !regEscalation.body.user?.isMainAdmin,
        'UnauthProv 13.8b: Public registration ignores forged role/isMainAdmin fields'
      );
      const ownerEscTok = regEscalation.body.token;
      const escUserId = regEscalation.body.user.id;

      const ownerCallProv = await request(
        '/api/admin/provision',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${ownerEscTok}` },
          body: JSON.stringify({ email: p2Email, password: p2Pass })
        },
        provSrv2.baseUrl
      );
      assert(ownerCallProv.status === 403, 'UnauthProv 13.8c: Non-admin owner calling POST /api/admin/provision rejected (HTTP 403)');

      const promoteViaAdminUpdate = await request(
        `/api/admin/users/${escUserId}/update`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${liveAdminTok}` },
          body: JSON.stringify({ role: 'main_admin' })
        },
        provSrv2.baseUrl
      );
      assert(
        promoteViaAdminUpdate.status === 403,
        'UnauthProv 13.8d: Promoting regular account to main_admin via user update endpoint blocked (HTTP 403)'
      );
    } finally {
      await provSrv2.stop(true);
      try { fs.rmSync(adminProvDir, { recursive: true, force: true }); } catch {}
    }

    // 13.5c Existing non-admin owner sharing INITIAL_ADMIN_EMAIL is never escalated/hijacked
    const hijackDir = path.join(os.tmpdir(), `forecaster_hijack_${Date.now()}`);
    fs.mkdirSync(hijackDir, { recursive: true });
    const hijackDb = path.join(hijackDir, 'hijack.json');
    const sharedEmail = `ordinary_owner_${Date.now()}@testcorp.local`;
    const ownerSalt = crypto.randomBytes(16).toString('hex');
    const ownerSecret = randomStrongSecret();
    fs.writeFileSync(
      hijackDb,
      JSON.stringify({
        version: '1.0.0',
        vaults: {
          vault_ord_1: { vaultId: 'vault_ord_1', updatedAt: new Date().toISOString(), transactions: [], accounts: [], accountTransfers: [] }
        },
        users: {
          usr_ord_1: {
            id: 'usr_ord_1',
            name: 'Ordinary Owner',
            email: sharedEmail,
            passwordHash: crypto.scryptSync(ownerSecret, ownerSalt, 64).toString('hex'),
            salt: ownerSalt,
            tier: 'Free Tier',
            role: 'owner',
            isPrimary: true,
            isMainAdmin: false,
            vaultId: 'vault_ord_1',
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
          }
        },
        tokens: {},
        outbox: []
      }, null, 2),
      'utf-8'
    );
    const hijackSrv = await startIsolatedTestServer({
      dataDir: hijackDir,
      dbFile: hijackDb,
      env: {
        INITIAL_ADMIN_EMAIL: sharedEmail,
        INITIAL_ADMIN_PASSWORD: randomStrongSecret()
      }
    });
    try {
      const ordLogin = await request(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email: sharedEmail, password: ownerSecret }) },
        hijackSrv.baseUrl
      );
      assert(
        ordLogin.status === 200 &&
        ordLogin.body.user?.role === 'owner' &&
        ordLogin.body.user?.isMainAdmin === false,
        'AdminProv 13.5c: Non-admin user matching INITIAL_ADMIN_EMAIL is NEVER escalated to main_admin or overwritten'
      );
    } finally {
      await hijackSrv.stop(true);
      try { fs.rmSync(hijackDir, { recursive: true, force: true }); } catch {}
    }

    // 13.7 Demo Mode Enabled: High-entropy auto-secret, explicit secret, restore/manage block, and non-demo overwrite protection
    const customDemoEmail = `demo_custom_${Date.now()}@demo.local`;
    const customDemoPass = randomStrongSecret();
    const demoAutoSrv = await startIsolatedTestServer({
      env: {
        ENABLE_DEMO_MODE: 'true'
      }
    });
    try {
      const demoStatus = await request('/api/public/system-status', {}, demoAutoSrv.baseUrl);
      assert(demoStatus.status === 200 && demoStatus.body.demoModeEnabled === true, 'DemoSec 13.7a: system-status reports demoModeEnabled=true when enabled');

      const autoLogs = demoAutoSrv.stdout.join('') + demoAutoSrv.stderr.join('');
      const autoDb = JSON.parse(fs.readFileSync(demoAutoSrv.dbFile, 'utf-8'));
      const autoDemoRec = autoDb.users?.['usr_demo_showcase'];
      assert(
        !!autoDemoRec &&
        autoDemoRec.isDemo === true &&
        autoDemoRec.isPrimary === false &&
        autoDemoRec.isMainAdmin === false &&
        autoDemoRec.role === 'manager' &&
        typeof autoDemoRec.passwordHash === 'string' &&
        autoDemoRec.passwordHash.length === 128 &&
        !autoLogs.includes(autoDemoRec.passwordHash),
        'DemoSec 13.7b: Enabled demo without DEMO_USER_PASSWORD uses non-owner role + scrypt hash'
      );

      // Predictable DemoPassword123! must NOT authenticate even when demo mode is enabled
      const legacyPassAttempt = await request(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email: 'demo@forecasterpro.com', password: 'DemoPassword123!' }) },
        demoAutoSrv.baseUrl
      );
      assert(legacyPassAttempt.status === 401, 'DemoSec 13.7c: Predictable DemoPassword123! rejected even when demo mode enabled');

      const demoOneClick = await request('/api/auth/demo-login', { method: 'POST' }, demoAutoSrv.baseUrl);
      assert(
        demoOneClick.status === 200 &&
        demoOneClick.body.user?.isPrimary === false &&
        demoOneClick.body.user?.isMainAdmin === false,
        'DemoSec 13.7d: Demo login succeeds with strictly non-privileged user profile'
      );
      const dTok = demoOneClick.body.token;

      // Demo cannot restore backups or perform owner-only manage operations even on demo-showcase-vault
      const demoRestoreBlock = await request(
        '/api/backup/restore',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${dTok}` },
          body: JSON.stringify({ vaultId: 'demo-showcase-vault', backupData: { transactions: [] } })
        },
        demoAutoSrv.baseUrl
      );
      assert(demoRestoreBlock.status === 403, 'DemoSec 13.7e: Demo user blocked from restore privilege inside demo vault (HTTP 403)');

      const demoProvBlock = await request(
        '/api/admin/provision',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${dTok}` },
          body: JSON.stringify({ email: 'evil@test.local', password: randomStrongSecret() })
        },
        demoAutoSrv.baseUrl
      );
      assert(demoProvBlock.status === 403, 'UnauthProv 13.8e: Demo user calling POST /api/admin/provision blocked (HTTP 403)');
    } finally {
      await demoAutoSrv.stop(true);
    }

    // Explicit DEMO_USER_EMAIL + DEMO_USER_PASSWORD & non-demo overwrite protection
    const demoExplicitSrv = await startIsolatedTestServer({
      env: {
        ENABLE_DEMO_MODE: 'true',
        DEMO_USER_EMAIL: customDemoEmail,
        DEMO_USER_PASSWORD: customDemoPass
      }
    });
    try {
      const explicitDemoLogs = demoExplicitSrv.stdout.join('') + demoExplicitSrv.stderr.join('');
      assert(!explicitDemoLogs.includes(customDemoPass), 'HashLog 13.9c: Server logs never emit DEMO_USER_PASSWORD');
      const expLogin = await request(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email: customDemoEmail, password: customDemoPass }) },
        demoExplicitSrv.baseUrl
      );
      assert(
        expLogin.status === 200 &&
        expLogin.body.user?.isDemo === true &&
        expLogin.body.user?.isPrimary === false &&
        expLogin.body.user?.vaultId === 'demo-showcase-vault',
        'DemoSec 13.7f: Configured high-entropy DEMO_USER_PASSWORD authenticates non-privileged demo user'
      );
    } finally {
      await demoExplicitSrv.stop(true);
    }

    // Weak DEMO_USER_PASSWORD is skipped safely (no weak password stored)
    const demoWeakSrv = await startIsolatedTestServer({
      env: {
        ENABLE_DEMO_MODE: 'true',
        DEMO_USER_PASSWORD: 'weak'
      }
    });
    try {
      const weakDemoDb = JSON.parse(fs.readFileSync(demoWeakSrv.dbFile, 'utf-8'));
      assert(
        !weakDemoDb.users?.['usr_demo_showcase'],
        'DemoSec 13.7h: Weak explicit DEMO_USER_PASSWORD refuses provisioning demo account'
      );
      const weakDemoLogin = await request(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email: 'demo@forecasterpro.com', password: 'weak' }) },
        demoWeakSrv.baseUrl
      );
      assert(weakDemoLogin.status === 401, 'DemoSec 13.7i: Weak explicit DEMO_USER_PASSWORD cannot authenticate');
    } finally {
      await demoWeakSrv.stop(true);
    }

    // Non-demo user collision protection with DEMO_USER_EMAIL
    const demoCollisionDir = path.join(os.tmpdir(), `forecaster_democol_${Date.now()}`);
    fs.mkdirSync(demoCollisionDir, { recursive: true });
    const demoCollisionDb = path.join(demoCollisionDir, 'demo-col.json');
    const legitUserEmail = `realuser_${Date.now()}@testcorp.local`;
    const legitUserPass = randomStrongSecret();
    const legitSalt = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(
      demoCollisionDb,
      JSON.stringify({
        version: '1.0.0',
        vaults: {
          vault_real_1: { vaultId: 'vault_real_1', updatedAt: new Date().toISOString(), transactions: [], accounts: [], accountTransfers: [] }
        },
        users: {
          usr_real_1: {
            id: 'usr_real_1',
            name: 'Real Owner',
            email: legitUserEmail,
            passwordHash: crypto.scryptSync(legitUserPass, legitSalt, 64).toString('hex'),
            salt: legitSalt,
            tier: 'Pro Tier',
            role: 'owner',
            isPrimary: true,
            isDemo: false,
            vaultId: 'vault_real_1',
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
          }
        },
        tokens: {},
        outbox: []
      }, null, 2),
      'utf-8'
    );
    const demoCollisionSrv = await startIsolatedTestServer({
      dataDir: demoCollisionDir,
      dbFile: demoCollisionDb,
      env: {
        ENABLE_DEMO_MODE: 'true',
        DEMO_USER_EMAIL: legitUserEmail,
        DEMO_USER_PASSWORD: randomStrongSecret()
      }
    });
    try {
      const legitCheck = await request(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email: legitUserEmail, password: legitUserPass }) },
        demoCollisionSrv.baseUrl
      );
      assert(
        legitCheck.status === 200 &&
        legitCheck.body.user?.isDemo === false &&
        legitCheck.body.user?.role === 'owner' &&
        legitCheck.body.user?.vaultId === 'vault_real_1',
        'DemoSec 13.7g: Provisioning demo user NEVER overwrites or converts an existing non-demo account'
      );
    } finally {
      await demoCollisionSrv.stop(true);
      try { fs.rmSync(demoCollisionDir, { recursive: true, force: true }); } catch {}
    }

    // 13.10 Hardcoded credential scan across runtime source & frontend assets
    const forbiddenLiterals = ['DemoPassword123!', 'usr_peter_badir', 'peter@badir.com'];
    const filesToScan = [
      path.resolve(process.cwd(), 'server.ts'),
      path.resolve(process.cwd(), 'index.html'),
      path.resolve(process.cwd(), 'landing.html'),
      path.resolve(process.cwd(), '.env.example')
    ];
    const collectJsFiles = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collectJsFiles(full);
        else if (/\.(js|ts|tsx|jsx|html)$/.test(entry.name)) filesToScan.push(full);
      }
    };
    collectJsFiles(path.resolve(process.cwd(), 'src'));
    collectJsFiles(path.resolve(process.cwd(), 'public'));

    const detectedCredHits: string[] = [];
    for (const filePath of filesToScan) {
      const text = fs.readFileSync(filePath, 'utf-8');
      for (const literal of forbiddenLiterals) {
        if (text.includes(literal)) {
          detectedCredHits.push(`${path.relative(process.cwd(), filePath)} contains ${literal}`);
        }
      }
      if (/Password123!/.test(text)) {
        detectedCredHits.push(`${path.relative(process.cwd(), filePath)} contains Password123!`);
      }
    }
    assert(
      detectedCredHits.length === 0,
      'CredScan 13.10: Zero hardcoded privileged/demo credentials or legacy IDs in server, frontend, or .env.example',
      detectedCredHits.join('; ')
    );

    console.log('\n======================================================');
    console.log(`🏆 ALL SECURITY REMEDIATION TESTS PASSED: ${passedTests}/${totalTests}`);
    console.log('======================================================\n');
  } finally {
    await mainServer.stop(true);
  }
}

runSecurityTestSuite().catch(err => {
  console.error('\n💥 SECURITY TEST SUITE FAILED:', err);
  process.exit(1);
});
