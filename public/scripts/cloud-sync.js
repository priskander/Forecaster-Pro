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

    setVaultId: function(newId) {
      const cleanId = (newId || DEFAULT_VAULT_ID).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      localStorage.setItem(VAULT_STORAGE_KEY, cleanId);
      this.updateUI();
      this.syncNow(true);
      return cleanId;
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
      const O = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return (v && typeof v === 'object') ? v : null; } catch (e) { return null; } };

      return {
        transactions: Array.isArray(window.transactions) && window.transactions.length > 0 ? window.transactions : A('pro_transactions'),
        accounts: Array.isArray(window.accounts) && window.accounts.length > 0 ? window.accounts : A('pro_accounts'),
        accountTransfers: Array.isArray(window.accountTransfers) ? window.accountTransfers : A('pro_account_transfers'),
        budgetLimits: (window.budgetLimits && typeof window.budgetLimits === 'object') ? window.budgetLimits : O('pro_budget_limits'),
        stockData: Array.isArray(window.stockData) ? window.stockData : A('pro_stock'),
        pharmacyData: Array.isArray(window.pharmacyData) ? window.pharmacyData : A('pro_pharmacy')
      };
    },

    applyRemoteData: function(remoteVault) {
      if (!remoteVault || typeof remoteVault !== 'object') return false;

      let changed = false;

      // 1. Transactions - Deduplicate and Merge
      if (Array.isArray(remoteVault.transactions)) {
        const currentTxns = Array.isArray(window.transactions) ? window.transactions : [];
        const txnMap = new Map();
        currentTxns.forEach(t => { if (t && t.id) txnMap.set(t.id, t); });
        
        let newTxnCount = 0;
        remoteVault.transactions.forEach(t => {
          if (t && t.id && !txnMap.has(t.id)) {
            newTxnCount++;
          }
          if (t && t.id) txnMap.set(t.id, t);
        });

        if (newTxnCount > 0 || currentTxns.length !== txnMap.size) {
          window.transactions = Array.from(txnMap.values());
          localStorage.setItem('pro_transactions', JSON.stringify(window.transactions));
          changed = true;
        }
      }

      // 2. Payment Accounts - Deduplicate and Merge
      if (Array.isArray(remoteVault.accounts)) {
        const currentAccs = Array.isArray(window.accounts) ? window.accounts : [];
        const accMap = new Map();
        currentAccs.forEach(a => { if (a && a.id) accMap.set(a.id, a); });

        let newAccCount = 0;
        remoteVault.accounts.forEach(a => {
          if (a && a.id && !accMap.has(a.id)) {
            newAccCount++;
          }
          if (a && a.id) accMap.set(a.id, a);
        });

        if (newAccCount > 0 || currentAccs.length !== accMap.size) {
          window.accounts = Array.from(accMap.values());
          localStorage.setItem('pro_accounts', JSON.stringify(window.accounts));
          changed = true;
        }
      }

      // 3. Account Transfers - Deduplicate and Merge
      if (Array.isArray(remoteVault.accountTransfers)) {
        const currentTransfers = Array.isArray(window.accountTransfers) ? window.accountTransfers : [];
        const trMap = new Map();
        currentTransfers.forEach(tr => { if (tr && tr.id) trMap.set(tr.id, tr); });

        let newTrCount = 0;
        remoteVault.accountTransfers.forEach(tr => {
          if (tr && tr.id && !trMap.has(tr.id)) {
            newTrCount++;
          }
          if (tr && tr.id) trMap.set(tr.id, tr);
        });

        if (newTrCount > 0 || currentTransfers.length !== trMap.size) {
          window.accountTransfers = Array.from(trMap.values());
          localStorage.setItem('pro_account_transfers', JSON.stringify(window.accountTransfers));
          changed = true;
        }
      }

      if (changed) {
        if (typeof window.populateAccountSelects === 'function') window.populateAccountSelects();
        if (typeof window.renderAllViews === 'function') window.renderAllViews();
      }

      return changed;
    },

    syncNow: async function(showFeedback = false) {
      if (isSyncing) return;
      isSyncing = true;
      this.updateUI(true);

      const vaultId = this.getVaultId();

      try {
        // Step 1: Push local state to server to merge
        const localData = this.getLocalData();
        const res = await fetch(`/api/cloud-sync/vault/${encodeURIComponent(vaultId)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
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
      // Debounce push when local user creates/updates data
      if (!this.isAutoSync()) return;
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this.syncNow(false);
      }, 1000);
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

    init: function() {
      this.updateUI(false);
      // Run initial cloud pull/sync on startup
      setTimeout(() => {
        this.syncNow(false);
      }, 800);
      this.scheduleAutoSync();
    }
  };

  // Wire into lifecycle
  window.addEventListener('DOMContentLoaded', () => {
    window.ForecasterCloudSync.init();
  });
})();
