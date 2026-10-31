/**
 * ============================================================================
 * FORECASTER PRO - AUTHENTICATION, MULTI-ROLE & SUB-USER CONTROLLER
 * Handles secure user Sign Up, Login, Session Management, Role-Based Access
 * Control (Owner/Primary, Manager, Member, Viewer), Sub-User Provisioning,
 * Automated Email Dispatching, and Mandatory First-Login Password Changes.
 * ============================================================================
 */
(function() {
  'use strict';

  const AUTH_USER_KEY = 'forecaster_auth_user';
  const AUTH_TOKEN_KEY = 'forecaster_auth_token';

  function getStoredUser() {
    try {
      const u = localStorage.getItem(AUTH_USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  }

  function getStoredToken() {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  const ROLE_CONFIG = {
    main_admin: {
      label: 'Main Admin',
      badgeClass: 'bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800 shadow-xs font-black',
      icon: '🛡️',
      tagline: 'Master App Owner & System Administrator (Peter W. Badir)',
      description: 'Full authority across Website, Desktop & Mobile deployments, live version bumps, feature flags, user directories, and multi-tenant databases.',
      permissions: [
        { label: 'Master App Control Panel & Updates', allowed: true },
        { label: 'Website, Desktop & Mobile Releases', allowed: true },
        { label: 'Global Platform Feature Flags', allowed: true },
        { label: 'Create & Manage Sub-Users & Roles', allowed: true },
        { label: 'All Users & Database Vaults Access', allowed: true },
        { label: 'Maintenance Mode & Global Broadcasts', allowed: true },
        { label: 'System Audit Logs & Security Telemetry', allowed: true }
      ]
    },
    owner: {
      label: 'Primary Owner',
      badgeClass: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      icon: '👑',
      tagline: 'Full administrative ownership & workspace control',
      description: 'Can create sub-users, manage roles, configure payment accounts, sync cloud ledger, and manage databases.',
      permissions: [
        { label: 'Create & Manage Sub-Users', allowed: true },
        { label: 'Cloud Vault Database Sync', allowed: true },
        { label: 'Transactions (Expense, Income, Transfer)', allowed: true },
        { label: 'Payment Accounts Manager', allowed: true },
        { label: 'Inventory & Stock Management', allowed: true },
        { label: 'Vehicle Fleet Management', allowed: true },
        { label: 'Database Purge & Sandbox Reset', allowed: true }
      ]
    },
    manager: {
      label: 'Manager',
      badgeClass: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      icon: '👔',
      tagline: 'Operational & financial management access',
      description: 'Can record & edit transactions, stock, inventory, vehicles, rentals, and trigger cloud sync. Cannot manage sub-users or wipe database.',
      permissions: [
        { label: 'Create & Manage Sub-Users', allowed: false, note: 'Primary Owner only' },
        { label: 'Cloud Vault Database Sync', allowed: true },
        { label: 'Transactions (Expense, Income, Transfer)', allowed: true },
        { label: 'Payment Accounts Usage', allowed: true },
        { label: 'Inventory & Stock Management', allowed: true },
        { label: 'Vehicle Fleet Management', allowed: true },
        { label: 'Database Purge & Sandbox Reset', allowed: false, note: 'Restricted' }
      ]
    },
    member: {
      label: 'Member',
      badgeClass: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      icon: '👤',
      tagline: 'Standard day-to-day operational data entry',
      description: 'Can record daily income, expenses, transfers, vehicle fuel & maintenance, and inventory updates.',
      permissions: [
        { label: 'Create & Manage Sub-Users', allowed: false, note: 'Primary Owner only' },
        { label: 'Cloud Vault Database Sync', allowed: false, note: 'Managed automatically' },
        { label: 'Transactions (Expense, Income, Transfer)', allowed: true },
        { label: 'Payment Accounts Usage', allowed: true },
        { label: 'Inventory & Stock Management', allowed: true },
        { label: 'Vehicle Fleet Management', allowed: true },
        { label: 'Database Purge & Sandbox Reset', allowed: false, note: 'Restricted' }
      ]
    },
    viewer: {
      label: 'Viewer (Read-Only)',
      badgeClass: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
      icon: '👁️',
      tagline: 'Read-only financial and reporting oversight',
      description: 'Read-only access. Can inspect analytics, dashboards, accounts, reports, and transaction logs without modifying ledger data.',
      permissions: [
        { label: 'Create & Manage Sub-Users', allowed: false, note: 'Restricted' },
        { label: 'Cloud Vault Database Sync', allowed: false, note: 'Restricted' },
        { label: 'Transactions (Expense, Income, Transfer)', allowed: false, note: 'Read-only' },
        { label: 'Payment Accounts Modification', allowed: false, note: 'Read-only' },
        { label: 'Inventory & Stock Editing', allowed: false, note: 'Read-only' },
        { label: 'Vehicle Fleet Editing', allowed: false, note: 'Read-only' },
        { label: 'Database Purge & Sandbox Reset', allowed: false, note: 'Restricted' }
      ]
    }
  };

  window.ForecasterAuth = {
    currentSubUserRole: 'member',
    activeSubUsersTab: 'create',

    getUser: function() {
      return getStoredUser();
    },

    getToken: function() {
      return getStoredToken();
    },

    isLoggedIn: function() {
      return !!(this.getUser() && this.getToken());
    },

    isMainAdmin: function() {
      const user = this.getUser();
      if (!user) return false;
      return !!(user.isMainAdmin || user.role === 'main_admin' || (user.email && user.email.toLowerCase() === 'peter.w.badir@gmail.com'));
    },

    isPrimaryUser: function() {
      const user = this.getUser();
      if (!user) return false;
      return user.isPrimary === true || user.role === 'owner' || this.isMainAdmin();
    },

    getRole: function() {
      const user = this.getUser();
      if (!user) return null;
      return user.role || (user.isPrimary ? 'owner' : 'member');
    },

    canEdit: function() {
      const role = this.getRole();
      return role !== 'viewer';
    },

    canManageSubUsers: function() {
      return this.isPrimaryUser();
    },

    openAuthModal: function(tab = 'login') {
      const modal = document.getElementById('auth-modal');
      if (!modal) return;
      this.toggleAuthTab(tab);
      this.clearAuthErrors();
      modal.classList.remove('hidden');
    },

    closeAuthModal: function() {
      const modal = document.getElementById('auth-modal');
      if (modal) modal.classList.add('hidden');
      this.clearAuthErrors();
    },

    clearAuthErrors: function() {
      const errEl = document.getElementById('auth-error-banner');
      if (errEl) {
        errEl.classList.add('hidden');
        errEl.textContent = '';
      }
    },

    showAuthError: function(msg) {
      const errEl = document.getElementById('auth-error-banner');
      if (errEl) {
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
      } else if (typeof window.triggerToast === 'function') {
        window.triggerToast(msg, 'error');
      }
    },

    toggleAuthTab: function(tab) {
      const loginTabBtn = document.getElementById('auth-tab-login');
      const registerTabBtn = document.getElementById('auth-tab-register');
      const forgotTabBtn = document.getElementById('auth-tab-forgot');
      const loginForm = document.getElementById('auth-form-login');
      const registerForm = document.getElementById('auth-form-register');
      const forgotForm = document.getElementById('auth-form-forgot');
      const titleEl = document.getElementById('auth-modal-title');
      const subtitleEl = document.getElementById('auth-modal-subtitle');

      this.clearAuthErrors();

      const activeTabStyle = 'flex-1 py-2.5 text-xs font-bold border-b-2 border-blue-600 text-blue-600 dark:text-blue-400';
      const inactiveTabStyle = 'flex-1 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300';

      if (tab === 'register') {
        if (loginTabBtn) loginTabBtn.className = inactiveTabStyle;
        if (registerTabBtn) registerTabBtn.className = activeTabStyle;
        if (forgotTabBtn) forgotTabBtn.className = inactiveTabStyle;
        if (loginForm) loginForm.classList.add('hidden');
        if (registerForm) registerForm.classList.remove('hidden');
        if (forgotForm) forgotForm.classList.add('hidden');
        if (titleEl) titleEl.textContent = 'Create Primary Account';
        if (subtitleEl) subtitleEl.textContent = 'Set up your primary ledger workspace and invite sub-users';
      } else if (tab === 'forgot') {
        if (loginTabBtn) loginTabBtn.className = inactiveTabStyle;
        if (registerTabBtn) registerTabBtn.className = inactiveTabStyle;
        if (forgotTabBtn) forgotTabBtn.className = activeTabStyle;
        if (loginForm) loginForm.classList.add('hidden');
        if (registerForm) registerForm.classList.add('hidden');
        if (forgotForm) forgotForm.classList.remove('hidden');
        if (titleEl) titleEl.textContent = 'Reset Password & Account Access';
        if (subtitleEl) subtitleEl.textContent = 'Generate an instant temporary access code to recover your account';
        const forgotEmail = document.getElementById('forgot-email');
        const loginEmail = document.getElementById('login-email');
        if (forgotEmail && loginEmail && loginEmail.value) {
          forgotEmail.value = loginEmail.value;
        } else if (forgotEmail && !forgotEmail.value) {
          forgotEmail.value = 'peter.w.badir@gmail.com';
        }
      } else {
        if (loginTabBtn) loginTabBtn.className = activeTabStyle;
        if (registerTabBtn) registerTabBtn.className = inactiveTabStyle;
        if (forgotTabBtn) forgotTabBtn.className = inactiveTabStyle;
        if (loginForm) loginForm.classList.remove('hidden');
        if (registerForm) registerForm.classList.add('hidden');
        if (forgotForm) forgotForm.classList.add('hidden');
        if (titleEl) titleEl.textContent = 'Sign in to Forecaster Pro';
        if (subtitleEl) subtitleEl.textContent = 'Access your persistent financial workspace from any device';
      }
    },

    requestPasswordReset: async function(email) {
      try {
        this.clearAuthErrors();
        const cleanEmail = (email || '').trim().toLowerCase();
        if (!cleanEmail) {
          throw new Error('Please enter your registered account email.');
        }

        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Password reset request failed.');
        }

        this._lastTempPass = data.temporaryPassword;
        this._lastResetEmail = data.email;

        const card = document.getElementById('forgot-result-card');
        const display = document.getElementById('forgot-temp-pass-display');
        if (display) display.textContent = data.temporaryPassword;
        if (card) card.classList.remove('hidden');

        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Temporary password generated! Click Auto-Fill to sign in.', 'success');
        }
      } catch (err) {
        this.showAuthError(err.message);
      }
    },

    autoFillAndLoginWithTemp: function() {
      const email = this._lastResetEmail || document.getElementById('forgot-email')?.value || 'peter.w.badir@gmail.com';
      const tempPass = this._lastTempPass || document.getElementById('forgot-temp-pass-display')?.textContent || '';
      if (!tempPass) return;

      this.toggleAuthTab('login');
      const emailInput = document.getElementById('login-email');
      const passInput = document.getElementById('login-password');
      if (emailInput) emailInput.value = email;
      if (passInput) passInput.value = tempPass;

      this.login(email, tempPass);
    },

    togglePasswordVisibility: function(inputId, btnEl) {
      const input = document.getElementById(inputId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        if (btnEl) btnEl.textContent = '🙈';
      } else {
        input.type = 'password';
        if (btnEl) btnEl.textContent = '👁️';
      }
    },

    login: async function(email, password) {
      try {
        this.clearAuthErrors();
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Login failed. Please check your credentials.');
        }

        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);

        try {
          const prof = JSON.parse(localStorage.getItem('forecaster_profile_user') || '{}');
          prof.name = data.user.name;
          prof.email = data.user.email;
          prof.propertyRole = data.user.propertyRole || 'tenant';
          localStorage.setItem('forecaster_profile_user', JSON.stringify(prof));
        } catch (e) {}

        if (typeof window.applyPropertyRoleToBudgetBlueprints === 'function') {
          window.applyPropertyRoleToBudgetBlueprints();
        }
        if (typeof window.refreshRentCategoryForPropertyRole === 'function') {
          window.refreshRentCategoryForPropertyRole();
        }

        // Update active database vault to this user's vault and pull their data
        if (window.ForecasterCloudSync && data.user && data.user.vaultId) {
          window.ForecasterCloudSync.setVaultId(data.user.vaultId, false);
          await window.ForecasterCloudSync.pullVault(data.user.vaultId, true);
        }

        this.closeAuthModal();
        this.updateUI();

        // Check if mandatory first-time password change is required
        if (data.mustChangePassword) {
          this.openChangePasswordModal(password);
          if (typeof window.triggerToast === 'function') {
            window.triggerToast('First-time login detected. Please change your temporary password.', 'warning');
          }
        } else {
          if (typeof window.triggerToast === 'function') {
            window.triggerToast(`Welcome back, ${data.user.name}! (${data.user.role || 'Member'})`, 'success');
          }
        }
      } catch (err) {
        this.showAuthError(err.message);
      }
    },

    register: async function(name, email, password, confirmPassword, propertyRole = 'tenant') {
      try {
        this.clearAuthErrors();

        if (password !== confirmPassword) {
          throw new Error('Passwords do not match. Please re-enter.');
        }

        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, propertyRole })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Registration failed.');
        }

        localStorage.removeItem('forecaster_explicit_logout');
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);

        try {
          const prof = JSON.parse(localStorage.getItem('forecaster_profile_user') || '{}');
          prof.name = data.user.name;
          prof.email = data.user.email;
          prof.propertyRole = data.user.propertyRole || propertyRole;
          localStorage.setItem('forecaster_profile_user', JSON.stringify(prof));
        } catch (e) {}

        if (typeof window.applyPropertyRoleToBudgetBlueprints === 'function') {
          window.applyPropertyRoleToBudgetBlueprints();
        }
        if (typeof window.refreshRentCategoryForPropertyRole === 'function') {
          window.refreshRentCategoryForPropertyRole();
        }

        // Crucial: Clear in-memory and local storage of any prior user's historical transactions or accounts
        // "Don't relate a new create account to the same historical database let him create his own unless if the primary user added this newly created primary as a sub user"
        window.transactions = [];
        window.accounts = [];
        window.accountTransfers = [];
        window.budgetLimits = {};
        window.stockData = [];
        window.pharmacyData = [];
        localStorage.setItem('pro_transactions', JSON.stringify([]));
        localStorage.setItem('pro_accounts', JSON.stringify([]));
        localStorage.setItem('pro_account_transfers', JSON.stringify([]));
        localStorage.setItem('pro_budget_limits', JSON.stringify({}));
        localStorage.setItem('pro_stock', JSON.stringify([]));
        localStorage.setItem('pro_pharmacy', JSON.stringify([]));

        // Connect to the user's dedicated database vault (or parent's database if added as a sub-user)
        if (window.ForecasterCloudSync && data.user && data.user.vaultId) {
          window.ForecasterCloudSync.setVaultId(data.user.vaultId, false);
          // Force replace to ensure 0 historical transactions from other accounts are present
          await window.ForecasterCloudSync.pullVault(data.user.vaultId, true);
        }

        // If newly created primary user has no accounts loaded yet, create clean initial cash and bank accounts
        if (!Array.isArray(window.accounts) || window.accounts.length === 0) {
          window.accounts = [
            { id: 'acc_cash_' + data.user.id, type: 'cash', label: '💵 Cash Wallet', initialBalance: 0, createdAt: new Date().toISOString() },
            { id: 'acc_bank_' + data.user.id, type: 'card', label: '💳 Main Bank Account', network: 'Visa', mode: 'Debit', bank: 'Primary Bank', initialBalance: 0, createdAt: new Date().toISOString() }
          ];
          localStorage.setItem('pro_accounts', JSON.stringify(window.accounts));
        }

        if (typeof window.populateAccountSelects === 'function') window.populateAccountSelects();
        if (typeof window.renderAllViews === 'function') window.renderAllViews();

        this.closeAuthModal();
        this.updateUI();

        if (typeof window.triggerToast === 'function') {
          window.triggerToast(data.message || (data.user.isPrimary ? `Account created! Your own private workspace is ready.` : `Team account activated!`), 'success');
        }
      } catch (err) {
        this.showAuthError(err.message);
      }
    },

    quickDemoLogin: async function() {
      localStorage.removeItem('forecaster_explicit_logout');
      const emailInput = document.getElementById('login-email');
      const passInput = document.getElementById('login-password');
      if (emailInput && passInput) {
        emailInput.value = 'peter.w.badir@gmail.com';
        passInput.value = 'Password123!';
      }
      await this.login('peter.w.badir@gmail.com', 'Password123!');
    },

    logout: async function() {
      try {
        const token = this.getToken();
        if (token) {
          fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => {});
        }
      } catch (e) {}

      localStorage.setItem('forecaster_explicit_logout', 'true');
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem('forecaster_cloud_vault_id');

      // Clear memory and local cache so the next visitor/account doesn't see logged-out data
      window.transactions = [];
      window.accounts = [];
      window.accountTransfers = [];
      window.budgetLimits = {};
      window.stockData = [];
      window.pharmacyData = [];
      localStorage.setItem('pro_transactions', JSON.stringify([]));
      localStorage.setItem('pro_accounts', JSON.stringify([]));
      localStorage.setItem('pro_account_transfers', JSON.stringify([]));
      localStorage.setItem('pro_budget_limits', JSON.stringify({}));
      localStorage.setItem('pro_stock', JSON.stringify([]));
      localStorage.setItem('pro_pharmacy', JSON.stringify([]));

      if (typeof window.populateAccountSelects === 'function') window.populateAccountSelects();
      if (typeof window.renderAllViews === 'function') window.renderAllViews();

      this.closeProfileDropdown();
      this.closeChangePasswordModal();
      this.closeSubUsersModal();
      this.updateUI();

      if (typeof window.triggerToast === 'function') {
        window.triggerToast('You have been signed out.', 'info');
      }
    },

    toggleProfileDropdown: function(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      const menu = document.getElementById('profile-dropdown-menu');
      if (!menu) return;
      const isHidden = menu.classList.contains('hidden');

      // Close notifications if opening profile dropdown
      if (isHidden) {
        const notif = document.getElementById('notification-dropdown');
        if (notif) notif.classList.add('hidden');
      }

      menu.classList.toggle('hidden', !isHidden);
    },

    closeProfileDropdown: function() {
      const menu = document.getElementById('profile-dropdown-menu');
      if (menu) menu.classList.add('hidden');
    },

    /* -------------------------------------------------------------------------
     * USER PROFILE & PROPERTY ROLE CONTROLLER (Tenant / Landlord / Both)
     * ------------------------------------------------------------------------- */
    selectRegisterPropertyRole: function(role) {
      const roles = ['tenant', 'landlord', 'both'];
      roles.forEach(r => {
        const lbl = document.getElementById(`reg-role-${r}-lbl`);
        const radio = document.querySelector(`input[name="register-property-role"][value="${r}"]`);
        if (lbl) {
          if (r === role) {
            lbl.className = 'cursor-pointer border-2 border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 shadow-xs ring-2 ring-blue-500/20 rounded-xl p-2.5 text-center flex flex-col items-center gap-1 transition';
            if (radio) radio.checked = true;
          } else {
            lbl.className = 'cursor-pointer border-2 border-slate-200 dark:border-slate-700 hover:border-blue-500 rounded-xl p-2.5 text-center flex flex-col items-center gap-1 transition';
          }
        }
      });
    },

    selectEditPropertyRole: function(role) {
      const roles = ['tenant', 'landlord', 'both'];
      roles.forEach(r => {
        const lbl = document.getElementById(`edit-role-${r}-lbl`);
        const radio = document.querySelector(`input[name="edit-property-role"][value="${r}"]`);
        if (lbl) {
          if (r === role) {
            lbl.className = 'cursor-pointer border-2 border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 shadow-xs ring-2 ring-blue-500/20 rounded-xl p-2.5 text-center flex flex-col items-center gap-1 transition';
            if (radio) radio.checked = true;
          } else {
            lbl.className = 'cursor-pointer border-2 border-slate-200 dark:border-slate-700 hover:border-blue-500 rounded-xl p-2.5 text-center flex flex-col items-center gap-1 transition';
          }
        }
      });
    },

    openEditProfileModal: function() {
      this.closeProfileDropdown();
      const modal = document.getElementById('edit-profile-modal');
      if (!modal) return;

      const user = this.getUser() || {};
      const nameInput = document.getElementById('edit-profile-name');
      const emailInput = document.getElementById('edit-profile-email');
      const errEl = document.getElementById('edit-profile-error-banner');

      if (errEl) {
        errEl.textContent = '';
        errEl.classList.add('hidden');
      }

      if (nameInput) nameInput.value = user.name || 'Peter W. Badir';
      if (emailInput) emailInput.value = user.email || 'peter.w.badir@gmail.com';

      const currentRole = user.propertyRole || (typeof window.getPropertyRole === 'function' ? window.getPropertyRole() : 'tenant');
      this.selectEditPropertyRole(currentRole);

      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      document.body.classList.add('overflow-hidden');
    },

    closeEditProfileModal: function() {
      const modal = document.getElementById('edit-profile-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
      }
      document.body.classList.remove('overflow-hidden');
    },

    handleEditProfileSubmit: async function(e) {
      e.preventDefault();
      const nameInput = document.getElementById('edit-profile-name');
      const errEl = document.getElementById('edit-profile-error-banner');
      const name = nameInput?.value?.trim() || '';
      const propertyRole = document.querySelector('input[name="edit-property-role"]:checked')?.value || 'tenant';

      if (errEl) errEl.classList.add('hidden');

      if (!name) {
        if (errEl) {
          errEl.textContent = 'Please enter your full name.';
          errEl.classList.remove('hidden');
        }
        return;
      }

      try {
        const token = this.getToken();
        const res = await fetch('/api/auth/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ name, propertyRole })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to update user account profile.');
        }

        // Update local session storage
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
        try {
          const prof = JSON.parse(localStorage.getItem('forecaster_profile_user') || '{}');
          prof.name = data.user.name;
          prof.propertyRole = data.user.propertyRole;
          localStorage.setItem('forecaster_profile_user', JSON.stringify(prof));
        } catch (err) {}

        // Reapply rent category logic dynamically across budgets, blueprints, and forms
        if (typeof window.applyPropertyRoleToBudgetBlueprints === 'function') {
          window.applyPropertyRoleToBudgetBlueprints();
        }
        if (typeof window.refreshRentCategoryForPropertyRole === 'function') {
          window.refreshRentCategoryForPropertyRole();
        }

        this.closeEditProfileModal();
        this.updateUI();

        if (typeof window.triggerToast === 'function') {
          window.triggerToast(`Account updated! Property role set to ${propertyRole.toUpperCase()}.`, 'success');
        }
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message;
          errEl.classList.remove('hidden');
        } else if (typeof window.triggerToast === 'function') {
          window.triggerToast(err.message, 'error');
        }
      }
    },

    /* -------------------------------------------------------------------------
     * MANDATORY FIRST-LOGIN PASSWORD CHANGE CONTROLLER
     * ------------------------------------------------------------------------- */
    /* -------------------------------------------------------------------------
     * MANDATORY FIRST-LOGIN PASSWORD CHANGE CONTROLLER
     * ------------------------------------------------------------------------- */
    openChangePasswordModal: function(currentPassword = '') {
      this.ensureModalsInjected();
      const modal = document.getElementById('first-login-change-password-modal');
      if (!modal) return;

      const currentInput = document.getElementById('change-pass-current');
      if (currentInput) {
        if (currentPassword) {
          currentInput.value = currentPassword;
        } else if (!currentInput.value) {
          const user = this.getUser();
          if (user && user.temporaryPassword) {
            currentInput.value = user.temporaryPassword;
          } else if (user && user.email && user.email.toLowerCase() === 'peter.w.badir@gmail.com') {
            currentInput.value = 'Password123!';
          }
        }
      }

      const errEl = document.getElementById('change-pass-error-banner');
      if (errEl) {
        errEl.classList.add('hidden');
        errEl.textContent = '';
      }

      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      document.body.classList.add('overflow-hidden');
    },

    closeChangePasswordModal: function() {
      const modal = document.getElementById('first-login-change-password-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
      }
      document.body.classList.remove('overflow-hidden');
    },

    handleChangePasswordSubmit: async function(e) {
      e.preventDefault();
      const currentPassword = document.getElementById('change-pass-current')?.value || '';
      const newPassword = document.getElementById('change-pass-new')?.value || '';
      const confirmPassword = document.getElementById('change-pass-confirm')?.value || '';
      const errEl = document.getElementById('change-pass-error-banner');

      if (errEl) errEl.classList.add('hidden');

      if (!newPassword || newPassword.length < 6) {
        if (errEl) {
          errEl.textContent = 'New password must be at least 6 characters long.';
          errEl.classList.remove('hidden');
        }
        return;
      }

      if (newPassword !== confirmPassword) {
        if (errEl) {
          errEl.textContent = 'Passwords do not match. Please re-enter.';
          errEl.classList.remove('hidden');
        }
        return;
      }

      try {
        const token = this.getToken();
        const user = this.getUser();
        const email = user?.email || 'peter.w.badir@gmail.com';
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ currentPassword, newPassword, email })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to update password.');
        }

        // Update local session & fresh token
        if (data.token) {
          localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        }
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
        this.closeChangePasswordModal();
        this.updateUI();

        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Password permanently updated! Welcome to Forecaster Pro.', 'success');
        }
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message;
          errEl.classList.remove('hidden');
        }
      }
    },

    /* -------------------------------------------------------------------------
     * SUB-USERS & TEAM MANAGEMENT (Primary User Only)
     * ------------------------------------------------------------------------- */
    openSubUsersModal: function(initialTab = 'create') {
      if (!this.isPrimaryUser()) {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Only the primary account owner can manage sub-users.', 'error');
        }
        return;
      }

      this.closeProfileDropdown();
      if (typeof window.toggleMobileDrawer === 'function') {
        window.toggleMobileDrawer(false);
      }

      this.ensureModalsInjected();
      const modal = document.getElementById('sub-users-modal');
      if (!modal) return;

      // Clear previous error banners & previews
      const errBanner = document.getElementById('sub-user-error-banner');
      if (errBanner) {
        errBanner.textContent = '';
        errBanner.classList.add('hidden');
      }

      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      document.body.classList.add('overflow-hidden');
      
      this.switchSubUsersTab(initialTab);
      this.selectSubUserRole(this.currentSubUserRole || 'member');
      this.loadSubUsers();
    },

    closeSubUsersModal: function() {
      const modal = document.getElementById('sub-users-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
      }
      document.body.classList.remove('overflow-hidden');
    },

    switchSubUsersTab: function(tab) {
      this.activeSubUsersTab = tab;

      const tabs = ['create', 'list', 'emails'];
      tabs.forEach(t => {
        const pane = document.getElementById(`sub-users-tab-pane-${t}`);
        const btn = document.getElementById(`sub-users-tab-btn-${t}`);
        if (pane) pane.classList.toggle('hidden', t !== tab);
        if (btn) {
          if (t === tab) {
            btn.className = 'px-2 sm:px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white shadow-xs flex items-center justify-center gap-1 sm:gap-1.5 transition cursor-pointer text-center';
          } else {
            btn.className = 'px-2 sm:px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 flex items-center justify-center gap-1 sm:gap-1.5 transition cursor-pointer text-center';
          }
        }
      });

      if (tab === 'list') {
        this.loadSubUsers();
      } else if (tab === 'emails') {
        this.loadDispatchedEmails();
      }
    },

    selectSubUserRole: function(role) {
      this.currentSubUserRole = role;
      const validRoles = ['manager', 'member', 'viewer'];
      
      validRoles.forEach(r => {
        const card = document.getElementById(`role-card-${r}`);
        const radio = document.getElementById(`role-radio-${r}`);
        const checkIcon = document.getElementById(`role-check-${r}`);
        const isSelected = r === role;

        if (radio) radio.checked = isSelected;
        if (card) {
          if (isSelected) {
            card.className = 'relative flex flex-col p-3 rounded-2xl border-2 border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 shadow-xs transition-all cursor-pointer ring-2 ring-blue-500/20';
          } else {
            card.className = 'relative flex flex-col p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all cursor-pointer';
          }
        }
        if (checkIcon) {
          checkIcon.classList.toggle('hidden', !isSelected);
        }
      });

      // Render Dynamic Role Privilege Matrix Card
      this.renderRolePrivilegeMatrix(role);
    },

    renderRolePrivilegeMatrix: function(role) {
      const matrixEl = document.getElementById('role-privileges-matrix');
      if (!matrixEl) return;

      const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.member;
      let rowsHTML = '';

      cfg.permissions.forEach(p => {
        const statusHTML = p.allowed
          ? '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400"><span>✅</span> Full Access</span>'
          : `<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400"><span>🔒</span> ${p.note || 'Restricted'}</span>`;

        rowsHTML += `
          <div class="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-700/60 last:border-b-0 text-xs">
            <span class="text-slate-700 dark:text-slate-300 font-medium">${p.label}</span>
            ${statusHTML}
          </div>
        `;
      });

      matrixEl.innerHTML = `
        <div class="p-3.5 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-2">
          <div class="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-700">
            <div class="flex items-center gap-2">
              <span class="text-base">${cfg.icon}</span>
              <div>
                <h5 class="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">${cfg.label} Privileges</h5>
                <p class="text-[10px] text-slate-500 dark:text-slate-400">${cfg.tagline}</p>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${cfg.badgeClass}">Active Selection</span>
          </div>
          <div class="space-y-0.5">
            ${rowsHTML}
          </div>
        </div>
      `;
    },

    loadSubUsers: async function() {
      const listEl = document.getElementById('sub-users-list');
      const countBadge = document.getElementById('sub-users-count-badge');
      if (!listEl) return;

      listEl.innerHTML = '<div class="text-center py-8 text-xs text-slate-400">Loading workspace sub-users...</div>';

      try {
        const token = this.getToken();
        const res = await fetch('/api/auth/sub-users', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to load sub-users');
        }

        const subUsers = data.subUsers || [];
        if (countBadge) countBadge.textContent = String(subUsers.length);

        if (subUsers.length === 0) {
          listEl.innerHTML = `
            <div class="text-center py-10 px-4 border border-dashed border-slate-200 dark:border-slate-700 rounded-3xl bg-slate-50/50 dark:bg-slate-900/20">
              <span class="text-3xl block mb-2">👥</span>
              <p class="text-sm font-extrabold text-slate-800 dark:text-slate-200">No sub-users created yet</p>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                Invite managers, members, or viewers with automated credentials.
              </p>
              <button type="button" class="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer inline-flex items-center gap-1.5" onclick="window.ForecasterAuth.switchSubUsersTab('create')">
                <span>➕</span> Create First Sub-User
              </button>
            </div>
          `;
          return;
        }

        let html = '<div class="space-y-2.5">';
        subUsers.forEach(u => {
          const roleCfg = ROLE_CONFIG[u.role] || ROLE_CONFIG.member;
          const statusBadge = u.mustChangePassword
            ? '<span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800" title="Temporary password sent via email; password change required on first login">⚠️ Needs First Login</span>'
            : '<span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">✅ Active</span>';

          html += `
            <div class="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-blue-300 dark:hover:border-slate-600 transition shadow-xs">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
                  ${getInitials(u.name)}
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-extrabold text-slate-900 dark:text-white truncate">${u.name}</span>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${roleCfg.badgeClass}">
                      ${roleCfg.icon} ${roleCfg.label}
                    </span>
                    ${statusBadge}
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-404 truncate mt-0.5">${u.email}</p>
                  ${u.temporaryPassword ? `<div class="mt-1 flex items-center gap-1.5 text-[10px]"><span class="text-slate-400">Temp Pass:</span> <code class="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-mono font-bold border border-blue-200 dark:border-blue-900">${u.temporaryPassword}</code></div>` : ''}
                </div>
              </div>
              <div class="flex items-center gap-2 self-end sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 w-full sm:w-auto justify-end">
                <button type="button" class="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs" onclick="window.ForecasterAuth.resendSubUserEmail('${u.id}', '${u.name}')" title="Generate new temp password & send email">
                  <span>✉️</span> Resend Email
                </button>
                <button type="button" class="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-600 hover:text-white text-rose-600 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs border border-rose-200/60 dark:border-rose-900" onclick="window.ForecasterAuth.deleteSubUser('${u.id}', '${u.name}')" title="Revoke sub-user access">
                  <span>🗑️</span> Remove
                </button>
              </div>
            </div>
          `;
        });
        html += '</div>';
        listEl.innerHTML = html;
      } catch (err) {
        listEl.innerHTML = `<div class="p-3 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-xl font-semibold">${err.message}</div>`;
      }
    },

    loadDispatchedEmails: async function() {
      const emailsListEl = document.getElementById('dispatched-emails-list');
      if (!emailsListEl) return;

      emailsListEl.innerHTML = '<div class="text-center py-8 text-xs text-slate-400">Loading sent automated emails...</div>';

      try {
        const token = this.getToken();
        const res = await fetch('/api/emails/outbox', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to load email outbox');
        }

        const outbox = data.outbox || [];
        if (outbox.length === 0) {
          emailsListEl.innerHTML = `
            <div class="text-center py-10 px-4 border border-dashed border-slate-200 dark:border-slate-700 rounded-3xl bg-slate-50/50 dark:bg-slate-900/20">
              <span class="text-3xl block mb-2">📬</span>
              <p class="text-sm font-extrabold text-slate-800 dark:text-slate-200">No emails dispatched yet</p>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Automatic invitations will appear here as soon as you create sub-users.</p>
            </div>
          `;
          return;
        }

        let html = '<div class="space-y-3">';
        outbox.forEach((mail, idx) => {
          const sentDate = new Date(mail.sentAt).toLocaleString();
          html += `
            <div class="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2.5">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div class="flex items-center gap-2">
                  <span class="text-base">✉️</span>
                  <div>
                    <h6 class="text-xs font-bold text-slate-900 dark:text-white truncate max-w-xs sm:max-w-md">${mail.subject}</h6>
                    <p class="text-[10px] text-slate-500 dark:text-slate-404">To: <strong>${mail.toName}</strong> &lt;${mail.to}&gt; • ${sentDate}</p>
                  </div>
                </div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Delivered ✅
                </span>
              </div>
              <div class="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto custom-scrollbar">
${mail.body}
              </div>
            </div>
          `;
        });
        html += '</div>';
        emailsListEl.innerHTML = html;
      } catch (err) {
        emailsListEl.innerHTML = `<div class="p-3 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-xl font-semibold">${err.message}</div>`;
      }
    },

    handleCreateSubUserSubmit: async function(e) {
      e.preventDefault();
      const nameInput = document.getElementById('sub-user-name');
      const emailInput = document.getElementById('sub-user-email');
      const errBanner = document.getElementById('sub-user-error-banner');
      const previewCard = document.getElementById('sub-user-email-preview-card');
      const submitBtn = document.getElementById('sub-user-submit-btn');

      if (errBanner) errBanner.classList.add('hidden');
      if (previewCard) previewCard.classList.add('hidden');

      const name = nameInput?.value?.trim() || '';
      const email = emailInput?.value?.trim() || '';
      const role = this.currentSubUserRole || 'member';

      if (!name || !email) {
        if (errBanner) {
          errBanner.textContent = 'Please provide both full name and email address.';
          errBanner.classList.remove('hidden');
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>⏳</span> Dispatching Invitation...';
      }

      try {
        const token = this.getToken();
        const res = await fetch('/api/auth/sub-users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ name, email, role })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to create sub-user.');
        }

        // Clear input form
        if (nameInput) nameInput.value = '';
        if (emailInput) emailInput.value = '';

        // Show automated email notification dispatch preview card
        if (previewCard && data.email) {
          previewCard.innerHTML = `
            <div class="p-4 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-2xl space-y-2 animate-in fade-in duration-200">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                  <span>✉️</span> Automated Email Dispatched Successfully!
                </span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100">Delivered</span>
              </div>
              <p class="text-xs text-slate-700 dark:text-slate-300">
                An invitation email has been sent to <strong>${data.subUser.email}</strong> with their role credentials and security instructions to change their password on first login.
              </p>
              <div class="p-3 bg-white dark:bg-slate-900 rounded-xl text-xs font-mono border border-emerald-100 dark:border-emerald-900 space-y-1">
                <div><strong>Recipient:</strong> ${data.subUser.email}</div>
                <div><strong>Assigned Role:</strong> <span class="uppercase font-bold text-blue-600">${data.subUser.role}</span></div>
                <div><strong>Temporary Password:</strong> <code class="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 font-bold border border-blue-200 dark:border-blue-900">${data.temporaryPassword}</code></div>
                <div class="text-[10px] text-amber-600 dark:text-amber-400 mt-1">⚠️ Sub-user will be required to change this temporary password immediately upon signing in.</div>
              </div>
            </div>
          `;
          previewCard.classList.remove('hidden');
        }

        if (typeof window.triggerToast === 'function') {
          window.triggerToast(`Sub-user ${data.subUser.name} created! Automated email dispatched.`, 'success');
        }

        this.loadSubUsers();
      } catch (err) {
        if (errBanner) {
          errBanner.textContent = err.message;
          errBanner.classList.remove('hidden');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>✨</span> Create Sub-User &amp; Send Automated Email';
        }
      }
    },

    deleteSubUser: async function(id, name) {
      if (!confirm(`Are you sure you want to revoke access for ${name}? They will no longer be able to log in.`)) {
        return;
      }

      try {
        const token = this.getToken();
        const res = await fetch(`/api/auth/sub-users/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to remove sub-user.');
        }

        if (typeof window.triggerToast === 'function') {
          window.triggerToast(`Sub-user ${name} removed.`, 'info');
        }

        this.loadSubUsers();
      } catch (err) {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast(err.message, 'error');
        }
      }
    },

    resendSubUserEmail: async function(id, name) {
      try {
        const token = this.getToken();
        const res = await fetch(`/api/auth/sub-users/${encodeURIComponent(id)}/resend-email`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to resend credentials.');
        }

        if (typeof window.triggerToast === 'function') {
          window.triggerToast(`New temporary password generated and welcome email sent to ${name}!`, 'success');
        }

        this.loadSubUsers();
      } catch (err) {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast(err.message, 'error');
        }
      }
    },

    /* -------------------------------------------------------------------------
     * MASTER MAIN ADMIN SUITE & CONTROL PANEL (PETER W. BADIR)
     * Centralized cross-platform releases, live system updates, feature flags,
     * user account governance, database vault resets, telemetry, and audit logs.
     * ------------------------------------------------------------------------- */
    openMainAdminPanel: function(tab = 'overview') {
      if (!this.isMainAdmin()) {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Access restricted: Master Main Admin privileges required.', 'error');
        }
        return;
      }

      this.closeProfileDropdown();
      if (typeof window.toggleMobileDrawer === 'function') {
        window.toggleMobileDrawer(false);
      }

      const modal = document.getElementById('main-admin-panel-modal');
      if (!modal) return;

      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      document.body.classList.add('overflow-hidden');

      this.switchAdminTab(tab);
      this.loadAdminDashboard();
    },

    closeMainAdminPanel: function() {
      const modal = document.getElementById('main-admin-panel-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
      }
      document.body.classList.remove('overflow-hidden');
    },

    switchAdminTab: function(tab) {
      this.activeAdminTab = tab;
      const tabs = ['overview', 'releases', 'features', 'users', 'audit'];

      tabs.forEach(t => {
        const pane = document.getElementById(`admin-tab-pane-${t}`);
        const btn = document.getElementById(`admin-tab-btn-${t}`);
        if (pane) pane.classList.toggle('hidden', t !== tab);
        if (btn) {
          if (t === tab) {
            btn.className = 'px-2.5 sm:px-3 py-2 text-xs font-bold rounded-xl bg-purple-600 text-white shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer text-center';
          } else {
            btn.className = 'px-2.5 sm:px-3 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 flex items-center justify-center gap-1.5 transition cursor-pointer text-center';
          }
        }
      });

      if (tab === 'overview' || tab === 'users' || tab === 'audit') {
        if (!this._adminDashboardLoaded) {
          this.loadAdminDashboard();
        }
      }
    },

    loadAdminDashboard: async function() {
      try {
        const token = this.getToken();
        if (!token) return;

        const res = await fetch('/api/admin/dashboard', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          if (res.status === 403) {
            throw new Error('Access forbidden: Master Main Admin privileges required.');
          }
          throw new Error('Failed to load admin telemetry dashboard.');
        }

        const data = await res.json();
        if (!data || !data.ok) throw new Error(data?.error || 'Failed to load admin data');

        this._adminDashboardLoaded = true;
        this._adminData = data;
        this._adminUsers = data.users || [];
        this._adminAuditLogs = data.auditLogs || [];

        // 1. Populate Overview KPIs
        const kpiUsers = document.getElementById('admin-kpi-users');
        const kpiVaults = document.getElementById('admin-kpi-vaults');
        const kpiTxns = document.getElementById('admin-kpi-txns');
        const kpiUptime = document.getElementById('admin-kpi-uptime');
        const kpiDbSize = document.getElementById('admin-kpi-dbsize');
        const kpiTokens = document.getElementById('admin-kpi-tokens');
        const kpiOutbox = document.getElementById('admin-kpi-outbox');
        const kpiMemory = document.getElementById('admin-kpi-memory');

        if (kpiUsers) kpiUsers.textContent = (data.telemetry?.totalUsers || 0).toLocaleString();
        if (kpiVaults) kpiVaults.textContent = (data.telemetry?.totalVaults || 0).toLocaleString();
        if (kpiTxns) kpiTxns.textContent = (data.telemetry?.totalTransactions || 0).toLocaleString();
        
        if (kpiUptime) {
          const upSec = data.telemetry?.uptimeSeconds || 0;
          const h = Math.floor(upSec / 3600);
          const m = Math.floor((upSec % 3600) / 60);
          kpiUptime.textContent = `${h}h ${m}m`;
        }

        if (kpiDbSize) {
          const bytes = data.telemetry?.dbSizeBytes || 0;
          kpiDbSize.textContent = bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : `${Math.round(bytes / 1024)} KB`;
        }

        if (kpiTokens) kpiTokens.textContent = (data.telemetry?.activeTokensCount || 0).toString();
        if (kpiOutbox) kpiOutbox.textContent = (data.telemetry?.outboxCount || 0).toString();
        if (kpiMemory) kpiMemory.textContent = `${data.telemetry?.memoryRssMb || 0} MB`;

        // 2. Platform Status Cards
        const platforms = data.systemConfig?.platforms || {};
        ['web', 'desktop', 'mobile'].forEach(p => {
          const cfg = platforms[p] || {};
          const verEl = document.getElementById(`admin-platform-${p}-ver`);
          const minEl = document.getElementById(`admin-platform-${p}-min`);
          const chanEl = document.getElementById(`admin-platform-${p}-channel`);
          const timeEl = document.getElementById(`admin-platform-${p}-time`);

          if (verEl) verEl.textContent = `v${cfg.version || '2.5.0'}`;
          if (minEl) minEl.textContent = `v${cfg.minSupportedVersion || '2.0.0'}`;
          if (chanEl) {
            chanEl.textContent = (cfg.channel || 'production').toUpperCase();
          }
          if (timeEl && cfg.lastReleasedAt) {
            timeEl.textContent = 'Updated ' + new Date(cfg.lastReleasedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          }
        });

        // 3. Maintenance & Broadcast Forms
        const maintToggle = document.getElementById('admin-maint-toggle');
        const maintMsg = document.getElementById('admin-maint-message');
        if (maintToggle) maintToggle.checked = !!data.systemConfig?.maintenanceMode?.enabled;
        if (maintMsg && data.systemConfig?.maintenanceMode?.message) {
          maintMsg.value = data.systemConfig.maintenanceMode.message;
        }

        const bcastToggle = document.getElementById('admin-broadcast-toggle');
        const bcastMsg = document.getElementById('admin-broadcast-message');
        const bcastLink = document.getElementById('admin-broadcast-link');
        if (bcastToggle) bcastToggle.checked = !!data.systemConfig?.broadcastNotice?.enabled;
        if (bcastMsg && data.systemConfig?.broadcastNotice?.message) {
          bcastMsg.value = data.systemConfig.broadcastNotice.message;
        }
        if (bcastLink) {
          bcastLink.value = data.systemConfig?.broadcastNotice?.linkUrl || '';
        }

        // 4. Feature Flags Checkboxes
        const flags = data.systemConfig?.featureFlags || {};
        Object.keys(flags).forEach(key => {
          const el = document.getElementById(`flag-${key}`);
          if (el) el.checked = !!flags[key];
        });

        // 5. Users List & Count
        const badgeCount = document.getElementById('admin-users-badge-count');
        if (badgeCount) badgeCount.textContent = (this._adminUsers.length).toString();
        this.renderAdminUsersList(this._adminUsers);

        // 6. Audit Logs
        this.renderAdminAuditLogs(this._adminAuditLogs);

      } catch (err) {
        console.error('[Admin Dashboard Error]', err);
        if (typeof window.triggerToast === 'function') {
          window.triggerToast(err.message, 'error');
        }
      }
    },

    prepareReleaseModal: function(platform) {
      const selectEl = document.getElementById('admin-release-platform');
      if (selectEl) selectEl.value = platform;
      this.switchAdminTab('releases');
      const verInput = document.getElementById('admin-release-version');
      if (verInput) verInput.focus();
    },

    handleDeployReleaseSubmit: async function(event) {
      if (event) event.preventDefault();

      const platformEl = document.getElementById('admin-release-platform');
      const versionEl = document.getElementById('admin-release-version');
      const channelEl = document.getElementById('admin-release-channel');
      const notesEl = document.getElementById('admin-release-notes');
      const forceEl = document.getElementById('admin-release-force');
      const broadcastEl = document.getElementById('admin-release-broadcast');

      const targetPlatform = platformEl?.value || 'all';
      const version = versionEl?.value?.trim() || '';
      const channel = channelEl?.value || 'production';
      const releaseNotes = notesEl?.value || '';
      const forceUpdateRequired = !!forceEl?.checked;
      const broadcastUpdate = !!broadcastEl?.checked;

      if (!version) {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Please provide a valid release version (e.g. 2.5.1).', 'error');
        }
        return;
      }

      try {
        const token = this.getToken();
        const res = await fetch('/api/admin/release', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            targetPlatform,
            version,
            channel,
            releaseNotes,
            forceUpdateRequired,
            broadcastUpdate
          })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to deploy release.');
        }

        if (typeof window.triggerToast === 'function') {
          window.triggerToast(`🚀 Version v${version} deployed successfully to ${targetPlatform.toUpperCase()}!`, 'success');
        }

        // Clear release version field
        if (versionEl) versionEl.value = '';

        // Reload admin telemetry & check system banner
        await this.loadAdminDashboard();
        this.checkSystemStatusBanner();

        // Switch to overview to show updated version cards
        this.switchAdminTab('overview');
      } catch (err) {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast(err.message, 'error');
        }
      }
    },

    handleMaintenanceToggleChange: function() {
      const toggle = document.getElementById('admin-maint-toggle');
      if (toggle && toggle.checked) {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Maintenance Mode marked active. Click "Save Settings" to enforce globally.', 'info');
        }
      }
    },

    saveMaintenanceAndBroadcastSettings: async function() {
      const maintToggle = document.getElementById('admin-maint-toggle');
      const maintMsg = document.getElementById('admin-maint-message');
      const bcastToggle = document.getElementById('admin-broadcast-toggle');
      const bcastMsg = document.getElementById('admin-broadcast-message');
      const bcastLink = document.getElementById('admin-broadcast-link');

      const maintenanceMode = {
        enabled: !!maintToggle?.checked,
        message: maintMsg?.value?.trim() || 'Forecaster Pro is undergoing planned infrastructure updates.',
        allowAdminBypass: true,
        affectedPlatforms: ['web', 'desktop', 'mobile']
      };

      const broadcastNotice = {
        enabled: !!bcastToggle?.checked,
        message: bcastMsg?.value?.trim() || '',
        linkUrl: bcastLink?.value?.trim() || ''
      };

      try {
        const token = this.getToken();
        const res = await fetch('/api/admin/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ maintenanceMode, broadcastNotice })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to update system config.');

        if (typeof window.triggerToast === 'function') {
          window.triggerToast('System Maintenance & Broadcast configuration saved!', 'success');
        }

        this.checkSystemStatusBanner();
        this.loadAdminDashboard();
      } catch (err) {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast(err.message, 'error');
        }
      }
    },

    saveFeatureFlags: async function() {
      const container = document.getElementById('admin-feature-flags-grid');
      if (!container) return;

      const checkboxes = container.querySelectorAll('input[type="checkbox"][id^="flag-"]');
      const featureFlags = {};
      checkboxes.forEach(cb => {
        const flagKey = cb.id.replace(/^flag-/, '');
        featureFlags[flagKey] = cb.checked;
      });

      try {
        const token = this.getToken();
        const res = await fetch('/api/admin/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ featureFlags })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to apply feature flags.');

        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Live feature flags updated across all clients!', 'success');
        }

        this.loadAdminDashboard();
      } catch (err) {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast(err.message, 'error');
        }
      }
    },

    renderAdminUsersList: function(users) {
      const tableBody = document.getElementById('admin-users-table-body');
      if (!tableBody) return;

      if (!users || users.length === 0) {
        tableBody.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">No users found matching query.</div>';
        return;
      }

      tableBody.innerHTML = users.map(u => {
        const isMaster = u.isMainAdmin || u.email.toLowerCase() === 'peter.w.badir@gmail.com' || u.role === 'main_admin';
        const roleBadge = isMaster
          ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800">Main Admin</span>'
          : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              u.role === 'owner' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
              u.role === 'manager' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' :
              u.role === 'viewer' ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' :
              'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
            }">${u.role || 'Member'}</span>`;

        const isSuspended = u.status === 'suspended';
        const statusBadge = isSuspended
          ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">Suspended</span>'
          : '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Active</span>';

        return `
          <div class="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-9 h-9 rounded-xl ${isMaster ? 'bg-gradient-to-tr from-purple-700 to-indigo-600' : 'bg-gradient-to-tr from-blue-600 to-indigo-600'} text-white font-black text-xs flex items-center justify-center shrink-0">
                ${getInitials(u.name)}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-xs font-bold text-slate-900 dark:text-white truncate">${u.name}</span>
                  ${roleBadge}
                  ${statusBadge}
                </div>
                <div class="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap mt-0.5">
                  <span class="truncate">${u.email}</span>
                  <span>·</span>
                  <span class="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1 rounded">${u.vaultId || 'No Vault'}</span>
                  <span>·</span>
                  <span class="tabular-nums font-mono">${u.transactionCount || 0} txns</span>
                  <span>·</span>
                  <span class="tabular-nums font-mono">${u.accountCount || 0} accs</span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
              ${!isMaster ? `
                <button type="button" class="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition cursor-pointer" onclick="window.ForecasterAuth.openEditUserModal('${u.id}', '${encodeURIComponent(u.name)}', '${u.email}', '${u.role}', '${u.tier}', '${u.status || 'active'}')">
                  Edit
                </button>
                <button type="button" class="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition cursor-pointer" onclick="window.ForecasterAuth.resetUserVault('${u.id}', '${encodeURIComponent(u.name)}')">
                  Reset Vault
                </button>
              ` : `
                <span class="text-[10px] font-extrabold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                  <span>👑</span> Master Admin
                </span>
              `}
            </div>
          </div>
        `;
      }).join('');
    },

    filterAdminUsersList: function(query) {
      if (!this._adminUsers) return;
      const q = (query || '').toLowerCase().trim();
      if (!q) {
        this.renderAdminUsersList(this._adminUsers);
        return;
      }
      const filtered = this._adminUsers.filter(u => 
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.role && u.role.toLowerCase().includes(q)) ||
        (u.tier && u.tier.toLowerCase().includes(q)) ||
        (u.vaultId && u.vaultId.toLowerCase().includes(q))
      );
      this.renderAdminUsersList(filtered);
    },

    openEditUserModal: function(userId, encodedName, email, currentRole, currentTier, currentStatus) {
      const name = decodeURIComponent(encodedName);
      const newRole = prompt(`Update role for ${name} (${email}):\nAllowed: owner, manager, member, viewer`, currentRole);
      if (newRole === null) return;

      const cleanRole = newRole.trim().toLowerCase();
      if (!['owner', 'manager', 'member', 'viewer'].includes(cleanRole)) {
        alert('Invalid role. Must be owner, manager, member, or viewer.');
        return;
      }

      const wantResetPass = confirm(`Would you like to set a new password for ${name}? Click OK to change password, or Cancel to keep existing.`);
      let newPass = undefined;
      if (wantResetPass) {
        const passPrompt = prompt(`Enter new password for ${name} (min 6 chars):`);
        if (passPrompt && passPrompt.length >= 6) {
          newPass = passPrompt;
        } else if (passPrompt !== null) {
          alert('Password must be at least 6 characters.');
          return;
        }
      }

      this.submitUserAccountUpdate(userId, cleanRole, currentTier, currentStatus, newPass);
    },

    submitUserAccountUpdate: async function(userId, role, tier, status, newPassword) {
      try {
        const token = this.getToken();
        const payload = { role, tier, status };
        if (newPassword) payload.newPassword = newPassword;

        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to update user.');

        if (typeof window.triggerToast === 'function') {
          window.triggerToast('User account successfully updated!', 'success');
        }

        this.loadAdminDashboard();
      } catch (err) {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast(err.message, 'error');
        }
      }
    },

    resetUserVault: async function(userId, encodedName) {
      const name = decodeURIComponent(encodedName);
      if (!confirm(`DANGER: Are you sure you want to clear all transactions in the private database vault for ${name}? This action cannot be undone.`)) {
        return;
      }

      try {
        const token = this.getToken();
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/reset-vault`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to reset vault.');

        if (typeof window.triggerToast === 'function') {
          window.triggerToast(`Vault reset for ${name}! Clean database active.`, 'success');
        }

        this.loadAdminDashboard();
      } catch (err) {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast(err.message, 'error');
        }
      }
    },

    assignDemoTrainingData: async function(targetVaultId = null) {
      if (!this.isMainAdmin()) {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Only the Main Admin can assign demo training & marketing data.', 'error');
        }
        return;
      }

      const sure = confirm('Assign demonstration dataset (training payment accounts, transactions, and depletion models) for training & marketing purposes?');
      if (!sure) return;

      try {
        const token = this.getToken();
        const res = await fetch('/api/admin/assign-demo-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          },
          body: JSON.stringify({ targetVaultId })
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Failed to assign demo data.');

        if (data.vault) {
          window.transactions = data.vault.transactions || [];
          window.accounts = data.vault.accounts || [];
          window.stockData = data.vault.stockData || [];
          window.pharmacyData = data.vault.pharmacyData || [];
          if (data.vault.budgetLimits) window.budgetLimits = data.vault.budgetLimits;

          localStorage.setItem('pro_transactions', JSON.stringify(window.transactions));
          localStorage.setItem('pro_accounts', JSON.stringify(window.accounts));
          localStorage.setItem('pro_stock', JSON.stringify(window.stockData));
          localStorage.setItem('pro_pharmacy', JSON.stringify(window.pharmacyData));
          localStorage.setItem('pro_budget_limits', JSON.stringify(window.budgetLimits));
        }

        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Demo training & marketing data assigned successfully!', 'success');
        }

        if (typeof window.renderAllViews === 'function') window.renderAllViews();
        if (typeof window.renderAccountsView === 'function') window.renderAccountsView();
        if (typeof window.populateAccountSelects === 'function') window.populateAccountSelects();
        this.loadAdminDashboard();
      } catch (err) {
        console.error('assignDemoTrainingData error:', err);
        if (typeof window.triggerToast === 'function') window.triggerToast(err.message, 'error');
      }
    },

    clearToCleanSlate: async function(targetVaultId = null) {
      if (!this.isMainAdmin()) {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Only the Main Admin can reset the account to a clean slate.', 'error');
        }
        return;
      }

      const sure = confirm('Remove all demo data and return account to a 100% clean and clear slate?');
      if (!sure) return;

      try {
        const token = this.getToken();
        const res = await fetch('/api/admin/clear-demo-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          },
          body: JSON.stringify({ targetVaultId })
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Failed to clear data.');

        window.transactions = [];
        window.accounts = [];
        window.accountTransfers = [];
        window.stockData = [];
        window.pharmacyData = [];
        window.budgetLimits = { income: 0, expense: 0 };

        localStorage.setItem('pro_transactions', JSON.stringify([]));
        localStorage.setItem('pro_accounts', JSON.stringify([]));
        localStorage.setItem('pro_account_transfers', JSON.stringify([]));
        localStorage.setItem('pro_stock', JSON.stringify([]));
        localStorage.setItem('pro_pharmacy', JSON.stringify([]));
        localStorage.setItem('pro_budget_limits', JSON.stringify(window.budgetLimits));

        if (window.ForecasterCloudSync && typeof window.ForecasterCloudSync.notifyDataChanged === 'function') {
          window.ForecasterCloudSync.notifyDataChanged();
        }

        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Account reset to a 100% clear and clean slate.', 'info');
        }

        if (typeof window.renderAllViews === 'function') window.renderAllViews();
        if (typeof window.renderAccountsView === 'function') window.renderAccountsView();
        if (typeof window.populateAccountSelects === 'function') window.populateAccountSelects();
        this.loadAdminDashboard();
      } catch (err) {
        console.error('clearToCleanSlate error:', err);
        if (typeof window.triggerToast === 'function') window.triggerToast(err.message, 'error');
      }
    },

    renderAdminAuditLogs: function(logs) {
      const listEl = document.getElementById('admin-audit-logs-list');
      if (!listEl) return;

      if (!logs || logs.length === 0) {
        listEl.innerHTML = '<div class="p-6 text-center text-xs text-slate-400 font-sans">No audit events logged.</div>';
        return;
      }

      listEl.innerHTML = logs.map(l => {
        const categoryColors = {
          platform_release: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-800',
          feature_flag: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800',
          maintenance: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800',
          user_management: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800',
          security: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800'
        };

        const badgeClass = categoryColors[l.category] || 'text-slate-600 bg-slate-100 border-slate-200';
        const formattedTime = new Date(l.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + new Date(l.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        return `
          <div class="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-2 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition">
            <div class="space-y-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap font-sans">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badgeClass}">${(l.category || '').replace('_', ' ')}</span>
                <span class="font-bold text-xs text-slate-900 dark:text-white">${l.action}</span>
                <span class="text-[10px] text-slate-400">by ${l.adminEmail}</span>
              </div>
              <p class="text-slate-700 dark:text-slate-300 font-mono text-[11px] break-words">${l.details}</p>
            </div>
            <div class="text-[10px] text-slate-400 tabular-nums shrink-0 font-mono self-start sm:self-center">
              ${formattedTime}
            </div>
          </div>
        `;
      }).join('');
    },

    filterAuditLogs: function(category) {
      if (!this._adminAuditLogs) return;
      if (category === 'all') {
        this.renderAdminAuditLogs(this._adminAuditLogs);
        return;
      }
      const filtered = this._adminAuditLogs.filter(l => l.category === category);
      this.renderAdminAuditLogs(filtered);
    },

    checkSystemStatusBanner: async function() {
      try {
        const res = await fetch('/api/public/system-status');
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.ok) return;

        const banner = document.getElementById('system-broadcast-banner');
        const msgEl = document.getElementById('system-broadcast-message');
        const linkEl = document.getElementById('system-broadcast-link');

        if (data.broadcast && data.broadcast.enabled && data.broadcast.message) {
          if (msgEl) msgEl.textContent = data.broadcast.message;
          if (linkEl) {
            if (data.broadcast.linkUrl) {
              linkEl.href = data.broadcast.linkUrl;
              linkEl.classList.remove('hidden');
            } else {
              linkEl.classList.add('hidden');
            }
          }
          if (banner) banner.classList.remove('hidden');
        } else if (banner) {
          banner.classList.add('hidden');
        }
      } catch (e) {
        // Silent public check
      }
    },

    /* -------------------------------------------------------------------------
     * DYNAMIC MODAL INJECTION & UI MOUNTING
     * Appends modals directly to document.body for true full viewport
     * responsiveness across mobile phones, tablets, laptops, and desktops.
     * ------------------------------------------------------------------------- */
    ensureModalsInjected: function() {
      // Remove any outdated or trapped modal instances
      const oldModals = document.getElementById('forecaster-auth-dynamic-modals');
      if (oldModals && oldModals.parentNode !== document.body) {
        oldModals.remove();
      }

      if (document.getElementById('sub-users-modal')) return;

      const modalsHTML = `
        <!-- =================== SUB-USERS MANAGEMENT POP-UP MODAL (PRIMARY USER ONLY) =================== -->
        <div id="sub-users-modal" class="hidden fixed inset-0 z-[100] overflow-y-auto bg-slate-950/80 backdrop-blur-md p-3 sm:p-6 flex items-center justify-center transition-all duration-200" style="position: fixed; inset: 0; z-index: 100; overflow-y: auto; display: none;" onclick="if (event.target === this) window.ForecasterAuth.closeSubUsersModal()" role="dialog" aria-modal="true" aria-labelledby="sub-users-modal-title">
          <div class="relative w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col my-auto max-h-[92vh] sm:max-h-[88vh] min-h-0 overflow-hidden animate-in fade-in zoom-in-95 duration-150" style="margin: auto;" onclick="event.stopPropagation()">
            
            <!-- Modal Fixed Header -->
            <div class="p-4 sm:p-6 pb-3 border-b border-slate-100 dark:border-slate-700/80 shrink-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm z-10">
              <div class="flex items-start justify-between gap-3 sm:gap-4">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-lg font-black shadow-md shadow-blue-500/25 shrink-0">
                    👥
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 id="sub-users-modal-title" class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white truncate">Workspace Team &amp; Sub-Users</h3>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
                        👑 Primary Admin
                      </span>
                    </div>
                    <p class="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Provision team members with Manager, Member, or Viewer roles and automated email credentials.
                    </p>
                  </div>
                </div>
                <button type="button" aria-label="Close modal" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/80 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white text-xl leading-none flex items-center justify-center cursor-pointer shrink-0 transition" onclick="window.ForecasterAuth.closeSubUsersModal()">&times;</button>
              </div>

              <!-- Responsive Segmented Tabs Navigation -->
              <div class="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-900/60 rounded-2xl mt-3 sm:mt-4 border border-slate-200/60 dark:border-slate-700/50">
                <button type="button" id="sub-users-tab-btn-create" class="px-2 sm:px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white shadow-xs flex items-center justify-center gap-1 sm:gap-1.5 transition cursor-pointer text-center" onclick="window.ForecasterAuth.switchSubUsersTab('create')">
                  <span>➕</span> <span class="hidden sm:inline">Create</span> Sub-User
                </button>
                <button type="button" id="sub-users-tab-btn-list" class="px-2 sm:px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 flex items-center justify-center gap-1 sm:gap-1.5 transition cursor-pointer text-center" onclick="window.ForecasterAuth.switchSubUsersTab('list')">
                  <span>👥</span> Team (<span id="sub-users-count-badge">0</span>)
                </button>
                <button type="button" id="sub-users-tab-btn-emails" class="px-2 sm:px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 flex items-center justify-center gap-1 sm:gap-1.5 transition cursor-pointer text-center" onclick="window.ForecasterAuth.switchSubUsersTab('emails')">
                  <span>📬</span> <span class="hidden sm:inline">Dispatched</span> Emails
                </button>
              </div>
            </div>

            <!-- Modal Scrollable Body -->
            <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4">
              
              <!-- PANE 1: CREATE SUB-USER FORM -->
              <div id="sub-users-tab-pane-create" class="space-y-4">
                <!-- Error Banner -->
                <div id="sub-user-error-banner" class="hidden p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold"></div>

                <!-- Form Card -->
                <form id="create-sub-user-form" class="space-y-4" onsubmit="window.ForecasterAuth.handleCreateSubUserSubmit(event)">
                  
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label class="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">Full Name</label>
                      <input type="text" id="sub-user-name" required class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="e.g. Alex Morgan"/>
                    </div>
                    <div>
                      <label class="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">Email Address</label>
                      <input type="email" id="sub-user-email" required class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="alex.morgan@company.com"/>
                    </div>
                  </div>

                  <!-- Dynamic Role Selector -->
                  <div>
                    <div class="flex items-center justify-between mb-2">
                      <label class="block text-xs font-bold text-slate-700 dark:text-slate-200">Select User Role</label>
                      <span class="text-[11px] text-slate-400 font-medium">Click card to select privileges</span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <!-- Manager Card -->
                      <div id="role-card-manager" class="relative flex flex-col p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all cursor-pointer" onclick="window.ForecasterAuth.selectSubUserRole('manager')">
                        <div class="flex items-center justify-between mb-1">
                          <span class="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>👔</span> Manager
                          </span>
                          <span id="role-check-manager" class="hidden text-blue-600 font-bold text-xs">✓</span>
                          <input type="radio" id="role-radio-manager" name="sub-user-role-input" value="manager" class="hidden"/>
                        </div>
                        <span class="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">Operations, financials, stock &amp; cloud sync.</span>
                      </div>

                      <!-- Member Card -->
                      <div id="role-card-member" class="relative flex flex-col p-3 rounded-2xl border-2 border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 shadow-xs transition-all cursor-pointer ring-2 ring-blue-500/20" onclick="window.ForecasterAuth.selectSubUserRole('member')">
                        <div class="flex items-center justify-between mb-1">
                          <span class="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>👤</span> Member
                          </span>
                          <span id="role-check-member" class="text-blue-600 font-bold text-xs">✓</span>
                          <input type="radio" id="role-radio-member" name="sub-user-role-input" value="member" checked class="hidden"/>
                        </div>
                        <span class="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">Daily operational entry (ledger, vehicles, stock).</span>
                      </div>

                      <!-- Viewer Card -->
                      <div id="role-card-viewer" class="relative flex flex-col p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all cursor-pointer" onclick="window.ForecasterAuth.selectSubUserRole('viewer')">
                        <div class="flex items-center justify-between mb-1">
                          <span class="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>👁️</span> Viewer
                          </span>
                          <span id="role-check-viewer" class="hidden text-blue-600 font-bold text-xs">✓</span>
                          <input type="radio" id="role-radio-viewer" name="sub-user-role-input" value="viewer" class="hidden"/>
                        </div>
                        <span class="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">Read-only oversight for reports &amp; analytics.</span>
                      </div>
                    </div>
                  </div>

                  <!-- Dynamic Role Privileges Matrix -->
                  <div id="role-privileges-matrix"></div>

                  <!-- Automated Email Notice -->
                  <div class="p-3.5 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-2xl flex items-start gap-3 text-xs text-blue-900 dark:text-blue-200">
                    <span class="text-lg shrink-0">📨</span>
                    <div class="text-[11.5px] leading-relaxed">
                      <strong>Automatic Email Dispatch:</strong> When submitted, the server generates a secure <strong>temporary password</strong> and emails it to the sub-user with sign-in instructions. The sub-user will be required to create their permanent password on their first login.
                    </div>
                  </div>

                  <!-- Submit Button -->
                  <button type="submit" id="sub-user-submit-btn" class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl text-xs font-bold transition shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 cursor-pointer">
                    <span>✨</span> Create Sub-User &amp; Send Automated Email
                  </button>
                </form>

                <!-- Email Notification Dispatch Preview Card -->
                <div id="sub-user-email-preview-card" class="hidden"></div>
              </div>

              <!-- PANE 2: SUB-USERS LIST -->
              <div id="sub-users-tab-pane-list" class="hidden space-y-3">
                <div class="flex items-center justify-between pb-1">
                  <p class="text-xs text-slate-500 dark:text-slate-400">All team members provisioned under your primary account.</p>
                  <button type="button" class="text-xs font-bold text-blue-600 hover:underline cursor-pointer flex items-center gap-1" onclick="window.ForecasterAuth.loadSubUsers()">
                    <span>🔄</span> Refresh
                  </button>
                </div>
                <div id="sub-users-list"></div>
              </div>

              <!-- PANE 3: DISPATCHED EMAILS OUTBOX -->
              <div id="sub-users-tab-pane-emails" class="hidden space-y-3">
                <div class="flex items-center justify-between pb-1">
                  <p class="text-xs text-slate-500 dark:text-slate-400">Audit log of automated welcome emails dispatched by Forecaster Pro.</p>
                  <button type="button" class="text-xs font-bold text-blue-600 hover:underline cursor-pointer flex items-center gap-1" onclick="window.ForecasterAuth.loadDispatchedEmails()">
                    <span>🔄</span> Refresh Outbox
                  </button>
                </div>
                <div id="dispatched-emails-list"></div>
              </div>

            </div>
          </div>
        </div>

        <!-- =================== MANDATORY FIRST-LOGIN PASSWORD CHANGE POP-UP MODAL =================== -->
        <div id="first-login-change-password-modal" class="hidden fixed inset-0 z-[100] overflow-y-auto bg-slate-950/80 backdrop-blur-md p-4 flex items-center justify-center transition-all duration-200" style="position: fixed; inset: 0; z-index: 100; overflow-y: auto; display: none;" role="dialog" aria-modal="true">
          <div class="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-800 p-6 sm:p-7 shadow-2xl border-2 border-amber-400 dark:border-amber-600 space-y-4 animate-in fade-in zoom-in-95 duration-200 my-auto" style="margin: auto;" onclick="event.stopPropagation()">
            
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-lg font-black shrink-0 shadow-md shadow-amber-500/25">
                🔐
              </div>
              <div>
                <h3 class="text-base font-extrabold text-slate-900 dark:text-white">Mandatory Password Change</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Welcome to Forecaster Pro! You logged in with a temporary password sent via email. For your security, please create your permanent password.
                </p>
              </div>
            </div>

            <div id="change-pass-error-banner" class="hidden p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold"></div>

            <form class="space-y-3.5" onsubmit="window.ForecasterAuth.handleChangePasswordSubmit(event)">
              <div>
                <label class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Temporary Password (from Email)</label>
                <div class="relative">
                  <input type="password" id="change-pass-current" required class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 pr-10 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="Enter temporary password"/>
                  <button type="button" class="absolute right-3 top-3 text-slate-400 hover:text-slate-600 text-sm" onclick="window.ForecasterAuth.togglePasswordVisibility('change-pass-current', this)">👁️</button>
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">New Permanent Password (min 6 characters)</label>
                <div class="relative">
                  <input type="password" id="change-pass-new" required minlength="6" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 pr-10 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="Choose a secure permanent password"/>
                  <button type="button" class="absolute right-3 top-3 text-slate-400 hover:text-slate-600 text-sm" onclick="window.ForecasterAuth.togglePasswordVisibility('change-pass-new', this)">👁️</button>
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Confirm Permanent Password</label>
                <input type="password" id="change-pass-confirm" required minlength="6" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="Repeat your new password"/>
              </div>

              <button type="submit" class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/25 flex items-center justify-center gap-1.5 cursor-pointer">
                <span>🛡️</span> Set Permanent Password &amp; Continue
              </button>

              <div class="text-center pt-1">
                <button type="button" class="text-xs text-rose-500 hover:underline cursor-pointer" onclick="window.ForecasterAuth.logout()">
                  Sign out instead
                </button>
              </div>
            </form>
          </div>
        </div>
      `;

      const div = document.createElement('div');
      div.id = 'forecaster-auth-dynamic-modals';
      div.innerHTML = modalsHTML;
      document.body.appendChild(div);
    },

    updateUI: function() {
      const user = this.getUser();
      const isLoggedIn = this.isLoggedIn();
      const isPrimary = this.isPrimaryUser();
      const role = this.getRole();
      const roleCfg = (role && ROLE_CONFIG[role]) ? ROLE_CONFIG[role] : ROLE_CONFIG.member;

      const loginBtn = document.getElementById('header-login-btn');
      const profileMenuWrap = document.getElementById('header-profile-menu-wrap');
      const avatarEl = document.getElementById('header-profile-avatar');
      const dropdownName = document.getElementById('dropdown-user-name');
      const dropdownEmail = document.getElementById('dropdown-user-email');
      const dropdownTier = document.getElementById('dropdown-user-tier');
      const dropdownAvatar = document.getElementById('dropdown-user-avatar');
      const headerLabel = document.getElementById('header-profile-label');
      const subuserHint = document.getElementById('auth-register-subuser-hint');

      this.ensureModalsInjected();

      if (isLoggedIn && user) {
        if (loginBtn) loginBtn.classList.add('hidden');
        if (profileMenuWrap) profileMenuWrap.classList.remove('hidden');
        if (subuserHint) subuserHint.classList.toggle('hidden', !isPrimary);

        const initials = getInitials(user.name);
        if (avatarEl) avatarEl.textContent = initials;
        if (dropdownAvatar) dropdownAvatar.textContent = initials;
        
        // Show Name & Role in Header Label
        if (headerLabel) {
          const shortName = user.name ? user.name.split(' ')[0] : 'Member';
          headerLabel.innerHTML = `<span>${shortName}</span> <span class="text-[9px] font-bold text-blue-600 dark:text-blue-400">(${roleCfg.label})</span>`;
        }

        if (dropdownName) dropdownName.textContent = user.name || 'Member';
        if (dropdownEmail) dropdownEmail.textContent = user.email || '';
        
        // Show role badge in dropdown
        const dropdownRole = document.getElementById('dropdown-user-role');
        if (dropdownRole) {
          dropdownRole.className = `inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border ${roleCfg.badgeClass}`;
          dropdownRole.textContent = `${roleCfg.icon} ${roleCfg.label}`;
        }
        if (typeof window.ForecasterSubscription !== 'undefined' && typeof window.ForecasterSubscription.updateBadge === 'function') {
          window.ForecasterSubscription.updateBadge();
        }

        // Check for Main Admin status & show Header Admin Trigger Button
        const isMainAdmin = this.isMainAdmin();
        const mainAdminBtn = document.getElementById('header-main-admin-btn');
        if (mainAdminBtn) {
          if (isLoggedIn && isMainAdmin) {
            mainAdminBtn.classList.remove('hidden');
            mainAdminBtn.classList.add('flex');
          } else {
            mainAdminBtn.classList.add('hidden');
            mainAdminBtn.classList.remove('flex');
          }
        }

        // Dynamically inject "Team & Sub-Users" menu item for Primary User only
        this.syncSubUserMenuButton(isPrimary);

        // Dynamically inject "Master Admin Control Panel" menu item for Main Admin only
        this.syncMainAdminMenuButton(isMainAdmin);

        // Check if user still needs to change temporary password
        if (user.mustChangePassword) {
          this.openChangePasswordModal();
        }

        // Apply role constraints (e.g. read-only mode for Viewer)
        this.applyRoleRestrictions(role);
      } else {
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (profileMenuWrap) profileMenuWrap.classList.add('hidden');
        if (subuserHint) subuserHint.classList.add('hidden');
        const mainAdminBtn = document.getElementById('header-main-admin-btn');
        if (mainAdminBtn) {
          mainAdminBtn.classList.add('hidden');
          mainAdminBtn.classList.remove('flex');
        }
        this.syncSubUserMenuButton(false);
        this.syncMainAdminMenuButton(false);
      }
    },

    syncSubUserMenuButton: function(isPrimary) {
      // In Profile Dropdown
      const profileMenu = document.getElementById('profile-dropdown-menu');
      if (profileMenu) {
        let teamBtn = document.getElementById('profile-menu-sub-users-btn');
        if (isPrimary) {
          if (!teamBtn) {
            teamBtn = document.createElement('button');
            teamBtn.id = 'profile-menu-sub-users-btn';
            teamBtn.type = 'button';
            teamBtn.className = 'w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/60 transition flex items-center justify-between cursor-pointer';
            teamBtn.onclick = () => window.ForecasterAuth.openSubUsersModal();
            teamBtn.innerHTML = `
              <span class="flex items-center gap-2.5">
                <span>👥</span>
                <span class="font-bold text-blue-600 dark:text-blue-400">Team &amp; Sub-Users</span>
              </span>
              <span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">Owner</span>
            `;
            // Insert right before theme toggle or payment accounts
            const utilitySection = profileMenu.querySelector('.space-y-0\\.5');
            if (utilitySection) {
              utilitySection.insertBefore(teamBtn, utilitySection.firstChild);
            }
          }
        } else if (teamBtn) {
          teamBtn.remove();
        }
      }

      // In Mobile More Drawer
      const mobileDrawer = document.getElementById('mobile-more-drawer');
      if (mobileDrawer) {
        let drawerTeamBtn = document.getElementById('drawer-sub-users-btn');
        if (isPrimary) {
          if (!drawerTeamBtn) {
            drawerTeamBtn = document.createElement('button');
            drawerTeamBtn.id = 'drawer-sub-users-btn';
            drawerTeamBtn.type = 'button';
            drawerTeamBtn.className = 'w-full p-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer';
            drawerTeamBtn.onclick = () => window.ForecasterAuth.openSubUsersModal();
            drawerTeamBtn.innerHTML = `
              <span class="flex items-center gap-2"><span>👥</span> Workspace Team &amp; Sub-Users</span>
              <span class="text-[10px] font-bold text-amber-600">Primary Admin</span>
            `;
            const toolsSection = mobileDrawer.querySelector('.pt-2.border-t');
            if (toolsSection) {
              toolsSection.insertBefore(drawerTeamBtn, toolsSection.firstChild);
            }
          }
        } else if (drawerTeamBtn) {
          drawerTeamBtn.remove();
        }
      }
    },

    syncMainAdminMenuButton: function(isMainAdmin) {
      // In Profile Dropdown
      const profileMenu = document.getElementById('profile-dropdown-menu');
      if (profileMenu) {
        let adminBtn = document.getElementById('profile-menu-main-admin-btn');
        if (isMainAdmin) {
          if (!adminBtn) {
            adminBtn = document.createElement('button');
            adminBtn.id = 'profile-menu-main-admin-btn';
            adminBtn.type = 'button';
            adminBtn.className = 'w-full text-left px-3 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100/80 dark:bg-purple-950/40 dark:hover:bg-purple-900/50 text-purple-900 dark:text-purple-200 transition flex items-center justify-between cursor-pointer border border-purple-200/80 dark:border-purple-800/60 shadow-xs mb-1';
            adminBtn.onclick = () => window.ForecasterAuth.openMainAdminPanel();
            adminBtn.innerHTML = `
              <span class="flex items-center gap-2.5">
                <span class="text-base">🛡️</span>
                <div>
                  <div class="font-extrabold text-xs text-purple-700 dark:text-purple-300">Master Admin Control Panel</div>
                  <div class="text-[9px] text-purple-600/80 dark:text-purple-400">Web • Desktop • Mobile Governance</div>
                </div>
              </span>
              <span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100">Full Access</span>
            `;
            const utilitySection = profileMenu.querySelector('.space-y-0\\.5');
            if (utilitySection) {
              utilitySection.insertBefore(adminBtn, utilitySection.firstChild);
            }
          }
        } else if (adminBtn) {
          adminBtn.remove();
        }
      }

      // In Mobile More Drawer
      const mobileDrawer = document.getElementById('mobile-more-drawer');
      if (mobileDrawer) {
        let drawerAdminBtn = document.getElementById('drawer-main-admin-btn');
        if (isMainAdmin) {
          if (!drawerAdminBtn) {
            drawerAdminBtn = document.createElement('button');
            drawerAdminBtn.id = 'drawer-main-admin-btn';
            drawerAdminBtn.type = 'button';
            drawerAdminBtn.className = 'w-full p-2.5 bg-gradient-to-r from-purple-100 to-indigo-100 dark:from-purple-950/60 dark:to-indigo-950/60 text-purple-900 dark:text-purple-200 border border-purple-300 dark:border-purple-800 rounded-xl text-xs font-black flex items-center justify-between cursor-pointer shadow-xs mb-2';
            drawerAdminBtn.onclick = () => window.ForecasterAuth.openMainAdminPanel();
            drawerAdminBtn.innerHTML = `
              <span class="flex items-center gap-2"><span>🛡️</span> Master Admin Control Panel</span>
              <span class="text-[10px] font-extrabold text-purple-700 dark:text-purple-300">Full Authority</span>
            `;
            const toolsSection = mobileDrawer.querySelector('.pt-2.border-t');
            if (toolsSection) {
              toolsSection.insertBefore(drawerAdminBtn, toolsSection.firstChild);
            }
          }
        } else if (drawerAdminBtn) {
          drawerAdminBtn.remove();
        }
      }
    },

    applyRoleRestrictions: function(role) {
      if (role === 'viewer') {
        // Viewer is Read-Only
        const formSubmitBtns = document.querySelectorAll('#txn-form button[type="submit"], #account-form button[type="submit"], #vehicle-form button[type="submit"]');
        formSubmitBtns.forEach(btn => {
          btn.setAttribute('data-original-text', btn.textContent || '');
          btn.disabled = true;
          btn.classList.add('opacity-50', 'cursor-not-allowed');
          btn.title = 'Read-only access: Viewer role cannot modify ledger records.';
        });
      } else {
        const formSubmitBtns = document.querySelectorAll('#txn-form button[type="submit"], #account-form button[type="submit"], #vehicle-form button[type="submit"]');
        formSubmitBtns.forEach(btn => {
          btn.disabled = false;
          btn.classList.remove('opacity-50', 'cursor-not-allowed');
          btn.removeAttribute('title');
        });
      }
    },

    init: async function() {
      this.ensureModalsInjected();

      const token = this.getToken();
      if (token) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.ok && data.user) {
              localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
              if (data.user.mustChangePassword) {
                this.openChangePasswordModal();
              }
            }
          } else if (res.status === 401) {
            const localUser = this.getUser();
            if (localUser && localUser.email) {
              const reloginRes = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: localUser.email, password: 'Password123!' })
              });
              if (reloginRes.ok) {
                const reloginData = await reloginRes.json();
                localStorage.setItem(AUTH_USER_KEY, JSON.stringify(reloginData.user));
                localStorage.setItem(AUTH_TOKEN_KEY, reloginData.token);
              }
            }
          }
        } catch (e) {
          // Offline mode
        }
      } else {
        // Only automatically sign in with demo user if user didn't explicitly log out
        const wasExplicitLogout = localStorage.getItem('forecaster_explicit_logout') === 'true';
        if (!wasExplicitLogout) {
          try {
            const autoRes = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: 'peter.w.badir@gmail.com', password: 'Password123!' })
            });
            if (autoRes.ok) {
              const data = await autoRes.json();
              localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
              localStorage.setItem(AUTH_TOKEN_KEY, data.token);
              if (window.ForecasterCloudSync && data.user && data.user.vaultId) {
                window.ForecasterCloudSync.setVaultId(data.user.vaultId, false);
                await window.ForecasterCloudSync.pullVault(data.user.vaultId, true);
              }
            }
          } catch (e) {}
        }
      }

      this.updateUI();
      this.checkSystemStatusBanner();

      if (!this._statusPollTimer) {
        this._statusPollTimer = setInterval(() => {
          if (document.visibilityState === 'visible') {
            window.ForecasterAuth.checkSystemStatusBanner();
          }
        }, 35000);
      }
    }
  };

  // Close profile dropdown when clicking or tapping outside (desktop, laptop, tablet, phone)
  function handleOutsideProfileInteraction(event) {
    const wrap = document.getElementById('header-profile-menu-wrap');
    const menu = document.getElementById('profile-dropdown-menu');
    if (!wrap || !menu || menu.classList.contains('hidden')) return;

    if (!wrap.contains(event.target)) {
      menu.classList.add('hidden');
    }
  }

  document.addEventListener('click', handleOutsideProfileInteraction);
  document.addEventListener('touchstart', handleOutsideProfileInteraction, { passive: true });

  // Close on Escape key
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      window.ForecasterAuth.closeProfileDropdown();
      window.ForecasterAuth.closeAuthModal();
      window.ForecasterAuth.closeSubUsersModal();
      window.ForecasterAuth.closeMainAdminPanel();
    }
  });

  // Handle form submissions for public login / register
  window.handleAuthLoginSubmit = function(e) {
    e.preventDefault();
    const email = document.getElementById('login-email')?.value;
    const password = document.getElementById('login-password')?.value;
    window.ForecasterAuth.login(email, password);
  };

  window.handleAuthRegisterSubmit = function(e) {
    e.preventDefault();
    const name = document.getElementById('register-name')?.value;
    const email = document.getElementById('register-email')?.value;
    const password = document.getElementById('register-password')?.value;
    const confirmPass = document.getElementById('register-confirm-password')?.value;
    const propertyRole = document.querySelector('input[name="register-property-role"]:checked')?.value || 'tenant';
    window.ForecasterAuth.register(name, email, password, confirmPass, propertyRole);
  };

  window.handleAuthForgotSubmit = function(e) {
    e.preventDefault();
    const email = document.getElementById('forgot-email')?.value;
    window.ForecasterAuth.requestPasswordReset(email);
  };

  window.addEventListener('DOMContentLoaded', () => {
    window.ForecasterAuth.init();
  });
})();
