/**
 * ============================================================================
 * FORECASTER PRO - LIGHTWEIGHT CROSS-DEVICE CLOUD DATABASE & SYNC ENGINE
 * Provides automatic, seamless cross-device synchronization for transactions,
 * payment accounts, and ledger data via the persistent backend Cloud Sync API.
 * ============================================================================
 */
(function() {
  'use strict';

  const VAULT_STORAGE_KEY = 'forecaster_cloud_vault_id';
  const AUTOSYNC_STORAGE_KEY = 'forecaster_cloud_autosync_enabled';
  const LAST_SYNC_KEY = 'forecaster_cloud_last_sync_time';
  const DEFAULT_VAULT_ID = 'shared-main-vault';

  let isSyncing = false;
  let autoSyncTimer = null;

  function getStoredVaultId() {
    try {
      // First check if a user session is active with an assigned vault
      const authUserStr = localStorage.getItem('forecaster_auth_user');
      if (authUserStr) {
        const u = JSON.parse(authUserStr);
        if (u && u.vaultId) {
          return u.vaultId.trim().toLowerCase();
        }
      }
      const v = localStorage.getItem(VAULT_STORAGE_KEY);
      return (v && v.trim()) ? v.trim().toLowerCase() : DEFAULT_VAULT_ID;
    } catch (e) {
      return DEFAULT_VAULT_ID;
    }
  }

  function isAutoSyncEnabled() {
    try {
      const v = localStorage.getItem(AUTOSYNC_STORAGE_KEY);
      return v === null ? true : v === 'true';
    } catch (e) {
      return true;
    }
  }

  function formatTimeAgo(isoString) {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Never';
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 10) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  window.ForecasterCloudSync = {
    getVaultId: function() {
      return getStoredVaultId();
    },

    setVaultId: function(newId, triggerSync = false) {
      const cleanId = (newId || DEFAULT_VAULT_ID).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      localStorage.setItem(VAULT_STORAGE_KEY, cleanId);
      this.updateUI();
      if (triggerSync) {
        this.syncNow(true);
      }
      return cleanId;
    },

    pullVault: async function(targetVaultId, forceReplace = false) {
      const vaultId = (targetVaultId || this.getVaultId()).trim().toLowerCase();
      try {
        const token = (window.ForecasterAuth && typeof window.ForecasterAuth.getToken === 'function')
          ? window.ForecasterAuth.getToken()
          : (localStorage.getItem('forecaster_auth_token') || '');

        const headers = { 'Accept': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/cloud-sync/vault/${encodeURIComponent(vaultId)}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data || !data.ok || !data.vault) return false;

        const remote = data.vault;

        if (forceReplace) {
          // Complete authoritative database synchronization for cross-device sign-in
          window.transactions = Array.isArray(remote.transactions) ? remote.transactions : [];
          localStorage.setItem('pro_transactions', JSON.stringify(window.transactions));

          if (Array.isArray(remote.accounts) && remote.accounts.length > 0) {
            window.accounts = remote.accounts;
            localStorage.setItem('pro_accounts', JSON.stringify(window.accounts));
          } else {
            window.accounts = [
              { id: 'acc_cash_default', type: 'cash', label: '💵 Cash Wallet', initialBalance: 0, createdAt: new Date().toISOString() },
              { id: 'acc_bank_default', type: 'card', label: '💳 Main Bank Account', network: 'Visa', mode: 'Debit', bank: 'Primary Bank', initialBalance: 0, createdAt: new Date().toISOString() }
            ];
            localStorage.setItem('pro_accounts', JSON.stringify(window.accounts));
          }

          window.accountTransfers = Array.isArray(remote.accountTransfers) ? remote.accountTransfers : [];
          localStorage.setItem('pro_account_transfers', JSON.stringify(window.accountTransfers));

          window.budgetLimits = (remote.budgetLimits && typeof remote.budgetLimits === 'object') ? remote.budgetLimits : { income: 0, expense: 0 };
          localStorage.setItem('pro_budget_limits', JSON.stringify(window.budgetLimits));

          if (remote.allocationsMode !== undefined) {
            localStorage.setItem('pro_allocations_mode', remote.allocationsMode);
          }
          if (remote.allocationsMonth !== undefined) {
            localStorage.setItem('pro_allocations_month', remote.allocationsMonth);
          }
          if (Array.isArray(remote.customCategories)) {
            localStorage.setItem('pro_custom_categories', JSON.stringify(remote.customCategories));
          }
          if (Array.isArray(remote.customSubcategories)) {
            localStorage.setItem('pro_custom_subcategories', JSON.stringify(remote.customSubcategories));
          }

          window.stockData = Array.isArray(remote.stockData) ? remote.stockData : [];
          localStorage.setItem('pro_stock', JSON.stringify(window.stockData));

          window.pharmacyData = Array.isArray(remote.pharmacyData) ? remote.pharmacyData : [];
          localStorage.setItem('pro_pharmacy', JSON.stringify(window.pharmacyData));

          localStorage.setItem('pro_vehicles', JSON.stringify(Array.isArray(remote.vehicles) ? remote.vehicles : []));
          localStorage.setItem('pro_vehicle_fuel', JSON.stringify(Array.isArray(remote.fuels) ? remote.fuels : []));
          localStorage.setItem('pro_vehicle_maintenance', JSON.stringify(Array.isArray(remote.maint) ? remote.maint : []));

          // Rentals & Contracts
          if (Array.isArray(remote.rentalProperties)) {
            localStorage.setItem('pro_rental_properties_v1', JSON.stringify(remote.rentalProperties));
          }
          if (Array.isArray(remote.rentalContracts)) {
            localStorage.setItem('pro_rental_contracts_v1', JSON.stringify(remote.rentalContracts));
          }
          if (Array.isArray(remote.rentalNotifications)) {
            localStorage.setItem('pro_rental_notifications_v1', JSON.stringify(remote.rentalNotifications));
          }
          if (remote.rentalNotificationConfig) {
            localStorage.setItem('pro_rental_notification_config_v1', JSON.stringify(remote.rentalNotificationConfig));
          }

          // User Settings
          if (remote.userSettings && remote.userSettings.theme) {
            localStorage.setItem('pro_theme', remote.userSettings.theme);
          }

          localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());

          if (typeof window.loadIntegratedDatabases === 'function') window.loadIntegratedDatabases();
          if (typeof window.loadVehicleDatabase === 'function') window.loadVehicleDatabase();
          if (typeof window.loadRentalDatabase === 'function') window.loadRentalDatabase();
          if (typeof window.rpmLoad === 'function') window.rpmLoad();
          if (typeof window.populateAccountSelects === 'function') window.populateAccountSelects();
          if (typeof window.renderVehicleManagement === 'function') window.renderVehicleManagement();
          if (typeof window.renderAllViews === 'function') window.renderAllViews();
          this.updateUI();
          return true;
        } else {
          return this.applyRemoteData(remote);
        }
      } catch (err) {
        console.warn('[Forecaster CloudSync] pullVault notice:', err);
        return false;
      }
    },

    isAutoSync: function() {
      return isAutoSyncEnabled();
    },

    setAutoSync: function(enabled) {
      localStorage.setItem(AUTOSYNC_STORAGE_KEY, enabled ? 'true' : 'false');
      this.updateUI();
      if (enabled) {
        this.scheduleAutoSync();
      } else if (autoSyncTimer) {
        clearInterval(autoSyncTimer);
        autoSyncTimer = null;
      }
    },

    getLocalData: function() {
      const A = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
      const O = (k, def = null) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return (v && typeof v === 'object') ? v : def; } catch (e) { return def; } };

      return {
        // 1. Financial
        transactions: Array.isArray(window.transactions) ? window.transactions : A('pro_transactions'),
        accounts: Array.isArray(window.accounts) ? window.accounts : A('pro_accounts'),
        accountTransfers: Array.isArray(window.accountTransfers) ? window.accountTransfers : A('pro_account_transfers'),
        // 2. Budgets
        budgetLimits: (window.budgetLimits && typeof window.budgetLimits === 'object') ? window.budgetLimits : O('pro_budget_limits', { income: 0, expense: 0 }),
        allocationsMode: localStorage.getItem('pro_allocations_mode') || 'envelope',
        allocationsMonth: localStorage.getItem('pro_allocations_month') || '',
        customCategories: A('pro_custom_categories'),
        customSubcategories: A('pro_custom_subcategories'),
        // 3 & 4. Inventory & Stock & Spare Parts
        stockData: Array.isArray(window.stockData) ? window.stockData : A('pro_stock'),
        pharmacyData: Array.isArray(window.pharmacyData) ? window.pharmacyData : A('pro_pharmacy'),
        // 5, 6 & 7. Vehicles, Fuel, Maintenance
        vehicles: Array.isArray(window.vehicles) ? window.vehicles : A('pro_vehicles'),
        fuels: Array.isArray(window.fuels) ? window.fuels : A('pro_vehicle_fuel'),
        maint: Array.isArray(window.maint) ? window.maint : A('pro_vehicle_maintenance'),
        // 8. Rental properties and contracts
        rentalProperties: A('pro_rental_properties_v1'),
        rentalContracts: A('pro_rental_contracts_v1'),
        // 9. Notifications and user settings
        rentalNotifications: A('pro_rental_notifications_v1'),
        rentalNotificationConfig: O('pro_rental_notification_config_v1', {}),
        userSettings: {
          theme: localStorage.getItem('pro_theme') || 'system',
          autoSync: this.isAutoSync()
        }
      };
    },

    applyRemoteData: function(remoteVault) {
      if (!remoteVault || typeof remoteVault !== 'object') return false;

      let changed = false;
      const isDiff = (a, b) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);

      // 1. Transactions - Authoritative sync only if remote differs from current local
      if (Array.isArray(remoteVault.transactions)) {
        if (isDiff(window.transactions, remoteVault.transactions)) {
          window.transactions = remoteVault.transactions;
          localStorage.setItem('pro_transactions', JSON.stringify(window.transactions));
          changed = true;
        }
      }

      // 2. Payment Accounts
      if (Array.isArray(remoteVault.accounts)) {
        if (isDiff(window.accounts, remoteVault.accounts)) {
          window.accounts = remoteVault.accounts;
          localStorage.setItem('pro_accounts', JSON.stringify(window.accounts));
          changed = true;
        }
      }

      // 3. Account Transfers
      if (Array.isArray(remoteVault.accountTransfers)) {
        if (isDiff(window.accountTransfers, remoteVault.accountTransfers)) {
          window.accountTransfers = remoteVault.accountTransfers;
          localStorage.setItem('pro_account_transfers', JSON.stringify(window.accountTransfers));
          changed = true;
        }
      }

      // 4. Budgets & Allocations
      if (remoteVault.budgetLimits && isDiff(window.budgetLimits, remoteVault.budgetLimits)) {
        window.budgetLimits = remoteVault.budgetLimits;
        localStorage.setItem('pro_budget_limits', JSON.stringify(window.budgetLimits));
        changed = true;
      }
      if (remoteVault.allocationsMode !== undefined && localStorage.getItem('pro_allocations_mode') !== remoteVault.allocationsMode) {
        localStorage.setItem('pro_allocations_mode', remoteVault.allocationsMode);
        changed = true;
      }
      if (remoteVault.allocationsMonth !== undefined && localStorage.getItem('pro_allocations_month') !== remoteVault.allocationsMonth) {
        localStorage.setItem('pro_allocations_month', remoteVault.allocationsMonth);
        changed = true;
      }
      if (Array.isArray(remoteVault.customCategories)) {
        let curCats = [];
        try { curCats = JSON.parse(localStorage.getItem('pro_custom_categories') || '[]'); } catch(e){}
        if (isDiff(curCats, remoteVault.customCategories)) {
          localStorage.setItem('pro_custom_categories', JSON.stringify(remoteVault.customCategories));
          changed = true;
        }
      }
      if (Array.isArray(remoteVault.customSubcategories)) {
        let curSub = [];
        try { curSub = JSON.parse(localStorage.getItem('pro_custom_subcategories') || '[]'); } catch(e){}
        if (isDiff(curSub, remoteVault.customSubcategories)) {
          localStorage.setItem('pro_custom_subcategories', JSON.stringify(remoteVault.customSubcategories));
          changed = true;
        }
      }

      // 5. Stock & Pharmacy
      if (Array.isArray(remoteVault.stockData) && isDiff(window.stockData, remoteVault.stockData)) {
        window.stockData = remoteVault.stockData;
        localStorage.setItem('pro_stock', JSON.stringify(window.stockData));
        changed = true;
      }
      if (Array.isArray(remoteVault.pharmacyData) && isDiff(window.pharmacyData, remoteVault.pharmacyData)) {
        window.pharmacyData = remoteVault.pharmacyData;
        localStorage.setItem('pro_pharmacy', JSON.stringify(window.pharmacyData));
        changed = true;
      }

      // 6. Vehicles & Fleet
      if (Array.isArray(remoteVault.vehicles)) {
        let curVeh = [];
        try { curVeh = JSON.parse(localStorage.getItem('pro_vehicles') || '[]'); } catch(e){}
        if (isDiff(curVeh, remoteVault.vehicles)) {
          localStorage.setItem('pro_vehicles', JSON.stringify(remoteVault.vehicles));
          changed = true;
        }
      }
      if (Array.isArray(remoteVault.fuels)) {
        let curFuels = [];
        try { curFuels = JSON.parse(localStorage.getItem('pro_vehicle_fuel') || '[]'); } catch(e){}
        if (isDiff(curFuels, remoteVault.fuels)) {
          localStorage.setItem('pro_vehicle_fuel', JSON.stringify(remoteVault.fuels));
          changed = true;
        }
      }
      if (Array.isArray(remoteVault.maint)) {
        let curMaint = [];
        try { curMaint = JSON.parse(localStorage.getItem('pro_vehicle_maintenance') || '[]'); } catch(e){}
        if (isDiff(curMaint, remoteVault.maint)) {
          localStorage.setItem('pro_vehicle_maintenance', JSON.stringify(remoteVault.maint));
          changed = true;
        }
      }

      // 7. Rentals & Contracts
      if (Array.isArray(remoteVault.rentalProperties)) {
        let curProps = [];
        try { curProps = JSON.parse(localStorage.getItem('pro_rental_properties_v1') || '[]'); } catch(e){}
        if (isDiff(curProps, remoteVault.rentalProperties)) {
          localStorage.setItem('pro_rental_properties_v1', JSON.stringify(remoteVault.rentalProperties));
          changed = true;
        }
      }
      if (Array.isArray(remoteVault.rentalContracts)) {
        let curContracts = [];
        try { curContracts = JSON.parse(localStorage.getItem('pro_rental_contracts_v1') || '[]'); } catch(e){}
        if (isDiff(curContracts, remoteVault.rentalContracts)) {
          localStorage.setItem('pro_rental_contracts_v1', JSON.stringify(remoteVault.rentalContracts));
          changed = true;
        }
      }
      if (Array.isArray(remoteVault.rentalNotifications)) {
        let curNotifs = [];
        try { curNotifs = JSON.parse(localStorage.getItem('pro_rental_notifications_v1') || '[]'); } catch(e){}
        if (isDiff(curNotifs, remoteVault.rentalNotifications)) {
          localStorage.setItem('pro_rental_notifications_v1', JSON.stringify(remoteVault.rentalNotifications));
          changed = true;
        }
      }
      if (remoteVault.rentalNotificationConfig) {
        let curConfig = {};
        try { curConfig = JSON.parse(localStorage.getItem('pro_rental_notification_config_v1') || '{}'); } catch(e){}
        if (isDiff(curConfig, remoteVault.rentalNotificationConfig)) {
          localStorage.setItem('pro_rental_notification_config_v1', JSON.stringify(remoteVault.rentalNotificationConfig));
          changed = true;
        }
      }

      if (changed) {
        this._isApplyingRemote = true;
        try {
          if (typeof window.loadIntegratedDatabases === 'function') window.loadIntegratedDatabases();
          if (typeof window.populateAccountSelects === 'function') window.populateAccountSelects();
          if (typeof window.loadVehicleDatabase === 'function') window.loadVehicleDatabase();
          if (typeof window.loadRentalDatabase === 'function') window.loadRentalDatabase();
          if (typeof window.rpmLoad === 'function') window.rpmLoad();
          if (typeof window.renderVehicleManagement === 'function') window.renderVehicleManagement();
          if (typeof window.renderAllViews === 'function') window.renderAllViews();
        } finally {
          this._isApplyingRemote = false;
        }
      }

      return changed;
    },

    exportBackup: async function(moduleFilter = 'all') {
      const vaultId = this.getVaultId();
      const token = (window.ForecasterAuth && typeof window.ForecasterAuth.getToken === 'function')
        ? window.ForecasterAuth.getToken()
        : (localStorage.getItem('forecaster_auth_token') || '');

      const headers = { 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/backup/export?vaultId=${encodeURIComponent(vaultId)}&module=${encodeURIComponent(moduleFilter)}`, { headers });
      if (!res.ok) throw new Error(`Backup export failed with HTTP ${res.status}`);
      const data = await res.json();
      return data.backup;
    },

    validateBackup: async function(backupData) {
      const vaultId = this.getVaultId();
      const token = (window.ForecasterAuth && typeof window.ForecasterAuth.getToken === 'function')
        ? window.ForecasterAuth.getToken()
        : (localStorage.getItem('forecaster_auth_token') || '');

      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/backup/validate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ vaultId, backupData })
      });
      return await res.json();
    },

    restoreBackup: async function(backupData, mode = 'merge', selectedModules = ['all']) {
      const vaultId = this.getVaultId();
      const token = (window.ForecasterAuth && typeof window.ForecasterAuth.getToken === 'function')
        ? window.ForecasterAuth.getToken()
        : (localStorage.getItem('forecaster_auth_token') || '');

      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers,
        body: JSON.stringify({ vaultId, backupData, mode, selectedModules })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      // Re-hydrate local state from updated vault
      if (data.vault) {
        this.applyRemoteData(data.vault);
      }
      return data;
    },

    syncNow: async function(showFeedback = false) {
      if (isSyncing) return;
      isSyncing = true;
      this.updateUI(true);

      const vaultId = this.getVaultId();

      try {
        // Step 1: Push local state to server to merge
        const localData = this.getLocalData();
        const token = (window.ForecasterAuth && typeof window.ForecasterAuth.getToken === 'function')
          ? window.ForecasterAuth.getToken()
          : (localStorage.getItem('forecaster_auth_token') || '');

        const headers = {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/cloud-sync/vault/${encodeURIComponent(vaultId)}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(localData)
        });

        if (!res.ok) {
          throw new Error(`Cloud Sync Server responded with HTTP ${res.status}`);
        }

        const data = await res.json();
        if (data && data.ok && data.vault) {
          this.applyRemoteData(data.vault);
          const syncTime = new Date().toISOString();
          localStorage.setItem(LAST_SYNC_KEY, syncTime);

          if (showFeedback && typeof window.triggerToast === 'function') {
            window.triggerToast(`Cloud sync complete! (${data.transactionCount || 0} txns, ${data.accountCount || 0} accounts)`, 'success');
          }
        }
      } catch (err) {
        console.warn('[Forecaster CloudSync] Background sync notice:', err.message);
        if (showFeedback && typeof window.triggerToast === 'function') {
          window.triggerToast(`Cloud sync offline: ${err.message}`, 'info');
        }
      } finally {
        isSyncing = false;
        this.updateUI(false);
      }
    },

    notifyDataChanged: function() {
      // Prevent loopback cascade when remote data was just applied
      if (this._isApplyingRemote) return;
      if (!this.isAutoSync()) return;
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this.syncNow(false);
      }, 2000);
    },

    updateUI: function(syncing = false) {
      const vaultId = this.getVaultId();
      const lastSync = localStorage.getItem(LAST_SYNC_KEY);
      const isAuto = this.isAutoSync();

      // 1. Header Cloud Status Pill
      const headerBadge = document.getElementById('header-cloud-sync-pill');
      if (headerBadge) {
        if (syncing) {
          headerBadge.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-blue-500 animate-ping mr-1.5"></span><span class="text-blue-600 dark:text-blue-400 font-bold">Syncing...</span>`;
        } else {
          headerBadge.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span><span class="text-slate-700 dark:text-slate-300 font-semibold">Cloud Synced</span> <span class="text-slate-400 text-[10px]">(${formatTimeAgo(lastSync)})</span>`;
        }
      }

      // 2. Database Sync Card UI in Reports & Backups
      const statusBadge = document.getElementById('cloud-sync-status-badge');
      if (statusBadge) {
        if (syncing) {
          statusBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200';
          statusBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span> Syncing with Cloud Database...';
        } else {
          statusBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
          statusBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Cloud Database Connected';
        }
      }

      const lastSyncEl = document.getElementById('cloud-sync-last-time');
      if (lastSyncEl) {
        lastSyncEl.textContent = formatTimeAgo(lastSync);
      }

      const vaultInput = document.getElementById('cloud-sync-vault-input');
      if (vaultInput && document.activeElement !== vaultInput) {
        vaultInput.value = vaultId;
      }

      const txnCountEl = document.getElementById('cloud-sync-txn-count');
      if (txnCountEl) {
        const count = Array.isArray(window.transactions) ? window.transactions.length : 0;
        txnCountEl.textContent = `${count} transactions cross-device`;
      }

      const autoSyncCheck = document.getElementById('cloud-sync-autosync-toggle');
      if (autoSyncCheck) {
        autoSyncCheck.checked = isAuto;
      }
    },

    scheduleAutoSync: function() {
      if (autoSyncTimer) clearInterval(autoSyncTimer);
      if (!this.isAutoSync()) return;

      // Sync every 30 seconds
      autoSyncTimer = setInterval(() => {
        this.syncNow(false);
      }, 30000);
    },

    restoreHistory: async function(showFeedback = true) {
      try {
        const vaultId = this.getVaultId();
        const token = (window.ForecasterAuth && typeof window.ForecasterAuth.getToken === 'function')
          ? window.ForecasterAuth.getToken()
          : (localStorage.getItem('forecaster_auth_token') || '');

        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/cloud-sync/restore-history', {
          method: 'POST',
          headers,
          body: JSON.stringify({ vaultId })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.ok && data.vault) {
          await this.pullVault(vaultId, true);
          if (showFeedback && typeof window.triggerToast === 'function') {
            window.triggerToast('All history, vehicles, routine medication schedules, and audit register restored successfully!', 'success');
          }
          return true;
        }
      } catch (err) {
        console.warn('[Forecaster CloudSync] restoreHistory notice:', err);
        if (showFeedback && typeof window.triggerToast === 'function') {
          window.triggerToast('Unable to restore cloud history. Check connection.', 'error');
        }
        return false;
      }
    },

    init: function() {
      if (typeof window.cleanDemoDataIfNonDemo === 'function') {
        window.cleanDemoDataIfNonDemo();
      }
      this.updateUI(false);
      // Run initial cloud pull/sync on startup
      setTimeout(() => {
        this.syncNow(false);
      }, 800);
      this.scheduleAutoSync();
    }
  };

  window.restoreMasterHistory = function(showFeedback = true) {
    if (window.ForecasterCloudSync && typeof window.ForecasterCloudSync.restoreHistory === 'function') {
      return window.ForecasterCloudSync.restoreHistory(showFeedback);
    }
    return Promise.resolve(false);
  };

  // Wire into lifecycle
  window.addEventListener('DOMContentLoaded', () => {
    window.ForecasterCloudSync.init();
  });
})();
