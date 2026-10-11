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
    if (typeof Chart === 'undefined') return;
    const isDark = document.documentElement.classList.contains('dark');
    Chart.defaults.color = isDark ? '#94a3b8' : '#64748b';
    Chart.defaults.borderColor = isDark ? '#334155' : '#e2e8f0';
  };

  window.toggleDarkMode = function() {
    const isDark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('pro_theme', isDark ? 'dark' : 'light'); } catch (err) {}
    
    // Update theme toggle icon
    const moonIcon = document.querySelector('#theme-toggle-btn .moon-icon');
    const sunIcon = document.querySelector('#theme-toggle-btn .sun-icon');
    if (moonIcon && sunIcon) {
      moonIcon.classList.toggle('hidden', isDark);
      sunIcon.classList.toggle('hidden', !isDark);
    }

    window.syncChartDefaultsToTheme();
    if (typeof window.renderAllViews === 'function') {
      window.renderAllViews();
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
   * 4. NOTIFICATION CENTER SYSTEM
   * ------------------------------------------------------------------------- */
  const NOTIFICATION_READ_KEY = 'pro_notification_read_signatures';
  let notificationReadSignatures = new Set();

  function loadNotificationReadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(NOTIFICATION_READ_KEY) || '[]');
      notificationReadSignatures = new Set(Array.isArray(stored) ? stored : []);
    } catch (err) {
      notificationReadSignatures = new Set();
    }
  }

  function saveNotificationReadState() {
    try {
      localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify(Array.from(notificationReadSignatures)));
    } catch (err) {}
  }

  window.toggleNotificationCenter = function(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('notification-dropdown');
    const bell = document.getElementById('notification-bell-btn');
    if (!menu || !bell) return;
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !willOpen);
    bell.setAttribute('aria-expanded', String(willOpen));
  };

  window.reviewNotification = function(event, element) {
    if (event) event.stopPropagation();
    if (!element) return;
    const signature = decodeURIComponent(element.dataset.signature || '');
    if (signature) {
      notificationReadSignatures.add(signature);
      saveNotificationReadState();
    }
    element.classList.add('notification-read');
    window.syncNotificationUnreadBadge();
  };

  window.markAllNotificationsRead = function(event) {
    if (event) event.stopPropagation();
    document.querySelectorAll('#notification-list .notification-item').forEach(element => {
      const signature = decodeURIComponent(element.dataset.signature || '');
      if (signature) notificationReadSignatures.add(signature);
      element.classList.add('notification-read');
    });
    saveNotificationReadState();
    window.syncNotificationUnreadBadge();
  };

  window.syncNotificationUnreadBadge = function() {
    const badge = document.getElementById('notification-unread-badge');
    const list = document.getElementById('notification-list');
    if (!badge || !list) return;
    const unread = list.querySelectorAll('.notification-item:not(.notification-read)').length;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.toggle('hidden', unread === 0);
  };

  function renderNotificationCenter(alertHTML) {
    const list = document.getElementById('notification-list');
    const badge = document.getElementById('notification-unread-badge');
    if (!list || !badge) return;

    if (!alertHTML || !alertHTML.length) {
      list.innerHTML = '<div class="text-center py-8 text-xs font-semibold text-slate-404">No active notifications.</div>';
      badge.classList.add('hidden');
      badge.textContent = '0';
      return;
    }

    let unreadCount = 0;
    list.innerHTML = alertHTML.map(html => {
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const title = temp.querySelector('h5')?.innerText?.trim() || '';
      const desc = temp.querySelector('p')?.innerText?.trim() || '';
      const signature = `${title}::${desc}`;
      const isRead = notificationReadSignatures.has(signature);
      if (!isRead) unreadCount++;
      return `<div class="notification-item ${isRead ? 'notification-read opacity-60' : ''} p-2 rounded-xl bg-slate-50 dark:bg-slate-700/50 mb-1 cursor-pointer" data-signature="${encodeURIComponent(signature)}" onclick="reviewNotification(event, this)">${html}</div>`;
    }).join('');

    badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    badge.classList.toggle('hidden', unreadCount === 0);
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

    // Redirect alerts to notification center
    const alertsSource = document.getElementById('alerts-container');
    if (alertsSource) {
      const alertHTML = Array.from(alertsSource.children)
        .filter(child => (child.querySelector('h5')?.innerText || '').trim() !== 'All calculations on track')
        .map(child => child.outerHTML);
      renderNotificationCenter(alertHTML);
    }
  };

  window.addEventListener('DOMContentLoaded', () => {
    loadNotificationReadState();
    window.syncChartDefaultsToTheme();
  });
})();
