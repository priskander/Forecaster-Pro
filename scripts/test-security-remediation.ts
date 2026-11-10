/**
 * Forecaster Pro Security Remediation Automated Test Suite
 * Tests all 6 security corrections against the live backend server.
 */

const BASE_URL = 'http://localhost:3000';

async function request(path: string, options: RequestInit = {}): Promise<{ status: number; body: any }> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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
  return { status: res.status, body };
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
  console.log('\n🔒 Starting Forecaster Pro Security Remediation Phase 1 Verification Suite...\n');

  // =========================================================================
  // 1. Remove hardcoded administrator passwords and insecure authentication fallbacks
  // =========================================================================
  console.log('--- Test Category 1: Hardcoded Administrator Password Removal & Authentication Fallbacks ---');
  
  // 1.1 First, try logging in with the old hardcoded password 'Password123!' when admin has a different password
  // Set admin password to 'SecureAdminP@ss2026!'
  const adminEmail = 'peter.w.badir@gmail.com';
  
  // Attempt to login with 'Password123!'
  const fakeLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: adminEmail, password: 'Password123!' })
  });
  assert(
    fakeLogin.status === 401 && fakeLogin.body.ok === false,
    'Vulnerability 1.1: Fallback login with hardcoded "Password123!" must be rejected with HTTP 401',
    `Received status: ${fakeLogin.status}, body: ${JSON.stringify(fakeLogin.body)}`
  );

  // 1.2 Attempt unauthenticated profile update with x-user-email or without token
  const unauthProfile = await request('/api/auth/profile', {
    method: 'PUT',
    headers: { 'x-user-email': adminEmail },
    body: JSON.stringify({ name: 'Hacked Admin' })
  });
  assert(
    unauthProfile.status === 401 && unauthProfile.body.ok === false,
    'Vulnerability 1.2: Unauthenticated profile update fallback to admin must be rejected with HTTP 401',
    `Received status: ${unauthProfile.status}`
  );

  // 1.3 Attempt change-password with unauthenticated email lookup and fallback
  const unauthChangePass = await request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({
      email: adminEmail,
      currentPassword: 'Password123!',
      newPassword: 'AttackerNewPassword123!'
    })
  });
  assert(
    unauthChangePass.status === 401 && unauthChangePass.body.ok === false,
    'Vulnerability 1.3: Unauthenticated change-password fallback with "Password123!" must be rejected with HTTP 401',
    `Received status: ${unauthChangePass.status}`
  );

  // =========================================================================
  // 2. Implement secure initial administrator provisioning
  // =========================================================================
  console.log('\n--- Test Category 2: Secure Initial Administrator Provisioning ---');
  // Check that admin account authenticates with bootstrap secret or persisted admin secret
  let currentAdminPass = 'ForecasterAdmin2026!';
  let adminInitialLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: adminEmail, password: currentAdminPass })
  });

  if (adminInitialLogin.status === 401) {
    // If already updated in a prior run, authenticate with the persisted custom password
    currentAdminPass = 'PersistentAdminPass#2026!';
    adminInitialLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: adminEmail, password: currentAdminPass })
    });
  }

  assert(
    adminInitialLogin.status === 200 && adminInitialLogin.body.ok === true && adminInitialLogin.body.user.isMainAdmin === true,
    'Provisioning 2.1: Initial admin is securely provisioned and authenticates with environment/bootstrap secret',
    `Status: ${adminInitialLogin.status}`
  );
  const adminToken = adminInitialLogin.body.token;

  // Change admin password to an updated secret
  const newAdminPass = currentAdminPass === 'ForecasterAdmin2026!' ? 'PersistentAdminPass#2026!' : 'ForecasterAdmin2026!';
  const changeAdminRes = await request('/api/auth/change-password', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      currentPassword: currentAdminPass,
      newPassword: newAdminPass
    })
  });
  assert(
    changeAdminRes.status === 200 && changeAdminRes.body.ok === true,
    'Provisioning 2.2: Admin can successfully change password to a custom permanent secret',
    `Status: ${changeAdminRes.status}`
  );
  const updatedAdminToken = changeAdminRes.body.token;

  // Verify that the custom password authenticates
  const customLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: adminEmail, password: newAdminPass })
  });
  assert(
    customLogin.status === 200 && customLogin.body.ok === true,
    'Provisioning 2.3: Custom admin password persists and authenticates',
    `Status: ${customLogin.status}`
  );

  // Verify that the old password NO LONGER authenticates
  const oldPassLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: adminEmail, password: currentAdminPass })
  });
  assert(
    oldPassLogin.status === 401 && oldPassLogin.body.ok === false,
    'Provisioning 2.4: Previous initial password is completely invalidated after change',
    `Status: ${oldPassLogin.status}`
  );

  // =========================================================================
  // 3. Enforce server-side role-based permissions for every API operation
  // =========================================================================
  console.log('\n--- Test Category 3: Server-Side Role-Based Access Control (RBAC) ---');
  
  // Register an Owner account (Tenant 1)
  const owner1Email = `owner1_${Date.now()}@testcorp.com`;
  const owner1Pass = 'OwnerPassword123!';
  const owner1Reg = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Owner One', email: owner1Email, password: owner1Pass, propertyRole: 'landlord' })
  });
  assert(owner1Reg.status === 201 && owner1Reg.body.ok === true, 'Setup 3.1: Register Owner 1 account');
  const owner1Token = owner1Reg.body.token;
  const owner1VaultId = owner1Reg.body.user.vaultId;

  // Owner 1 creates a Sub-user with role 'viewer'
  const viewerEmail = `viewer_${Date.now()}@testcorp.com`;
  const createViewerRes = await request('/api/auth/sub-users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner1Token}` },
    body: JSON.stringify({ name: 'Auditor Viewer', email: viewerEmail, role: 'viewer' })
  });
  assert(createViewerRes.status === 201 && createViewerRes.body.ok === true, 'Setup 3.2: Owner creates Viewer sub-user');
  const viewerTempPass = createViewerRes.body.temporaryPassword;

  // Viewer signs in
  const viewerLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: viewerEmail, password: viewerTempPass })
  });
  assert(viewerLogin.status === 200 && viewerLogin.body.ok === true, 'Setup 3.3: Viewer signs in');
  const viewerToken = viewerLogin.body.token;

  // RBAC Test 3.1: Viewer attempts to read vault data -> MUST SUCCEED (200 OK)
  const viewerReadVault = await request(`/api/cloud-sync/vault/${owner1VaultId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${viewerToken}` }
  });
  assert(
    viewerReadVault.status === 200 && viewerReadVault.body.ok === true,
    'RBAC 3.1: Read-only viewer is authorized to read workspace vault data (HTTP 200)',
    `Status: ${viewerReadVault.status}`
  );

  // RBAC Test 3.2: Viewer attempts to mutate vault data via POST /api/cloud-sync/vault/:id -> MUST FAIL (403 Forbidden)
  const viewerWriteVault = await request(`/api/cloud-sync/vault/${owner1VaultId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${viewerToken}` },
    body: JSON.stringify({ transactions: [{ id: 'tx_viewer_hack', amount: 999999 }] })
  });
  assert(
    viewerWriteVault.status === 403 && viewerWriteVault.body.ok === false,
    'RBAC 3.2: Read-only viewer is FORBIDDEN from mutating vault data (HTTP 403)',
    `Status: ${viewerWriteVault.status}`
  );

  // RBAC Test 3.3: Viewer attempts to add a transaction via POST /api/cloud-sync/transactions -> MUST FAIL (403 Forbidden)
  const viewerWriteTxn = await request(`/api/cloud-sync/transactions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${viewerToken}` },
    body: JSON.stringify({ vaultId: owner1VaultId, transaction: { id: 'tx_viewer_hack', amount: 500 } })
  });
  assert(
    viewerWriteTxn.status === 403 && viewerWriteTxn.body.ok === false,
    'RBAC 3.3: Read-only viewer is FORBIDDEN from posting transactions (HTTP 403)',
    `Status: ${viewerWriteTxn.status}`
  );

  // RBAC Test 3.4: Viewer attempts to delete transaction via DELETE /api/cloud-sync/transactions/:id -> MUST FAIL (403 Forbidden)
  const viewerDeleteTxn = await request(`/api/cloud-sync/transactions/tx_123?vaultId=${owner1VaultId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${viewerToken}` }
  });
  assert(
    viewerDeleteTxn.status === 403 && viewerDeleteTxn.body.ok === false,
    'RBAC 3.4: Read-only viewer is FORBIDDEN from deleting transactions (HTTP 403)',
    `Status: ${viewerDeleteTxn.status}`
  );

  // RBAC Test 3.5: Owner attempts the same write operations -> MUST SUCCEED (200 OK)
  const ownerWriteTxn = await request(`/api/cloud-sync/transactions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner1Token}` },
    body: JSON.stringify({ vaultId: owner1VaultId, transaction: { id: 'tx_owner_valid', amount: 120, description: 'Office Supplies' } })
  });
  assert(
    ownerWriteTxn.status === 200 && ownerWriteTxn.body.ok === true,
    'RBAC 3.5: Workspace Owner is authorized to mutate data (HTTP 200)',
    `Status: ${ownerWriteTxn.status}`
  );

  // =========================================================================
  // 4. Ensure users can only access data belonging to their authorised organisation
  // =========================================================================
  console.log('\n--- Test Category 4: Multi-Tenant Data & Organization Isolation ---');
  
  // Register Tenant 2 (Owner 2)
  const owner2Email = `owner2_${Date.now()}@competitor.com`;
  const owner2Pass = 'Owner2Password123!';
  const owner2Reg = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Owner Two', email: owner2Email, password: owner2Pass, propertyRole: 'tenant' })
  });
  assert(owner2Reg.status === 201 && owner2Reg.body.ok === true, 'Setup 4.1: Register Owner 2 (Tenant 2)');
  const owner2Token = owner2Reg.body.token;
  const owner2VaultId = owner2Reg.body.user.vaultId;

  // Owner 2 creates Sub-user B2
  const sub2Email = `sub2_${Date.now()}@competitor.com`;
  const createSub2 = await request('/api/auth/sub-users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner2Token}` },
    body: JSON.stringify({ name: 'Competitor Member', email: sub2Email, role: 'member' })
  });
  assert(createSub2.status === 201 && createSub2.body.ok === true, 'Setup 4.2: Owner 2 creates Sub-user 2');
  const sub2Id = createSub2.body.subUser.id;

  // Isolation Test 4.1: Owner 1 calls GET /api/auth/sub-users -> Sub-user 2 must NOT appear
  const owner1SubUsers = await request('/api/auth/sub-users', {
    method: 'GET',
    headers: { Authorization: `Bearer ${owner1Token}` }
  });
  assert(owner1SubUsers.status === 200 && owner1SubUsers.body.ok === true, 'Isolation 4.1a: Owner 1 lists sub-users');
  const owner1List = owner1SubUsers.body.subUsers || [];
  const leakedSub2 = owner1List.find((u: any) => u.id === sub2Id || u.email === sub2Email);
  assert(
    !leakedSub2,
    'Isolation 4.1: Cross-tenant sub-user leakage prevented (Sub-user 2 is NOT visible to Owner 1)'
  );

  // Isolation Test 4.2: Owner 1 attempts to delete Sub-user 2 (belonging to Tenant 2) -> MUST FAIL (403 Forbidden)
  const crossDelete = await request(`/api/auth/sub-users/${sub2Id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${owner1Token}` }
  });
  assert(
    crossDelete.status === 403 && crossDelete.body.ok === false,
    'Isolation 4.2: Cross-tenant sub-user deletion is strictly FORBIDDEN (HTTP 403)',
    `Status: ${crossDelete.status}`
  );

  // Isolation Test 4.3: Owner 1 attempts to resend credentials for Sub-user 2 -> MUST FAIL (403 Forbidden)
  const crossResend = await request(`/api/auth/sub-users/${sub2Id}/resend-email`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner1Token}` }
  });
  assert(
    crossResend.status === 403 && crossResend.body.ok === false,
    'Isolation 4.3: Cross-tenant credential reset is strictly FORBIDDEN (HTTP 403)',
    `Status: ${crossResend.status}`
  );

  // Isolation Test 4.4: Owner 1 attempts to access Owner 2 vault -> MUST FAIL (403 Forbidden)
  const crossVault = await request(`/api/cloud-sync/vault/${owner2VaultId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${owner1Token}` }
  });
  assert(
    crossVault.status === 403 && crossVault.body.ok === false,
    'Isolation 4.4: Cross-tenant vault data access is strictly FORBIDDEN (HTTP 403)',
    `Status: ${crossVault.status}`
  );

  // Isolation Test 4.5: Scoped outbox -> Owner 1 outbox does not expose Tenant 2 emails or cleartext passwords
  const owner1Outbox = await request('/api/emails/outbox', {
    method: 'GET',
    headers: { Authorization: `Bearer ${owner1Token}` }
  });
  assert(owner1Outbox.status === 200 && owner1Outbox.body.ok === true, 'Isolation 4.5a: Owner 1 retrieves outbox');
  const outboxItems = owner1Outbox.body.outbox || [];
  const leakedEmail = outboxItems.find((e: any) => e.to === sub2Email);
  assert(!leakedEmail, 'Isolation 4.5: Outbox emails of other organizations are NOT exposed');
  const hasPlaintextPassword = outboxItems.some((e: any) => e.metadata?.temporaryPassword);
  assert(!hasPlaintextPassword, 'Isolation 4.6: Outbox records redact plaintext temporary access keys');

  // =========================================================================
  // 5. Secure session creation, validation, expiration and revocation
  // =========================================================================
  console.log('\n--- Test Category 5: Session Creation, Validation & Revocation ---');
  
  // Create user for session test
  const sessUserEmail = `session_${Date.now()}@test.com`;
  const sessInitialPass = 'SessionP@ss123!';
  const sessReg = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Session User', email: sessUserEmail, password: sessInitialPass })
  });
  assert(sessReg.status === 201 && sessReg.body.ok === true, 'Session 5.1: Register session test user');
  const sessionToken1 = sessReg.body.token;

  // Verify Token 1 works
  const meRes1 = await request('/api/auth/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${sessionToken1}` }
  });
  assert(meRes1.status === 200 && meRes1.body.ok === true, 'Session 5.2: Token 1 authenticates successfully');

  // Change password to revoke previous sessions
  const sessNewPass = 'NewSessionP@ss456!';
  const changePassRes = await request('/api/auth/change-password', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessionToken1}` },
    body: JSON.stringify({
      currentPassword: sessInitialPass,
      newPassword: sessNewPass
    })
  });
  assert(changePassRes.status === 200 && changePassRes.body.ok === true, 'Session 5.3: Password changed successfully');
  const sessionToken2 = changePassRes.body.token;

  // Session Revocation Test 5.4: Old Token 1 MUST BE REVOKED -> 401 Unauthorized
  const meOldToken = await request('/api/auth/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${sessionToken1}` }
  });
  assert(
    meOldToken.status === 401 && meOldToken.body.ok === false,
    'Session 5.4: Previous session Token 1 is immediately REVOKED upon password change (HTTP 401)',
    `Status: ${meOldToken.status}`
  );

  // Session Revocation Test 5.5: New Token 2 MUST SUCCEED -> 200 OK
  const meNewToken = await request('/api/auth/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${sessionToken2}` }
  });
  assert(
    meNewToken.status === 200 && meNewToken.body.ok === true,
    'Session 5.5: Fresh session Token 2 authenticates successfully (HTTP 200)',
    `Status: ${meNewToken.status}`
  );

  // Session Revocation Test 5.6: Explicit logout invalidates Token 2
  const logoutRes = await request('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessionToken2}` }
  });
  assert(logoutRes.status === 200 && logoutRes.body.ok === true, 'Session 5.6a: Logout succeeds');
  const meLoggedOut = await request('/api/auth/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${sessionToken2}` }
  });
  assert(
    meLoggedOut.status === 401 && meLoggedOut.body.ok === false,
    'Session 5.6: Logged out Token 2 is properly invalidated and returns HTTP 401',
    `Status: ${meLoggedOut.status}`
  );

  // =========================================================================
  // 6. Protect sensitive endpoints against unauthorised requests
  // =========================================================================
  console.log('\n--- Test Category 6: Sensitive Endpoints Protection ---');

  // Sensitive 6.1: Admin Dashboard without token -> MUST FAIL (401 Unauthorized)
  const unauthAdminDash = await request('/api/admin/dashboard', { method: 'GET' });
  assert(
    unauthAdminDash.status === 401 && unauthAdminDash.body.ok === false,
    'Sensitive 6.1: Unauthenticated request to /api/admin/dashboard returns HTTP 401'
  );

  // Sensitive 6.2: Admin Dashboard with regular user token -> MUST FAIL (403 Forbidden)
  const forbiddenAdminDash = await request('/api/admin/dashboard', {
    method: 'GET',
    headers: { Authorization: `Bearer ${owner1Token}` }
  });
  assert(
    forbiddenAdminDash.status === 403 && forbiddenAdminDash.body.ok === false,
    'Sensitive 6.2: Non-admin user request to /api/admin/dashboard returns HTTP 403'
  );

  // Sensitive 6.3: Admin Config update with non-admin token -> MUST FAIL (403 Forbidden)
  const forbiddenConfig = await request('/api/admin/config', {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner1Token}` },
    body: JSON.stringify({ maintenanceMode: { enabled: true } })
  });
  assert(
    forbiddenConfig.status === 403 && forbiddenConfig.body.ok === false,
    'Sensitive 6.3: Non-admin user request to /api/admin/config returns HTTP 403'
  );

  // Sensitive 6.4: Admin Dashboard with valid Master Admin token -> MUST SUCCEED (200 OK)
  const validAdminDash = await request('/api/admin/dashboard', {
    method: 'GET',
    headers: { Authorization: `Bearer ${customLogin.body.token}` }
  });
  assert(
    validAdminDash.status === 200 && validAdminDash.body.ok === true && validAdminDash.body.admin.isMainAdmin === true,
    'Sensitive 6.4: Authorized Master Admin accesses admin dashboard successfully (HTTP 200)'
  );

  console.log(`\n======================================================`);
  console.log(`🏆 ALL SECURITY REMEDIATION TESTS PASSED: ${passedTests}/${totalTests}`);
  console.log(`======================================================\n`);
}

runSecurityTestSuite().catch(err => {
  console.error('\n❌ Security test suite encountered an unhandled failure:', err);
  process.exit(1);
});
