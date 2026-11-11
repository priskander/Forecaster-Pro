/**
 * Forecaster Pro Cloud Synchronization & Backup Restoration Automated Test Suite (Phase 1.1)
 * Tests all 8 backup & restore categories using 100% isolated synthetic test accounts and vaults.
 * Never touches or modifies real production users or production vaults.
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
  console.log('\n📦 Starting Forecaster Pro Backup & Cloud Restoration Test Suite (Phase 1.1)...\n');

  // --- Setup Isolated Synthetic Workspace Owner Session ---
  const synthOwnerEmail = `synth_backup_${Date.now()}@backup-test.local`;
  const synthUserReg = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Synthetic Backup Owner',
      email: synthOwnerEmail,
      password: 'StrongBackupPass#2026!'
    })
  });

  const testToken = synthUserReg.body?.token;
  const testVaultId = synthUserReg.body?.user?.vaultId;
  if (!testToken || !testVaultId) {
    throw new Error('Could not register synthetic test owner for backup testing: ' + JSON.stringify(synthUserReg.body));
  }
  const testHeaders = { Authorization: `Bearer ${testToken}` };

  // Pre-seed the synthetic workspace vault with sample records across all modules
  const initialSeedData = {
    transactions: [
      { id: 'tx_seed_1', date: '2026-11-01', amount: 1500, type: 'income', category: 'Salary', description: 'Monthly income' },
      { id: 'tx_seed_2', date: '2026-11-02', amount: 85, type: 'expense', category: 'Groceries', description: 'Supermarket' }
    ],
    accounts: [
      { id: 'acc_seed_1', type: 'bank', label: 'Primary Checking', balance: 5000 },
      { id: 'acc_seed_2', type: 'cash', label: 'Cash Wallet', balance: 400 }
    ],
    accountTransfers: [],
    budgetLimits: { Groceries: 500, Utilities: 300 },
    allocationsMode: 'dynamic',
    allocationsMonth: '2026-11',
    customCategories: ['Investments', 'Freelance'],
    stockData: [
      { id: 'stk_seed_1', name: 'Flour', category: 'Pantry', currentStock: 10, unit: 'kg' },
      { id: 'part_seed_1', name: 'Oil Filter', category: 'Spare Parts', itemType: 'vehicle-spare-part', currentStock: 4, unit: 'pcs' }
    ],
    pharmacyData: [
      { id: 'med_seed_1', name: 'Paracetamol 500mg', currentStock: 30, unit: 'sachets', schedule: 'after breakfast' }
    ],
    vehicles: [
      { id: 'veh_seed_1', make: 'Toyota', model: 'Corolla', plate: 'ABC-123', year: 2022 }
    ],
    fuels: [
      { id: 'fuel_seed_1', vehicleId: 'veh_seed_1', liters: 40, cost: 60, date: '2026-11-03' }
    ],
    maint: [
      { id: 'maint_seed_1', vehicleId: 'veh_seed_1', service: 'Oil Change', cost: 80, date: '2026-11-04' }
    ],
    rentalProperties: [
      { id: 'prop_seed_1', title: 'Sunset Apartments #4B', city: 'Metropolis', monthlyRent: 1200 }
    ],
    rentalContracts: [
      { id: 'cntr_seed_1', propertyId: 'prop_seed_1', tenantName: 'Alice Smith', rentAmount: 1200, startDate: '2026-01-01' }
    ],
    rentalNotifications: [],
    userSettings: { theme: 'dark', autoSync: true }
  };

  const seedRes = await request(`/api/cloud-sync/vault/${testVaultId}`, {
    method: 'POST',
    headers: testHeaders,
    body: JSON.stringify(initialSeedData)
  });
  if (seedRes.status !== 200) {
    throw new Error('Failed to pre-seed synthetic test vault: ' + JSON.stringify(seedRes.body));
  }

  // ============================================================================
  // Test Category 1: Full Application Snapshot Export & Versioning
  // ============================================================================
  console.log('--- Test Category 1: Full Application Snapshot Export & Versioning ---');

  const exportAll = await request(`/api/backup/export?vaultId=${testVaultId}&module=all`, {
    method: 'GET',
    headers: testHeaders
  });

  assert(exportAll.status === 200, 'Snapshot Export', 'HTTP 200 returned on export');
  assert(exportAll.body?.ok === true, 'Snapshot Export', 'Response body has ok: true');
  
  const envelope = exportAll.body?.backup;
  assert(envelope?.format === 'forecaster-pro-backup', 'Versioning', 'Envelope format is "forecaster-pro-backup"');
  assert(envelope?.schemaVersion === '2.0.0', 'Versioning', 'Schema version is strictly "2.0.0"');
  assert(typeof envelope?.checksum === 'string' && envelope.checksum.length === 64, 'Integrity', 'Valid SHA-256 digital checksum generated');
  assert(typeof envelope?.organizationId === 'string' && envelope.organizationId === testVaultId, 'Ownership', 'Organization ID matches requested vault');
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
  const exportFin = await request(`/api/backup/export?vaultId=${testVaultId}&module=financial`, {
    method: 'GET',
    headers: testHeaders
  });
  assert(exportFin.status === 200, 'Modular Export', 'Financial export returned HTTP 200');
  const finMods = exportFin.body?.backup?.modules;
  assert(finMods?.financial?.transactions?.length > 0, 'Modular Export', 'Financial export has transactions');
  assert(finMods?.inventory?.stockData?.length === 0, 'Modular Export', 'Financial export isolates inventory (stockData is empty)');
  assert(finMods?.fleet?.vehicles?.length === 0, 'Modular Export', 'Financial export isolates fleet (vehicles is empty)');

  // 2.2 Inventory module only
  const exportInv = await request(`/api/backup/export?vaultId=${testVaultId}&module=inventory`, {
    method: 'GET',
    headers: testHeaders
  });
  const invMods = exportInv.body?.backup?.modules;
  assert(invMods?.inventory?.stockData?.length > 0, 'Modular Export', 'Inventory export includes stock data');
  assert(invMods?.inventory?.pharmacyData?.length > 0, 'Modular Export', 'Inventory export includes pharmacy data');
  assert(invMods?.financial?.transactions?.length === 0, 'Modular Export', 'Inventory export isolates financial records');

  // 2.3 Fleet module only
  const exportFlt = await request(`/api/backup/export?vaultId=${testVaultId}&module=fleet`, {
    method: 'GET',
    headers: testHeaders
  });
  const fltMods = exportFlt.body?.backup?.modules;
  assert(fltMods?.fleet?.vehicles?.length > 0, 'Modular Export', 'Fleet export includes vehicles');
  assert(fltMods?.fleet?.fuels?.length > 0, 'Modular Export', 'Fleet export includes fuels');
  assert(fltMods?.fleet?.maint?.length > 0, 'Modular Export', 'Fleet export includes maintenance');
  assert(fltMods?.inventory?.stockData?.length === 0, 'Modular Export', 'Fleet export isolates inventory');

  // 2.4 Spare Parts filter
  const exportParts = await request(`/api/backup/export?vaultId=${testVaultId}&module=parts`, {
    method: 'GET',
    headers: testHeaders
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
    headers: testHeaders,
    body: JSON.stringify({ vaultId: testVaultId, backupData: envelope })
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
    headers: testHeaders,
    body: JSON.stringify({ vaultId: testVaultId, backupData: badBackup })
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

  // Sample backup for deduplication test
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
          { id: 'acc_dedup_1', type: 'bank', label: 'Dedup Bank' }
        ],
        transfers: []
      },
      inventory: {
        stockData: [
          { id: 'stk_dedup_1', name: 'Dedup Screws', currentStock: 50, unit: 'box' }
        ],
        pharmacyData: [
          { id: 'med_dedup_1', name: 'Dedup Aspirin', currentStock: 20, unit: 'tablets' }
        ]
      },
      fleet: {
        vehicles: [
          { id: 'veh_dedup_1', make: 'Ford', model: 'Focus', plate: 'DED-100' }
        ],
        fuels: [],
        maint: []
      },
      rentals: {
        properties: [
          { id: 'prop_dedup_1', title: 'Dedup Studio Apt' }
        ],
        contracts: [],
        notifications: []
      },
      budgets: { limits: { Supplies: 400 } },
      settings: { theme: 'light' }
    }
  };

  // First restore into synthetic test vault
  const firstRestore = await request('/api/backup/restore', {
    method: 'POST',
    headers: testHeaders,
    body: JSON.stringify({ vaultId: testVaultId, backupData: sampleBackup, mode: 'replace' })
  });
  assert(firstRestore.status === 200, 'Deduplication', 'First restore succeeded (HTTP 200)');
  const vault1 = firstRestore.body?.vault;
  assert(vault1?.transactions?.length === 2, 'Deduplication', 'Initial transaction count is 2');
  assert(vault1?.vehicles?.length === 1, 'Deduplication', 'Initial vehicle count is 1');
  assert(vault1?.stockData?.length === 1, 'Deduplication', 'Initial stock count is 1');
  assert(vault1?.pharmacyData?.length === 1, 'Deduplication', 'Initial pharmacy count is 1');
  assert(vault1?.rentalProperties?.length === 1, 'Deduplication', 'Initial rental property count is 1');

  // Second restore of the EXACT SAME backup (should deduplicate completely)
  const secondRestore = await request('/api/backup/restore', {
    method: 'POST',
    headers: testHeaders,
    body: JSON.stringify({ vaultId: testVaultId, backupData: sampleBackup, mode: 'merge' })
  });
  assert(secondRestore.status === 200, 'Deduplication', 'Second restore succeeded (HTTP 200)');
  const vault2 = secondRestore.body?.vault;
  assert(vault2?.transactions?.length === 2, 'Deduplication', 'Transaction count remains EXACTLY 2 (zero duplicates)');
  assert(vault2?.vehicles?.length === 1, 'Deduplication', 'Vehicle count remains EXACTLY 1 (zero duplicates)');
  assert(vault2?.stockData?.length === 1, 'Deduplication', 'Stock count remains EXACTLY 1 (zero duplicates)');
  assert(vault2?.rentalProperties?.length === 1, 'Deduplication', 'Rental property count remains EXACTLY 1 (zero duplicates)');

  // Third repeated restore to confirm stability
  const thirdRestore = await request('/api/backup/restore', {
    method: 'POST',
    headers: testHeaders,
    body: JSON.stringify({ vaultId: testVaultId, backupData: sampleBackup, mode: 'merge' })
  });
  const vaultAfter3 = thirdRestore.body?.vault;
  assert(vaultAfter3?.transactions?.length === 2, 'Deduplication', 'Third restore: Transaction count still 2 (zero duplicate drift)');

  // ============================================================================
  // Test Category 5: "Never Silently Overwrite" & Non-Destructive Merge vs Explicit Replace
  // ============================================================================
  console.log('\n--- Test Category 5: "Never Silently Overwrite" & Non-Destructive Merge vs Replace ---');

  // Pre-seed an existing private record that is NOT in the incoming backup
  await request(`/api/cloud-sync/transactions?vaultId=${testVaultId}`, {
    method: 'POST',
    headers: testHeaders,
    body: JSON.stringify({
      transactions: [{ id: 'tx_pre_existing_local', date: '2026-11-05', amount: 777, type: 'income', description: 'Local Unrelated Record' }]
    })
  });

  // Verify it exists in vault
  const vaultBeforeMerge = await request(`/api/cloud-sync/vault/${testVaultId}`, { headers: testHeaders });
  assert(vaultBeforeMerge.body?.vault?.transactions?.some((t: any) => t.id === 'tx_pre_existing_local'), 'Safety', 'Local pre-existing record verified in vault');

  // Now restore incoming backup that does NOT have tx_pre_existing_local
  const nonDestructiveRestore = await request('/api/backup/restore', {
    method: 'POST',
    headers: testHeaders,
    body: JSON.stringify({ vaultId: testVaultId, backupData: sampleBackup, mode: 'merge' })
  });

  const vaultAfterMerge = nonDestructiveRestore.body?.vault;
  const localRecordStillExists = vaultAfterMerge?.transactions?.some((t: any) => t.id === 'tx_pre_existing_local');
  assert(localRecordStillExists, 'Never Silently Overwrite', 'Pre-existing local record was PRESERVED in merge mode (never silently overwritten)');
  assert(vaultAfterMerge?.transactions?.length === 3, 'Never Silently Overwrite', 'Total transactions: 1 pre-existing + 2 from backup = 3');

  // Verify explicit replace mode replaces the module completely
  const explicitReplaceRestore = await request('/api/backup/restore', {
    method: 'POST',
    headers: testHeaders,
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
  assert(vaultAfterReplace?.vehicles?.length === 1, 'Explicit Replace', 'Fleet vehicles preserved during financial-only replace');

  // ============================================================================
  // Test Category 6: Multi-Tenant & Organization Ownership Isolation
  // ============================================================================
  console.log('\n--- Test Category 6: Multi-Tenant & Organization Ownership Isolation ---');

  // Register Tenant 2
  const owner2Email = `tenant2_${Date.now()}@backup-test.local`;
  const reg2 = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Tenant Two', email: owner2Email, password: 'Password123#Tenant2' })
  });
  const token2 = reg2.body?.token;
  const vaultId2 = reg2.body?.user?.vaultId;

  // Tenant 2 attempts to restore into Tenant 1's vault
  const unauthorizedRestore = await request('/api/backup/restore', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token2}` },
    body: JSON.stringify({
      vaultId: testVaultId,
      backupData: sampleBackup,
      mode: 'merge'
    })
  });
  assert(unauthorizedRestore.status === 403, 'Tenant Isolation', 'Cross-tenant backup restore strictly FORBIDDEN with HTTP 403');

  // Tenant 2 attempts to export Tenant 1's backup
  const unauthorizedExport = await request(`/api/backup/export?vaultId=${testVaultId}`, {
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
  const checkTenant1Vault = await request(`/api/cloud-sync/vault/${testVaultId}`, {
    headers: testHeaders
  });
  assert(checkTenant1Vault.body?.vault?.transactions?.length === 2, 'Tenant Isolation', 'Tenant 1 vault remains completely untouched');

  // ============================================================================
  // Test Category 7: Cross-Device Restoration Simulation
  // ============================================================================
  console.log('\n--- Test Category 7: Cross-Device Restoration Simulation ---');

  // Device 1 pushes complete 9-domain dataset to Tenant 1 vault
  const device1Data = {
    transactions: [{ id: 'tx_dev1_salary', amount: 5000, type: 'income', category: 'Salary', date: '2026-11-01' }],
    accounts: [{ id: 'acc_dev1_bank', type: 'card', label: 'Primary Bank' }],
    accountTransfers: [{ id: 'tr_dev1_1', fromAccountId: 'acc_dev1_bank', toAccountId: 'acc_dev1_cash', amount: 200 }],
    budgetLimits: { Rent: 1500, Groceries: 600 },
    allocationsMode: 'target_pct',
    allocationsMonth: '2026-11',
    customCategories: ['Tech', 'Subscriptions'],
    stockData: [{ id: 'stk_dev1_item', name: 'Wireless Router', currentStock: 5 }],
    pharmacyData: [{ id: 'med_dev1_item', name: 'Vitamin C 1000mg', currentStock: 60, unit: 'sachets', schedule: 'after breakfast' }],
    vehicles: [{ id: 'veh_dev1_car', make: 'Honda', model: 'Civic', plate: 'CIV-2026' }],
    fuels: [{ id: 'fuel_dev1_1', vehicleId: 'veh_dev1_car', liters: 45, cost: 80, date: '2026-11-02' }],
    maint: [{ id: 'maint_dev1_1', vehicleId: 'veh_dev1_car', service: 'Brake inspection', cost: 120 }],
    rentalProperties: [{ id: 'prop_dev1_condo', title: 'Skyline Condo 12A', city: 'Metropolis' }],
    rentalContracts: [{ id: 'cntr_dev1_1', propertyId: 'prop_dev1_condo', tenantName: 'David Lee', rentAmount: 1800 }],
    rentalNotifications: [{ id: 'notif_dev1_1', type: 'contract_expiry', message: 'Lease expiring soon', date: '2026-11-01' }],
    userSettings: { theme: 'dark', currency: 'EUR', autoSync: true }
  };

  const pushDev1 = await request(`/api/cloud-sync/vault/${testVaultId}`, {
    method: 'POST',
    headers: testHeaders,
    body: JSON.stringify(device1Data)
  });
  assert(pushDev1.status === 200, 'Cross-Device Simulation', 'Device 1 pushed all 9 modules to cloud vault');

  // Device 2 logs in from fresh browser, pulls the vault
  const pullDev2 = await request(`/api/cloud-sync/vault/${testVaultId}`, {
    method: 'GET',
    headers: testHeaders
  });
  assert(pullDev2.status === 200, 'Cross-Device Simulation', 'Device 2 pulls vault from cloud');
  const d2Vault = pullDev2.body?.vault;

  // Verify all 9 domains are hydrated for Device 2
  assert(d2Vault?.transactions?.some((t: any) => t.id === 'tx_dev1_salary'), 'Cross-Device Simulation', '1. Financial transactions hydrated on Device 2');
  assert(d2Vault?.accounts?.some((a: any) => a.id === 'acc_dev1_bank'), 'Cross-Device Simulation', '1. Payment accounts hydrated on Device 2');
  assert(d2Vault?.accountTransfers?.some((tr: any) => tr.id === 'tr_dev1_1'), 'Cross-Device Simulation', '1. Transfers hydrated on Device 2');
  assert(d2Vault?.budgetLimits?.Rent === 1500, 'Cross-Device Simulation', '2. Budgets hydrated on Device 2');
  assert(d2Vault?.customCategories?.includes('Tech'), 'Cross-Device Simulation', '2. Custom categories hydrated on Device 2');
  assert(d2Vault?.stockData?.some((s: any) => s.id === 'stk_dev1_item'), 'Cross-Device Simulation', '3. Stock inventory hydrated on Device 2');
  assert(d2Vault?.pharmacyData?.some((p: any) => p.id === 'med_dev1_item'), 'Cross-Device Simulation', '3. Pharmacy stock hydrated on Device 2');
  assert(d2Vault?.vehicles?.some((v: any) => v.id === 'veh_dev1_car'), 'Cross-Device Simulation', '5. Vehicles fleet hydrated on Device 2');
  assert(d2Vault?.fuels?.some((f: any) => f.id === 'fuel_dev1_1'), 'Cross-Device Simulation', '6. Fuel logs hydrated on Device 2');
  assert(d2Vault?.maint?.some((m: any) => m.id === 'maint_dev1_1'), 'Cross-Device Simulation', '7. Maintenance history hydrated on Device 2');
  assert(d2Vault?.rentalProperties?.some((p: any) => p.id === 'prop_dev1_condo'), 'Cross-Device Simulation', '8. Rental properties hydrated on Device 2');
  assert(d2Vault?.rentalContracts?.some((c: any) => c.id === 'cntr_dev1_1'), 'Cross-Device Simulation', '8. Rental contracts hydrated on Device 2');
  assert(d2Vault?.rentalNotifications?.some((n: any) => n.id === 'notif_dev1_1'), 'Cross-Device Simulation', '9. Rental notifications hydrated on Device 2');
  assert(d2Vault?.userSettings?.currency === 'EUR', 'Cross-Device Simulation', '9. User settings hydrated on Device 2');

  // ============================================================================
  // Test Category 8: Backward Compatibility with Legacy v1 Backups
  // ============================================================================
  console.log('\n--- Test Category 8: Backward Compatibility with Legacy v1 Backups ---');

  const legacyV1Backup = {
    pro_transactions: [
      { id: 'tx_leg_1', amount: 320, type: 'expense', category: 'Hardware', date: '2026-09-15', description: 'Legacy router' }
    ],
    pro_accounts: [
      { id: 'acc_leg_1', type: 'bank', label: 'Legacy Bank' }
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
    headers: testHeaders,
    body: JSON.stringify({ vaultId: testVaultId, backupData: legacyV1Backup })
  });
  assert(validateLegacy.status === 200, 'Legacy Compatibility', 'Legacy backup validation returned HTTP 200');
  assert(validateLegacy.body?.valid === true, 'Legacy Compatibility', 'Legacy backup recognized as valid');
  assert(validateLegacy.body?.incompatibilities?.some((inc: string) => inc.includes('Legacy backup format')), 'Legacy Compatibility', 'Incompatibilities report flagged legacy format migration');

  const restoreLegacy = await request('/api/backup/restore', {
    method: 'POST',
    headers: testHeaders,
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
