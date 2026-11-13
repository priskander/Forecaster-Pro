/**
 * Forecaster Pro Security Remediation Automated Test Suite (Phases 1.1 – 1.3)
 * Runs 100% isolated against ephemeral server instances & temporary DB_FILEs in os.tmpdir().
 * Never touches or modifies production users, real credentials, or data/cloud-ledger-db.json.
 */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
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

    const demoLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'demo@forecasterpro.com', password: 'DemoPassword123!' })
    });
    assert(demoLogin.status === 200 && demoLogin.body.user.isDemo === true, 'Demo 6.1: Demo user authenticates into demo-showcase-vault');
    const demoToken = demoLogin.body.token;

    const demoAdminReq = await request('/api/admin/dashboard', {
      headers: { Authorization: `Bearer ${demoToken}` }
    });
    assert(demoAdminReq.status === 403, 'Demo 6.2: Demo user FORBIDDEN from administrator dashboard (HTTP 403)');

    const demoVaultHack = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
      headers: { Authorization: `Bearer ${demoToken}` }
    });
    assert(demoVaultHack.status === 403, 'Demo 6.3: Demo user FORBIDDEN from accessing production workspaces (HTTP 403)');

    const demoSubUserHack = await request('/api/auth/sub-users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${demoToken}` },
      body: JSON.stringify({ name: 'Demo Hack Sub', email: 'hack@demo.local', role: 'member' })
    });
    assert(demoSubUserHack.status === 403, 'Demo 6.4: Demo user FORBIDDEN from managing sub-users (HTTP 403)');

    const demoRevokeHack = await request('/api/auth/revoke-all-sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${demoToken}` },
      body: JSON.stringify({ scope: 'all' })
    });
    assert(demoRevokeHack.status === 403, 'Demo 6.5: Demo user FORBIDDEN from bulk session revocation (HTTP 403)');

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
      forgotExisting.body.temporaryPassword === undefined,
      'Reset 9.1: /api/auth/forgot-password is non-enumerating and never leaks temporary credentials in HTTP response'
    );

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
