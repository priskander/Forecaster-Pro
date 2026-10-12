/**
 * FORECASTER PRO - GITHUB SYNC & CLOUD REPOSITORY HOOK POINT
 * Provides automated or manual bi-directional sync to private GitHub Gists or Repositories.
 * Uses native GitHub REST API (v3) with fine-grained personal access tokens.
 */
(function() {
  'use strict';

  const GITHUB_CONFIG_KEY = 'forecaster_github_sync_config';

  function getStoredConfig() {
    try {
      return JSON.parse(localStorage.getItem(GITHUB_CONFIG_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveStoredConfig(cfg) {
    localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(cfg));
  }

  window.ForecasterGitHubSync = {
    getConfig: function() {
      return Object.assign({
        token: '',
        mode: 'gist', // 'gist' or 'repo'
        gistId: '',
        repo: '',     // 'username/repo-name'
        branch: 'main',
        lastSync: null,
        autoSync: false
      }, getStoredConfig());
    },

    saveConfig: function(cfg) {
      const current = this.getConfig();
      const updated = Object.assign({}, current, cfg);
      saveStoredConfig(updated);
      this.updateUI();
      return updated;
    },

    openModal: function() {
      const modal = document.getElementById('github-sync-modal');
      if (!modal) return;
      const cfg = this.getConfig();
      const tokenInput = document.getElementById('gh-sync-token');
      const modeSelect = document.getElementById('gh-sync-mode');
      const gistInput = document.getElementById('gh-sync-gist-id');
      const repoInput = document.getElementById('gh-sync-repo');
      const branchInput = document.getElementById('gh-sync-branch');
      const autoSyncCheck = document.getElementById('gh-sync-autosync');

      if (tokenInput) tokenInput.value = cfg.token || '';
      if (modeSelect) {
        modeSelect.value = cfg.mode || 'gist';
        this.toggleModeFields(cfg.mode || 'gist');
      }
      if (gistInput) gistInput.value = cfg.gistId || '';
      if (repoInput) repoInput.value = cfg.repo || '';
      if (branchInput) branchInput.value = cfg.branch || 'main';
      if (autoSyncCheck) autoSyncCheck.checked = !!cfg.autoSync;

      this.updateUI();
      modal.classList.remove('hidden');
    },

    closeModal: function() {
      const modal = document.getElementById('github-sync-modal');
      if (modal) modal.classList.add('hidden');
    },

    toggleModeFields: function(mode) {
      const gistWrap = document.getElementById('gh-sync-gist-wrap');
      const repoWrap = document.getElementById('gh-sync-repo-wrap');
      if (gistWrap) gistWrap.classList.toggle('hidden', mode !== 'gist');
      if (repoWrap) repoWrap.classList.toggle('hidden', mode !== 'repo');
    },

    updateUI: function() {
      const cfg = this.getConfig();
      const statusEl = document.getElementById('gh-sync-status-badge');
      const lastSyncEl = document.getElementById('gh-sync-last-time');

      const isConnected = !!cfg.token && ((cfg.mode === 'gist') || (cfg.mode === 'repo' && cfg.repo));

      if (statusEl) {
        statusEl.className = isConnected
          ? 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200';
        statusEl.innerHTML = isConnected
          ? '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Cloud Sync Connected'
          : '<span class="w-2 h-2 rounded-full bg-slate-400"></span> Disconnected';
      }

      if (lastSyncEl) {
        lastSyncEl.textContent = cfg.lastSync ? new Date(cfg.lastSync).toLocaleString() : 'Never';
      }
    },

    getPayload: function() {
      // Collect complete datastore state
      const A = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
      const O = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return (v && typeof v === 'object') ? v : null; } catch (e) { return null; } };

      return {
        transactions: Array.isArray(window.transactions) ? window.transactions : A('pro_transactions'),
        stockData: Array.isArray(window.stockData) ? window.stockData : A('pro_stock'),
        pharmacyData: Array.isArray(window.pharmacyData) ? window.pharmacyData : A('pro_pharmacy'),
        budgetLimits: typeof window.budgetLimits !== 'undefined' ? window.budgetLimits : O('pro_budget_limits'),
        accounts: Array.isArray(window.accounts) ? window.accounts : A('pro_accounts'),
        accountTransfers: Array.isArray(window.accountTransfers) ? window.accountTransfers : A('pro_account_transfers'),
        pro_vehicles: A('pro_vehicles'),
        pro_vehicle_fuel: A('pro_vehicle_fuel'),
        pro_vehicle_maintenance: A('pro_vehicle_maintenance'),
        pro_rental_contracts_v1: A('pro_rental_contracts_v1'),
        pro_rental_properties_v1: A('pro_rental_properties_v1'),
        forecaster_profile_user: O('forecaster_profile_user'),
        version: 'ForecasterPro-v1.06.12-github-sync',
        exportedAt: new Date().toISOString()
      };
    },

    pushToGitHub: async function() {
      const cfg = this.getConfig();
      if (!cfg.token) {
        if (typeof window.triggerToast === 'function') window.triggerToast('Please provide a GitHub Personal Access Token.', 'error');
        return;
      }

      const syncBtn = document.getElementById('gh-push-btn');
      if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<span>⏳</span> Pushing to Cloud...';
      }

      try {
        const payload = this.getPayload();
        const contentStr = JSON.stringify(payload, null, 2);

        if (cfg.mode === 'gist') {
          // Push to GitHub Gist
          let url = 'https://api.github.com/gists';
          let method = 'POST';

          const body = {
            description: 'Forecaster Pro Unified Cloud Backup',
            public: false,
            files: {
              'forecaster-data.json': { content: contentStr }
            }
          };

          if (cfg.gistId) {
            url = `https://api.github.com/gists/${cfg.gistId}`;
            method = 'PATCH';
          }

          const res = await fetch(url, {
            method: method,
            headers: {
              'Authorization': `token ${cfg.token}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${res.status}`);
          }

          const gist = await res.json();
          this.saveConfig({ gistId: gist.id, lastSync: new Date().toISOString() });
          if (typeof window.triggerToast === 'function') {
            window.triggerToast('Successfully synced datastore to private GitHub Gist!', 'success');
          }
        } else {
          // Push to Repository
          if (!cfg.repo) throw new Error('Repository (username/repo) is required');

          const path = 'forecaster-data.json';
          const getUrl = `https://api.github.com/repos/${cfg.repo}/contents/${path}?ref=${cfg.branch || 'main'}`;

          let sha = null;
          const getRes = await fetch(getUrl, {
            headers: {
              'Authorization': `token ${cfg.token}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });
          if (getRes.ok) {
            const fileInfo = await getRes.json();
            sha = fileInfo.sha;
          }

          const putUrl = `https://api.github.com/repos/${cfg.repo}/contents/${path}`;
          const putBody = {
            message: `Update Forecaster Pro Data: ${new Date().toISOString()}`,
            content: btoa(unescape(encodeURIComponent(contentStr))),
            branch: cfg.branch || 'main'
          };
          if (sha) putBody.sha = sha;

          const putRes = await fetch(putUrl, {
            method: 'PUT',
            headers: {
              'Authorization': `token ${cfg.token}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(putBody)
          });

          if (!putRes.ok) {
            const err = await putRes.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${putRes.status}`);
          }

          this.saveConfig({ lastSync: new Date().toISOString() });
          if (typeof window.triggerToast === 'function') {
            window.triggerToast(`Synced to GitHub repo (${cfg.repo})!`, 'success');
          }
        }
      } catch (err) {
        console.error('[GitHub Sync Error]', err);
        if (typeof window.triggerToast === 'function') {
          window.triggerToast(`GitHub Sync Failed: ${err.message}`, 'error');
        }
      } finally {
        if (syncBtn) {
          syncBtn.disabled = false;
          syncBtn.innerHTML = '<span>☁️</span> Push to GitHub';
        }
        this.updateUI();
      }
    },

    pullFromGitHub: async function() {
      const cfg = this.getConfig();
      if (!cfg.token) {
        if (typeof window.triggerToast === 'function') window.triggerToast('Please provide a GitHub Personal Access Token.', 'error');
        return;
      }

      const pullBtn = document.getElementById('gh-pull-btn');
      if (pullBtn) {
        pullBtn.disabled = true;
        pullBtn.innerHTML = '<span>⏳</span> Pulling from Cloud...';
      }

      try {
        let contentStr = '';
        if (cfg.mode === 'gist') {
          if (!cfg.gistId) throw new Error('No Gist ID configured yet. Push first or enter an existing Gist ID.');
          const url = `https://api.github.com/gists/${cfg.gistId}`;
          const res = await fetch(url, {
            headers: {
              'Authorization': `token ${cfg.token}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const gist = await res.json();
          const file = gist.files['forecaster-data.json'] || Object.values(gist.files)[0];
          if (!file) throw new Error('No data file found in Gist');
          contentStr = file.content;
        } else {
          if (!cfg.repo) throw new Error('Repository is required');
          const path = 'forecaster-data.json';
          const url = `https://api.github.com/repos/${cfg.repo}/contents/${path}?ref=${cfg.branch || 'main'}`;
          const res = await fetch(url, {
            headers: {
              'Authorization': `token ${cfg.token}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const fileInfo = await res.json();
          contentStr = decodeURIComponent(escape(atob(fileInfo.content)));
        }

        const parsed = JSON.parse(contentStr);
        // Apply restored datasets
        if (Array.isArray(parsed.transactions)) localStorage.setItem('pro_transactions', JSON.stringify(parsed.transactions));
        if (Array.isArray(parsed.stockData)) localStorage.setItem('pro_stock', JSON.stringify(parsed.stockData));
        if (Array.isArray(parsed.pharmacyData)) localStorage.setItem('pro_pharmacy', JSON.stringify(parsed.pharmacyData));
        if (parsed.budgetLimits) localStorage.setItem('pro_budget_limits', JSON.stringify(parsed.budgetLimits));
        if (Array.isArray(parsed.accounts)) localStorage.setItem('pro_accounts', JSON.stringify(parsed.accounts));
        if (Array.isArray(parsed.accountTransfers)) localStorage.setItem('pro_account_transfers', JSON.stringify(parsed.accountTransfers));
        if (Array.isArray(parsed.pro_vehicles)) localStorage.setItem('pro_vehicles', JSON.stringify(parsed.pro_vehicles));
        if (Array.isArray(parsed.pro_vehicle_fuel)) localStorage.setItem('pro_vehicle_fuel', JSON.stringify(parsed.pro_vehicle_fuel));
        if (Array.isArray(parsed.pro_vehicle_maintenance)) localStorage.setItem('pro_vehicle_maintenance', JSON.stringify(parsed.pro_vehicle_maintenance));
        if (Array.isArray(parsed.pro_rental_contracts_v1)) localStorage.setItem('pro_rental_contracts_v1', JSON.stringify(parsed.pro_rental_contracts_v1));
        if (Array.isArray(parsed.pro_rental_properties_v1)) localStorage.setItem('pro_rental_properties_v1', JSON.stringify(parsed.pro_rental_properties_v1));

        this.saveConfig({ lastSync: new Date().toISOString() });
        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Database restored from GitHub! Reloading workspace...', 'success');
        }
        setTimeout(() => window.location.reload(), 450);
      } catch (err) {
        console.error('[GitHub Pull Error]', err);
        if (typeof window.triggerToast === 'function') {
          window.triggerToast(`Pull Failed: ${err.message}`, 'error');
        }
      } finally {
        if (pullBtn) {
          pullBtn.disabled = false;
          pullBtn.innerHTML = '<span>⬇️</span> Pull & Restore';
        }
        this.updateUI();
      }
    }
  };

  // Bind modal form submit & triggers
  window.addEventListener('DOMContentLoaded', function() {
    window.ForecasterGitHubSync.updateUI();

    const form = document.getElementById('github-sync-form');
    if (form) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        const mode = document.getElementById('gh-sync-mode')?.value || 'gist';
        const token = (document.getElementById('gh-sync-token')?.value || '').trim();
        const gistId = (document.getElementById('gh-sync-gist-id')?.value || '').trim();
        const repo = (document.getElementById('gh-sync-repo')?.value || '').trim();
        const branch = (document.getElementById('gh-sync-branch')?.value || '').trim() || 'main';
        const autoSync = !!document.getElementById('gh-sync-autosync')?.checked;

        window.ForecasterGitHubSync.saveConfig({ mode, token, gistId, repo, branch, autoSync });
        if (typeof window.triggerToast === 'function') {
          window.triggerToast('GitHub Cloud Sync settings saved.', 'success');
        }
      });
    }
  });
})();
