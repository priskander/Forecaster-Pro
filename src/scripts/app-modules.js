/**
 * ============================================================================
 * FORECASTER PRO - ENTERPRISE EXTENSION MODULES
 * Payment Accounts, Settings, Dark Mode, Notification Center, Widgets & Analytics
 * ============================================================================
 */
(function() {
  'use strict';

  /* -------------------------------------------------------------------------
   * 1. THEME & DARK MODE CONTROLLER
   * ------------------------------------------------------------------------- */
  window.syncChartDefaultsToTheme = function() {
    try {
      if (typeof Chart === 'undefined' || !Chart.defaults) return;
      const isDark = document.documentElement.classList.contains('dark');
      Chart.defaults.color = isDark ? '#94a3b8' : '#64748b';
      Chart.defaults.borderColor = isDark ? '#334155' : '#e2e8f0';
    } catch (e) {}
  };

  window.syncThemeIcons = function() {
    const isDark = document.documentElement.classList.contains('dark');
    document.querySelectorAll('.moon-icon').forEach(function(el) {
      el.classList.toggle('hidden', isDark);
    });
    document.querySelectorAll('.sun-icon').forEach(function(el) {
      el.classList.toggle('hidden', !isDark);
    });
  };

  window.toggleDarkMode = function() {
    const isDark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('pro_theme', isDark ? 'dark' : 'light'); } catch (err) {}
    
    // Update theme toggle icons everywhere (header, dropdown, drawer)
    window.syncThemeIcons();

    window.syncChartDefaultsToTheme();
    if (typeof window.renderAllViews === 'function') {
      window.renderAllViews();
    }
  };

  // Mobile "More" Drawer Controller
  window.toggleMobileDrawer = function(forceOpen) {
    const drawer = document.getElementById('mobile-more-drawer');
    if (!drawer) return;
    const isCurrentlyOpen = !drawer.classList.contains('hidden');
    const shouldOpen = (typeof forceOpen === 'boolean') ? forceOpen : !isCurrentlyOpen;
    if (shouldOpen) {
      drawer.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
      try {
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      } catch (e) {}
    } else {
      drawer.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    }
  };

  /* -------------------------------------------------------------------------
   * 2. SETTINGS DROPDOWN & SANDBOX CONTROLLER
   * ------------------------------------------------------------------------- */
  window.toggleSettingsMenu = function(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('settings-dropdown-menu');
    if (menu) menu.classList.toggle('hidden');
  };

  document.addEventListener('click', function(e) {
    const menu = document.getElementById('settings-dropdown-menu');
    if (!menu || menu.classList.contains('hidden')) return;
    if (!menu.contains(e.target) && !e.target.closest('[title="Configuration"]')) {
      menu.classList.add('hidden');
    }
  });

  window.confirmRefreshSandbox = function() {
    const menu = document.getElementById('settings-dropdown-menu');
    if (menu) menu.classList.add('hidden');
    if (typeof window.triggerToast === 'function') {
      window.triggerToast('Refreshing sandbox environment...', 'info');
    }
    setTimeout(() => location.reload(), 500);
  };

  window.confirmDeleteAllData = function() {
    const menu = document.getElementById('settings-dropdown-menu');
    if (menu) menu.classList.add('hidden');

    const sure = confirm(
      'This will PERMANENTLY delete ALL data in this sandbox — every transaction, ' +
      'inventory batch, pharmacy record, payment account, and transfer. ' +
      'This cannot be undone.\n\nAre you sure you want to continue?'
    );
    if (!sure) return;

    const keysToWipe = [
      'pro_transactions', 'pro_stock', 'pro_pharmacy', 'pro_budget_limits',
      'pro_accounts', 'pro_account_transfers', 'pro_expenses', 'pro_income',
      'pro_vehicles', 'pro_vehicle_fuel', 'pro_vehicle_maintenance',
      'pro_rental_contracts_v1', 'pro_rental_properties_v1'
    ];
    keysToWipe.forEach(key => {
      try { localStorage.removeItem(key); } catch (err) {}
    });

    if (typeof window.triggerToast === 'function') {
      window.triggerToast('All database input deleted. Reloading a fresh sandbox...', 'success');
    }
    setTimeout(() => location.reload(), 700);
  };

  /* -------------------------------------------------------------------------
   * 3. HIDE & UNHIDE ITEMS MODAL
   * ------------------------------------------------------------------------- */
  window.openUnhideItemsModal = function() {
    const menu = document.getElementById('settings-dropdown-menu');
    if (menu) menu.classList.add('hidden');

    const hiddenStock = (window.stockData || []).filter(s => s.isHidden);
    const hiddenPharmacy = (window.pharmacyData || []).filter(p => p.isHidden);
    const list = document.getElementById('unhide-items-list');
    if (list) {
      let html = '';

      if (hiddenStock.length) {
        html += `<p class="text-[10px] font-black uppercase text-slate-404 pt-1">📦 Hidden Inventory Batches</p>`;
        hiddenStock.forEach(s => {
          html += `
            <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
              <div>
                <p class="text-xs font-bold text-slate-900 dark:text-white">${s.name}</p>
                <p class="text-[10px] text-slate-404 font-semibold uppercase mt-0.5">${s.quantity} ${s.unit} • Exp: ${s.expDate || 'N/A'}</p>
              </div>
              <button onclick="unhideStockBatch('${s.id}')" class="text-[10px] text-blue-600 font-bold hover:underline">Unhide</button>
            </div>
          `;
        });
      }

      if (hiddenPharmacy.length) {
        html += `<p class="text-[10px] font-black uppercase text-slate-404 pt-2">💊 Hidden Medication Batches</p>`;
        hiddenPharmacy.forEach(p => {
          html += `
            <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
              <div>
                <p class="text-xs font-bold text-slate-900 dark:text-white">${p.name}</p>
                <p class="text-[10px] text-slate-404 font-semibold uppercase mt-0.5">${p.quantity} ${p.unit} • Exp: ${p.expDate || 'N/A'}</p>
              </div>
              <button onclick="unhidePharmacyBatch('${p.id}')" class="text-[10px] text-blue-600 font-bold hover:underline">Unhide</button>
            </div>
          `;
        });
      }

      if (!hiddenStock.length && !hiddenPharmacy.length) {
        html = `<div class="text-center py-8 text-slate-404 font-semibold text-xs">No hidden items — everything you've registered is currently visible.</div>`;
      }

      list.innerHTML = html;
    }

    const modal = document.getElementById('custom-modal');
    if (modal) modal.classList.remove('hidden');
    const unhideModal = document.getElementById('unhide-items-modal');
    if (unhideModal) unhideModal.classList.remove('hidden');
  };

  window.hideStockBatch = function(id) {
    const item = (window.stockData || []).find(s => s.id === id);
    if (!item) return;
    item.isHidden = true;
    localStorage.setItem('pro_stock', JSON.stringify(window.stockData));
    if (typeof window.triggerToast === 'function') window.triggerToast('Batch hidden from active inventory.', 'info');
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  window.unhideStockBatch = function(id) {
    const item = (window.stockData || []).find(s => s.id === id);
    if (!item) return;
    item.isHidden = false;
    localStorage.setItem('pro_stock', JSON.stringify(window.stockData));
    if (typeof window.triggerToast === 'function') window.triggerToast('Batch restored to active inventory.', 'success');
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
    window.openUnhideItemsModal();
  };

  window.hidePharmacyBatch = function(id) {
    const item = (window.pharmacyData || []).find(p => p.id === id);
    if (!item) return;
    item.isHidden = true;
    localStorage.setItem('pro_pharmacy', JSON.stringify(window.pharmacyData));
    if (typeof window.triggerToast === 'function') window.triggerToast('Batch hidden from medication database.', 'info');
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  window.unhidePharmacyBatch = function(id) {
    const item = (window.pharmacyData || []).find(p => p.id === id);
    if (!item) return;
    item.isHidden = false;
    localStorage.setItem('pro_pharmacy', JSON.stringify(window.pharmacyData));
    if (typeof window.triggerToast === 'function') window.triggerToast('Batch restored to medication database.', 'success');
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
    window.openUnhideItemsModal();
  };

  /* -------------------------------------------------------------------------
   * 4. NOTIFICATION CENTER SYSTEM (7-Day Auto-Removal of Read Alerts)
   * ------------------------------------------------------------------------- */
  const NOTIFICATION_READ_KEY = 'pro_notification_read_signatures_v2';
  const LEGACY_READ_KEY = 'pro_notification_read_signatures';
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  let notificationReadMap = {}; // { [signature]: readTimestamp }

  function loadNotificationReadState() {
    try {
      let stored = JSON.parse(localStorage.getItem(NOTIFICATION_READ_KEY) || 'null');
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
        stored = {};
        const legacy = JSON.parse(localStorage.getItem(LEGACY_READ_KEY) || '[]');
        if (Array.isArray(legacy)) {
          const now = Date.now();
          legacy.forEach(sig => { stored[sig] = now; });
        }
      }
      // Prune any read notifications older than 7 days from their read date
      const now = Date.now();
      const pruned = {};
      for (const [sig, timestamp] of Object.entries(stored)) {
        const readAt = Number(timestamp) || now;
        if (now - readAt < SEVEN_DAYS_MS) {
          pruned[sig] = readAt;
        }
      }
      notificationReadMap = pruned;
      saveNotificationReadState();
    } catch (err) {
      notificationReadMap = {};
    }
  }

  function saveNotificationReadState() {
    try {
      localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify(notificationReadMap));
    } catch (err) {}
  }
  loadNotificationReadState();

  window.toggleNotificationCenter = function(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('notification-dropdown');
    const bell = document.getElementById('notification-bell-btn');
    if (!menu || !bell) return;
    const willOpen = menu.classList.contains('hidden');

    if (willOpen && window.ForecasterAuth && typeof window.ForecasterAuth.closeProfileDropdown === 'function') {
      window.ForecasterAuth.closeProfileDropdown();
    }

    menu.classList.toggle('hidden', !willOpen);
    bell.setAttribute('aria-expanded', String(willOpen));
  };

  window.reviewNotification = function(event, element) {
    if (event) event.stopPropagation();
    if (!element) return;
    const signature = decodeURIComponent(element.dataset.signature || '');
    if (signature) {
      notificationReadMap[signature] = Date.now();
      saveNotificationReadState();
    }
    element.classList.add('notification-read');
    element.classList.add('opacity-60');
    window.syncNotificationUnreadBadge();
  };

  window.markAllNotificationsRead = function(event) {
    if (event) event.stopPropagation();
    const now = Date.now();
    document.querySelectorAll('#notification-list .notification-item').forEach(element => {
      const signature = decodeURIComponent(element.dataset.signature || '');
      if (signature) notificationReadMap[signature] = now;
      element.classList.add('notification-read');
      element.classList.add('opacity-60');
    });
    saveNotificationReadState();
    window.syncNotificationUnreadBadge();
  };

  window.clearAllReadNotifications = function(event) {
    if (event) event.stopPropagation();
    const now = Date.now();
    for (const sig of Object.keys(notificationReadMap)) {
      notificationReadMap[sig] = now - SEVEN_DAYS_MS - 1000;
    }
    saveNotificationReadState();
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
    if (typeof window.triggerToast === 'function') window.triggerToast('Read notifications cleared.', 'info');
  };

  window.syncNotificationUnreadBadge = function() {
    const badge = document.getElementById('notification-unread-badge');
    const list = document.getElementById('notification-list');
    if (!badge || !list) return;
    const unread = list.querySelectorAll('.notification-item:not(.notification-read)').length;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.toggle('hidden', unread === 0);

    document.querySelectorAll('.mobile-unread-notif-count').forEach(el => {
      el.textContent = unread > 99 ? '99+' : String(unread);
    });
  };

  function renderNotificationCenter(alertHTML) {
    const list = document.getElementById('notification-list');
    const badge = document.getElementById('notification-unread-badge');
    if (!list || !badge) return;

    if (!alertHTML || !alertHTML.length) {
      list.innerHTML = '<div class="text-center py-8 text-xs font-semibold text-slate-400">No active notifications.</div>';
      badge.classList.add('hidden');
      badge.textContent = '0';
      document.querySelectorAll('.mobile-unread-notif-count').forEach(el => el.textContent = '0');
      return;
    }

    const now = Date.now();

    // 1. Remove notifications that were marked as read more than 7 days ago
    const activeAlerts = alertHTML.filter(html => {
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const title = temp.querySelector('h5')?.innerText?.trim() || temp.querySelector('.font-extrabold')?.innerText?.trim() || 'System Alert';
      const desc = temp.querySelector('p')?.innerText?.trim() || temp.querySelector('.font-medium')?.innerText?.trim() || temp.innerText?.slice(0, 90) || '';
      const signature = `${title}::${desc}`;

      const readAt = notificationReadMap[signature];
      if (readAt) {
        const elapsed = now - readAt;
        if (elapsed >= SEVEN_DAYS_MS) {
          // Remove notification after 7 days from read date
          delete notificationReadMap[signature];
          return false;
        }
      }
      return true;
    });

    saveNotificationReadState();

    if (!activeAlerts.length) {
      list.innerHTML = '<div class="text-center py-8 text-xs font-semibold text-slate-400">All caught up! No active notifications.</div>';
      badge.classList.add('hidden');
      badge.textContent = '0';
      document.querySelectorAll('.mobile-unread-notif-count').forEach(el => el.textContent = '0');
      return;
    }

    let unreadCount = 0;
    list.innerHTML = activeAlerts.map(html => {
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const title = temp.querySelector('h5')?.innerText?.trim() || temp.querySelector('.font-extrabold')?.innerText?.trim() || 'System Alert';
      const desc = temp.querySelector('p')?.innerText?.trim() || temp.querySelector('.font-medium')?.innerText?.trim() || temp.innerText?.slice(0, 90) || '';
      const signature = `${title}::${desc}`;
      const readAt = notificationReadMap[signature];
      const isRead = !!readAt;
      if (!isRead) unreadCount++;

      let readMeta = '';
      if (isRead) {
        const daysLeft = Math.max(1, Math.ceil((SEVEN_DAYS_MS - (now - readAt)) / (24 * 60 * 60 * 1000)));
        readMeta = `<span class="text-[9px] text-slate-400 font-medium">✓ Read · auto-removes in ${daysLeft}d</span>`;
      } else {
        readMeta = `<span class="inline-flex items-center gap-1 text-[9px] text-blue-600 dark:text-blue-400 font-bold"><span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span> New Alert</span>`;
      }

      return `
        <div class="notification-item ${isRead ? 'notification-read opacity-65 bg-slate-50/80 dark:bg-slate-700/40' : 'bg-slate-50 dark:bg-slate-700/70 border-l-4 border-blue-500'} p-3 rounded-xl transition hover:shadow-sm cursor-pointer" data-signature="${encodeURIComponent(signature)}" onclick="reviewNotification(event, this)">
          <div class="flex items-center justify-between pb-1 mb-1 border-b border-slate-200/50 dark:border-slate-600/50">
            ${readMeta}
            <span class="text-[9px] text-slate-400 font-semibold">${isRead ? 'Marked Read' : 'Tap to mark read'}</span>
          </div>
          ${html}
        </div>
      `;
    }).join('');

    badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    badge.classList.toggle('hidden', unreadCount === 0);

    document.querySelectorAll('.mobile-unread-notif-count').forEach(el => {
      el.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    });
  }

  document.addEventListener('click', function(event) {
    const center = document.getElementById('notification-center');
    const menu = document.getElementById('notification-dropdown');
    const bell = document.getElementById('notification-bell-btn');
    if (!center || !menu || !bell) return;
    if (!center.contains(event.target)) {
      menu.classList.add('hidden');
      bell.setAttribute('aria-expanded', 'false');
    }
  });

  /* -------------------------------------------------------------------------
   * 5. SPENDING LAST 7 DAYS WIDGET
   * ------------------------------------------------------------------------- */
  let spend7dChartInstance = null;

  window.renderSpend7DaysWidget = function() {
    const canvas = document.getElementById('spend7dChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    const dayKey = d => d.toISOString().split('T')[0];
    const dayLabel = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const dailyExpense = days.map(d => {
      const key = dayKey(d);
      return (window.transactions || [])
        .filter(t => t.type === 'expense' && t.date === key)
        .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    });

    const totalExpense7d = dailyExpense.reduce((s, v) => s + v, 0);
    const totalIncome7d = days.reduce((sum, d) => {
      const key = dayKey(d);
      return sum + (window.transactions || [])
        .filter(t => t.type === 'income' && t.date === key)
        .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    }, 0);

    const totalEl = document.getElementById('spend7d-total');
    const incomeEl = document.getElementById('spend7d-income-pill');
    const expenseEl = document.getElementById('spend7d-expense-pill');
    const startEl = document.getElementById('spend7d-date-start');
    const endEl = document.getElementById('spend7d-date-end');

    if (totalEl) totalEl.innerText = `EGP ${totalExpense7d.toFixed(2)}`;
    if (incomeEl) incomeEl.innerText = `EGP ${totalIncome7d.toFixed(2)}`;
    if (expenseEl) expenseEl.innerText = `EGP ${totalExpense7d.toFixed(2)}`;
    if (startEl) startEl.innerText = dayLabel(days[0]);
    if (endEl) endEl.innerText = dayLabel(days[days.length - 1]);

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 160);
    gradient.addColorStop(0, 'rgba(244, 63, 94, 0.35)');
    gradient.addColorStop(1, 'rgba(244, 63, 94, 0)');

    if (spend7dChartInstance) spend7dChartInstance.destroy();

    spend7dChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: days.map(dayLabel),
        datasets: [{
          data: dailyExpense,
          borderColor: '#f43f5e',
          backgroundColor: gradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.45,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#f43f5e'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          x: { display: false, grid: { display: false } },
          y: { display: false, grid: { display: false }, beginAtZero: true }
        },
        interaction: { intersect: false, mode: 'index' }
      }
    });
  };

  /* -------------------------------------------------------------------------
   * 6. DASHBOARD PAYMENT ACCOUNTS ANALYSIS DOUGHNUT CHART
   * ------------------------------------------------------------------------- */
  let dashboardAccountsChartInstance = null;

  window.accountIcon = function(type) {
    if (type === 'card' || type === 'credit' || type === 'bank') return '💳';
    if (type === 'wallet') return '📱';
    if (type === 'cash') return '💵';
    return '🏦';
  };

  window.renderDashboardAccountsAnalysis = function() {
    const tbody = document.getElementById('dashboard-accounts-table-body');
    const canvas = document.getElementById('dashboardAccountsChart');
    if (!tbody) return;

    const data = (window.accounts || []).map(acc => {
      const income = (window.transactions || []).filter(t => t.type === 'income' && t.accountId === acc.id).reduce((s, t) => s + parseFloat(t.amount || 0), 0);
      const expense = (window.transactions || []).filter(t => t.type === 'expense' && t.accountId === acc.id).reduce((s, t) => s + parseFloat(t.amount || 0), 0);
      const transfersIn = (window.accountTransfers || []).filter(tr => tr.toId === acc.id).reduce((s, tr) => s + parseFloat(tr.amount || 0), 0);
      const transfersOut = (window.accountTransfers || []).filter(tr => tr.fromId === acc.id).reduce((s, tr) => s + parseFloat(tr.amount || 0), 0);
      const netBalance = income - expense + transfersIn - transfersOut;
      return { acc, income, expense, transfersIn, transfersOut, netBalance };
    });

    tbody.innerHTML = data.map(d => `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800 transition">
        <td class="py-2 px-2 font-semibold text-slate-900 dark:text-white">${window.accountIcon(d.acc.type)} ${d.acc.label}</td>
        <td class="py-2 px-2 text-right text-emerald-700 dark:text-emerald-400 font-bold">EGP ${d.income.toFixed(2)}</td>
        <td class="py-2 px-2 text-right text-rose-600 dark:text-rose-400 font-bold">EGP ${d.expense.toFixed(2)}</td>
        <td class="py-2 px-2 text-right text-indigo-700 dark:text-indigo-400 font-bold">+${d.transfersIn.toFixed(0)} / -${d.transfersOut.toFixed(0)}</td>
        <td class="py-2 px-2 text-right font-extrabold ${d.netBalance < 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}">EGP ${d.netBalance.toFixed(2)}</td>
      </tr>
    `).join('') || `<tr><td colspan="5" class="py-6 text-center text-slate-404 font-semibold">No accounts registered yet.</td></tr>`;

    if (!canvas || typeof Chart === 'undefined') return;
    const chartData = data.filter(d => d.expense > 0);
    const labels = chartData.map(d => d.acc.label);
    const values = chartData.map(d => d.expense);

    if (dashboardAccountsChartInstance) dashboardAccountsChartInstance.destroy();
    if (!labels.length) return;

    dashboardAccountsChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: ['#2563eb', '#f43f5e', '#10b981', '#f59e0b', '#6366f1', '#0ea5e9', '#a855f7', '#84cc16']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9 } } } }
      }
    });
  };

  /* -------------------------------------------------------------------------
   * PAYMENT ACCOUNTS CONTROLLER & REPOSITORY ENGINE
   * ------------------------------------------------------------------------- */
  const EGYPT_BANKS = [
    'National Bank of Egypt (NBE)',
    'Banque Misr',
    'Commercial International Bank (CIB)',
    'Banque du Caire',
    'QNB Alahli',
    'Alex Bank',
    'Faisal Islamic Bank',
    'Arab African International Bank (AAIB)',
    'HSBC Egypt',
    'Emirates NBD',
    'Abu Dhabi Islamic Bank (ADIB)',
    'Credit Agricole Egypt',
    'Other'
  ];

  const WALLET_TELECOM_PROVIDERS = [
    'Vodafone Cash',
    'Orange Money',
    'Etisalat Cash',
    'WE Pay',
    'Other'
  ];

  const WALLET_BANK_PROVIDERS = [
    'Instapay / IPN',
    'Smart Wallet (CIB)',
    'BM Wallet (Banque Misr)',
    'Al Ahly Phone Cash (NBE)',
    'QNB Wallet',
    'Other'
  ];

  const TRANSFER_METHODS = [
    'Instapay',
    'ATM Cash Deposit',
    'ATM Cash Withdrawal',
    'Bank ACH / Wire Transfer',
    'Mobile Wallet Transfer',
    'Cash Hand-to-Hand'
  ];

  let editingAccountId = null;

  window.toggleAccountTypeFields = function() {
    const typeSelect = document.getElementById('account-type');
    const cardFields = document.getElementById('account-card-fields');
    const walletFields = document.getElementById('account-wallet-fields');
    if (!typeSelect) return;

    const val = typeSelect.value;
    if (cardFields) cardFields.classList.toggle('hidden', val !== 'card');
    if (walletFields) walletFields.classList.toggle('hidden', val !== 'wallet');
  };

  window.toggleCardBankOtherField = function() {
    const bankSelect = document.getElementById('account-card-bank');
    const otherInput = document.getElementById('account-card-bank-other');
    if (bankSelect && otherInput) {
      otherInput.classList.toggle('hidden', bankSelect.value !== 'Other');
    }
  };

  window.toggleWalletProviderOptions = function() {
    const kindSelect = document.getElementById('account-wallet-kind');
    const providerSelect = document.getElementById('account-wallet-provider');
    if (!kindSelect || !providerSelect) return;

    const isBank = kindSelect.value === 'Bank';
    const list = isBank ? WALLET_BANK_PROVIDERS : WALLET_TELECOM_PROVIDERS;
    providerSelect.innerHTML = list.map(p => `<option value="${p}">${p}</option>`).join('');
    window.toggleWalletProviderOtherField();
  };

  window.toggleWalletProviderOtherField = function() {
    const providerSelect = document.getElementById('account-wallet-provider');
    const otherInput = document.getElementById('account-wallet-provider-other');
    if (providerSelect && otherInput) {
      otherInput.classList.toggle('hidden', providerSelect.value !== 'Other');
    }
  };

  window.populateAccountBankAndProviderOptions = function() {
    const bankSelect = document.getElementById('account-card-bank');
    if (bankSelect && bankSelect.options.length === 0) {
      bankSelect.innerHTML = EGYPT_BANKS.map(b => `<option value="${b}">${b}</option>`).join('');
    }

    const walletProviderSelect = document.getElementById('account-wallet-provider');
    if (walletProviderSelect && walletProviderSelect.options.length === 0) {
      window.toggleWalletProviderOptions();
    }

    const transferMethodSelect = document.getElementById('form-transfer-method');
    if (transferMethodSelect && transferMethodSelect.options.length === 0) {
      transferMethodSelect.innerHTML = TRANSFER_METHODS.map(m => `<option value="${m}">${m}</option>`).join('');
      transferMethodSelect.addEventListener('change', () => {
        const feeWrap = document.getElementById('form-transfer-instapay-fee-wrap');
        if (feeWrap) feeWrap.classList.toggle('hidden', transferMethodSelect.value !== 'Instapay');
      });
    }
  };

  window.handleAddAccountSubmit = function(e) {
    if (e) e.preventDefault();
    const type = document.getElementById('account-type')?.value || 'cash';
    const nickname = (document.getElementById('account-nickname')?.value || '').trim();

    let network = '';
    let mode = '';
    let bank = '';
    let kind = '';
    let provider = '';
    let autoLabel = '';

    if (type === 'card') {
      network = document.getElementById('account-card-network')?.value || 'Visa';
      mode = document.getElementById('account-card-mode')?.value || 'Debit';
      bank = document.getElementById('account-card-bank')?.value || 'Bank';
      if (bank === 'Other') {
        bank = (document.getElementById('account-card-bank-other')?.value || '').trim() || 'Bank';
      }
      autoLabel = `${bank} ${network} (${mode})`;
    } else if (type === 'wallet') {
      kind = document.getElementById('account-wallet-kind')?.value || 'Telecom';
      provider = document.getElementById('account-wallet-provider')?.value || 'Wallet';
      if (provider === 'Other') {
        provider = (document.getElementById('account-wallet-provider-other')?.value || '').trim() || 'Wallet';
      }
      autoLabel = `${provider} (${kind})`;
    } else if (type === 'cash') {
      autoLabel = 'Cash Wallet';
    } else {
      autoLabel = 'General Account';
    }

    const label = nickname || autoLabel;

    if (!Array.isArray(window.accounts)) window.accounts = [];

    if (editingAccountId) {
      const idx = window.accounts.findIndex(a => a.id === editingAccountId);
      if (idx !== -1) {
        window.accounts[idx] = {
          ...window.accounts[idx],
          type,
          label,
          nickname,
          network,
          mode,
          bank,
          kind,
          provider,
          updatedAt: new Date().toISOString()
        };
        if (typeof window.triggerToast === 'function') window.triggerToast('Payment account updated.', 'success');
      }
      editingAccountId = null;
      const submitBtn = document.querySelector('#account-form button[type="submit"]');
      if (submitBtn) submitBtn.textContent = 'Add Account';
      const cancelBtn = document.getElementById('account-edit-cancel-btn');
      if (cancelBtn) cancelBtn.classList.add('hidden');
    } else {
      const newAcc = {
        id: 'acc_' + Date.now(),
        type,
        label,
        nickname,
        network,
        mode,
        bank,
        kind,
        provider,
        initialBalance: 0,
        createdAt: new Date().toISOString()
      };
      window.accounts.push(newAcc);
      if (typeof window.triggerToast === 'function') window.triggerToast(`Payment account "${label}" created.`, 'success');
    }

    window.saveAccountsDatabase();
    document.getElementById('account-form')?.reset();
    window.toggleAccountTypeFields();
    window.renderAccountsView();
    window.populateAccountSelects();
    window.renderDashboardAccountsAnalysis();
  };

  window.editAccount = function(id, evt) {
    if (evt) {
      if (typeof evt.preventDefault === 'function') evt.preventDefault();
      if (typeof evt.stopPropagation === 'function') evt.stopPropagation();
    } else if (typeof window !== 'undefined' && window.event) {
      if (typeof window.event.preventDefault === 'function') window.event.preventDefault();
      if (typeof window.event.stopPropagation === 'function') window.event.stopPropagation();
    }

    const acc = (window.accounts || []).find(a => a.id === id);
    if (!acc) return;

    editingAccountId = id;

    // Populate form fields
    const typeSelect = document.getElementById('account-type');
    if (typeSelect) {
      typeSelect.value = acc.type || 'cash';
      window.toggleAccountTypeFields();
    }

    if (acc.type === 'card') {
      const net = document.getElementById('account-card-network');
      if (net && acc.network) net.value = acc.network;

      const mode = document.getElementById('account-card-mode');
      if (mode && acc.mode) mode.value = acc.mode;

      const bank = document.getElementById('account-card-bank');
      const bankOther = document.getElementById('account-card-bank-other');
      if (bank && acc.bank) {
        const optionExists = Array.from(bank.options).some(o => o.value === acc.bank);
        if (optionExists) {
          bank.value = acc.bank;
          if (bankOther) bankOther.classList.add('hidden');
        } else {
          bank.value = 'Other';
          if (bankOther) {
            bankOther.value = acc.bank;
            bankOther.classList.remove('hidden');
          }
        }
      }
    } else if (acc.type === 'wallet') {
      const kind = document.getElementById('account-wallet-kind');
      if (kind && acc.kind) {
        kind.value = acc.kind;
        window.toggleWalletProviderOptions();
      }

      const prov = document.getElementById('account-wallet-provider');
      const provOther = document.getElementById('account-wallet-provider-other');
      if (prov && acc.provider) {
        const optionExists = Array.from(prov.options).some(o => o.value === acc.provider);
        if (optionExists) {
          prov.value = acc.provider;
          if (provOther) provOther.classList.add('hidden');
        } else {
          prov.value = 'Other';
          if (provOther) {
            provOther.value = acc.provider;
            provOther.classList.remove('hidden');
          }
        }
      }
    }

    const nick = document.getElementById('account-nickname');
    if (nick) nick.value = acc.nickname || '';

    const submitBtn = document.querySelector('#account-form button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Save Changes';

    const cancelBtn = document.getElementById('account-edit-cancel-btn');
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    document.getElementById('account-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof window.triggerToast === 'function') {
      window.triggerToast(`Editing account: ${acc.label}`, 'info');
    }
  };

  window.cancelAccountEdit = function() {
    editingAccountId = null;
    document.getElementById('account-form')?.reset();
    window.toggleAccountTypeFields();
    const submitBtn = document.querySelector('#account-form button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Add Account';
    const cancelBtn = document.getElementById('account-edit-cancel-btn');
    if (cancelBtn) cancelBtn.classList.add('hidden');
  };

  window.deleteAccount = function(id, evt) {
    if (evt) {
      if (typeof evt.preventDefault === 'function') evt.preventDefault();
      if (typeof evt.stopPropagation === 'function') evt.stopPropagation();
    } else if (typeof window !== 'undefined' && window.event) {
      if (typeof window.event.preventDefault === 'function') window.event.preventDefault();
      if (typeof window.event.stopPropagation === 'function') window.event.stopPropagation();
    }

    const acc = (window.accounts || []).find(a => a.id === id);
    if (!acc) return;

    const txnCount = (window.transactions || []).filter(t => t.accountId === id).length;
    const transferCount = (window.accountTransfers || []).filter(tr => tr.fromId === id || tr.toId === id).length;

    let confirmMsg = `Delete payment account "${acc.label}"?`;
    if (txnCount > 0 || transferCount > 0) {
      confirmMsg += `\n\nNotice: This account is referenced in ${txnCount} transaction(s) and ${transferCount} transfer(s).`;
    }

    const confirmed = confirm(confirmMsg);
    if (!confirmed) return;

    window.accounts = (window.accounts || []).filter(a => a.id !== id);

    if (Array.isArray(window.transactions)) {
      window.transactions.forEach(t => {
        if (t.accountId === id) t.accountId = '';
      });
      window.saveTransactionsDatabase();
    }

    window.saveAccountsDatabase();

    const vaultId = (window.ForecasterCloudSync && typeof window.ForecasterCloudSync.getVaultId === 'function')
      ? window.ForecasterCloudSync.getVaultId()
      : 'shared-main-vault';

    const token = (window.ForecasterAuth && typeof window.ForecasterAuth.getToken === 'function')
      ? window.ForecasterAuth.getToken()
      : (localStorage.getItem('forecaster_auth_token') || '');

    fetch(`/api/cloud-sync/accounts/${encodeURIComponent(id)}?vaultId=${encodeURIComponent(vaultId)}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      }
    }).catch(() => {});

    if (editingAccountId === id) {
      window.cancelAccountEdit();
    }

    if (typeof window.triggerToast === 'function') {
      window.triggerToast(`Payment account "${acc.label}" deleted.`, 'info');
    }

    window.renderAccountsView();
    window.populateAccountSelects();
    window.renderDashboardAccountsAnalysis();
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  window.deleteAccountTransfer = function(id) {
    const tr = (window.accountTransfers || []).find(t => t.id === id);
    if (!tr) return;

    const sure = confirm(`Delete transfer of EGP ${parseFloat(tr.amount || 0).toFixed(2)} from ${tr.fromLabel || tr.fromId} to ${tr.toLabel || tr.toId}?`);
    if (!sure) return;

    window.accountTransfers = (window.accountTransfers || []).filter(t => t.id !== id);
    window.saveAccountsDatabase();
    if (typeof window.triggerToast === 'function') window.triggerToast('Transfer entry deleted.', 'info');

    window.renderAccountsView();
    window.renderDashboardAccountsAnalysis();
  };

  window.renderAccountsView = function() {
    const cardsContainer = document.getElementById('accounts-list-cards');
    const transfersContainer = document.getElementById('account-transfers-list');
    if (!cardsContainer) return;

    const accounts = Array.isArray(window.accounts) ? window.accounts : [];

    if (accounts.length === 0) {
      cardsContainer.innerHTML = `
        <div class="md:col-span-2 border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 rounded-2xl text-center space-y-2">
          <span class="text-3xl">💳</span>
          <h4 class="text-sm font-bold text-slate-800 dark:text-slate-200">No Payment Accounts Registered Yet</h4>
          <p class="text-xs text-slate-404 max-w-sm mx-auto">Register bank cards, cash wallets, or mobile wallets (Vodafone Cash, Instapay) on the left to track multi-account balances.</p>
        </div>
      `;
    } else {
      cardsContainer.innerHTML = accounts.map(acc => {
        const income = (window.transactions || []).filter(t => t.type === 'income' && t.accountId === acc.id).reduce((s, t) => s + parseFloat(t.amount || 0), 0);
        const expense = (window.transactions || []).filter(t => t.type === 'expense' && t.accountId === acc.id).reduce((s, t) => s + parseFloat(t.amount || 0), 0);
        const transfersIn = (window.accountTransfers || []).filter(tr => tr.toId === acc.id).reduce((s, tr) => s + parseFloat(tr.amount || 0), 0);
        const transfersOut = (window.accountTransfers || []).filter(tr => tr.fromId === acc.id).reduce((s, tr) => s + parseFloat(tr.amount || 0), 0);
        const netBalance = (acc.initialBalance || 0) + income - expense + transfersIn - transfersOut;

        const subdetail = acc.type === 'card'
          ? `${acc.bank || 'Bank'} • ${acc.network || 'Visa'} ${acc.mode || 'Card'}`
          : (acc.type === 'wallet' ? `${acc.provider || 'Wallet'} • ${acc.kind || 'Telecom'}` : (acc.type === 'cash' ? 'Physical Cash Reserve' : 'General Ledger Account'));

        return `
          <div class="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 p-5 rounded-2xl shadow-sm hover:shadow transition space-y-3 relative overflow-hidden">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2.5">
                <span class="text-2xl">${window.accountIcon(acc.type)}</span>
                <div>
                  <h3 class="font-bold text-sm text-slate-900 dark:text-white leading-tight">${acc.label}</h3>
                  <p class="text-[10px] font-semibold text-slate-404 uppercase tracking-wider">${subdetail}</p>
                </div>
              </div>
              <div class="flex items-center gap-1">
                <button type="button" onclick="window.editAccount('${acc.id}', event)" class="px-2 py-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-lg transition flex items-center gap-1 cursor-pointer" title="Edit Account">
                  <span>✏️</span> Edit
                </button>
                <button type="button" onclick="window.deleteAccount('${acc.id}', event)" class="px-2 py-1 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition flex items-center gap-1 cursor-pointer" title="Delete Account">
                  <span>🗑️</span> Delete
                </button>
              </div>
            </div>

            <div class="pt-2 border-t border-slate-200/70 dark:border-slate-700/60 flex items-end justify-between">
              <div>
                <span class="text-[10px] font-bold text-slate-404 uppercase">Current Balance</span>
                <p class="text-lg font-black ${netBalance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}">EGP ${netBalance.toFixed(2)}</p>
              </div>
              <div class="text-right text-[10px] space-y-0.5">
                <p class="text-emerald-600 dark:text-emerald-400 font-bold">+EGP ${income.toFixed(0)} in</p>
                <p class="text-rose-600 dark:text-rose-400 font-bold">-EGP ${expense.toFixed(0)} out</p>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    if (transfersContainer) {
      const transfers = Array.isArray(window.accountTransfers) ? window.accountTransfers : [];
      if (transfers.length === 0) {
        transfersContainer.innerHTML = `
          <div class="text-center py-8 text-xs font-semibold text-slate-404 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            No inter-account transfers recorded yet. Use the "Transfer" tab in Log New Transaction to move funds between accounts.
          </div>
        `;
      } else {
        transfersContainer.innerHTML = transfers.map(tr => `
          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-xs">
            <div class="flex items-center gap-3">
              <span class="text-lg">🔁</span>
              <div>
                <div class="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>${tr.fromLabel || tr.fromId}</span>
                  <span class="text-slate-400">➜</span>
                  <span class="text-blue-600 dark:text-blue-400 font-extrabold">${tr.toLabel || tr.toId}</span>
                </div>
                <div class="text-[10px] text-slate-404 font-semibold mt-0.5 flex items-center gap-2">
                  <span>📅 ${tr.date || 'N/A'}</span>
                  <span>• Method: ${tr.method || 'Transfer'}</span>
                  ${tr.fee > 0 ? `<span class="text-amber-600 font-bold">(Fee: EGP ${parseFloat(tr.fee).toFixed(2)})</span>` : ''}
                  ${tr.notes ? `<span>• "${tr.notes}"</span>` : ''}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-sm font-black text-indigo-600 dark:text-indigo-400">EGP ${parseFloat(tr.amount || 0).toFixed(2)}</span>
              <button type="button" onclick="window.deleteAccountTransfer('${tr.id}')" class="text-slate-400 hover:text-rose-600 p-1" title="Delete Transfer">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </div>
        `).join('');
      }
    }
  };

  window.populateAccountSelects = function() {
    const selects = document.querySelectorAll('.payment-account-select');
    const accounts = Array.isArray(window.accounts) ? window.accounts : [];

    selects.forEach(sel => {
      const currentVal = sel.value;
      let optionsHTML = '';

      if (sel.id === 'form-transfer-from' || sel.id === 'form-transfer-to') {
        optionsHTML = accounts.map(a => `<option value="${a.id}">${window.accountIcon(a.type)} ${a.label}</option>`).join('');
      } else {
        optionsHTML = accounts.map(a => `<option value="${a.id}">${window.accountIcon(a.type)} ${a.label}</option>`).join('');
      }

      sel.innerHTML = optionsHTML || `<option value="">No Accounts Registered</option>`;
      if (currentVal && accounts.some(a => a.id === currentVal)) {
        sel.value = currentVal;
      } else if (sel.id === 'form-transfer-to' && accounts.length > 1) {
        sel.value = accounts[1].id;
      }
    });
  };

  window.populateAccountFilterSelect = function() {
    const filterSel = document.getElementById('filter-account');
    if (!filterSel) return;
    const currentVal = filterSel.value;
    const accounts = Array.isArray(window.accounts) ? window.accounts : [];
    filterSel.innerHTML = `<option value="">All Accounts</option>` +
      accounts.map(a => `<option value="${a.id}">${window.accountIcon(a.type)} ${a.label}</option>`).join('');
    if (currentVal) filterSel.value = currentVal;
  };

  window.addEventListener('DOMContentLoaded', () => {
    window.populateAccountBankAndProviderOptions();
  });

  /* -------------------------------------------------------------------------
   * 7. MASTER RENDER HOOK - EXTENDS RENDER ALL VIEWS
   * ------------------------------------------------------------------------- */
  const originalRenderAllViews = window.renderAllViews;
  window.renderAllViews = function() {
    if (typeof originalRenderAllViews === 'function') {
      try { originalRenderAllViews(); } catch(err) { console.error(err); }
    }

    try {
      if (typeof window.populateAccountSelects === 'function') window.populateAccountSelects();
      if (typeof window.populateAccountFilterSelect === 'function') window.populateAccountFilterSelect();
      if (typeof window.renderAccountsView === 'function') window.renderAccountsView();
      if (typeof window.renderDashboardAccountsAnalysis === 'function') window.renderDashboardAccountsAnalysis();
      if (typeof window.renderSpend7DaysWidget === 'function') window.renderSpend7DaysWidget();
      if (typeof window.renderRentalManagement === 'function') window.renderRentalManagement();
      if (typeof window.renderVehicleManagement === 'function') window.renderVehicleManagement();
    } catch(err) {
      console.error('[Forecaster Modules] render error:', err);
    }

    // Merge financial alerts, immediate reorders & predictive alerts into notification center
    try {
      let combinedAlerts = [];
      const alertsSource = document.getElementById('alerts-container');
      if (alertsSource && alertsSource.children) {
        const financialAlerts = Array.from(alertsSource.children)
          .filter(child => child && (child.querySelector('h5')?.innerText || '').trim() !== 'All calculations on track')
          .map(child => child.outerHTML);
        combinedAlerts = combinedAlerts.concat(financialAlerts);
      }

      if (typeof window.getImmediateReordersAndPredictiveAlerts === 'function') {
        const reorderAlerts = window.getImmediateReordersAndPredictiveAlerts();
        combinedAlerts = combinedAlerts.concat(reorderAlerts);
      }

      renderNotificationCenter(combinedAlerts);
    } catch(err) {
      console.warn('[Forecaster Modules] alerts extraction error:', err);
    }
  };

  window.addEventListener('DOMContentLoaded', () => {
    loadNotificationReadState();
    window.syncChartDefaultsToTheme();
  });
})();
