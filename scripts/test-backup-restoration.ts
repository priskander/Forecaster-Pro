/**
 * ============================================================================
 * FORECASTER PRO - COMPLETE CLOUD SYNC & BACKUP RESTORATION TEST SUITE
 * Tests complete snapshot and independent modular backup and restoration across:
 * 1. Financial transactions and accounts
 * 2. Budgets and allocations
 * 3. Inventory and pharmacy stock
 * 4. Spare parts and stock movements
 * 5. Vehicles and vehicle history
 * 6. Fuel transactions and fuel history
 * 7. Maintenance and associated expenses
 * 8. Rental properties and contracts
 * 9. Notifications and relevant user settings
 *
 * Requirements verified:
 * - Versioned backup format (v2.0.0 with SHA-256 checksum)
 * - Pre-flight validation & diagnostics reporting
 * - Deduplication preventing duplicate records on repeated restores
 * - Non-destructive merge preserving unmentioned user data ("never silently overwrite")
 * - Explicit replacement mode verification
 * - Multi-tenant and organization ownership enforcement (HTTP 403 on cross-tenant access)
 * - Complete cross-device restoration simulation
 * - Backward compatibility with legacy v1 backups
 * ============================================================================
 */

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, category: string, name: string, detail?: string) {
  if (condition) {
    results.push({ category, name, passed: true });
    console.log(`  ✅ PASS: [${category}] ${name}`);
  } else {
    const msg = detail || 'Assertion failed';
    results.push({ category, name, passed: false, error: msg });
    console.error(`  ❌ FAIL: [${category}] ${name} -> ${msg}`);
  }
}

async function request(path: string, options: RequestInit = {}): Promise<{ status: number; body: any }> {
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

  return { status: res.status, body };
}

async function runTests() {
  console.log('\n📦 Starting Forecaster Pro Backup & Cloud Restoration Test Suite...\n');

  // --- Setup Master Admin Session ---
  let adminPass = 'ForecasterAdmin2026!';
  let adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'peter.w.badir@gmail.com', password: adminPass })
  });

  if (adminLogin.status === 401) {
    adminPass = 'PersistentAdminPass#2026!';
    adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'peter.w.badir@gmail.com', password: adminPass })
    });
  }

  const adminToken = adminLogin.body?.token;
  if (!adminToken) {
    throw new Error('Could not authenticate master admin for testing: ' + JSON.stringify(adminLogin.body));
  }
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  // ============================================================================
  // Test Category 1: Full Application Snapshot Export & Versioning
  // ============================================================================
  console.log('--- Test Category 1: Full Application Snapshot Export & Versioning ---');

  const exportAll = await request('/api/backup/export?vaultId=demo-showcase-vault&module=all', {
    method: 'GET',
    headers: adminHeaders
  });

  assert(exportAll.status === 200, 'Snapshot Export', 'HTTP 200 returned on export');
  assert(exportAll.body?.ok === true, 'Snapshot Export', 'Response body has ok: true');
  
  const envelope = exportAll.body?.backup;
  assert(envelope?.format === 'forecaster-pro-backup', 'Versioning', 'Envelope format is "forecaster-pro-backup"');
  assert(envelope?.schemaVersion === '2.0.0', 'Versioning', 'Schema version is strictly "2.0.0"');
  assert(typeof envelope?.checksum === 'string' && envelope.checksum.length === 64, 'Integrity', 'Valid SHA-256 digital checksum generated');
  assert(typeof envelope?.organizationId === 'string' && envelope.organizationId === 'demo-showcase-vault', 'Ownership', 'Organization ID matches requested vault');
  assert(typeof envelope?.ownerEmail === 'string' && envelope.ownerEmail.length > 0, 'Ownership', 'Owner email metadata preserved');

  // Verify all 9 module structures in envelope.modules
  const mods = envelope?.modules;
  assert(Array.isArray(mods?.financial?.transactions), 'Module Check', '1. Financial transactions array exists');
  assert(Array.isArray(mods?.financial?.accounts), 'Module Check', '1. Financial accounts array exists');
  assert(Array.isArray(mods?.financial?.transfers), 'Module Check', '1. Financial transfers array exists');
  assert(typeof mods?.budgets === 'object', 'Module Check', '2. Budgets & allocations structure exists');
  assert(Array.isArray(mods?.inventory?.stockData), 'Module Check', '3. Stock inventory array exists');
  assert(Array.isArray(mods?.inventory?.pharmacyData), 'Module Check', '3. Pharmacy medications array exists');
  assert(Array.isArray(mods?.fleet?.vehicles), 'Module Check', '5. Vehicles array exists');
  assert(Array.isArray(mods?.fleet?.fuels), 'Module Check', '6. Fuel transactions array exists');
  assert(Array.isArray(mods?.fleet?.maint), 'Module Check', '7. Maintenance history array exists');
  assert(Array.isArray(mods?.rentals?.properties), 'Module Check', '8. Rental properties array exists');
  assert(Array.isArray(mods?.rentals?.contracts), 'Module Check', '8. Rental contracts array exists');
  assert(typeof mods?.settings === 'object', 'Module Check', '9. Notifications & settings structure exists');

  // Verify backward compatibility aliases at top level
  assert(Array.isArray(envelope?.transactions), 'Legacy Compatibility', 'Top-level transactions alias preserved');
  assert(Array.isArray(envelope?.stockData), 'Legacy Compatibility', 'Top-level stockData alias preserved');
  assert(Array.isArray(envelope?.pro_vehicles), 'Legacy Compatibility', 'Top-level pro_vehicles alias preserved');

  // ============================================================================
  // Test Category 2: Independent Modular Backups
  // ============================================================================
  console.log('\n--- Test Category 2: Independent Modular Backups ---');

  // 2.1 Financial module only
  const exportFin = await request('/api/backup/export?vaultId=demo-showcase-vault&module=financial', {
    method: 'GET',
    headers: adminHeaders
  });
  assert(exportFin.status === 200, 'Modular Export', 'Financial export returned HTTP 200');
  const finMods = exportFin.body?.backup?.modules;
  assert(finMods?.financial?.transactions?.length > 0, 'Modular Export', 'Financial export has transactions');
  assert(finMods?.inventory?.stockData?.length === 0, 'Modular Export', 'Financial export isolates inventory (stockData is empty)');
  assert(finMods?.fleet?.vehicles?.length === 0, 'Modular Export', 'Financial export isolates fleet (vehicles is empty)');

  // 2.2 Inventory module only
  const exportInv = await request('/api/backup/export?vaultId=demo-showcase-vault&module=inventory', {
    method: 'GET',
    headers: adminHeaders
  });
  const invMods = exportInv.body?.backup?.modules;
  assert(invMods?.inventory?.stockData?.length > 0, 'Modular Export', 'Inventory export includes stock data');
  assert(invMods?.inventory?.pharmacyData?.length > 0, 'Modular Export', 'Inventory export includes pharmacy data');
  assert(invMods?.financial?.transactions?.length === 0, 'Modular Export', 'Inventory export isolates financial records');

  // 2.3 Fleet module only
  const exportFlt = await request('/api/backup/export?vaultId=demo-showcase-vault&module=fleet', {
    method: 'GET',
    headers: adminHeaders
  });
  const fltMods = exportFlt.body?.backup?.modules;
  assert(fltMods?.fleet?.vehicles?.length > 0, 'Modular Export', 'Fleet export includes vehicles');
  assert(fltMods?.fleet?.fuels?.length > 0, 'Modular Export', 'Fleet export includes fuels');
  assert(fltMods?.fleet?.maint?.length > 0, 'Modular Export', 'Fleet export includes maintenance');
  assert(fltMods?.inventory?.stockData?.length === 0, 'Modular Export', 'Fleet export isolates inventory');

  // 2.4 Spare Parts filter
  const exportParts = await request('/api/backup/export?vaultId=demo-showcase-vault&module=parts', {
    method: 'GET',
    headers: adminHeaders
  });
  const partsItems = exportParts.body?.backup?.modules?.inventory?.stockData || [];
  assert(partsItems.length > 0, 'Modular Export', 'Spare parts export returned items');
  const allAreParts = partsItems.every((p: any) => p.itemType === 'vehicle-spare-part' || p.itemType === 'residential-spare-part' || p.category === 'Spare Parts');
  assert(allAreParts, 'Modular Export', 'All items in parts export are spare parts');

  // ============================================================================
  // Test Category 3: Pre-flight Validation & Diagnostics Reporting
  // ============================================================================
  console.log('\n--- Test Category 3: Pre-flight Validation & Diagnostics Reporting ---');

  // 3.1 Valid backup validation
  const validateValid = await request('/api/backup/validate', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ vaultId: 'demo-showcase-vault', backupData: exportAll.body?.backup })
  });
  assert(validateValid.status === 200, 'Pre-flight Validation', 'Valid backup validation returned HTTP 200');
  assert(validateValid.body?.valid === true, 'Pre-flight Validation', 'Validation reports valid: true');
  assert(validateValid.body?.existingDuplicateCount > 0, 'Duplicate Diagnostics', 'Correctly detects existing records as duplicates');
  assert(validateValid.body?.invalidRecordCount === 0, 'Diagnostics', 'Zero invalid records in clean backup');

  // 3.2 Malformed records validation
  const badBackup = {
    format: 'forecaster-pro-backup',
    schemaVersion: '2.0.0',
    modules: {
      financial: {
        transactions: [
          { id: 'tx_valid_1', date: '2026-11-01', amount: 150, type: 'expense', description: 'Office supplies' },
          { id: 'tx_bad_neg', date: '2026-11-01', amount: -500, type: 'expense', description: 'Negative amount' },
          { id: '', date: '2026-11-01', amount: 100, type: 'income', description: 'Missing id' }
        ],
        accounts: [],
        transfers: []
      },
      fleet: {
        vehicles: [
          { id: 'veh_bad', make: '', model: '', plate: '' }
        ]
      }
    }
  };

  const validateBad = await request('/api/backup/validate', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ vaultId: 'demo-showcase-vault', backupData: badBackup })
  });

  assert(validateBad.status === 200, 'Validation Diagnostics', 'Validation returned HTTP 200 with diagnostics');
  assert(validateBad.body?.hasWarnings === true, 'Validation Diagnostics', 'Correctly flags hasWarnings: true');
  assert(validateBad.body?.invalidRecordCount >= 2, 'Validation Diagnostics', 'Correctly counts invalid records');
  assert(Array.isArray(validateBad.body?.errors) && validateBad.body.errors.length >= 2, 'Validation Diagnostics', 'Provides descriptive errors list');
  const foundNegError = validateBad.body.errors.some((e: any) => e.id === 'tx_bad_neg' && e.reason.includes('non-negative'));
  assert(foundNegError, 'Validation Diagnostics', 'Identified specific validation failure reason for negative amount');

  // ============================================================================
  // Test Category 4: Deduplication & Repeated Restoration (Zero duplicate creation)
  // ============================================================================
  console.log('\n--- Test Category 4: Deduplication & Repeated Restoration ---');

  // Create isolated test vault for repeated restoration test
  const testVaultId = 'vault_dedup_test_' + Date.now();
  const sampleBackup = {
    format: 'forecaster-pro-backup',
    schemaVersion: '2.0.0',
    organizationId: testVaultId,
    modules: {
      financial: {
        transactions: [
          { id: 'tx_dedup_1', date: '2026-11-01', amount: 350, type: 'expense', category: 'Supplies', description: 'Dedup Item 1' },
          { id: 'tx_dedup_2', date: '2026-11-02', amount: 900, type: 'income', category: 'Sales', description: 'Dedup Item 2' }
        ],
        accounts: [
          { id: 'acc_dedup_cash', type: 'cash', label: 'Dedup Wallet', initialBalance: 100 }
        ],
        transfers: []
      },
      inventory: {
        stockData: [
          { id: 'stk_dedup_1', name: 'Dedup Stock Item A', currentStock: 25, unit: 'pcs' }
        ],
        pharmacyData: [
          { id: 'phm_dedup_1', name: 'Dedup Med Omega', currentStock: 40, unit: 'capsules' }
        ]
      },
      fleet: {
        vehicles: [
          { id: 'veh_dedup_corolla', make: 'Toyota', model: 'Corolla', plate: 'TEST-123' }
        ],
        fuels: [
          { id: 'fuel_dedup_1', vehicleId: 'veh_dedup_corolla', liters: 35, cost: 490 }
        ],
        maint: []
      },
      rentals: {
        properties: [
          { id: 'prop_dedup_1', title: 'Dedup Sunset Apartment', address: '123 Test St' }
        ],
        contracts: [
          { id: 'cntr_dedup_1', propertyId: 'prop_dedup_1', tenantName: 'Alice Tester', rentAmount: 1200 }
        ],
        notifications: []
      },
      budgets: { limits: { income: 5000, expense: 3000 } },
      settings: { theme: 'dark' }
    }
  };

  // First restore (merge mode)
  const restore1 = await request('/api/backup/restore', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ vaultId: testVaultId, backupData: sampleBackup, mode: 'merge' })
  });
  assert(restore1.status === 200, 'Deduplication', 'First restore succeeded (HTTP 200)');
  const vaultAfter1 = restore1.body?.vault;
  assert(vaultAfter1?.transactions?.length === 2, 'Deduplication', 'Initial transaction count is 2');
  assert(vaultAfter1?.vehicles?.length === 1, 'Deduplication', 'Initial vehicle count is 1');
  assert(vaultAfter1?.stockData?.length === 1, 'Deduplication', 'Initial stock count is 1');
  assert(vaultAfter1?.pharmacyData?.length === 1, 'Deduplication', 'Initial pharmacy count is 1');
  assert(vaultAfter1?.rentalProperties?.length === 1, 'Deduplication', 'Initial rental property count is 1');

  // Second restore of the EXACT same backup (merge mode)
  const restore2 = await request('/api/backup/restore', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ vaultId: testVaultId, backupData: sampleBackup, mode: 'merge' })
  });
  assert(restore2.status === 200, 'Deduplication', 'Second restore succeeded (HTTP 200)');
  const vaultAfter2 = restore2.body?.vault;
  assert(vaultAfter2?.transactions?.length === 2, 'Deduplication', 'Transaction count remains EXACTLY 2 (zero duplicates)');
  assert(vaultAfter2?.vehicles?.length === 1, 'Deduplication', 'Vehicle count remains EXACTLY 1 (zero duplicates)');
  assert(vaultAfter2?.stockData?.length === 1, 'Deduplication', 'Stock count remains EXACTLY 1 (zero duplicates)');
  assert(vaultAfter2?.rentalProperties?.length === 1, 'Deduplication', 'Rental property count remains EXACTLY 1 (zero duplicates)');

  // Third restore (merge mode)
  const restore3 = await request('/api/backup/restore', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ vaultId: testVaultId, backupData: sampleBackup, mode: 'merge' })
  });
  const vaultAfter3 = restore3.body?.vault;
  assert(vaultAfter3?.transactions?.length === 2, 'Deduplication', 'Third restore: Transaction count still 2 (zero duplicate drift)');

  // ============================================================================
  // Test Category 5: "Never Silently Overwrite" & Non-Destructive Merge vs Explicit Replace
  // ============================================================================
  console.log('\n--- Test Category 5: "Never Silently Overwrite" & Non-Destructive Merge vs Replace ---');

  // Pre-seed an existing private record that is NOT in the incoming backup
  await request('/api/cloud-sync/transactions', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      vaultId: testVaultId,
      transaction: { id: 'tx_pre_existing_local', date: '2026-11-05', amount: 777, type: 'income', description: 'Local Unrelated Record' }
    })
  });

  // Verify it exists in vault
  const vaultBeforeMerge = await request(`/api/cloud-sync/vault/${testVaultId}`, { headers: adminHeaders });
  assert(vaultBeforeMerge.body?.vault?.transactions?.some((t: any) => t.id === 'tx_pre_existing_local'), 'Safety', 'Local pre-existing record verified in vault');

  // Now restore incoming backup that does NOT have tx_pre_existing_local
  const nonDestructiveRestore = await request('/api/backup/restore', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ vaultId: testVaultId, backupData: sampleBackup, mode: 'merge' })
  });

  const vaultAfterMerge = nonDestructiveRestore.body?.vault;
  const localRecordStillExists = vaultAfterMerge?.transactions?.some((t: any) => t.id === 'tx_pre_existing_local');
  assert(localRecordStillExists, 'Never Silently Overwrite', 'Pre-existing local record was PRESERVED in merge mode (never silently overwritten)');
  assert(vaultAfterMerge?.transactions?.length === 3, 'Never Silently Overwrite', 'Total transactions: 1 pre-existing + 2 from backup = 3');

  // Verify explicit replace mode replaces the module completely
  const explicitReplaceRestore = await request('/api/backup/restore', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      vaultId: testVaultId,
      backupData: sampleBackup,
      mode: 'replace',
      selectedModules: ['financial']
    })
  });

  const vaultAfterReplace = explicitReplaceRestore.body?.vault;
  assert(vaultAfterReplace?.transactions?.length === 2, 'Explicit Replace', 'Replace mode explicitly set financial transactions to backup snapshot length');
  assert(!vaultAfterReplace?.transactions?.some((t: any) => t.id === 'tx_pre_existing_local'), 'Explicit Replace', 'Unrelated local record replaced only when explicit mode="replace" requested');
  // Verify other modules were preserved during single module replace
  assert(vaultAfterReplace?.vehicles?.length === 1, 'Explicit Replace', 'Fleet vehicles preserved during financial-only replace');

  // ============================================================================
  // Test Category 6: Multi-Tenant & Organization Ownership Isolation
  // ============================================================================
  console.log('\n--- Test Category 6: Multi-Tenant & Organization Ownership Isolation ---');

  // Register Tenant 1
  const owner1Email = `tenant1_${Date.now()}@testcorp.com`;
  const reg1 = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Tenant One', email: owner1Email, password: 'Password123!' })
  });
  const token1 = reg1.body?.token;
  const vaultId1 = reg1.body?.user?.vaultId;

  // Register Tenant 2
  const owner2Email = `tenant2_${Date.now()}@testcorp.com`;
  const reg2 = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Tenant Two', email: owner2Email, password: 'Password123!' })
  });
  const token2 = reg2.body?.token;
  const vaultId2 = reg2.body?.user?.vaultId;

  // Tenant 2 attempts to restore into Tenant 1's vault
  const unauthorizedRestore = await request('/api/backup/restore', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token2}` },
    body: JSON.stringify({
      vaultId: vaultId1,
      backupData: sampleBackup,
      mode: 'merge'
    })
  });
  assert(unauthorizedRestore.status === 403, 'Tenant Isolation', 'Cross-tenant backup restore strictly FORBIDDEN with HTTP 403');

  // Tenant 2 attempts to export Tenant 1's backup
  const unauthorizedExport = await request(`/api/backup/export?vaultId=${vaultId1}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token2}` }
  });
  assert(unauthorizedExport.status === 403, 'Tenant Isolation', 'Cross-tenant backup export strictly FORBIDDEN with HTTP 403');

  // When Tenant 2 restores a backup into their own vault, records are scoped exclusively to vaultId2
  const tenant2OwnRestore = await request('/api/backup/restore', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token2}` },
    body: JSON.stringify({
      vaultId: vaultId2,
      backupData: sampleBackup,
      mode: 'merge'
    })
  });
  assert(tenant2OwnRestore.status === 200, 'Tenant Isolation', 'Tenant 2 can restore into their own vault');
  assert(tenant2OwnRestore.body?.vault?.vaultId === vaultId2, 'Tenant Isolation', 'Data is stored strictly in Tenant 2 vault');

  // Verify Tenant 1 vault was completely untouched
  const checkTenant1Vault = await request(`/api/cloud-sync/vault/${vaultId1}`, {
    headers: { Authorization: `Bearer ${token1}` }
  });
  assert(checkTenant1Vault.body?.vault?.transactions?.length === 0, 'Tenant Isolation', 'Tenant 1 vault remains completely untouched');

  // ============================================================================
  // Test Category 7: Cross-Device Restoration Simulation
  // ============================================================================
  console.log('\n--- Test Category 7: Cross-Device Restoration Simulation ---');

  // Device 1 pushes complete 9-domain dataset to Tenant 1 vault
  const device1Data = {
    transactions: [{ id: 'tx_dev1_salary', amount: 5000, type: 'income', category: 'Salary', date: '2026-11-01' }],
    accounts: [{ id: 'acc_dev1_bank', type: 'card', label: 'Primary Bank' }],
    accountTransfers: [{ id: 'tr_dev1', fromAccountId: 'acc_dev1_bank', toAccountId: 'acc_cash', amount: 200 }],
    budgetLimits: { income: 6000, expense: 3500 },
    allocationsMode: 'envelope',
    customCategories: [{ id: 'cat_invest', name: 'Investments', color: '#10b981' }],
    stockData: [{ id: 'stk_dev1_coffee', name: 'Arabica Coffee Beans', currentStock: 10, unit: 'bags' }],
    pharmacyData: [{ id: 'phm_dev1_vitamin', name: 'Vitamin C 1000mg', currentStock: 30, unit: 'tablets' }],
    vehicles: [{ id: 'veh_dev1_civic', make: 'Honda', model: 'Civic', plate: 'HND-555' }],
    fuels: [{ id: 'fuel_dev1_1', vehicleId: 'veh_dev1_civic', liters: 40, cost: 560 }],
    maint: [{ id: 'mnt_dev1_oil', vehicleId: 'veh_dev1_civic', date: '2026-10-20', totalCost: 650 }],
    rentalProperties: [{ id: 'prop_dev1_villa', title: 'Palm Villa', address: 'Palm Springs' }],
    rentalContracts: [{ id: 'cntr_dev1_1', propertyId: 'prop_dev1_villa', rentAmount: 3000 }],
    rentalNotifications: [{ id: 'notif_dev1_1', timestamp: '2026-11-01', message: 'Rent due soon' }],
    userSettings: { theme: 'dark', autoSync: true }
  };

  const pushDev1 = await request(`/api/cloud-sync/vault/${vaultId1}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: JSON.stringify(device1Data)
  });
  assert(pushDev1.status === 200, 'Cross-Device Simulation', 'Device 1 pushed all 9 modules to cloud vault');

  // Device 2 (Simulating clean device logging in from another device/browser)
  // Calls pullVault -> GET /api/cloud-sync/vault/:vaultId
  const pullDev2 = await request(`/api/cloud-sync/vault/${vaultId1}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token1}` }
  });
  assert(pullDev2.status === 200, 'Cross-Device Simulation', 'Device 2 pulls vault from cloud');
  const d2Vault = pullDev2.body?.vault;

  assert(d2Vault?.transactions?.length === 1 && d2Vault.transactions[0].id === 'tx_dev1_salary', 'Cross-Device Simulation', '1. Financial transactions hydrated on Device 2');
  assert(d2Vault?.accounts?.length === 1, 'Cross-Device Simulation', '1. Payment accounts hydrated on Device 2');
  assert(d2Vault?.accountTransfers?.length === 1, 'Cross-Device Simulation', '1. Transfers hydrated on Device 2');
  assert(d2Vault?.budgetLimits?.income === 6000, 'Cross-Device Simulation', '2. Budgets hydrated on Device 2');
  assert(d2Vault?.customCategories?.length === 1, 'Cross-Device Simulation', '2. Custom categories hydrated on Device 2');
  assert(d2Vault?.stockData?.length === 1 && d2Vault.stockData[0].name === 'Arabica Coffee Beans', 'Cross-Device Simulation', '3. Stock inventory hydrated on Device 2');
  assert(d2Vault?.pharmacyData?.length === 1, 'Cross-Device Simulation', '3. Pharmacy stock hydrated on Device 2');
  assert(d2Vault?.vehicles?.length === 1 && d2Vault.vehicles[0].plate === 'HND-555', 'Cross-Device Simulation', '5. Vehicles fleet hydrated on Device 2');
  assert(d2Vault?.fuels?.length === 1, 'Cross-Device Simulation', '6. Fuel logs hydrated on Device 2');
  assert(d2Vault?.maint?.length === 1, 'Cross-Device Simulation', '7. Maintenance history hydrated on Device 2');
  assert(d2Vault?.rentalProperties?.length === 1, 'Cross-Device Simulation', '8. Rental properties hydrated on Device 2');
  assert(d2Vault?.rentalContracts?.length === 1, 'Cross-Device Simulation', '8. Rental contracts hydrated on Device 2');
  assert(d2Vault?.rentalNotifications?.length === 1, 'Cross-Device Simulation', '9. Rental notifications hydrated on Device 2');
  assert(d2Vault?.userSettings?.theme === 'dark', 'Cross-Device Simulation', '9. User settings hydrated on Device 2');

  // ============================================================================
  // Test Category 8: Backward Compatibility with Legacy v1 Backups
  // ============================================================================
  console.log('\n--- Test Category 8: Backward Compatibility with Legacy v1 Backups ---');

  const legacyV1Backup = {
    version: 'ForecasterPro-v1.06.12-enterprise',
    exportedAt: '2026-09-15T12:00:00.000Z',
    pro_transactions: [
      { id: 'tx_leg_1', date: '2026-09-01', amount: 200, type: 'expense', category: 'Groceries', description: 'Legacy Grocery' }
    ],
    pro_accounts: [
      { id: 'acc_leg_cash', type: 'cash', label: 'Legacy Cash Wallet', initialBalance: 50 }
    ],
    pro_stock: [
      { id: 'stk_leg_1', name: 'Legacy Olive Oil', currentStock: 3, unit: 'Bottle' }
    ],
    pro_vehicles: [
      { id: 'veh_leg_1', make: 'Nissan', model: 'Sunny', plate: 'LEG-999' }
    ],
    pro_vehicle_fuel: [
      { id: 'fuel_leg_1', vehicleId: 'veh_leg_1', liters: 25, cost: 350 }
    ],
    pro_rental_contracts_v1: [
      { id: 'cntr_leg_1', propertyId: 'prop_leg_1', rentAmount: 850 }
    ],
    pro_rental_properties_v1: [
      { id: 'prop_leg_1', title: 'Legacy Downtown Studio' }
    ]
  };

  const validateLegacy = await request('/api/backup/validate', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ vaultId: testVaultId, backupData: legacyV1Backup })
  });
  assert(validateLegacy.status === 200, 'Legacy Compatibility', 'Legacy backup validation returned HTTP 200');
  assert(validateLegacy.body?.valid === true, 'Legacy Compatibility', 'Legacy backup recognized as valid');
  assert(validateLegacy.body?.incompatibilities?.some((inc: string) => inc.includes('Legacy backup format')), 'Legacy Compatibility', 'Incompatibilities report flagged legacy format migration');

  const restoreLegacy = await request('/api/backup/restore', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ vaultId: testVaultId, backupData: legacyV1Backup, mode: 'merge' })
  });
  assert(restoreLegacy.status === 200, 'Legacy Compatibility', 'Legacy backup successfully normalized and restored');
  const vaultWithLegacy = restoreLegacy.body?.vault;
  assert(vaultWithLegacy?.transactions?.some((t: any) => t.id === 'tx_leg_1'), 'Legacy Compatibility', 'Legacy transaction restored');
  assert(vaultWithLegacy?.vehicles?.some((v: any) => v.id === 'veh_leg_1'), 'Legacy Compatibility', 'Legacy vehicle restored');
  assert(vaultWithLegacy?.rentalContracts?.some((c: any) => c.id === 'cntr_leg_1'), 'Legacy Compatibility', 'Legacy rental contract restored');

  // ============================================================================
  // Summary & Evaluation
  // ============================================================================
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n======================================================');
  if (failed === 0) {
    console.log(`🏆 ALL CLOUD SYNC & BACKUP RESTORATION TESTS PASSED: ${passed}/${total}`);
    console.log('======================================================\n');
    process.exit(0);
  } else {
    console.error(`💥 TEST SUITE FAILED: ${failed} failure(s) out of ${total}`);
    console.log('======================================================\n');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
