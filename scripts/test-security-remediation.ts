/**
 * Forecaster Pro Security Remediation Automated Test Suite (Phase 1.1)
 * Tests all security corrections using 100% isolated synthetic test accounts and vaults.
 * Never touches or modifies production users or real data vaults.
 */

const BASE_URL = 'http://localhost:3000';

async function request(path: string, options: RequestInit = {}): Promise<{ status: number; body: any; headers: Headers }> {
  const url = `${BASE_URL}${path}`;
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
  console.log('\n🔒 Starting Forecaster Pro Security Remediation Phase 1.1 Verification Suite...\n');

  // =========================================================================
  // 1. Remove hardcoded administrator passwords and insecure authentication fallbacks
  // =========================================================================
  console.log('--- Test Category 1: Hardcoded Administrator Password Removal & Authentication Fallbacks ---');
  
  const syntheticAdminEmail = `synth_admin_${Date.now()}@synthetic-test.local`;
  
  // 1.1 Attempt to login to a target account with old hardcoded default "Password123!"
  const fakeLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: syntheticAdminEmail, password: 'Password123!' })
  });
  assert(
    fakeLogin.status === 401 && fakeLogin.body.ok === false,
    'Vulnerability 1.1: Fallback login with hardcoded "Password123!" must be rejected with HTTP 401',
    `Received status: ${fakeLogin.status}`
  );

  // 1.2 Attempt unauthenticated profile update with x-user-email or without token
  const unauthProfile = await request('/api/auth/profile', {
    method: 'PUT',
    headers: { 'x-user-email': syntheticAdminEmail },
    body: JSON.stringify({ name: 'Hacked User' })
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
      email: syntheticAdminEmail,
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
  // 2. Implement secure initial administrator provisioning & password lifecycle
  // =========================================================================
  console.log('\n--- Test Category 2: Secure Initial Administrator Provisioning & Lifecycle ---');
  
  // Register an isolated synthetic primary workspace owner
  const synthOwnerEmail = `synth_owner_${Date.now()}@testcorp.local`;
  const initialSecret = 'StrongSecret#2026!';
  const regSynth = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Synthetic Primary Owner', email: synthOwnerEmail, password: initialSecret })
  });
  assert(
    (regSynth.status === 200 || regSynth.status === 201) && regSynth.body.ok === true && !!regSynth.body.token,
    'Provisioning 2.1: Primary workspace owner securely provisioned and authenticated',
    `Status: ${regSynth.status}`
  );
  const synthToken = regSynth.body.token;

  // Change password to a custom permanent secret
  const newSecret = 'UpdatedPermanentPass#2026!';
  const changePassRes = await request('/api/auth/change-password', {
    method: 'POST',
    headers: { Authorization: `Bearer ${synthToken}` },
    body: JSON.stringify({
      currentPassword: initialSecret,
      newPassword: newSecret
    })
  });
  assert(
    changePassRes.status === 200 && changePassRes.body.ok === true,
    'Provisioning 2.2: User can successfully change password to a custom permanent secret',
    `Status: ${changePassRes.status}`
  );
  const updatedToken = changePassRes.body.token;

  // Verify that the new custom password authenticates
  const customLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: synthOwnerEmail, password: newSecret })
  });
  assert(
    customLogin.status === 200 && customLogin.body.ok === true,
    'Provisioning 2.3: Custom permanent password persists and authenticates',
    `Status: ${customLogin.status}`
  );

  // Verify that the initial password is now rejected
  const oldLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: synthOwnerEmail, password: initialSecret })
  });
  assert(
    oldLogin.status === 401,
    'Provisioning 2.4: Previous initial password is completely invalidated after change',
    `Status: ${oldLogin.status}`
  );

  // =========================================================================
  // 3. Complete Role-Based Access Control (RBAC Permission Matrix)
  // =========================================================================
  console.log('\n--- Test Category 3: Server-Side Role-Based Access Control (RBAC) Matrix ---');
  
  // 3.1 Setup Owner, Manager, Member, Viewer sub-users in isolated workspace
  const workspaceVaultId = regSynth.body.user.vaultId;

  // Owner creates Viewer
  const createViewerRes = await request('/api/auth/sub-users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${updatedToken}` },
    body: JSON.stringify({ name: 'Synthetic Viewer', email: `viewer_${Date.now()}@testcorp.local`, role: 'viewer' })
  });
  assert(createViewerRes.status === 201, 'Setup 3.1: Owner creates Viewer sub-user');
  const viewerTempPass = createViewerRes.body.temporaryPassword;
  const viewerLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: createViewerRes.body.subUser.email, password: viewerTempPass })
  });
  const viewerToken = viewerLogin.body.token;

  // Owner creates Member
  const createMemberRes = await request('/api/auth/sub-users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${updatedToken}` },
    body: JSON.stringify({ name: 'Synthetic Member', email: `member_${Date.now()}@testcorp.local`, role: 'member' })
  });
  assert(createMemberRes.status === 201, 'Setup 3.2: Owner creates Member sub-user');
  const memberTempPass = createMemberRes.body.temporaryPassword;
  const memberLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: createMemberRes.body.subUser.email, password: memberTempPass })
  });
  const memberToken = memberLogin.body.token;

  // Owner creates Manager
  const createManagerRes = await request('/api/auth/sub-users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${updatedToken}` },
    body: JSON.stringify({ name: 'Synthetic Manager', email: `manager_${Date.now()}@testcorp.local`, role: 'manager' })
  });
  assert(createManagerRes.status === 201, 'Setup 3.3: Owner creates Manager sub-user');
  const managerTempPass = createManagerRes.body.temporaryPassword;
  const managerLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: createManagerRes.body.subUser.email, password: managerTempPass })
  });
  const managerToken = managerLogin.body.token;

  // --- VIEWER TESTS ---
  // Viewer can read
  const viewerRead = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
    headers: { Authorization: `Bearer ${viewerToken}` }
  });
  assert(viewerRead.status === 200, 'RBAC 3.1: Read-only viewer is authorized to read workspace vault data (HTTP 200)');

  // Viewer cannot write/mutate vault
  const viewerMutate = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${viewerToken}` },
    body: JSON.stringify({ transactions: [{ id: 'tx_viewer_hack', amount: 999 }] })
  });
  assert(viewerMutate.status === 403, 'RBAC 3.2: Read-only viewer is FORBIDDEN from mutating vault data (HTTP 403)');

  // Viewer cannot create transaction
  const viewerPostTxn = await request(`/api/cloud-sync/transactions?vaultId=${workspaceVaultId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${viewerToken}` },
    body: JSON.stringify({ transactions: [{ id: 'tx_viewer_post', amount: 50, type: 'expense', date: '2026-11-10' }] })
  });
  assert(viewerPostTxn.status === 403, 'RBAC 3.3: Read-only viewer is FORBIDDEN from posting transactions (HTTP 403)');

  // Viewer cannot delete transaction
  const viewerDelTxn = await request(`/api/cloud-sync/transactions/some_id?vaultId=${workspaceVaultId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${viewerToken}` }
  });
  assert(viewerDelTxn.status === 403, 'RBAC 3.4: Read-only viewer is FORBIDDEN from deleting transactions (HTTP 403)');

  // Viewer cannot restore backup
  const viewerRestore = await request('/api/backup/restore', {
    method: 'POST',
    headers: { Authorization: `Bearer ${viewerToken}` },
    body: JSON.stringify({ vaultId: workspaceVaultId, backupData: {}, mode: 'merge' })
  });
  assert(viewerRestore.status === 403, 'RBAC 3.5: Read-only viewer is FORBIDDEN from restoring backup (HTTP 403)');

  // --- MEMBER TESTS ---
  // Member can read vault data
  const memberRead = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
    headers: { Authorization: `Bearer ${memberToken}` }
  });
  assert(memberRead.status === 200, 'RBAC 3.6: Member is authorized to read workspace vault (HTTP 200)');

  // Member can create transaction
  const testTxId = `tx_member_${Date.now()}`;
  const memberPostTxn = await request(`/api/cloud-sync/transactions?vaultId=${workspaceVaultId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}` },
    body: JSON.stringify({
      transactions: [{ id: testTxId, amount: 120, type: 'expense', date: '2026-11-10', category: 'Fuel' }]
    })
  });
  assert(memberPostTxn.status === 200, 'RBAC 3.7: Member is authorized to create transactions (HTTP 200)');

  // Member is forbidden from deleting transactions
  const memberDelTxn = await request(`/api/cloud-sync/transactions/${testTxId}?vaultId=${workspaceVaultId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${memberToken}` }
  });
  assert(memberDelTxn.status === 403, 'RBAC 3.8: Member is FORBIDDEN from deleting transactions (HTTP 403)');

  // Member is forbidden from deleting accounts
  const memberDelAcc = await request(`/api/cloud-sync/accounts/some_acc?vaultId=${workspaceVaultId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${memberToken}` }
  });
  assert(memberDelAcc.status === 403, 'RBAC 3.9: Member is FORBIDDEN from deleting payment accounts (HTTP 403)');

  // Member is forbidden from restoring backups
  const memberRestore = await request('/api/backup/restore', {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}` },
    body: JSON.stringify({ vaultId: workspaceVaultId, backupData: {}, mode: 'merge' })
  });
  assert(memberRestore.status === 403, 'RBAC 3.10: Member is FORBIDDEN from restoring backups (HTTP 403)');

  // --- MANAGER TESTS ---
  // Manager can delete transactions
  const managerDelTxn = await request(`/api/cloud-sync/transactions/${testTxId}?vaultId=${workspaceVaultId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${managerToken}` }
  });
  assert(managerDelTxn.status === 200, 'RBAC 3.11: Manager is authorized to delete transactions (HTTP 200)');

  // Manager is forbidden from deleting payment accounts (Owner only)
  const managerDelAcc = await request(`/api/cloud-sync/accounts/some_acc?vaultId=${workspaceVaultId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${managerToken}` }
  });
  assert(managerDelAcc.status === 403, 'RBAC 3.12: Manager is FORBIDDEN from deleting payment accounts (HTTP 403)');

  // Manager is forbidden from restoring backups (Owner only)
  const managerRestore = await request('/api/backup/restore', {
    method: 'POST',
    headers: { Authorization: `Bearer ${managerToken}` },
    body: JSON.stringify({ vaultId: workspaceVaultId, backupData: {}, mode: 'merge' })
  });
  assert(managerRestore.status === 403, 'RBAC 3.13: Manager is FORBIDDEN from restoring backups (HTTP 403)');

  // Manager is authorized to export backups (Owner & Manager)
  const managerExport = await request(`/api/backup/export?vaultId=${workspaceVaultId}`, {
    headers: { Authorization: `Bearer ${managerToken}` }
  });
  assert(managerExport.status === 200, 'RBAC 3.14: Manager is authorized to export backups (HTTP 200)');

  // Manager is authorized to validate backups (Owner & Manager)
  const managerValidate = await request('/api/backup/validate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${managerToken}` },
    body: JSON.stringify({ vaultId: workspaceVaultId, backupData: { schemaVersion: '2.0.0', modules: {} } })
  });
  assert(managerValidate.status === 200, 'RBAC 3.15: Manager is authorized to validate backups (HTTP 200)');

  // Manager is FORBIDDEN from creating sub-users (Owner only)
  const managerCreateSub = await request('/api/auth/sub-users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${managerToken}` },
    body: JSON.stringify({ name: 'Manager Rogue Sub', email: 'rogue@sub.local', role: 'viewer' })
  });
  assert(managerCreateSub.status === 403, 'RBAC 3.16: Manager is FORBIDDEN from creating sub-users (HTTP 403)');

  // Manager is authorized to view sub-users (Owner & Manager)
  const managerListSub = await request('/api/auth/sub-users', {
    headers: { Authorization: `Bearer ${managerToken}` }
  });
  assert(managerListSub.status === 200, 'RBAC 3.17: Manager is authorized to view sub-users (HTTP 200)');

  // Member is FORBIDDEN from exporting backups
  const memberExport = await request(`/api/backup/export?vaultId=${workspaceVaultId}`, {
    headers: { Authorization: `Bearer ${memberToken}` }
  });
  assert(memberExport.status === 403, 'RBAC 3.18: Member is FORBIDDEN from exporting backups (HTTP 403)');

  // Member is FORBIDDEN from validating backups
  const memberValidate = await request('/api/backup/validate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}` },
    body: JSON.stringify({ vaultId: workspaceVaultId, backupData: {} })
  });
  assert(memberValidate.status === 403, 'RBAC 3.19: Member is FORBIDDEN from validating backups (HTTP 403)');

  // Member is FORBIDDEN from viewing sub-users
  const memberListSub = await request('/api/auth/sub-users', {
    headers: { Authorization: `Bearer ${memberToken}` }
  });
  assert(memberListSub.status === 403, 'RBAC 3.20: Member is FORBIDDEN from viewing sub-users (HTTP 403)');

  // Viewer is FORBIDDEN from exporting backups
  const viewerExport = await request(`/api/backup/export?vaultId=${workspaceVaultId}`, {
    headers: { Authorization: `Bearer ${viewerToken}` }
  });
  assert(viewerExport.status === 403, 'RBAC 3.21: Viewer is FORBIDDEN from exporting backups (HTTP 403)');

  // Viewer is FORBIDDEN from viewing sub-users
  const viewerListSub = await request('/api/auth/sub-users', {
    headers: { Authorization: `Bearer ${viewerToken}` }
  });
  assert(viewerListSub.status === 403, 'RBAC 3.22: Viewer is FORBIDDEN from viewing sub-users (HTTP 403)');

  // --- OWNER TESTS ---
  // Owner can manage accounts
  const ownerDelAcc = await request(`/api/cloud-sync/accounts/non_existent_acc?vaultId=${workspaceVaultId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${updatedToken}` }
  });
  assert(ownerDelAcc.status === 200, 'RBAC 3.23: Owner is authorized to manage/delete accounts (HTTP 200)');

  // =========================================================================
  // 4. Multi-Tenant Data & Organization Isolation
  // =========================================================================
  console.log('\n--- Test Category 4: Multi-Tenant Data & Organization Isolation ---');

  // Register Tenant 2 (Different Organization)
  const owner2Email = `tenant2_${Date.now()}@tenantcorp.local`;
  const reg2 = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Tenant Two Owner', email: owner2Email, password: 'Password123#Tenant2' })
  });
  assert(reg2.status === 200 || reg2.status === 201, 'Setup 4.1: Register Tenant 2');
  const token2 = reg2.body.token;
  const vaultId2 = reg2.body.user.vaultId;

  // Owner 2 creates Sub-user 2
  const createSub2 = await request('/api/auth/sub-users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token2}` },
    body: JSON.stringify({ name: 'Sub-User 2', email: `sub2_${Date.now()}@tenantcorp.local`, role: 'member' })
  });
  assert(createSub2.status === 201, 'Setup 4.2: Owner 2 creates Sub-user 2');
  const subUser2Id = createSub2.body.subUser.id;

  // Verify Owner 1 cannot see Sub-user 2
  const owner1SubUsers = await request('/api/auth/sub-users', {
    headers: { Authorization: `Bearer ${updatedToken}` }
  });
  const leakedSubUser = owner1SubUsers.body.subUsers.find((u: any) => u.id === subUser2Id);
  assert(!leakedSubUser, 'Isolation 4.1: Cross-tenant sub-user leakage prevented (Sub-user 2 is NOT visible to Tenant 1)');

  // Verify Owner 1 cannot delete Sub-user 2
  const crossDelete = await request(`/api/auth/sub-users/${subUser2Id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${updatedToken}` }
  });
  assert(crossDelete.status === 403, 'Isolation 4.2: Cross-tenant sub-user deletion is strictly FORBIDDEN (HTTP 403)');

  // Verify Owner 1 cannot reset Sub-user 2 credentials
  const crossReset = await request(`/api/auth/sub-users/${subUser2Id}/resend-email`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${updatedToken}` }
  });
  assert(crossReset.status === 403, 'Isolation 4.3: Cross-tenant credential reset is strictly FORBIDDEN (HTTP 403)');

  // Verify Owner 1 cannot access Tenant 2 vault data
  const crossVault = await request(`/api/cloud-sync/vault/${vaultId2}`, {
    headers: { Authorization: `Bearer ${updatedToken}` }
  });
  assert(crossVault.status === 403, 'Isolation 4.4: Cross-tenant vault data access is strictly FORBIDDEN (HTTP 403)');

  // Verify Tenant 1 outbox does not show Tenant 2 welcome email
  const outbox1 = await request('/api/emails/outbox', {
    headers: { Authorization: `Bearer ${updatedToken}` }
  });
  assert(outbox1.status === 200, 'Isolation 4.5: Tenant 1 retrieves own outbox successfully');
  const hasTenant2Email = outbox1.body.outbox.some((e: any) => e.to === createSub2.body.subUser.email);
  assert(!hasTenant2Email, 'Isolation 4.6: Outbox emails of other organizations are NOT exposed');

  // =========================================================================
  // 5. Session Creation, Validation, Expiration & Revocation
  // =========================================================================
  console.log('\n--- Test Category 5: Session Creation, Validation & Revocation ---');

  // Register session test user
  const sessionUserEmail = `session_${Date.now()}@testcorp.local`;
  const regSession = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Session User', email: sessionUserEmail, password: 'InitialSessionPass#1' })
  });
  const sessionToken1 = regSession.body.token;

  // Token 1 works
  const sessionTest1 = await request('/api/auth/profile', {
    headers: { Authorization: `Bearer ${sessionToken1}` }
  });
  assert(sessionTest1.status === 200, 'Session 5.1: Token 1 authenticates successfully');

  // Change password -> Token 1 should be immediately revoked
  const sessionChange = await request('/api/auth/change-password', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessionToken1}` },
    body: JSON.stringify({ currentPassword: 'InitialSessionPass#1', newPassword: 'SecondSessionPass#2' })
  });
  assert(sessionChange.status === 200, 'Session 5.2: Password changed successfully');
  const sessionToken2 = sessionChange.body.token;

  // Previous Token 1 must be rejected with 401
  const sessionTestOld = await request('/api/auth/profile', {
    headers: { Authorization: `Bearer ${sessionToken1}` }
  });
  assert(sessionTestOld.status === 401, 'Session 5.3: Previous session Token 1 is immediately REVOKED upon password change (HTTP 401)');

  // Fresh Token 2 must succeed
  const sessionTestNew = await request('/api/auth/profile', {
    headers: { Authorization: `Bearer ${sessionToken2}` }
  });
  assert(sessionTestNew.status === 200, 'Session 5.4: Fresh session Token 2 authenticates successfully (HTTP 200)');

  // Bulk session revocation test via POST /api/auth/revoke-all-sessions
  const bulkRevoke = await request('/api/auth/revoke-all-sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessionToken2}` },
    body: JSON.stringify({ scope: 'organization' })
  });
  assert(bulkRevoke.status === 200 && bulkRevoke.body.revokedCount > 0, 'Session 5.5: Bulk session revocation endpoint successfully invalidates organization tokens');

  // After bulk revocation, Token 2 must now be 401
  const sessionAfterRevoke = await request('/api/auth/profile', {
    headers: { Authorization: `Bearer ${sessionToken2}` }
  });
  assert(sessionAfterRevoke.status === 401, 'Session 5.6: Revoked session returns HTTP 401 after bulk revocation');

  // =========================================================================
  // 6. Sensitive Endpoints & Demo Account Confinement
  // =========================================================================
  console.log('\n--- Test Category 6: Sensitive Endpoints & Demo Account Confinement ---');

  // Unauthenticated request to /api/admin/dashboard returns 401
  const unauthAdmin = await request('/api/admin/dashboard');
  assert(unauthAdmin.status === 401, 'Sensitive 6.1: Unauthenticated request to /api/admin/dashboard returns HTTP 401');

  // Non-admin user request to /api/admin/dashboard returns 403
  const nonAdminReq = await request('/api/admin/dashboard', {
    headers: { Authorization: `Bearer ${updatedToken}` }
  });
  assert(nonAdminReq.status === 403, 'Sensitive 6.2: Non-admin user request to /api/admin/dashboard returns HTTP 403');

  // Authenticate Demo User
  const demoLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'demo@forecasterpro.com', password: 'DemoPassword123!' })
  });
  assert(demoLogin.status === 200 && demoLogin.body.user.isDemo === true, 'Demo 6.1: Demo user authenticates into demo-showcase-vault');
  const demoToken = demoLogin.body.token;

  // Demo user FORBIDDEN from admin dashboard
  const demoAdminReq = await request('/api/admin/dashboard', {
    headers: { Authorization: `Bearer ${demoToken}` }
  });
  assert(demoAdminReq.status === 403, 'Demo 6.2: Demo user is FORBIDDEN from administrator dashboard (HTTP 403)');

  // Demo user FORBIDDEN from accessing production workspaces
  const demoVaultHack = await request(`/api/cloud-sync/vault/${workspaceVaultId}`, {
    headers: { Authorization: `Bearer ${demoToken}` }
  });
  assert(demoVaultHack.status === 403, 'Demo 6.3: Demo user is FORBIDDEN from accessing production workspaces (HTTP 403)');

  // Demo user FORBIDDEN from creating sub-users
  const demoSubUserHack = await request('/api/auth/sub-users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${demoToken}` },
    body: JSON.stringify({ name: 'Demo Hack Sub', email: 'hack@demo.local', role: 'member' })
  });
  assert(demoSubUserHack.status === 403, 'Demo 6.4: Demo user is FORBIDDEN from managing sub-users (HTTP 403)');

  // =========================================================================
  // 7. CORS and Security Headers Policy
  // =========================================================================
  console.log('\n--- Test Category 7: Configurable CORS, CSRF & Security Headers ---');

  // 7.1 Preflight OPTIONS with untrusted origin is rejected with HTTP 403
  const badCorsOptions = await request('/api/cloud-sync/status', {
    method: 'OPTIONS',
    headers: { Origin: 'https://malicious-attacker.com' }
  });
  assert(badCorsOptions.status === 403, 'CORS 7.1: Preflight OPTIONS from untrusted origin is rejected (HTTP 403)');

  // 7.2 Preflight OPTIONS with trusted loopback origin succeeds with HTTP 204 & Access-Control-Allow-Origin
  const loopbackCorsOptions = await request('/api/cloud-sync/status', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:3000' }
  });
  assert(
    loopbackCorsOptions.status === 204 && loopbackCorsOptions.headers.get('access-control-allow-origin') === 'http://localhost:3000',
    'CORS 7.2: Preflight OPTIONS from trusted local origin succeeds with HTTP 204 and matching allow-origin'
  );

  // 7.3 Mutation from untrusted origin is blocked by CSRF protection
  const csrfAttack = await request('/api/auth/register', {
    method: 'POST',
    headers: { Origin: 'https://evil-phishing.org' },
    body: JSON.stringify({ name: 'CSRF Attack', email: 'csrf@evil.org', password: 'Password123!' })
  });
  assert(csrfAttack.status === 403, 'CORS 7.3: Mutation request from untrusted origin is rejected by CSRF protection (HTTP 403)');

  // 7.4 Defense-in-depth security headers are present
  const secHeadersReq = await request('/api/public/system-status');
  assert(
    secHeadersReq.headers.get('x-content-type-options') === 'nosniff' &&
    secHeadersReq.headers.get('x-frame-options') === 'SAMEORIGIN',
    'CORS 7.4: Standard defense-in-depth security headers (nosniff, SAMEORIGIN) are properly enforced'
  );

  // =========================================================================
  // 8. Password Policy & Brute-Force Lockout
  // =========================================================================
  console.log('\n--- Test Category 8: Strong Password Policy & Brute-Force Lockout ---');

  // 8.1 Password shorter than 8 characters is rejected
  const shortPassRes = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Short Pass User', email: `short_${Date.now()}@test.local`, password: 'Short1!' })
  });
  assert(shortPassRes.status === 400, 'Password 8.1: Password shorter than 8 characters is rejected (HTTP 400)');

  // 8.2 Password missing uppercase letter is rejected
  const noUpperRes = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'No Upper User', email: `noupper_${Date.now()}@test.local`, password: 'password123!' })
  });
  assert(noUpperRes.status === 400, 'Password 8.2: Password missing uppercase letter is rejected (HTTP 400)');

  // 8.3 Password missing numeric digit is rejected
  const noDigitRes = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'No Digit User', email: `nodigit_${Date.now()}@test.local`, password: 'Password!@#' })
  });
  assert(noDigitRes.status === 400, 'Password 8.3: Password missing numeric digit is rejected (HTTP 400)');

  // 8.4 Password missing special character is rejected
  const noSpecialRes = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'No Special User', email: `nospecial_${Date.now()}@test.local`, password: 'Password123' })
  });
  assert(noSpecialRes.status === 400, 'Password 8.4: Password missing special character is rejected (HTTP 400)');

  // 8.5 Valid strong password succeeds
  const lockoutTargetEmail = `lockout_target_${Date.now()}@lockout.local`;
  const validStrongPass = 'SecureTargetPass#2026!';
  const strongRegRes = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Lockout Target', email: lockoutTargetEmail, password: validStrongPass })
  });
  assert(strongRegRes.status === 200 || strongRegRes.status === 201, 'Password 8.5: Valid strong password meets all criteria and succeeds (HTTP 201)');

  // 8.6 Brute-force account lockout: 5 consecutive failed login attempts
  for (let attempt = 1; attempt <= 4; attempt++) {
    const failRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: lockoutTargetEmail, password: 'WrongPassword#999!' })
    });
    assert(failRes.status === 401, `Lockout 8.6a: Failed attempt #${attempt} returns HTTP 401`);
  }

  // 5th failed attempt triggers HTTP 423 Account Locked
  const lockTriggerRes = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: lockoutTargetEmail, password: 'WrongPassword#999!' })
  });
  assert(lockTriggerRes.status === 423, 'Lockout 8.6b: 5th consecutive failed attempt triggers temporary account lockout (HTTP 423)');

  // 8.7 While account is locked, even the correct password is rejected with HTTP 423
  const lockedWithCorrectPass = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: lockoutTargetEmail, password: validStrongPass })
  });
  assert(lockedWithCorrectPass.status === 423, 'Lockout 8.7: Locked account rejects login even with valid password while lockout is active (HTTP 423)');

  console.log('\n======================================================');
  console.log(`🏆 ALL SECURITY REMEDIATION TESTS PASSED: ${passedTests}/${totalTests}`);
  console.log('======================================================\n');
}

runSecurityTestSuite().catch(err => {
  console.error('\n💥 SECURITY TEST SUITE FAILED:', err);
  process.exit(1);
});
