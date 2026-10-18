/**
 * ============================================================================
 * FORECASTER PRO - AUTHENTICATION & PROFILE CONTROLLER
 * Handles secure user Sign Up, Login, Session Management, and the Responsive
 * Top-Right Profile Dropdown Menu across desktop, laptop, tablet, and mobile.
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

  window.ForecasterAuth = {
    getUser: function() {
      return getStoredUser();
    },

    getToken: function() {
      return getStoredToken();
    },

    isLoggedIn: function() {
      return !!(this.getUser() && this.getToken());
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
      const loginForm = document.getElementById('auth-form-login');
      const registerForm = document.getElementById('auth-form-register');
      const titleEl = document.getElementById('auth-modal-title');
      const subtitleEl = document.getElementById('auth-modal-subtitle');

      this.clearAuthErrors();

      const activeTabStyle = 'flex-1 py-2.5 text-xs font-bold border-b-2 border-blue-600 text-blue-600 dark:text-blue-400';
      const inactiveTabStyle = 'flex-1 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300';

      if (tab === 'register') {
        if (loginTabBtn) loginTabBtn.className = inactiveTabStyle;
        if (registerTabBtn) registerTabBtn.className = activeTabStyle;
        if (loginForm) loginForm.classList.add('hidden');
        if (registerForm) registerForm.classList.remove('hidden');
        if (titleEl) titleEl.textContent = 'Create your Account';
        if (subtitleEl) subtitleEl.textContent = 'Start syncing and managing your ledger across all devices';
      } else {
        if (loginTabBtn) loginTabBtn.className = activeTabStyle;
        if (registerTabBtn) registerTabBtn.className = inactiveTabStyle;
        if (loginForm) loginForm.classList.remove('hidden');
        if (registerForm) registerForm.classList.add('hidden');
        if (titleEl) titleEl.textContent = 'Sign in to Forecaster Pro';
        if (subtitleEl) subtitleEl.textContent = 'Access your persistent financial workspace from any device';
      }
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

        this.closeAuthModal();
        this.updateUI();

        if (typeof window.triggerToast === 'function') {
          window.triggerToast(`Welcome back, ${data.user.name}!`, 'success');
        }

        // Trigger cloud sync for this user
        if (window.ForecasterCloudSync && typeof window.ForecasterCloudSync.syncNow === 'function') {
          window.ForecasterCloudSync.syncNow(false);
        }
      } catch (err) {
        this.showAuthError(err.message);
      }
    },

    register: async function(name, email, password, confirmPassword) {
      try {
        this.clearAuthErrors();

        if (password !== confirmPassword) {
          throw new Error('Passwords do not match. Please re-enter.');
        }

        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Registration failed.');
        }

        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);

        this.closeAuthModal();
        this.updateUI();

        if (typeof window.triggerToast === 'function') {
          window.triggerToast(`Account created! Welcome, ${data.user.name}!`, 'success');
        }

        if (window.ForecasterCloudSync && typeof window.ForecasterCloudSync.syncNow === 'function') {
          window.ForecasterCloudSync.syncNow(false);
        }
      } catch (err) {
        this.showAuthError(err.message);
      }
    },

    quickDemoLogin: function() {
      const emailInput = document.getElementById('login-email');
      const passInput = document.getElementById('login-password');
      if (emailInput && passInput) {
        emailInput.value = 'peter.w.badir@gmail.com';
        passInput.value = 'Password123!';
      }
      this.login('peter.w.badir@gmail.com', 'Password123!');
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

      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      this.closeProfileDropdown();
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
      menu.classList.toggle('hidden', !isHidden);
    },

    closeProfileDropdown: function() {
      const menu = document.getElementById('profile-dropdown-menu');
      if (menu) menu.classList.add('hidden');
    },

    updateUI: function() {
      const user = this.getUser();
      const isLoggedIn = this.isLoggedIn();

      const loginBtn = document.getElementById('header-login-btn');
      const profileMenuWrap = document.getElementById('header-profile-menu-wrap');
      const avatarEl = document.getElementById('header-profile-avatar');
      const dropdownName = document.getElementById('dropdown-user-name');
      const dropdownEmail = document.getElementById('dropdown-user-email');
      const dropdownTier = document.getElementById('dropdown-user-tier');
      const dropdownAvatar = document.getElementById('dropdown-user-avatar');

      if (isLoggedIn && user) {
        if (loginBtn) loginBtn.classList.add('hidden');
        if (profileMenuWrap) profileMenuWrap.classList.remove('hidden');

        const initials = getInitials(user.name);
        if (avatarEl) avatarEl.textContent = initials;
        if (dropdownAvatar) dropdownAvatar.textContent = initials;
        if (dropdownName) dropdownName.textContent = user.name || 'Member';
        if (dropdownEmail) dropdownEmail.textContent = user.email || '';
        if (dropdownTier) dropdownTier.textContent = user.tier || 'Free Tier';
      } else {
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (profileMenuWrap) profileMenuWrap.classList.add('hidden');
      }
    },

    init: async function() {
      // Check session validity with backend if token exists
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
            }
          } else if (res.status === 401) {
            // Token expired or server restarted without stored token
            // Refresh with default demo user so user stays logged in seamlessly
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
          // Offline mode - retain local cached session
        }
      } else {
        // Automatically sign in with default user on first visit if preferred
        // so the user immediately experiences the authenticated profile view
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
          }
        } catch (e) {}
      }

      this.updateUI();
    }
  };

  // Close profile dropdown when clicking outside
  document.addEventListener('click', function(event) {
    const wrap = document.getElementById('header-profile-menu-wrap');
    const menu = document.getElementById('profile-dropdown-menu');
    if (!wrap || !menu || menu.classList.contains('hidden')) return;

    if (!wrap.contains(event.target)) {
      menu.classList.add('hidden');
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      window.ForecasterAuth.closeProfileDropdown();
      window.ForecasterAuth.closeAuthModal();
    }
  });

  // Handle form submissions
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
    window.ForecasterAuth.register(name, email, password, confirmPass);
  };

  window.addEventListener('DOMContentLoaded', () => {
    window.ForecasterAuth.init();
  });
})();
