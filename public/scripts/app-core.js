/**
 * ============================================================================
 * FORECASTER PRO - CORE APPLICATION ENGINE & DATA STORES
 * Enterprise-grade state, calculations, transaction audit, stock & pharmacy
 * ============================================================================
 */
(function() {
  'use strict';

  // Core Data Stores
  window.transactions = [];
  window.stockData = [];
  window.pharmacyData = [];

  // Filter drawer state
  window.drawers = { transaction: false, accounts: false };

  // Subordinate editing logs
  window.activeEditingStockLogs = [];
  window.activeEditingStockUnit = 'units';
  window.activeEditingPharmacyLogs = [];
  window.activeEditingPharmacyUnit = 'pills';

  // Collapsible groups
  window.expandedMedGroups = {};
  window.expandedStockGroups = {};

  // Insights state
  window.activeInsightId = 'spending';
  window.customCashReserve = 5000;

  // Budget Limits
  window.budgetLimits = {
    income: 3500,
    expense: 2000
  };

  window.performanceChartInstance = null;

  window.incomeAllocationBlueprint = {
    "Salary": { pct: 70, color: "#10b981" },
    "Freelance": { pct: 15, color: "#06b6d4" },
    "Investments": { pct: 10, color: "#8b5cf6" },
    "Gifts": { pct: 3, color: "#ec4899" },
    "Others": { pct: 2, color: "#64748b" }
  };

  window.expenseAllocationBlueprint = {
    "Rent": { pct: 35, color: "#8b5cf6" },
    "Groceries": { pct: 15, color: "#10b981" },
    "Utilities": { pct: 10, color: "#f59e0b" },
    "Medical": { pct: 10, color: "#3b82f6" },
    "God Savings": { pct: 10, color: "#06b6d4" },
    "Tobacco": { pct: 5, color: "#64748b" },
    "Pet Supplies": { pct: 5, color: "#ec4899" },
    "Entertainment": { pct: 5, color: "#f43f5e" },
    "Others": { pct: 5, color: "#14b8a6" },
    "Transportation": { pct: 8, color: "#6366f1" },
    "Subscriptions": { pct: 3, color: "#d946ef" },
    "Education": { pct: 5, color: "#eab308" },
    "Savings / Investments": { pct: 6, color: "#0ea5e9" },
    "Fast Food / Work Meals": { pct: 4, color: "#f97316" }
  };

  /* DATABASE LOADING */
  window.loadIntegratedDatabases = function() {
    window.stockData = JSON.parse(localStorage.getItem('pro_stock') || '[]');
    window.pharmacyData = JSON.parse(localStorage.getItem('pro_pharmacy') || '[]');
    
    const savedTxns = localStorage.getItem('pro_transactions');
    if (savedTxns) {
      window.transactions = JSON.parse(savedTxns);
    } else {
      const oldExpenses = JSON.parse(localStorage.getItem('pro_expenses') || '[]');
      const oldIncome = JSON.parse(localStorage.getItem('pro_income') || '[]');
      
      oldExpenses.forEach(e => {
        window.transactions.push({
          id: e.id,
          date: e.date,
          category: e.category,
          amount: parseFloat(e.amount),
          description: e.desc || 'Legacy Expense Entry',
          type: 'expense'
        });
      });
      
      oldIncome.forEach(i => {
        window.transactions.push({
          id: i.id,
          date: i.date,
          category: i.category,
          amount: parseFloat(i.amount),
          description: i.desc || 'Legacy Income Entry',
          type: 'income'
        });
      });

      if (!Array.isArray(window.transactions)) {
        window.transactions = [];
      }
    }

    const storedLimits = localStorage.getItem('pro_budget_limits');
    if (storedLimits) {
      window.budgetLimits = JSON.parse(storedLimits);
    } else {
      window.budgetLimits = { income: 0, expense: 0 };
    }

    // Load Payment Accounts (100% clean default)
    const savedAccounts = localStorage.getItem('pro_accounts');
    if (savedAccounts) {
      try {
        window.accounts = JSON.parse(savedAccounts);
      } catch (e) {
        window.accounts = [];
      }
    } else {
      window.accounts = [];
    }
    if (!Array.isArray(window.accounts)) {
      window.accounts = [];
    }
    localStorage.setItem('pro_accounts', JSON.stringify(window.accounts));

    // Load Account Transfers
    const savedTransfers = localStorage.getItem('pro_account_transfers');
    if (savedTransfers) {
      try {
        window.accountTransfers = JSON.parse(savedTransfers);
      } catch (e) {
        window.accountTransfers = [];
      }
    } else {
      window.accountTransfers = [];
    }
  };

  window.saveTransactionsDatabase = function() {
    localStorage.setItem('pro_transactions', JSON.stringify(window.transactions));
    if (window.ForecasterCloudSync && typeof window.ForecasterCloudSync.notifyDataChanged === 'function') {
      window.ForecasterCloudSync.notifyDataChanged();
    }
  };

  window.saveAccountsDatabase = function() {
    localStorage.setItem('pro_accounts', JSON.stringify(window.accounts || []));
    localStorage.setItem('pro_account_transfers', JSON.stringify(window.accountTransfers || []));
    if (window.ForecasterCloudSync && typeof window.ForecasterCloudSync.notifyDataChanged === 'function') {
      window.ForecasterCloudSync.notifyDataChanged();
    }
  };

  /* TOAST NOTIFICATION */
  window.triggerToast = function(message, variant = "info") {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');

    if (!toast || !toastMessage || !toastIcon) return;

    toastMessage.innerText = message;
    toast.classList.remove('hidden', 'translate-y-2', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    if (variant === "success") {
      toastIcon.innerText = "🟢";
      toast.className = "fixed bottom-6 right-6 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-l-4 border-l-emerald-500 p-4 rounded-xl shadow-2xl max-w-md flex items-center gap-3 transition-all duration-300";
    } else if (variant === "error") {
      toastIcon.innerText = "🔴";
      toast.className = "fixed bottom-6 right-6 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-l-4 border-l-rose-500 p-4 rounded-xl shadow-2xl max-w-md flex items-center gap-3 transition-all duration-300";
    } else {
      toastIcon.innerText = "💡";
      toast.className = "fixed bottom-6 right-6 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-l-4 border-l-blue-500 p-4 rounded-xl shadow-2xl max-w-md flex items-center gap-3 transition-all duration-300";
    }

    setTimeout(() => {
      toast.classList.remove('translate-y-0', 'opacity-100');
      toast.classList.add('translate-y-2', 'opacity-0');
      setTimeout(() => { toast.classList.add('hidden'); }, 300);
    }, 3000);
  };

  /* VIEW NAVIGATION ROUTER */
  window.switchView = function(viewId, element) {
    if (typeof event !== 'undefined' && event) {
      try { event.preventDefault(); } catch(e) {}
    }
    const requestedStockModule = (viewId === 'pharmacy' || viewId === 'inventory' || viewId === 'spareparts') ? viewId : null;
    if (requestedStockModule) viewId = 'stock';

    const cleanId = String(viewId || 'dashboard').replace(/^view-/, '');

    // 1. Hide every single view section cleanly (isolated panel architecture)
    document.querySelectorAll('.view-section').forEach(section => {
      section.classList.remove('active');
      section.classList.add('hidden');
      section.style.display = 'none';
    });
    
    // 2. Show requested view section
    const activeView = document.getElementById('view-' + cleanId);
    if (activeView) {
      activeView.classList.remove('hidden');
      activeView.classList.add('active');
      activeView.style.display = 'block';
    } else {
      console.warn('[Forecaster] View section not found for id: view-' + cleanId);
      const fallback = document.getElementById('view-dashboard');
      if (fallback) {
        fallback.classList.remove('hidden');
        fallback.classList.add('active');
        fallback.style.display = 'block';
      }
    }
    
    // 3. Update desktop nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
      link.classList.add('text-slate-700', 'dark:text-slate-300');
    });
    
    let activeLink = element;
    if (!activeLink || !activeLink.classList || !activeLink.classList.contains('nav-link')) {
      activeLink = document.querySelector(`.nav-link[onclick*="'${cleanId}'"]`) ||
                   document.querySelector(`.nav-link[onclick*='"${cleanId}"']`);
    }
    if (activeLink) {
      activeLink.classList.remove('text-slate-700', 'dark:text-slate-300');
      activeLink.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
    }

    // 4. Sync mobile bottom nav items if present
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
      const targetView = btn.getAttribute('data-target-view');
      if (targetView === cleanId) {
        btn.classList.add('text-blue-600', 'dark:text-blue-400');
        btn.classList.remove('text-slate-500', 'dark:text-slate-400');
      } else {
        btn.classList.remove('text-blue-600', 'dark:text-blue-400');
        btn.classList.add('text-slate-500', 'dark:text-slate-400');
      }
    });

    // 5. Close mobile drawer if open
    if (typeof window.toggleMobileDrawer === 'function') {
      window.toggleMobileDrawer(false);
    } else {
      const drawer = document.getElementById('mobile-more-drawer');
      if (drawer && !drawer.classList.contains('hidden')) {
        drawer.classList.add('hidden');
      }
    }

    // 6. Scroll to top safely
    try { window.scrollTo(0, 0); } catch(e) {}

    // 7. Render views safely
    try {
      if (typeof window.renderAllViews === 'function') {
        window.renderAllViews();
      }
    } catch(err) {
      console.error('[Forecaster] renderAllViews error during switchView:', err);
    }

    if (requestedStockModule && typeof window.setStockPharmacyModule === 'function') {
      try {
        window.setStockPharmacyModule(requestedStockModule);
      } catch(err) {
        console.error('[Forecaster] setStockPharmacyModule error during switchView:', err);
      }
    }

    setTimeout(() => {
      try {
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
          lucide.createIcons();
        }
      } catch(e) {}
    }, 30);
  };

  /* STOCK, PHARMACY & SPARE PARTS SWITCHER */
  window.setStockPharmacyModule = function(module) {
    module = module || 'inventory';
    const inventoryPanel = document.getElementById('stock-module-panel');
    const pharmacyPanel = document.getElementById('pharmacy-module-panel');
    const sparepartsPanel = document.getElementById('spareparts-module-panel');

    if (inventoryPanel) inventoryPanel.classList.toggle('hidden', module !== 'inventory');
    if (pharmacyPanel) pharmacyPanel.classList.toggle('hidden', module !== 'pharmacy');
    if (sparepartsPanel) sparepartsPanel.classList.toggle('hidden', module !== 'spareparts');

    const activeBtnClass = 'py-2 px-3 border-2 border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5';
    const inactiveBtnClass = 'py-2 px-3 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5';

    document.querySelectorAll('.btn-switch-inventory').forEach(b => {
      b.className = `btn-switch-inventory ${module === 'inventory' ? activeBtnClass : inactiveBtnClass}`;
    });
    document.querySelectorAll('.btn-switch-pharmacy').forEach(b => {
      b.className = `btn-switch-pharmacy ${module === 'pharmacy' ? activeBtnClass : inactiveBtnClass}`;
    });
    document.querySelectorAll('.btn-switch-spareparts').forEach(b => {
      b.className = `btn-switch-spareparts ${module === 'spareparts' ? activeBtnClass : inactiveBtnClass}`;
    });

    if (module === 'spareparts') {
      if (typeof window.populateSparePartTargets === 'function') window.populateSparePartTargets();
      if (typeof window.renderSparePartsLedger === 'function') window.renderSparePartsLedger();
    } else if (module === 'pharmacy') {
      if (typeof window.renderPharmacyLedger === 'function') window.renderPharmacyLedger();
    } else {
      if (typeof window.renderStockInventoryLedger === 'function') window.renderStockInventoryLedger();
    }
  };

  /* FILTER DRAWER TOGGLE */
  window.toggleFilterDrawer = function(type) {
    window.drawers[type] = !window.drawers[type];
    const elem = document.getElementById(`${type}-filter-drawer`);
    if (elem) {
      if (window.drawers[type]) elem.classList.remove('hidden');
      else elem.classList.add('hidden');
    }
  };

  window.populateCategoryFilters = function() {
    const filterCat = document.getElementById('filter-txn-cat');
    if (!filterCat) return;
    filterCat.innerHTML = '<option value="">All Categories</option>';
    
    const allCats = [...Object.keys(window.incomeAllocationBlueprint), ...Object.keys(window.expenseAllocationBlueprint)];
    allCats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      filterCat.appendChild(opt);
    });
  };

  window.togglePackagingMath = function(tab) {
    const styleEl = document.getElementById(`${tab}-buy-style`);
    if (!styleEl) return;
    const style = styleEl.value;
    const sizeContainer = document.getElementById(`${tab}-pack-size-container`);
    const qtyLabel = document.getElementById(`lbl-${tab}-qty`);
    const priceLabel = document.getElementById(`lbl-${tab}-price`);
    
    if (style === 'pack') {
      if (sizeContainer) sizeContainer.classList.remove('hidden');
      if (qtyLabel) qtyLabel.innerText = "Packs Bought";
      if (priceLabel) priceLabel.innerText = "Price per Pack (EGP)";
    } else {
      if (sizeContainer) sizeContainer.classList.add('hidden');
      if (qtyLabel) qtyLabel.innerText = tab === 'pharmacy' ? "In Stock (Pills/ml)" : "Quantity Bought";
      if (priceLabel) priceLabel.innerText = "Price per Unit (EGP)";
    }
    window.updateFormRealtimePreview(tab);
  };

  window.updateFormRealtimePreview = function(tab) {
    const styleEl = document.getElementById(`${tab}-buy-style`);
    if (!styleEl) return;
    const style = styleEl.value;
    const qty = parseFloat(document.getElementById(`${tab}-quantity`)?.value) || 0;
    const price = parseFloat(document.getElementById(`${tab}-price`)?.value) || 0;
    const previewEl = document.getElementById(`${tab}-calc-preview`);

    if (style === 'pack' && previewEl) {
      const packSize = parseFloat(document.getElementById(`${tab}-pack-size`)?.value) || 1;
      const totalLoose = qty * packSize;
      const unitPrice = packSize > 0 ? (price / packSize) : 0;
      
      previewEl.innerText = `Intelligent Packaging Assist: ${totalLoose} total base elements compiled @ EGP ${unitPrice.toFixed(2)}/unit.`;
      previewEl.classList.remove('hidden');
    } else if (previewEl) {
      previewEl.classList.add('hidden');
    }
  };

  window.logAutomaticExpense = function(name, totalCost, category) {
    const today = new Date().toISOString().split('T')[0];
    const autoExpense = {
      id: 'exp_auto_' + Date.now() + Math.random().toString(36).substr(2, 4),
      date: today,
      category: category,
      amount: parseFloat(totalCost),
      description: `Purchase: ${name}`,
      type: 'expense'
    };
    window.transactions.push(autoExpense);
    window.saveTransactionsDatabase();
    window.triggerToast(`Auto-Expense compiled: EGP ${totalCost.toFixed(2)} successfully logged to ${category}!`, "info");
  };

  const RENT_EXPENSE_ALLOCATION = { pct: 35, color: "#8b5cf6" };
  const RENT_INCOME_ALLOCATION = { pct: 15, color: "#8b5cf6" };

  window.applyPropertyRoleToBudgetBlueprints = function() {
    const role = window.getPropertyRole();
    if (role === 'landlord') {
      delete window.expenseAllocationBlueprint['Rent'];
      window.incomeAllocationBlueprint['Rent'] = RENT_INCOME_ALLOCATION;
    } else if (role === 'both') {
      window.expenseAllocationBlueprint['Rent'] = RENT_EXPENSE_ALLOCATION;
      window.incomeAllocationBlueprint['Rent'] = RENT_INCOME_ALLOCATION;
    } else {
      window.expenseAllocationBlueprint['Rent'] = RENT_EXPENSE_ALLOCATION;
      delete window.incomeAllocationBlueprint['Rent'];
    }
  };

  window.getPropertyRole = function() {
    try {
      const raw = localStorage.getItem('forecaster_profile_user');
      const profile = raw ? JSON.parse(raw) : null;
      return (profile && profile.propertyRole) || 'tenant';
    } catch (e) { return 'tenant'; }
  };

  window.expenseCategoriesForPropertyRole = function() {
    const base = ["Groceries", "Utilities", "Rent", "Entertainment", "God Savings", "Tobacco", "Pet Supplies", "Medical", "Transportation", "Subscriptions", "Education", "Savings / Investments", "Fast Food / Work Meals", "Others"];
    const role = window.getPropertyRole();
    if (role === 'landlord') return base.filter(cat => cat !== 'Rent');
    return base;
  };

  window.incomeCategoriesForPropertyRole = function() {
    const base = ["Salary", "Freelance", "Investments", "Gifts", "Others"];
    const role = window.getPropertyRole();
    if (role === 'landlord' || role === 'both') return ["Rent", ...base];
    return base;
  };

  window.refreshRentCategoryForPropertyRole = function() {
    window.applyPropertyRoleToBudgetBlueprints();
    const expenseSelect = document.getElementById('input-category');
    const expenseLabel = document.getElementById('label-type-expense');
    if (expenseSelect && expenseLabel && expenseLabel.className.indexOf('border-blue-500') !== -1) {
      window.toggleFormType('expense');
    } else if (expenseSelect && document.getElementById('label-type-income') &&
               document.getElementById('label-type-income').className.indexOf('border-blue-500') !== -1) {
      window.toggleFormType('income');
    }
    const unifiedType = document.getElementById('form-txn-type');
    if (unifiedType && unifiedType.value) window.setFormType(unifiedType.value);
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  window.setFormType = function(type) {
    const expenseBtn = document.getElementById('form-type-expense');
    const incomeBtn = document.getElementById('form-type-income');
    const transferBtn = document.getElementById('form-type-transfer');
    const typeInput = document.getElementById('form-txn-type');
    const tipEl = document.getElementById('form-txn-tip');
    const selectEl = document.getElementById('form-txn-category');
    const categoryWrap = document.getElementById('form-txn-category-wrap');
    const accountWrap = document.getElementById('form-txn-account-wrap');
    const transferFields = document.getElementById('form-transfer-fields');
    const utilityWrap = document.getElementById('form-txn-utility-wrap');
    const utilityDueDateWrap = document.getElementById('form-txn-utility-duedate-wrap');

    if (!typeInput) return;
    typeInput.value = type;

    // Reset button styles
    const activeClass = "py-2 px-3 border-2 border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm";
    const inactiveClass = "py-2 px-3 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5";

    if (expenseBtn) expenseBtn.className = (type === 'expense') ? activeClass : inactiveClass;
    if (incomeBtn) incomeBtn.className = (type === 'income') ? activeClass : inactiveClass;
    if (transferBtn) transferBtn.className = (type === 'transfer') ? activeClass : inactiveClass;

    if (type === 'transfer') {
      if (categoryWrap) categoryWrap.classList.add('hidden');
      if (accountWrap) accountWrap.classList.add('hidden');
      if (transferFields) transferFields.classList.remove('hidden');
      if (tipEl) tipEl.classList.add('hidden');
      if (utilityWrap) utilityWrap.classList.add('hidden');
      if (utilityDueDateWrap) utilityDueDateWrap.classList.add('hidden');
    } else {
      if (categoryWrap) categoryWrap.classList.remove('hidden');
      if (accountWrap) accountWrap.classList.remove('hidden');
      if (transferFields) transferFields.classList.add('hidden');

      if (selectEl) {
        selectEl.innerHTML = '';
        if (type === 'expense') {
          if (tipEl) tipEl.classList.remove('hidden');
          const expCats = window.expenseCategoriesForPropertyRole();
          expCats.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.innerHTML = cat === "Groceries" ? "🥦 Groceries" : (cat === "Medical" ? "💊 Medical" : cat === "Tobacco" ? "🚬 Tobacco" : cat);
            selectEl.appendChild(opt);
          });
        } else {
          if (tipEl) tipEl.classList.add('hidden');
          if (utilityWrap) utilityWrap.classList.add('hidden');
          if (utilityDueDateWrap) utilityDueDateWrap.classList.add('hidden');
          const incCats = window.incomeCategoriesForPropertyRole();
          incCats.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.innerHTML = cat;
            selectEl.appendChild(opt);
          });
        }
      }
    }
  };

  window.handleUnifiedTxnSubmit = function(e) {
    e.preventDefault();
    const type = document.getElementById('form-txn-type').value;
    const date = document.getElementById('form-txn-date').value;
    const amount = parseFloat(document.getElementById('form-txn-amount').value);
    const desc = (document.getElementById('form-txn-desc')?.value || '').trim();

    if (type === 'transfer') {
      const fromId = document.getElementById('form-transfer-from')?.value;
      const toId = document.getElementById('form-transfer-to')?.value;
      const method = document.getElementById('form-transfer-method')?.value || 'Instapay';
      const fee = parseFloat(document.getElementById('form-transfer-instapay-fee')?.value || '0') || 0;

      if (!fromId || !toId) {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Please select both Origin and Destination accounts.', 'error');
        }
        return;
      }

      if (fromId === toId) {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Origin and Destination accounts cannot be the same.', 'error');
        }
        return;
      }

      const fromAcc = (window.accounts || []).find(a => a.id === fromId);
      const toAcc = (window.accounts || []).find(a => a.id === toId);

      const transferEntry = {
        id: 'tr_' + Date.now(),
        date: date,
        fromId: fromId,
        toId: toId,
        fromLabel: fromAcc ? fromAcc.label : fromId,
        toLabel: toAcc ? toAcc.label : toId,
        amount: amount,
        fee: fee,
        method: method,
        notes: desc || `Transfer from ${fromAcc ? fromAcc.label : fromId} to ${toAcc ? toAcc.label : toId}`,
        createdAt: new Date().toISOString()
      };

      if (!Array.isArray(window.accountTransfers)) window.accountTransfers = [];
      window.accountTransfers.unshift(transferEntry);
      window.saveAccountsDatabase();

      if (typeof window.triggerToast === 'function') {
        window.triggerToast(`Transfer of EGP ${amount.toFixed(2)} recorded successfully!`, 'success');
      }

      e.target.reset();
      window.setFormType('expense');
      const today = new Date().toISOString().split('T')[0];
      const dateInput = document.getElementById('form-txn-date');
      if (dateInput) dateInput.value = today;

      if (typeof window.renderAllViews === 'function') window.renderAllViews();
      return;
    }

    const category = document.getElementById('form-txn-category')?.value || 'General';
    const accountId = document.getElementById('form-txn-account')?.value || '';

    const entry = {
      id: 'tx_' + Date.now(),
      date: date,
      category: category,
      amount: amount,
      description: desc || `${type.charAt(0).toUpperCase() + type.slice(1)} Entry`,
      type: type,
      accountId: accountId
    };

    window.transactions.push(entry);
    window.saveTransactionsDatabase();
    window.triggerToast(`${type.charAt(0).toUpperCase() + type.slice(1)} captured successfully!`, "success");

    e.target.reset();
    window.setFormType('expense');
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('form-txn-date');
    if (dateInput) dateInput.value = today;

    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  window.handleInventoryRegister = function(e) {
    e.preventDefault();
    const name = document.getElementById('stock-name').value.trim();
    const style = document.getElementById('stock-buy-style').value;
    const rawQty = parseFloat(document.getElementById('stock-quantity').value);
    const unit = document.getElementById('stock-unit').value;
    const rawPrice = parseFloat(document.getElementById('stock-price').value) || 0;
    const threshold = parseFloat(document.getElementById('stock-threshold').value);
    const alertMethod = document.getElementById('stock-alert-method').value;
    const prodDate = document.getElementById('stock-prod-date').value;
    const expDate = document.getElementById('stock-exp-date').value;

    let quantity = rawQty;
    let price = rawPrice;
    let packSize = 1;

    if (style === 'pack') {
      packSize = parseFloat(document.getElementById('stock-pack-size').value) || 1;
      quantity = rawQty * packSize;
      price = rawPrice / packSize;
    }

    const asset = {
      id: 'stk_' + Date.now(),
      name, quantity, unit, price, threshold, alertMethod, prodDate, expDate, packSize, buyStyle: style,
      consumptionLogs: []
    };

    window.stockData.push(asset);
    localStorage.setItem('pro_stock', JSON.stringify(window.stockData));

    const computedCost = rawQty * (style === 'pack' ? rawPrice : price);
    window.logAutomaticExpense(name, computedCost, "Groceries");

    window.triggerToast("Asset ledger record finalized!", "success");
    e.target.reset();
    window.togglePackagingMath('stock');
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  window.handlePharmacyRegister = function(e) {
    e.preventDefault();
    const name = document.getElementById('pharmacy-name').value.trim();
    const style = document.getElementById('pharmacy-buy-style').value;
    const rawQty = parseFloat(document.getElementById('pharmacy-quantity').value);
    const unit = document.getElementById('pharmacy-unit').value;
    const rawPrice = parseFloat(document.getElementById('pharmacy-price').value) || 0;
    const threshold = parseFloat(document.getElementById('pharmacy-threshold').value);
    const alertMethod = document.getElementById('pharmacy-alert-method').value;
    const prodDate = document.getElementById('pharmacy-prod-date').value;
    const expDate = document.getElementById('pharmacy-exp-date').value;
    const dosage = document.getElementById('pharmacy-dosage').value.trim();
    const reason = document.getElementById('pharmacy-reason').value.trim();
    const prescription = document.getElementById('pharmacy-prescription').value;

    let quantity = rawQty;
    let price = rawPrice;
    let packSize = 1;

    if (style === 'pack') {
      packSize = parseFloat(document.getElementById('pharmacy-pack-size').value) || 1;
      quantity = rawQty * packSize;
      price = rawPrice / packSize;
    }

    const med = {
      id: 'med_' + Date.now(),
      name, quantity, unit, price, threshold, alertMethod, prodDate, expDate, dosage, reason, prescription, packSize, buyStyle: style,
      consumptionLogs: []
    };

    window.pharmacyData.push(med);
    localStorage.setItem('pro_pharmacy', JSON.stringify(window.pharmacyData));

    const computedCost = rawQty * (style === 'pack' ? rawPrice : price);
    window.logAutomaticExpense(name, computedCost, "Medical");

    window.triggerToast("Medication details integrated!", "success");
    e.target.reset();
    window.togglePackagingMath('pharmacy');
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  /* SPARE PARTS MANAGEMENT IN STOCK MODULE */
  window.toggleSparePartOrigin = function() {
    const isNew = document.querySelector('input[name="sparepart-origin"]:checked')?.value === 'new';
    const newLbl = document.getElementById('sparepart-origin-label-new');
    const oldLbl = document.getElementById('sparepart-origin-label-old');
    const disclaimer = document.getElementById('sparepart-origin-disclaimer');
    const accWrap = document.getElementById('sparepart-account-wrapper');

    if (newLbl) {
      newLbl.className = isNew
        ? 'cursor-pointer border-2 border-blue-600 bg-blue-50 text-blue-700 p-2 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs'
        : 'cursor-pointer border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 p-2 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs';
    }
    if (oldLbl) {
      oldLbl.className = !isNew
        ? 'cursor-pointer border-2 border-blue-600 bg-blue-50 text-blue-700 p-2 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs'
        : 'cursor-pointer border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 p-2 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs';
    }
    if (disclaimer) disclaimer.classList.toggle('hidden', isNew);
    if (accWrap) accWrap.classList.toggle('hidden', !isNew);
  };

  window.populateSparePartTargets = function() {
    const targetEl = document.getElementById('sparepart-target');
    if (!targetEl) return;
    const type = document.getElementById('sparepart-type')?.value || 'vehicle-spare-part';
    
    let options = '<option value="">General Stock / Any Compatible</option>';
    if (type === 'vehicle-spare-part') {
      const vehicles = Array.isArray(window.vehicles) ? window.vehicles : [];
      vehicles.forEach(v => {
        options += `<option value="Vehicle: ${v.make} ${v.model} (${v.plate})">🏎️ ${v.make} ${v.model} • ${v.plate}</option>`;
      });
    } else {
      let properties = [];
      try {
        properties = JSON.parse(localStorage.getItem('pro_rental_properties_v1') || '[]');
      } catch(e) {}
      properties.forEach(p => {
        options += `<option value="Property: ${p.propertyName || p.name} (${p.unitNumber || 'Unit'})">🏠 ${p.propertyName || p.name} - ${p.unitNumber || 'Unit'}</option>`;
      });
    }
    targetEl.innerHTML = options;
  };

  window.handleSparePartRegister = function(e) {
    e.preventDefault();
    const name = document.getElementById('sparepart-name').value.trim();
    const type = document.getElementById('sparepart-type').value;
    const target = document.getElementById('sparepart-target')?.value || '';
    const rawQty = parseFloat(document.getElementById('sparepart-quantity').value) || 0;
    const unit = document.getElementById('sparepart-unit').value || 'pcs';
    const rawPrice = parseFloat(document.getElementById('sparepart-price').value) || 0;
    const threshold = parseFloat(document.getElementById('sparepart-threshold').value) || 1;
    const sku = document.getElementById('sparepart-sku')?.value.trim() || '';
    const expDate = document.getElementById('sparepart-exp-date')?.value || '';
    const isNew = document.querySelector('input[name="sparepart-origin"]:checked')?.value === 'new';
    const accountId = document.getElementById('sparepart-account')?.value;

    if (!name || rawQty <= 0) {
      if (typeof window.triggerToast === 'function') window.triggerToast('Please provide a valid part name and quantity.', 'error');
      return;
    }

    const part = {
      id: 'part_' + Date.now(),
      name,
      itemType: type, // 'vehicle-spare-part' or 'residential-spare-part'
      category: 'Spare Parts',
      targetVehicleOrUnit: target,
      quantity: rawQty,
      unit,
      price: rawPrice,
      threshold,
      sku,
      expDate,
      prodDate: new Date().toISOString().split('T')[0],
      buyStyle: 'single',
      packSize: 1,
      consumptionLogs: []
    };

    if (!Array.isArray(window.stockData)) window.stockData = [];
    window.stockData.push(part);
    localStorage.setItem('pro_stock', JSON.stringify(window.stockData));

    if (isNew && rawPrice > 0) {
      const expenseCat = type === 'vehicle-spare-part' ? 'Vehicle Maintenance' : 'Home Repairs & Maintenance';
      const totalCost = rawQty * rawPrice;
      window.logAutomaticExpense(`${name} (Spare Part)`, totalCost, expenseCat, accountId);
    }

    if (typeof window.triggerToast === 'function') {
      window.triggerToast(`Spare part "${name}" logged successfully!`, 'success');
    }

    e.target.reset();
    document.getElementById('sparepart-type').value = type;
    window.toggleSparePartOrigin();
    window.populateSparePartTargets();
    if (typeof window.renderSparePartsLedger === 'function') window.renderSparePartsLedger();
    if (typeof window.renderVehicleManagement === 'function') window.renderVehicleManagement();
    if (typeof window.ForecasterCloudSync !== 'undefined' && window.ForecasterCloudSync.queueSync) {
      window.ForecasterCloudSync.queueSync();
    }
  };

  window.closeModal = function() {
    const modal = document.getElementById('custom-modal');
    if (modal) modal.classList.add('hidden');
    ['edit-expense-modal', 'edit-income-modal', 'edit-stock-modal', 'edit-pharmacy-modal', 'edit-transfer-modal', 'add-batch-modal', 'unhide-items-modal', 'add-txn-modal', 'rental-payment-modal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  };

  window.syncRentOptionForEdit = function(selectEl, shouldHaveRent) {
    if (!selectEl) return;
    const existing = selectEl.querySelector('option[value="Rent"]');
    if (shouldHaveRent && !existing) {
      const opt = document.createElement('option');
      opt.value = 'Rent';
      opt.textContent = 'Rent';
      selectEl.insertBefore(opt, selectEl.firstChild);
    } else if (!shouldHaveRent && existing) {
      existing.remove();
    }
  };

  window.editTransaction = function(id) {
    const txn = window.transactions.find(t => t.id === id);
    if (!txn) return;

    document.getElementById('custom-modal').classList.remove('hidden');
    const role = window.getPropertyRole();

    if (txn.type === 'expense') {
      document.getElementById('edit-expense-modal').classList.remove('hidden');
      document.getElementById('edit-income-modal').classList.add('hidden');

      const expCategorySelect = document.getElementById('edit-expense-category');
      window.syncRentOptionForEdit(expCategorySelect, role !== 'landlord' || txn.category === 'Rent');
      document.getElementById('edit-expense-id').value = txn.id;
      document.getElementById('edit-expense-date').value = txn.date;
      document.getElementById('edit-expense-category').value = txn.category;
      document.getElementById('edit-expense-amount').value = txn.amount;
      document.getElementById('edit-expense-desc').value = txn.description;
    } else {
      document.getElementById('edit-income-modal').classList.remove('hidden');
      document.getElementById('edit-expense-modal').classList.add('hidden');

      const incCategorySelect = document.getElementById('edit-income-category');
      window.syncRentOptionForEdit(incCategorySelect, role === 'landlord' || role === 'both' || txn.category === 'Rent');
      document.getElementById('edit-income-id').value = txn.id;
      document.getElementById('edit-income-date').value = txn.date;
      document.getElementById('edit-income-category').value = txn.category;
      document.getElementById('edit-income-amount').value = txn.amount;
      document.getElementById('edit-income-desc').value = txn.description;
    }
  };

  window.handleEditExpenseSubmit = function(e) {
    e.preventDefault();
    const id = document.getElementById('edit-expense-id').value;
    const date = document.getElementById('edit-expense-date').value;
    const category = document.getElementById('edit-expense-category').value;
    const amount = parseFloat(document.getElementById('edit-expense-amount').value);
    const desc = document.getElementById('edit-expense-desc').value.trim();

    const index = window.transactions.findIndex(t => t.id === id);
    if (index !== -1) {
      window.transactions[index].date = date;
      window.transactions[index].category = category;
      window.transactions[index].amount = amount;
      window.transactions[index].description = desc;
      window.saveTransactionsDatabase();
      window.triggerToast("Expense modified successfully!", "success");
    }
    window.closeModal();
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  window.handleEditIncomeSubmit = function(e) {
    e.preventDefault();
    const id = document.getElementById('edit-income-id').value;
    const date = document.getElementById('edit-income-date').value;
    const category = document.getElementById('edit-income-category').value;
    const amount = parseFloat(document.getElementById('edit-income-amount').value);
    const desc = document.getElementById('edit-income-desc').value.trim();

    const index = window.transactions.findIndex(t => t.id === id);
    if (index !== -1) {
      window.transactions[index].date = date;
      window.transactions[index].category = category;
      window.transactions[index].amount = amount;
      window.transactions[index].description = desc;
      window.saveTransactionsDatabase();
      window.triggerToast("Income modified successfully!", "success");
    }
    window.closeModal();
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  window.deleteTransaction = function(id) {
    window.transactions = window.transactions.filter(t => t.id !== id);
    window.saveTransactionsDatabase();
    window.triggerToast("Transaction deleted safely.", "info");
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  window.toggleMedGroupCollapse = function(name) {
    window.expandedMedGroups[name] = !window.expandedMedGroups[name];
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  window.toggleStockGroupCollapse = function(name) {
    window.expandedStockGroups[name] = !window.expandedStockGroups[name];
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  window.consumeStockItem = function(id, amount) {
    const item = window.stockData.find(s => s.id === id);
    if (!item) return;

    if (item.quantity < amount) {
      window.triggerToast(`Operation cancelled: Only ${item.quantity} ${item.unit} in active stock!`, "error");
      return;
    }

    item.quantity -= amount;
    const today = new Date().toISOString().split('T')[0];
    item.consumptionLogs.push({ date: today, amount: amount, type: 'consumed' });
    localStorage.setItem('pro_stock', JSON.stringify(window.stockData));
    window.triggerToast(`Disbursed ${amount} ${item.unit} of ${item.name} from reserves.`, "success");
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  window.consumeMedicationItem = function(id, amount) {
    const med = window.pharmacyData.find(m => m.id === id);
    if (!med) return;

    if (med.quantity < amount) {
      window.triggerToast(`Operation cancelled: Only ${med.quantity} ${med.unit} left!`, "error");
      return;
    }

    med.quantity -= amount;
    const today = new Date().toISOString().split('T')[0];
    med.consumptionLogs.push({ date: today, amount: amount, type: 'consumed' });
    localStorage.setItem('pro_pharmacy', JSON.stringify(window.pharmacyData));
    window.triggerToast(`Administered dosage of ${amount} ${med.unit} for ${med.name}.`, "success");
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  window.deleteStockItem = function(id) {
    window.stockData = window.stockData.filter(s => s.id !== id);
    localStorage.setItem('pro_stock', JSON.stringify(window.stockData));
    window.triggerToast("Asset registry removed.", "info");
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  window.deletePharmacyItem = function(id) {
    window.pharmacyData = window.pharmacyData.filter(m => m.id !== id);
    localStorage.setItem('pro_pharmacy', JSON.stringify(window.pharmacyData));
    window.triggerToast("Medication database record discarded.", "info");
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
  };

  /* MONTHLY CATEGORY SCOPING HELPERS */
  window.formatMonthLabel = function(ym) {
    if (!ym || ym === 'all') return 'All Recorded Time';
    if (ym === 'auto') return 'Active Month';
    try {
      const parts = ym.split('-');
      if (parts.length < 2) return ym;
      const date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } catch(e) {
      return ym;
    }
  };

  window.getActiveAllocationsMonth = function() {
    const selected = window.allocationsSelectedMonth || localStorage.getItem('pro_allocations_month') || 'auto';
    if (selected !== 'auto') return selected;

    const monthSet = new Set();
    (window.transactions || []).forEach(t => {
      if (t.date && t.date.length >= 7) monthSet.add(t.date.slice(0, 7));
    });
    const sorted = Array.from(monthSet).sort().reverse();
    return sorted[0] || new Date().toISOString().slice(0, 7);
  };

  window.setAllocationsMonth = function(val) {
    window.allocationsSelectedMonth = val;
    localStorage.setItem('pro_allocations_month', val);
    window.renderAllViews();
  };

  window.populateAllocationsMonthFilter = function() {
    const select = document.getElementById('allocations-month-filter');
    if (!select) return;

    const monthSet = new Set();
    (window.transactions || []).forEach(t => {
      if (t.date && t.date.length >= 7) monthSet.add(t.date.slice(0, 7));
    });
    (window.accountTransfers || []).forEach(tr => {
      if (tr.date && tr.date.length >= 7) monthSet.add(tr.date.slice(0, 7));
    });

    const sortedMonths = Array.from(monthSet).sort().reverse();
    const currentSelected = window.allocationsSelectedMonth || localStorage.getItem('pro_allocations_month') || 'auto';
    const activeMonth = window.getActiveAllocationsMonth();

    let html = `<option value="auto"${currentSelected === 'auto' ? ' selected' : ''}>Active Month (${window.formatMonthLabel(activeMonth)})</option>`;
    html += `<option value="all"${currentSelected === 'all' ? ' selected' : ''}>All Recorded Time</option>`;

    sortedMonths.forEach(m => {
      const selected = (currentSelected === m) ? ' selected' : '';
      html += `<option value="${m}"${selected}>${window.formatMonthLabel(m)}</option>`;
    });

    select.innerHTML = html;
  };

  window.getAllocationsScopedData = function() {
    const activeMonth = window.getActiveAllocationsMonth();
    let scopedTxns = window.transactions || [];
    let scopedTransfers = window.accountTransfers || [];

    if (activeMonth !== 'all') {
      scopedTxns = scopedTxns.filter(t => (t.date || '').startsWith(activeMonth));
      scopedTransfers = scopedTransfers.filter(tr => (tr.date || '').startsWith(activeMonth));
    }

    return { activeMonth, scopedTxns, scopedTransfers };
  };

  /* MAIN ORCHESTRATOR */
  window.renderAllViews = function() {
    window.populateAllocationsMonthFilter();
    window.autoCalculateAllocations(false);
    window.calculateOverallDashboardAggregates();
    window.renderDashboardBlueprintItems();
    window.renderHouseholdFinancialFootprint();
    window.renderConsolidatedTableRegistry();
    window.renderStockInventoryLedger();
    window.renderPharmacyLedger();
    if (typeof window.renderSparePartsLedger === 'function') window.renderSparePartsLedger();
    window.renderShoppingPlannerDetails();
    window.renderImmediateSystemAlerts();
    window.renderMedicationSafetyDashboard();
    window.renderChartsPerformanceTrend();
    window.renderInsightsTab();
    window.renderInteractiveReportsDashboard();
  };

  window.autoCalculateAllocations = function(forceSync = false) {
    const { activeMonth, scopedTxns, scopedTransfers } = window.getAllocationsScopedData();

    let registeredIncome = 0;
    let registeredExpenses = 0;

    scopedTxns.forEach(t => {
      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'income') registeredIncome += amt;
      if (t.type === 'expense') registeredExpenses += amt;
    });

    let totalTransfersAmount = 0;
    let totalTransferFees = 0;
    scopedTransfers.forEach(tr => {
      totalTransfersAmount += parseFloat(tr.amount) || 0;
      totalTransferFees += parseFloat(tr.fee) || 0;
    });

    // Update Live Ledger Tracking in Define Allocations card
    const monthBadge = document.getElementById('alloc-active-month-badge');
    if (monthBadge) monthBadge.innerText = window.formatMonthLabel(activeMonth);

    const regIncEl = document.getElementById('alloc-registered-income');
    const regExpEl = document.getElementById('alloc-registered-expenses');
    const regTrEl = document.getElementById('alloc-registered-transfers');
    if (regIncEl) regIncEl.innerText = `EGP ${registeredIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (regExpEl) regExpEl.innerText = `EGP ${registeredExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (regTrEl) {
      const count = scopedTransfers.length;
      regTrEl.innerText = `${count} (EGP ${totalTransfersAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${totalTransferFees > 0 ? ` + EGP ${totalTransferFees.toFixed(2)} fee` : ''})`;
    }

    const modeInc = document.getElementById('label-income-calc-mode');
    const modeExp = document.getElementById('label-expense-calc-mode');
    const isManual = localStorage.getItem('pro_allocations_mode') === 'manual';

    if (forceSync) {
      localStorage.removeItem('pro_allocations_mode');
    }

    if (!isManual || forceSync) {
      // Auto-calculate budget limits based on monthly registered income, expenses, and transfer fees
      const autoIncome = registeredIncome > 0 ? registeredIncome : (window.budgetLimits.income || 3500);
      const autoExpense = (registeredExpenses + totalTransferFees) > 0 ? (registeredExpenses + totalTransferFees) : (window.budgetLimits.expense || 2000);

      window.budgetLimits.income = autoIncome;
      window.budgetLimits.expense = autoExpense;
      localStorage.setItem('pro_budget_limits', JSON.stringify(window.budgetLimits));

      const incInput = document.getElementById('budget-income-input');
      const expInput = document.getElementById('budget-expense-input');
      if (incInput && document.activeElement !== incInput) incInput.value = autoIncome.toFixed(2);
      if (expInput && document.activeElement !== expInput) expInput.value = autoExpense.toFixed(2);

      if (modeInc) {
        modeInc.textContent = 'Auto-Linked';
        modeInc.className = 'text-[10px] font-bold text-emerald-600 dark:text-emerald-400';
      }
      if (modeExp) {
        modeExp.textContent = 'Auto-Linked';
        modeExp.className = 'text-[10px] font-bold text-rose-600 dark:text-rose-400';
      }

      if (forceSync && typeof window.triggerToast === 'function') {
        window.triggerToast(`Allocations auto-calculated for ${window.formatMonthLabel(activeMonth)}: Inflow EGP ${autoIncome.toFixed(2)}, Outflow EGP ${autoExpense.toFixed(2)}`, 'success');
      }
    } else {
      if (modeInc) {
        modeInc.textContent = 'Manual';
        modeInc.className = 'text-[10px] font-bold text-slate-400';
      }
      if (modeExp) {
        modeExp.textContent = 'Manual';
        modeExp.className = 'text-[10px] font-bold text-slate-400';
      }
    }
  };

  window.calculateOverallDashboardAggregates = function() {
    let totalIncome = 0;
    let totalExpenses = 0;

    window.transactions.forEach(t => {
      if (t.type === 'income') totalIncome += parseFloat(t.amount);
      if (t.type === 'expense') totalExpenses += parseFloat(t.amount);
    });

    const netSavings = totalIncome - totalExpenses;

    const incEl = document.getElementById('stat-total-income');
    const expEl = document.getElementById('stat-total-expenses');
    const savEl = document.getElementById('stat-net-savings');
    const bgtEl = document.getElementById('stat-budget-limit');
    const pctEl = document.getElementById('stat-expense-percentage');

    if (incEl) incEl.innerText = `EGP ${totalIncome.toFixed(2)}`;
    if (expEl) expEl.innerText = `EGP ${totalExpenses.toFixed(2)}`;
    if (savEl) savEl.innerText = `EGP ${netSavings.toFixed(2)}`;
    if (bgtEl) bgtEl.innerText = `EGP ${window.budgetLimits.expense.toFixed(2)}`;

    const pctUsed = window.budgetLimits.expense > 0 ? (totalExpenses / window.budgetLimits.expense * 100) : 0;
    if (pctEl) pctEl.innerText = `${pctUsed.toFixed(1)}% of total budget limit`;

    const savingsPill = document.getElementById('savings-progress-pill');
    if (savingsPill) {
      if (netSavings < 0) {
        savingsPill.className = "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700";
        savingsPill.textContent = "Deficit Footprint";
      } else if (netSavings > 500) {
        savingsPill.className = "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700";
        savingsPill.textContent = "Healthy Savings Pool";
      } else {
        savingsPill.className = "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700";
        savingsPill.textContent = "Active Saving";
      }
    }
  };

  window.updateMainBudgets = function() {
    const incVal = parseFloat(document.getElementById('budget-income-input')?.value) || 0;
    const expVal = parseFloat(document.getElementById('budget-expense-input')?.value) || 0;
    
    window.budgetLimits.income = incVal;
    window.budgetLimits.expense = expVal;
    localStorage.setItem('pro_budget_limits', JSON.stringify(window.budgetLimits));
    localStorage.setItem('pro_allocations_mode', 'manual');
    
    if (typeof window.triggerToast === 'function') {
      window.triggerToast("Manual allocation limits set!", "success");
    }
    window.renderAllViews();
  };

  window.renderDashboardBlueprintItems = function() {
    const incContainer = document.getElementById('blueprint-income-items');
    const expContainer = document.getElementById('blueprint-expense-items');
    if (!incContainer || !expContainer) return;

    incContainer.innerHTML = '';
    expContainer.innerHTML = '';

    const { scopedTxns } = window.getAllocationsScopedData();

    const incomeByCategory = {};
    const expenseByCategory = {};
    let totalRegisteredIncome = 0;
    let totalRegisteredExpense = 0;

    scopedTxns.forEach(t => {
      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'income') {
        const cat = t.category || 'Others';
        incomeByCategory[cat] = (incomeByCategory[cat] || 0) + amt;
        totalRegisteredIncome += amt;
      } else if (t.type === 'expense') {
        const cat = t.category || 'Others';
        expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amt;
        totalRegisteredExpense += amt;
      }
    });

    let totalForecastedIncome = 0;
    let totalForecastedExpense = 0;

    // Monthly Income Target Proportions (Amount Registered / Amount Forecasted per Category)
    for (const [name, data] of Object.entries(window.incomeAllocationBlueprint)) {
      const forecasted = window.budgetLimits.income * (data.pct / 100);
      totalForecastedIncome += forecasted;
      const registered = incomeByCategory[name] || 0;
      const pct = forecasted > 0 ? (registered / forecasted * 100) : 0;

      incContainer.innerHTML += `
        <div class="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 space-y-1.5 transition">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${data.color}"></span>
              <span class="font-semibold text-slate-800 dark:text-slate-200 truncate">${name}</span>
              <span class="text-[10px] text-slate-400 shrink-0">(${data.pct}%)</span>
            </div>
            <div class="text-right font-mono text-xs shrink-0 ml-2">
              <span class="font-bold text-emerald-600 dark:text-emerald-400">EGP ${registered.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span class="text-slate-400 font-normal"> / </span>
              <span class="font-semibold text-slate-700 dark:text-slate-300">EGP ${forecasted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-300" style="width: ${Math.min(pct, 100).toFixed(0)}%; background-color: ${data.color}"></div>
            </div>
            <span class="text-[10px] font-bold ${pct >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'} font-mono shrink-0">
              ${pct.toFixed(0)}%
            </span>
          </div>
        </div>
      `;
    }

    // Monthly Expense Quotas Blueprint (Amount Registered / Amount Forecasted per Category)
    for (const [name, data] of Object.entries(window.expenseAllocationBlueprint)) {
      const forecasted = window.budgetLimits.expense * (data.pct / 100);
      totalForecastedExpense += forecasted;
      const registered = expenseByCategory[name] || 0;
      const pct = forecasted > 0 ? (registered / forecasted * 100) : 0;
      const isOver = registered > forecasted && forecasted > 0;

      expContainer.innerHTML += `
        <div class="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border ${isOver ? 'border-rose-300 dark:border-rose-800/80 bg-rose-50/20' : 'border-slate-100 dark:border-slate-700'} space-y-1.5 transition">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${data.color}"></span>
              <span class="font-semibold text-slate-800 dark:text-slate-200 truncate">${name}</span>
              <span class="text-[10px] text-slate-400 shrink-0">(${data.pct}%)</span>
            </div>
            <div class="text-right font-mono text-xs shrink-0 ml-2">
              <span class="font-bold ${isOver ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}">EGP ${registered.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span class="text-slate-400 font-normal"> / </span>
              <span class="font-semibold text-slate-700 dark:text-slate-300">EGP ${forecasted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-300" style="width: ${Math.min(pct, 100).toFixed(0)}%; background-color: ${isOver ? '#f43f5e' : data.color}"></div>
            </div>
            <span class="text-[10px] font-bold ${isOver ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'} font-mono shrink-0">
              ${pct.toFixed(0)}%
            </span>
          </div>
        </div>
      `;
    }

    const incTotalsEl = document.getElementById('blueprint-income-totals');
    const expTotalsEl = document.getElementById('blueprint-expense-totals');
    if (incTotalsEl) {
      incTotalsEl.innerText = `EGP ${totalRegisteredIncome.toFixed(0)} / EGP ${totalForecastedIncome.toFixed(0)}`;
    }
    if (expTotalsEl) {
      expTotalsEl.innerText = `EGP ${totalRegisteredExpense.toFixed(0)} / EGP ${totalForecastedExpense.toFixed(0)}`;
    }
  };

  window.renderHouseholdFinancialFootprint = function() {
    const expContainer = document.getElementById('expense-distribution-bars');
    const incContainer = document.getElementById('income-distribution-bars');
    if (!expContainer && !incContainer) return;

    const { activeMonth, scopedTxns } = window.getAllocationsScopedData();

    // Update Footprint Month Badge
    const footprintBadge = document.getElementById('footprint-month-badge');
    if (footprintBadge) footprintBadge.innerText = window.formatMonthLabel(activeMonth);

    let totalExpenses = 0;
    let totalIncome = 0;
    const expensesByCategory = {};
    const incomeByCategory = {};

    const colorPalette = [
      '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', 
      '#06b6d4', '#6366f1', '#14b8a6', '#f97316', '#64748b'
    ];

    scopedTxns.forEach(t => {
      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'expense') {
        totalExpenses += amt;
        const cat = t.category || 'General';
        expensesByCategory[cat] = (expensesByCategory[cat] || 0) + amt;
      } else if (t.type === 'income') {
        totalIncome += amt;
        const cat = t.category || 'General';
        incomeByCategory[cat] = (incomeByCategory[cat] || 0) + amt;
      }
    });

    const totalExpEl = document.getElementById('footprint-total-expense');
    const totalIncEl = document.getElementById('footprint-total-income');
    if (totalExpEl) totalExpEl.innerText = `EGP ${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (totalIncEl) totalIncEl.innerText = `EGP ${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Render Expense Ratios by Category (Monthly)
    if (expContainer) {
      const expEntries = Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1]);
      if (expEntries.length === 0 || totalExpenses === 0) {
        expContainer.innerHTML = `
          <div class="p-3 text-center text-xs text-slate-404 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
            No expenses recorded for ${window.formatMonthLabel(activeMonth)}.
          </div>`;
      } else {
        let html = '';
        expEntries.forEach(([category, amt], idx) => {
          const blueprint = window.expenseAllocationBlueprint && window.expenseAllocationBlueprint[category];
          const color = blueprint ? blueprint.color : colorPalette[idx % colorPalette.length];
          const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
          html += `
            <div class="space-y-1">
              <div class="flex items-center justify-between text-xs">
                <span class="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${color}"></span>
                  <span>${category}</span>
                </span>
                <div class="flex items-center gap-2">
                  <span class="text-slate-500 dark:text-slate-404 font-mono text-[11px] font-bold">${pct.toFixed(1)}%</span>
                  <span class="font-bold text-slate-900 dark:text-white">EGP ${amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
              <div class="w-full h-2 bg-slate-100 dark:bg-slate-700/60 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-300" style="width: ${Math.min(pct, 100).toFixed(1)}%; background-color: ${color}"></div>
              </div>
            </div>`;
        });
        expContainer.innerHTML = html;
      }
    }

    // Render Income Sources Breakdown (Monthly)
    if (incContainer) {
      const incEntries = Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1]);
      if (incEntries.length === 0 || totalIncome === 0) {
        incContainer.innerHTML = `
          <div class="p-3 text-center text-xs text-slate-404 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
            No income recorded for ${window.formatMonthLabel(activeMonth)}.
          </div>`;
      } else {
        let html = '';
        incEntries.forEach(([category, amt], idx) => {
          const blueprint = window.incomeAllocationBlueprint && window.incomeAllocationBlueprint[category];
          const color = blueprint ? blueprint.color : colorPalette[idx % colorPalette.length];
          const pct = totalIncome > 0 ? (amt / totalIncome) * 100 : 0;
          html += `
            <div class="space-y-1">
              <div class="flex items-center justify-between text-xs">
                <span class="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${color}"></span>
                  <span>${category}</span>
                </span>
                <div class="flex items-center gap-2">
                  <span class="text-slate-500 dark:text-slate-404 font-mono text-[11px] font-bold">${pct.toFixed(1)}%</span>
                  <span class="font-bold text-slate-900 dark:text-white">EGP ${amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
              <div class="w-full h-2 bg-slate-100 dark:bg-slate-700/60 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-300" style="width: ${Math.min(pct, 100).toFixed(1)}%; background-color: ${color}"></div>
              </div>
            </div>`;
        });
        incContainer.innerHTML = html;
      }
    }
  };

  window.renderConsolidatedTableRegistry = function() {
    const tbody = document.getElementById('transactions-table-body');
    const recentDashboardList = document.getElementById('recent-transactions-list');
    if (!tbody) return;

    const filterType = document.getElementById('filter-txn-type')?.value || 'all';
    const filterCat = document.getElementById('filter-txn-cat')?.value || '';
    const filterSort = document.getElementById('filter-txn-sort')?.value || 'date-desc';
    const searchVal = (document.getElementById('filter-txn-search')?.value || '').toLowerCase();
    const dateStart = document.getElementById('filter-txn-start')?.value || '';
    const dateEnd = document.getElementById('filter-txn-end')?.value || '';

    let records = [...window.transactions];

    if (filterType !== 'all') records = records.filter(r => r.type === filterType);
    if (filterCat) records = records.filter(r => r.category === filterCat);
    if (searchVal) records = records.filter(r => (r.description || '').toLowerCase().includes(searchVal) || (r.category || '').toLowerCase().includes(searchVal));
    if (dateStart) records = records.filter(r => r.date >= dateStart);
    if (dateEnd) records = records.filter(r => r.date <= dateEnd);

    if (filterSort === 'date-desc') records.sort((a,b) => new Date(b.date) - new Date(a.date));
    else if (filterSort === 'date-asc') records.sort((a,b) => new Date(a.date) - new Date(b.date));
    else if (filterSort === 'amt-desc') records.sort((a,b) => b.amount - a.amount);
    else if (filterSort === 'amt-asc') records.sort((a,b) => a.amount - b.amount);

    tbody.innerHTML = '';
    records.forEach(r => {
      const colorTag = r.type === 'income' ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';
      tbody.innerHTML += `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800 transition border-b border-slate-100 dark:border-slate-800 font-medium">
          <td class="py-3 px-2 whitespace-nowrap text-slate-500 font-bold">${r.date}</td>
          <td class="py-3 px-2">
            <span class="inline-flex px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${colorTag}">
              ${r.type}
            </span>
          </td>
          <td class="py-3 px-2 whitespace-nowrap">
            <span class="font-bold text-slate-707 dark:text-slate-200">${r.category}</span>
          </td>
          <td class="py-3 px-2 text-slate-900 dark:text-slate-100">${r.description}</td>
          <td class="py-3 px-2 text-right font-black ${r.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}">
            EGP ${r.amount.toFixed(2)}
          </td>
          <td class="py-3 px-2 text-center whitespace-nowrap space-x-1.5">
            <button onclick="editTransaction('${r.id}')" class="p-1 hover:text-blue-600 transition" title="Modify Record">✏️</button>
            <button onclick="deleteTransaction('${r.id}')" class="p-1 hover:text-rose-600 transition" title="Delete Record">🗑️</button>
          </td>
        </tr>
      `;
    });

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-404 font-semibold">No transactions match active analytical filters.</td></tr>`;
    }

    if (recentDashboardList) {
      recentDashboardList.innerHTML = '';
      const topDash = [...window.transactions].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
      
      topDash.forEach(td => {
        const isInc = td.type === 'income';
        const blueprint = isInc ? window.incomeAllocationBlueprint[td.category] : window.expenseAllocationBlueprint[td.category];
        const catColor = blueprint ? blueprint.color : (isInc ? '#10b981' : '#f43f5e');

        recentDashboardList.innerHTML += `
          <div class="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition font-medium">
            <div class="flex items-center gap-3">
              <div class="w-2 h-10 rounded-full" style="background-color: ${catColor}"></div>
              <div>
                <p class="text-xs font-bold text-slate-900 dark:text-white mb-0.5">${td.description}</p>
                <span class="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded" style="color: ${catColor}; background-color: ${catColor}15">
                  ${td.category}
                </span>
              </div>
            </div>
            <div class="text-right">
              <p class="text-xs font-black ${isInc ? 'text-emerald-600' : 'text-rose-600'}">
                ${isInc ? '+' : '-'}EGP ${td.amount.toFixed(2)}
              </p>
              <span class="text-[9px] text-slate-404 font-semibold">${td.date}</span>
            </div>
          </div>
        `;
      });
      if (topDash.length === 0) {
        recentDashboardList.innerHTML = `<p class="text-center text-xs text-slate-404 py-6 font-semibold">Pristine database registry.</p>`;
      }
    }
  };

  window.renderStockInventoryLedger = function() {
    const container = document.getElementById('inventory-ledger-cards');
    if (!container) return;

    const searchVal = (document.getElementById('inventory-search')?.value || '').toLowerCase();
    container.innerHTML = '';

    const isSparePart = s => s && (s.itemType === 'vehicle-spare-part' || s.itemType === 'residential-spare-part' || s.category === 'Spare Parts');
    const generalStock = (Array.isArray(window.stockData) ? window.stockData : []).filter(s => s && !s.isHidden && !isSparePart(s));

    const grouped = {};
    generalStock.forEach(s => {
      if (!grouped[s.name]) grouped[s.name] = [];
      grouped[s.name].push(s);
    });

    Object.entries(grouped).forEach(([name, batches]) => {
      if (searchVal && !name.toLowerCase().includes(searchVal)) return;

      const totalInStock = batches.reduce((sum, b) => sum + parseFloat(b.quantity), 0);
      const sample = batches[0];
      const unit = sample.unit;
      const totalThreshold = batches.reduce((sum, b) => sum + parseFloat(b.threshold), 0);
      const isCritical = totalInStock <= totalThreshold;
      const colorBadge = isCritical ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-blue-50 text-blue-700 border-blue-200';

      let cardHTML = `
        <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between space-y-4">
          <div class="flex items-start justify-between font-medium">
            <div>
              <h3 class="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>📦</span> ${name}
              </h3>
              <p class="text-[10px] text-slate-404 font-bold uppercase mt-0.5">${batches.length} Batch(es) registered</p>
            </div>
            <span class="text-xs font-bold border px-3 py-1 rounded-full ${colorBadge}">
              ${totalInStock.toFixed(1)} ${unit} Remaining
            </span>
          </div>
          
          <div class="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl flex items-center justify-between text-xs font-medium">
            <div class="space-y-0.5">
              <span class="text-[10px] text-slate-400 block uppercase font-bold">Avg Value</span>
              <span class="font-extrabold text-slate-900 dark:text-slate-100">EGP ${Number(batches[0]?.price || 0).toFixed(2)} / base</span>
            </div>
            <div class="space-y-0.5 text-right">
              <span class="text-[10px] text-slate-404 block uppercase font-bold">Buffer Limit</span>
              <span class="font-extrabold text-rose-600">${totalThreshold.toFixed(1)} ${unit}</span>
            </div>
          </div>

          <div class="flex gap-2 items-center">
            <input type="number" id="quick-consume-val-${name.replace(/\s+/g, '-')}" placeholder="Qty" class="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold" min="0.1" step="0.1" value="1">
            <button onclick="executeConsolidatedStockConsumption('${name}', ${totalInStock})" class="flex-grow py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg transition">
              Disburse Item
            </button>
            <button onclick="toggleStockGroupCollapse('${name}')" class="p-1 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
              ${window.expandedStockGroups[name] ? '🔼' : '🔽'}
            </button>
          </div>
      `;

      if (window.expandedStockGroups[name]) {
        cardHTML += `<div class="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2 mt-2">
          <p class="text-[10px] font-black uppercase text-slate-404">Batch Breakdown</p>`;
        batches.forEach(b => {
          cardHTML += `
            <div class="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-700 text-[11px] space-y-1 relative font-medium">
              <div class="flex justify-between font-bold">
                <span>Batch ID: ${b.id.split('_')[1] || b.id}</span>
                <span>${b.quantity.toFixed(1)} ${unit}</span>
              </div>
              <div class="flex justify-between text-[10px] text-slate-404">
                <span>Exp: ${b.expDate || 'N/A'}</span>
                <span>Cost: EGP ${(b.price * (b.packSize || 1)).toFixed(2)}</span>
              </div>
              <div class="flex justify-end gap-1.5 pt-1.5">
                <button onclick="editStockItem('${b.id}')" class="text-[10px] text-blue-600 font-bold hover:underline">Edit Batch</button>
                <span class="text-slate-300">|</span>
                <button onclick="deleteStockItem('${b.id}')" class="text-[10px] text-rose-600 font-bold hover:underline">Discard</button>
              </div>
            </div>
          `;
        });
        cardHTML += `</div>`;
      }

      cardHTML += `</div>`;
      container.innerHTML += cardHTML;
    });

    if (generalStock.length === 0) {
      container.innerHTML = `<div class="col-span-2 text-center py-12 text-slate-404 font-semibold bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">No general assets currently logged. Use registration form.</div>`;
    }
  };

  /* SPARE PARTS LEDGER & CONSUMPTION CONTROLLER */
  window.sparePartsFilter = 'all';

  window.filterSpareParts = function(type) {
    window.sparePartsFilter = type;
    const btns = {
      all: document.getElementById('btn-sp-all'),
      vehicle: document.getElementById('btn-sp-vehicle'),
      residential: document.getElementById('btn-sp-residential')
    };
    Object.keys(btns).forEach(k => {
      if (btns[k]) {
        if (k === type) {
          btns[k].className = 'px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-600 text-white';
        } else {
          btns[k].className = 'px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
        }
      }
    });
    window.renderSparePartsLedger();
  };

  window.renderSparePartsLedger = function() {
    const container = document.getElementById('spareparts-ledger-cards');
    if (!container) return;

    const searchVal = (document.getElementById('spareparts-search')?.value || '').toLowerCase();
    container.innerHTML = '';

    const allParts = (Array.isArray(window.stockData) ? window.stockData : [])
      .filter(p => p && !p.isHidden && (p.itemType === 'vehicle-spare-part' || p.itemType === 'residential-spare-part' || p.category === 'Spare Parts'));

    // Update KPIs
    const totalCount = allParts.reduce((sum, p) => sum + (parseFloat(p.quantity) || 0), 0);
    const totalVal = allParts.reduce((sum, p) => sum + ((parseFloat(p.quantity) || 0) * (parseFloat(p.price) || 0)), 0);
    const lowCount = allParts.filter(p => (parseFloat(p.quantity) || 0) <= (parseFloat(p.threshold) || 1)).length;

    const kpiCount = document.getElementById('spareparts-kpi-count');
    const kpiVal = document.getElementById('spareparts-kpi-val');
    const kpiLow = document.getElementById('spareparts-kpi-low');
    if (kpiCount) kpiCount.textContent = `${allParts.length} parts (${totalCount.toFixed(1)} qty)`;
    if (kpiVal) kpiVal.textContent = `EGP ${totalVal.toFixed(2)}`;
    if (kpiLow) kpiLow.textContent = `${lowCount} item${lowCount === 1 ? '' : 's'}`;

    const filter = window.sparePartsFilter || 'all';
    const filtered = allParts.filter(p => {
      if (filter === 'vehicle') return p.itemType === 'vehicle-spare-part';
      if (filter === 'residential') return p.itemType === 'residential-spare-part';
      return true;
    }).filter(p => {
      if (!searchVal) return true;
      return (p.name || '').toLowerCase().includes(searchVal) ||
             (p.sku || '').toLowerCase().includes(searchVal) ||
             (p.targetVehicleOrUnit || '').toLowerCase().includes(searchVal);
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div class="col-span-2 text-center py-12 text-slate-404 font-semibold bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">No spare parts matching criteria. Use the form to log new parts.</div>`;
      return;
    }

    filtered.forEach(p => {
      const qty = parseFloat(p.quantity) || 0;
      const th = parseFloat(p.threshold) || 1;
      const isLow = qty <= th;
      const badgeClass = isLow ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
      const isVeh = p.itemType === 'vehicle-spare-part';
      const typIcon = isVeh ? '🏎️' : '🏠';
      const typLabel = isVeh ? 'Vehicle Fleet' : 'Property / Home';

      const card = `
        <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between space-y-4">
          <div class="flex items-start justify-between font-medium">
            <div>
              <div class="flex items-center gap-1.5">
                <span class="text-sm">${typIcon}</span>
                <h3 class="text-sm font-black text-slate-900 dark:text-white">${p.name}</h3>
              </div>
              <div class="flex flex-wrap items-center gap-2 mt-1">
                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">${typLabel}</span>
                ${p.sku ? `<span class="text-[9px] font-mono text-slate-400">SKU: ${p.sku}</span>` : ''}
                ${p.targetVehicleOrUnit ? `<span class="text-[9px] text-blue-600 dark:text-blue-400 truncate max-w-[140px]">${p.targetVehicleOrUnit}</span>` : ''}
              </div>
            </div>
            <span class="text-xs font-bold border px-3 py-1 rounded-full ${badgeClass}">
              ${qty.toFixed(1)} ${p.unit || 'pcs'}
            </span>
          </div>

          <div class="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl flex items-center justify-between text-xs font-medium">
            <div>
              <span class="text-[10px] text-slate-400 block uppercase font-bold">Unit Price</span>
              <span class="font-extrabold text-slate-900 dark:text-slate-100">EGP ${Number(p.price || 0).toFixed(2)}</span>
            </div>
            <div class="text-center">
              <span class="text-[10px] text-slate-400 block uppercase font-bold">Total Value</span>
              <span class="font-extrabold text-blue-600 dark:text-blue-400">EGP ${(qty * Number(p.price || 0)).toFixed(2)}</span>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-slate-400 block uppercase font-bold">Reorder Alert</span>
              <span class="font-extrabold text-amber-600">${th.toFixed(1)} ${p.unit || 'pcs'}</span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <input type="number" id="consume-sparepart-${p.id}" placeholder="Qty" class="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold" min="0.1" step="0.1" value="1">
            <button onclick="window.executeSparePartConsumption('${p.id}')" class="flex-grow py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg transition">
              Disburse / Use Part
            </button>
            <button onclick="window.deleteStockItem('${p.id}')" class="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-xs font-bold transition" title="Discard Part">
              🗑️
            </button>
          </div>
        </div>
      `;
      container.innerHTML += card;
    });
  };

  window.executeSparePartConsumption = function(partId) {
    const inputEl = document.getElementById(`consume-sparepart-${partId}`);
    const consumeQty = parseFloat(inputEl?.value) || 1;
    if (consumeQty <= 0) return;

    const part = (Array.isArray(window.stockData) ? window.stockData : []).find(p => p.id === partId);
    if (!part) {
      if (typeof window.triggerToast === 'function') window.triggerToast('Part not found.', 'error');
      return;
    }

    if (Number(part.quantity || 0) < consumeQty) {
      if (typeof window.triggerToast === 'function') window.triggerToast(`Only ${part.quantity} ${part.unit || 'units'} available in stock!`, 'error');
      return;
    }

    part.quantity = Number(part.quantity || 0) - consumeQty;
    if (!Array.isArray(part.consumptionLogs)) part.consumptionLogs = [];
    part.consumptionLogs.push({
      date: new Date().toISOString().split('T')[0],
      amount: consumeQty,
      type: 'consumed_manual'
    });

    localStorage.setItem('pro_stock', JSON.stringify(window.stockData));
    if (typeof window.triggerToast === 'function') {
      window.triggerToast(`Disbursed ${consumeQty} ${part.unit || 'pcs'} of ${part.name}. Remaining: ${part.quantity}`, 'success');
    }

    window.renderSparePartsLedger();
    if (typeof window.renderVehicleManagement === 'function') window.renderVehicleManagement();
    if (typeof window.ForecasterCloudSync !== 'undefined' && window.ForecasterCloudSync.queueSync) {
      window.ForecasterCloudSync.queueSync();
    }
  };

  window.executeConsolidatedStockConsumption = function(name, currentTotal) {
    const inputVal = parseFloat(document.getElementById(`quick-consume-val-${name.replace(/\s+/g, '-')}`)?.value) || 0;
    if (inputVal <= 0) return;

    if (currentTotal < inputVal) {
      window.triggerToast(`Not enough cumulative stock of ${name} left!`, "error");
      return;
    }

    let deficit = inputVal;
    const matchedBatches = window.stockData.filter(s => s.name === name).sort((a,b) => new Date(a.prodDate) - new Date(b.prodDate));
    
    for (let i = 0; i < matchedBatches.length; i++) {
      if (deficit <= 0) break;
      const batch = matchedBatches[i];
      if (batch.quantity >= deficit) {
        batch.quantity -= deficit;
        batch.consumptionLogs.push({ date: new Date().toISOString().split('T')[0], amount: deficit, type: 'consumed' });
        deficit = 0;
      } else {
        deficit -= batch.quantity;
        batch.consumptionLogs.push({ date: new Date().toISOString().split('T')[0], amount: batch.quantity, type: 'consumed' });
        batch.quantity = 0;
      }
    }

    localStorage.setItem('pro_stock', JSON.stringify(window.stockData));
    window.triggerToast(`Disbursed ${inputVal} total of ${name} across active batches.`, "success");
    window.renderAllViews();
  };

  window.renderPharmacyLedger = function() {
    const container = document.getElementById('pharmacy-clinical-rows');
    if (!container) return;

    const searchVal = (document.getElementById('pharmacy-search')?.value || '').toLowerCase();
    container.innerHTML = '';

    const grouped = {};
    window.pharmacyData.forEach(m => {
      if (!grouped[m.name]) grouped[m.name] = [];
      grouped[m.name].push(m);
    });

    Object.entries(grouped).forEach(([name, batches]) => {
      if (searchVal && !name.toLowerCase().includes(searchVal)) return;

      const totalInStock = batches.reduce((sum, b) => sum + parseFloat(b.quantity), 0);
      const sample = batches[0];
      const unit = sample.unit;
      const totalThreshold = batches.reduce((sum, b) => sum + parseFloat(b.threshold), 0);
      const isCritical = totalInStock <= totalThreshold;
      const colorBadge = isCritical ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';

      let cardHTML = `
        <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between space-y-4">
          <div class="flex items-start justify-between font-medium">
            <div>
              <h3 class="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>💊</span> ${name}
              </h3>
              <span class="text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-707 dark:text-slate-300 px-2 py-0.5 rounded font-bold uppercase tracking-wider block mt-1 w-fit">${sample.prescription} medication</span>
            </div>
            <span class="text-xs font-bold border px-3 py-1 rounded-full ${colorBadge}">
              ${totalInStock.toFixed(0)} ${unit} Remaining
            </span>
          </div>
          
          <div class="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl text-xs space-y-1.5 font-medium">
            <div class="flex justify-between">
              <span class="text-slate-404">Dosage Instructions</span>
              <span class="font-extrabold text-slate-900 dark:text-slate-100">${sample.dosage}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-404">Clinical Purpose</span>
              <span class="font-extrabold text-slate-900 dark:text-slate-100">${sample.reason}</span>
            </div>
          </div>

          <div class="flex gap-2 items-center">
            <input type="number" id="med-consume-val-${name.replace(/\s+/g, '-')}" placeholder="Qty" class="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold" min="1" step="1" value="1">
            <button onclick="executeConsolidatedPharmacyConsumption('${name}', ${totalInStock})" class="flex-grow py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg transition">
              Dispense Dose
            </button>
            <button onclick="toggleMedGroupCollapse('${name}')" class="p-1 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
              ${window.expandedMedGroups[name] ? '🔼' : '🔽'}
            </button>
          </div>
      `;

      if (window.expandedMedGroups[name]) {
        cardHTML += `<div class="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2 mt-2">
          <p class="text-[10px] font-black uppercase text-slate-404">Batch Breakdown</p>`;
        batches.forEach(b => {
          cardHTML += `
            <div class="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-700 text-[11px] space-y-1 relative font-medium">
              <div class="flex justify-between font-bold">
                <span>Batch Code: ${b.id.split('_')[1]}</span>
                <span>${b.quantity} ${unit}</span>
              </div>
              <div class="flex justify-between text-[10px] text-slate-404 font-medium">
                <span>Exp Date: ${b.expDate || 'N/A'}</span>
                <span>Price per unit: EGP ${(b.price).toFixed(2)}</span>
              </div>
              <div class="flex justify-end gap-1.5 pt-1.5">
                <button onclick="editPharmacyItem('${b.id}')" class="text-[10px] text-blue-600 font-bold hover:underline">Edit Batch</button>
                <span class="text-slate-300">|</span>
                <button onclick="deletePharmacyItem('${b.id}')" class="text-[10px] text-rose-600 font-bold hover:underline">Discard</button>
              </div>
            </div>
          `;
        });
        cardHTML += `</div>`;
      }

      cardHTML += `</div>`;
      container.innerHTML += cardHTML;
    });

    if (window.pharmacyData.length === 0) {
      container.innerHTML = `<div class="col-span-2 text-center py-12 text-slate-404 font-semibold bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">No clinical medications compiled. Please run registration.</div>`;
    }
  };

  window.executeConsolidatedPharmacyConsumption = function(name, currentTotal) {
    const inputVal = parseInt(document.getElementById(`med-consume-val-${name.replace(/\s+/g, '-')}`)?.value) || 0;
    if (inputVal <= 0) return;

    if (currentTotal < inputVal) {
      window.triggerToast(`Not enough cumulative stock of ${name} left!`, "error");
      return;
    }

    let deficit = inputVal;
    const matchedBatches = window.pharmacyData.filter(m => m.name === name).sort((a,b) => new Date(a.prodDate) - new Date(b.prodDate));
    
    for (let i = 0; i < matchedBatches.length; i++) {
      if (deficit <= 0) break;
      const batch = matchedBatches[i];
      if (batch.quantity >= deficit) {
        batch.quantity -= deficit;
        batch.consumptionLogs.push({ date: new Date().toISOString().split('T')[0], amount: deficit, type: 'consumed' });
        deficit = 0;
      } else {
        deficit -= batch.quantity;
        batch.consumptionLogs.push({ date: new Date().toISOString().split('T')[0], amount: batch.quantity, type: 'consumed' });
        batch.quantity = 0;
      }
    }

    localStorage.setItem('pro_pharmacy', JSON.stringify(window.pharmacyData));
    window.triggerToast(`Disbursed ${inputVal} total medication elements of ${name}.`, "success");
    window.renderAllViews();
  };

  window.renderShoppingPlannerDetails = function() {
    const tbody = document.getElementById('forecaster-planner-rows');
    const totalDisplay = document.getElementById('forecast-total-budget');
    if (!tbody) return;

    tbody.innerHTML = '';
    let cumulativeBudget = 0;
    const consolidated = {};
    
    window.stockData.forEach(s => {
      if (!consolidated[s.name]) {
        consolidated[s.name] = { name: s.name, quantity: 0, logs: [], price: s.price, unit: s.unit, threshold: s.threshold, type: 'asset' };
      }
      consolidated[s.name].quantity += s.quantity;
      consolidated[s.name].logs = consolidated[s.name].logs.concat(s.consumptionLogs || []);
    });

    window.pharmacyData.forEach(m => {
      if (!consolidated[m.name]) {
        consolidated[m.name] = { name: m.name, quantity: 0, logs: [], price: m.price, unit: m.unit, threshold: m.threshold, type: 'pharmacy' };
      }
      consolidated[m.name].quantity += m.quantity;
      consolidated[m.name].logs = consolidated[m.name].logs.concat(m.consumptionLogs || []);
    });

    Object.entries(consolidated).forEach(([name, data]) => {
      let velocity = 0;
      const logs = data.logs.filter(l => l.type === 'consumed');
      if (logs.length > 0) {
        const totalConsumed = logs.reduce((sum, l) => sum + parseFloat(l.amount), 0);
        const dates = logs.map(l => new Date(l.date));
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        const timespan = Math.max(1, Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)));
        velocity = totalConsumed / timespan;
      } else {
        velocity = data.type === 'pharmacy' ? 1.0 : 0.5;
      }

      const daysSupply = velocity > 0 ? (data.quantity / velocity) : 999;
      const safetyBuffer = velocity * 7;
      
      let deficit = 0;
      if (data.quantity < safetyBuffer) {
        deficit = safetyBuffer - data.quantity;
      }

      const estimatedCost = deficit * data.price;
      cumulativeBudget += estimatedCost;

      tbody.innerHTML += `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 font-medium">
          <td class="py-2 px-2 font-bold text-slate-800 dark:text-slate-200">${name}</td>
          <td class="py-2 px-2">${data.quantity.toFixed(0)} ${data.unit}</td>
          <td class="py-2 px-2 font-semibold text-indigo-600 dark:text-indigo-400">${velocity.toFixed(2)} / day</td>
          <td class="py-2 px-2 font-bold">${daysSupply > 100 ? 'Safe reserve' : daysSupply.toFixed(0) + ' Days'}</td>
          <td class="py-2 px-2 text-slate-555">${safetyBuffer.toFixed(0)} ${data.unit}</td>
          <td class="py-2 px-2 font-bold ${deficit > 0 ? 'text-rose-600' : 'text-emerald-600'}">${deficit.toFixed(0)} ${data.unit}</td>
          <td class="py-2 px-2 text-right font-black text-slate-900 dark:text-white">EGP ${estimatedCost.toFixed(2)}</td>
        </tr>
      `;
    });

    if (totalDisplay) totalDisplay.innerText = `EGP ${cumulativeBudget.toFixed(2)}`;
  };

  window.getImmediateReordersAndPredictiveAlerts = function() {
    let lowCount = 0;
    const alerts = [];

    const groupedStock = {};
    (window.stockData || []).forEach(s => {
      const key = (s.name || '').trim();
      if (!groupedStock[key]) {
        groupedStock[key] = { name: s.name, totalQty: 0, totalThreshold: 0, unit: s.unit, batches: [] };
      }
      groupedStock[key].totalQty += parseFloat(s.quantity || 0);
      groupedStock[key].totalThreshold += parseFloat(s.threshold || 0);
      groupedStock[key].batches.push(s);
    });

    const groupedPharmacy = {};
    (window.pharmacyData || []).forEach(m => {
      const key = (m.name || '').trim();
      if (!groupedPharmacy[key]) {
        groupedPharmacy[key] = { name: m.name, totalQty: 0, totalThreshold: 0, unit: m.unit, batches: [] };
      }
      groupedPharmacy[key].totalQty += parseFloat(m.quantity || 0);
      groupedPharmacy[key].totalThreshold += parseFloat(m.threshold || 0);
      groupedPharmacy[key].batches.push(m);
    });

    Object.values(groupedStock).forEach(group => {
      if (group.totalQty <= group.totalThreshold) {
        lowCount++;
        alerts.push(`
          <div class="flex items-start gap-2.5 p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/40 text-xs">
            <span class="text-base shrink-0">🚨</span>
            <div class="min-w-0">
              <h5 class="font-extrabold text-xs text-rose-900 dark:text-rose-200">Reorder Alert: ${group.name}</h5>
              <p class="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5">Low inventory: ${group.totalQty.toFixed(1)} ${group.unit} remaining (Safety threshold: ${group.totalThreshold.toFixed(1)} ${group.unit}). Immediate replenishment advised.</p>
            </div>
          </div>
        `);
      }
    });

    const today = new Date();
    Object.values(groupedPharmacy).forEach(group => {
      if (group.totalQty <= group.totalThreshold) {
        lowCount++;
        alerts.push(`
          <div class="flex items-start gap-2.5 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/40 text-xs">
            <span class="text-base shrink-0">⚠️</span>
            <div class="min-w-0">
              <h5 class="font-extrabold text-xs text-amber-900 dark:text-amber-200">Medication Reorder: ${group.name}</h5>
              <p class="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">Low reserve: ${group.totalQty.toFixed(0)} ${group.unit} on hand (Threshold: ${group.totalThreshold.toFixed(0)} ${group.unit}).</p>
            </div>
          </div>
        `);
      }

      // Check expiry predictions
      group.batches.forEach(b => {
        if (b.expDate) {
          const exp = new Date(b.expDate);
          const daysLeft = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 0) {
            alerts.push(`
              <div class="flex items-start gap-2.5 p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/40 text-xs">
                <span class="text-base shrink-0">🛑</span>
                <div class="min-w-0">
                  <h5 class="font-extrabold text-xs text-rose-900 dark:text-rose-200">Expired Medication: ${group.name}</h5>
                  <p class="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5">Batch [${b.id || 'N/A'}] expired on ${b.expDate}. Safe disposal & replacement required.</p>
                </div>
              </div>
            `);
          } else if (daysLeft <= 30) {
            alerts.push(`
              <div class="flex items-start gap-2.5 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/40 text-xs">
                <span class="text-base shrink-0">⏳</span>
                <div class="min-w-0">
                  <h5 class="font-extrabold text-xs text-amber-900 dark:text-amber-200">Predictive Expiry Warning: ${group.name}</h5>
                  <p class="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">Expires in ${daysLeft} days (${b.expDate}). Plan consumption or refill.</p>
                </div>
              </div>
            `);
          }
        }
      });
    });

    const insightLowStock = document.getElementById('insight-low-stock');
    if (insightLowStock) insightLowStock.innerText = `${lowCount} Items`;

    window.immediateReorderAlerts = alerts;
    return alerts;
  };

  window.renderImmediateSystemAlerts = function() {
    window.getImmediateReordersAndPredictiveAlerts();
  };

  window.renderMedicationSafetyDashboard = function() {
    const container = document.getElementById('medication-safety-dashboard');
    if (!container) return;

    let expiredCount = 0;
    let criticalExpiryList = [];
    let rXCount = 0;
    let otcCount = 0;
    const today = new Date();

    window.pharmacyData.forEach(m => {
      if (m.prescription === 'Rx') rXCount++;
      else otcCount++;

      if (m.expDate) {
        const exp = new Date(m.expDate);
        const diffTime = exp - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) {
          expiredCount++;
          criticalExpiryList.push(`${m.name} (Expired on ${m.expDate})`);
        } else if (diffDays <= 60) {
          criticalExpiryList.push(`${m.name} (Expiring in ${diffDays} days)`);
        }
      }
    });

    container.innerHTML = `
      <div class="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2 font-medium">
        <h4 class="text-xs font-bold text-slate-555 uppercase tracking-wider flex items-center gap-1.5">
          <span class="w-2 h-2 bg-rose-500 rounded-full"></span> Active Expiry Tracker
        </h4>
        <div class="text-xs space-y-1">
          <span class="text-slate-900 dark:text-white font-extrabold text-sm block">${expiredCount} Batches Expired</span>
          <div class="text-[10px] text-slate-500 dark:text-slate-404 max-h-24 overflow-y-auto custom-scrollbar leading-relaxed">
            ${criticalExpiryList.length > 0 ? criticalExpiryList.map(item => `• <span class="text-rose-600 font-bold">${item}</span><br>`).join('') : 'All current medications have safe expiry margins.'}
          </div>
        </div>
      </div>

      <div class="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2 font-medium">
        <h4 class="text-xs font-bold text-slate-555 uppercase tracking-wider flex items-center gap-1.5">
          <span class="w-2 h-2 bg-indigo-500 rounded-full"></span> Therapeutic Safeguard
        </h4>
        <div class="text-xs space-y-2">
          <div class="flex justify-between font-semibold">
            <span>Controlled prescription drugs (Rx)</span>
            <span class="text-indigo-600 dark:text-indigo-400 font-bold">${rXCount} Items</span>
          </div>
          <div class="flex justify-between font-semibold">
            <span>Over the counter drugs (OTC)</span>
            <span class="text-indigo-600 dark:text-indigo-400 font-bold">${otcCount} Items</span>
          </div>
          <p class="text-[9px] text-slate-404 mt-1">Cross-interaction checks compiled dynamically against prescription codes.</p>
        </div>
      </div>

      <div class="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2 font-medium">
        <h4 class="text-xs font-bold text-slate-555 uppercase tracking-wider flex items-center gap-1.5">
          <span class="w-2 h-2 bg-emerald-500 rounded-full"></span> Buffer Defense Index
        </h4>
        <div class="text-xs space-y-1">
          <span class="text-slate-900 dark:text-white font-extrabold text-sm block">System Health Score: 100%</span>
          <p class="text-[10px] text-slate-500 dark:text-slate-404 leading-relaxed">
            Maintains 7-day reserve supply based on consumption velocities. Refill pipelines automatically compute deficit budgets to prevent stock depletions.
          </p>
        </div>
      </div>
    `;
  };

  window.renderInsightsTab = function() {
    const incomeList = document.getElementById('insights-income-list');
    const expenseList = document.getElementById('insights-expense-list');
    const alertsContainer = document.getElementById('alerts-container');
    
    if (!incomeList || !expenseList) return;

    incomeList.innerHTML = '';
    expenseList.innerHTML = '';
    if (alertsContainer) alertsContainer.innerHTML = '';

    let alerts = [];

    for (const [source, config] of Object.entries(window.incomeAllocationBlueprint)) {
      const calculatedBudget = window.budgetLimits.income * (config.pct / 100);
      const actual = window.transactions
        .filter(t => t.type === 'income' && t.category === source)
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
      const percentAchieved = calculatedBudget > 0 ? ((actual / calculatedBudget) * 100).toFixed(0) : 0;
      
      incomeList.innerHTML += `
        <div class="space-y-2 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 font-medium">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span class="w-3.5 h-3.5 rounded-md flex-shrink-0" style="background-color: ${config.color}"></span>
              <div>
                <h5 class="text-sm font-bold text-slate-900 dark:text-white">${source}</h5>
                <span class="text-[10px] uppercase font-semibold text-slate-404">Projection Split: ${config.pct}%</span>
              </div>
            </div>
            <div>
              <span class="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md">Achieved: ${percentAchieved}%</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs border-t border-b border-dashed border-slate-200 dark:border-slate-700 py-2 my-1">
            <div>
              <p class="text-slate-404 font-bold">Actual Received</p>
              <p class="font-extrabold text-slate-800 dark:text-slate-200">EGP ${actual.toFixed(2)}</p>
            </div>
            <div class="text-right">
              <p class="text-slate-404 font-bold">Calculated Target</p>
              <p class="font-extrabold text-slate-600 dark:text-slate-400">EGP ${calculatedBudget.toFixed(2)}</p>
            </div>
          </div>

          <div class="space-y-1">
            <div class="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-300" style="background-color: ${config.color}; width: ${Math.min(percentAchieved, 100)}%"></div>
            </div>
          </div>
        </div>
      `;

      if (actual < (calculatedBudget * 0.8) && calculatedBudget > 0) {
        alerts.push({
          type: 'warning',
          title: `Income Deficiency: ${source}`,
          desc: `Actual inflows of EGP ${actual.toFixed(2)} lag below 80% of your calculated benchmark threshold of EGP ${calculatedBudget.toFixed(2)}.`
        });
      }
    }

    for (const [category, config] of Object.entries(window.expenseAllocationBlueprint)) {
      const calculatedBudgetLimit = window.budgetLimits.expense * (config.pct / 100);
      const actualSpent = window.transactions
        .filter(t => t.type === 'expense' && t.category === category)
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
      const percentSpent = calculatedBudgetLimit > 0 ? ((actualSpent / calculatedBudgetLimit) * 100).toFixed(0) : 0;
      
      let statusBadge = `<span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">On Track</span>`;
      if (parseFloat(percentSpent) >= 100) {
        statusBadge = `<span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300">Over Quota</span>`;
      } else if (parseFloat(percentSpent) >= 80) {
        statusBadge = `<span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">Approaching Limit</span>`;
      }

      expenseList.innerHTML += `
        <div class="space-y-2 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 font-medium">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span class="w-3.5 h-3.5 rounded-md flex-shrink-0" style="background-color: ${config.color}"></span>
              <div>
                <h5 class="text-sm font-bold text-slate-900 dark:text-white">${category}</h5>
                <span class="text-[10px] uppercase font-semibold text-slate-404">Dynamic Priority Weight: ${config.pct}%</span>
              </div>
            </div>
            <div>${statusBadge}</div>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs border-t border-b border-dashed border-slate-200 dark:border-slate-700 py-2 my-1">
            <div>
              <p class="text-slate-404 font-bold">Actual Outflow</p>
              <p class="font-extrabold text-slate-800 dark:text-slate-200">EGP ${actualSpent.toFixed(2)}</p>
            </div>
            <div class="text-right">
              <p class="text-slate-404 font-bold">Calculated Limit</p>
              <p class="font-extrabold text-slate-600 dark:text-slate-400">EGP ${calculatedBudgetLimit.toFixed(2)}</p>
            </div>
          </div>

          <div class="space-y-1">
            <div class="flex justify-between text-[10px] text-slate-505 font-bold">
              <span>Ratio: ${percentSpent}% utilized</span>
              <span>EGP ${Math.max(0, calculatedBudgetLimit - actualSpent).toFixed(2)} remaining</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-300" style="background-color: ${config.color}; width: ${Math.min(percentSpent, 100)}%"></div>
            </div>
          </div>
        </div>
      `;

      if (actualSpent > calculatedBudgetLimit && calculatedBudgetLimit > 0) {
        alerts.push({
          type: 'danger',
          title: `Budget Ceiling Exceeded: ${category}`,
          desc: `Over-allocation flagged! Spent EGP ${actualSpent.toFixed(2)} exceeds the dynamic calculation model limit of EGP ${calculatedBudgetLimit.toFixed(2)}.`
        });
      }
    }

    if (alertsContainer) {
      if (alerts.length === 0) {
        alertsContainer.innerHTML = `
          <div class="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 font-medium">
            <span class="text-lg">🛡️</span>
            <div>
              <h5 class="text-sm font-bold">All calculations on track</h5>
              <p class="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">Financial flows currently balance without anomalies. Outstanding performance!</p>
            </div>
          </div>
        `;
      } else {
        alerts.forEach(al => {
          const isDanger = al.type === 'danger';
          alertsContainer.innerHTML += `
            <div class="flex items-start gap-3 p-4 rounded-xl border font-medium ${isDanger ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900 text-rose-800 dark:text-rose-200' : 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900 text-amber-800 dark:text-amber-200'}">
              <span class="text-lg mt-0.5">${isDanger ? '🚨' : '⚠️'}</span>
              <div>
                <h5 class="text-sm font-extrabold">${al.title}</h5>
                <p class="text-xs opacity-90">${al.desc}</p>
              </div>
            </div>
          `;
        });
      }
    }
  };

  /* CHARTS AND VISUALS */
  window.renderChartsPerformanceTrend = function() {
    const ctx = document.getElementById('overviewChart');
    if (!ctx || typeof Chart === 'undefined') return;

    const expenseCategoriesMap = {};
    const incomeSourcesMap = {};

    Object.keys(window.expenseAllocationBlueprint).forEach(k => expenseCategoriesMap[k] = 0);
    Object.keys(window.incomeAllocationBlueprint).forEach(k => incomeSourcesMap[k] = 0);

    window.transactions.forEach(t => {
      if (t.type === 'expense' && t.category in expenseCategoriesMap) {
        expenseCategoriesMap[t.category] += parseFloat(t.amount);
      } else if (t.type === 'income' && t.category in incomeSourcesMap) {
        incomeSourcesMap[t.category] += parseFloat(t.amount);
      }
    });

    const labels = Object.keys(window.expenseAllocationBlueprint);
    const actualSpentData = labels.map(lbl => expenseCategoriesMap[lbl]);
    const limitsData = labels.map(lbl => window.budgetLimits.expense * (window.expenseAllocationBlueprint[lbl].pct / 100));

    if (window.performanceChartInstance) {
      window.performanceChartInstance.destroy();
    }

    const isDark = document.documentElement.classList.contains('dark');

    window.performanceChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Actual Spent (EGP)',
            data: actualSpentData,
            backgroundColor: labels.map(lbl => window.expenseAllocationBlueprint[lbl].color),
            borderRadius: 6,
            borderWidth: 0
          },
          {
            label: 'Calculated Budget Limit (EGP)',
            data: limitsData,
            backgroundColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(226, 232, 240, 0.65)',
            borderColor: isDark ? 'rgba(71, 85, 105, 0.8)' : 'rgba(148, 163, 184, 0.4)',
            borderWidth: 1.5,
            borderRadius: 6,
            type: 'bar'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: isDark ? '#e2e8f0' : '#475569',
              font: { family: 'Inter', weight: 600, size: 11 },
              boxWidth: 12
            }
          },
          tooltip: {
            backgroundColor: isDark ? '#1e293b' : '#0f172a',
            titleFont: { family: 'Inter', weight: 'bold' },
            bodyFont: { family: 'Inter' },
            padding: 10,
            cornerRadius: 8
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: isDark ? '#334155' : '#f1f5f9' },
            ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Inter', size: 10 } }
          },
          x: {
            grid: { display: false },
            ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Inter', size: 9, weight: 600 } }
          }
        }
      }
    });
  };

  /* REPORTS INSPECTOR */
  window.selectInsight = function(insightId) {
    window.activeInsightId = insightId;
    const listIds = ['spending', 'fueling-history', 'categories', 'income-vs-expense', 'living-costs', 'subscriptions'];
    listIds.forEach(id => {
      const button = document.getElementById(`btn-insight-${id}`);
      if (button) {
        if (id === insightId) {
          button.className = "w-full text-left py-3.5 px-4 flex items-center justify-between bg-blue-50/85 dark:bg-blue-950/40 border-l-4 border-l-blue-600 rounded-2xl transition-all duration-200 group";
        } else {
          button.className = "w-full text-left py-3.5 px-4 flex items-center justify-between hover:bg-slate-50/70 dark:hover:bg-slate-800/70 rounded-2xl transition-all duration-200 group border border-transparent";
        }
      }
    });
    window.renderInteractiveReportsDashboard();
  };

  window.renderInteractiveReportsDashboard = function() {
    const container = document.getElementById('insight-report-content');
    if (!container) return;

    const expenseTxns = window.transactions.filter(t => t.type === 'expense');
    const totalSpent = expenseTxns.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const incomeTxns = window.transactions.filter(t => t.type === 'income');
    const totalIncome = incomeTxns.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    if (window.activeInsightId === 'spending') {
      const txCount = expenseTxns.length;
      const avgSpend = txCount > 0 ? (totalSpent / txCount) : 0;
      
      let weekendSpent = 0;
      let weekdaySpent = 0;
      expenseTxns.forEach(t => {
        const day = new Date(t.date).getDay();
        if (day === 0 || day === 6) weekendSpent += t.amount;
        else weekdaySpent += t.amount;
      });
      
      const totalCalculated = weekendSpent + weekdaySpent;
      const weekendPct = totalCalculated > 0 ? (weekendSpent / totalCalculated * 100) : 0;
      const weekdayPct = totalCalculated > 0 ? (weekdaySpent / totalCalculated * 100) : 0;

      let maxTx = { description: 'None', amount: 0, date: 'N/A' };
      expenseTxns.forEach(t => {
        if (t.amount > maxTx.amount) maxTx = t;
      });

      container.innerHTML = `
        <div class="space-y-4 font-medium">
          <div>
            <span class="px-2.5 py-0.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold uppercase rounded-full">Automated Spending Analysis</span>
            <h4 class="text-lg font-black text-slate-900 dark:text-white mt-1.5">Spending Insights Overview</h4>
          </div>
          
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl">
              <span class="text-[10px] text-slate-404 block uppercase font-bold mb-0.5">Total Outflow</span>
              <span class="text-lg font-extrabold text-slate-900 dark:text-white">EGP ${totalSpent.toFixed(2)}</span>
            </div>
            <div class="p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl">
              <span class="text-[10px] text-slate-404 block uppercase font-bold mb-0.5">Avg Transaction</span>
              <span class="text-lg font-extrabold text-slate-900 dark:text-white">EGP ${avgSpend.toFixed(2)}</span>
            </div>
            <div class="p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl">
              <span class="text-[10px] text-slate-404 block uppercase font-bold mb-0.5">Volume Count</span>
              <span class="text-lg font-extrabold text-slate-900 dark:text-white">${txCount} Entry Logs</span>
            </div>
          </div>

          <div class="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl space-y-3">
            <h5 class="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-semibold">Weekly Disbursal Footprint</h5>
            <div class="space-y-2">
              <div>
                <div class="flex justify-between text-xs text-slate-600 dark:text-slate-300 font-semibold mb-1">
                  <span>Weekdays (Mon - Fri)</span>
                  <span>EGP ${weekdaySpent.toFixed(2)} (${weekdayPct.toFixed(0)}%)</span>
                </div>
                <div class="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div class="bg-amber-500 h-full rounded-full" style="width: ${weekdayPct}%"></div>
                </div>
              </div>
              <div>
                <div class="flex justify-between text-xs text-slate-600 dark:text-slate-300 font-semibold mb-1">
                  <span>Weekends (Sat - Sun)</span>
                  <span>EGP ${weekendSpent.toFixed(2)} (${weekendPct.toFixed(0)}%)</span>
                </div>
                <div class="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div class="bg-indigo-500 h-full rounded-full" style="width: ${weekendPct}%"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl flex items-center justify-between">
            <div>
              <span class="text-[10px] text-slate-404 block uppercase font-bold">Largest Single Outflow</span>
              <span class="text-sm font-extrabold text-slate-800 dark:text-slate-200">${maxTx.description}</span>
              <span class="text-[10px] text-slate-404 block">${maxTx.date} (${maxTx.category})</span>
            </div>
            <span class="text-lg font-black text-rose-600">EGP ${maxTx.amount.toFixed(2)}</span>
          </div>
        </div>
      `;
    }
  };

  /* EXCEL & PDF EXPORT */
  window.downloadActiveInsightExcel = function() {
    try {
      if (typeof XLSX === 'undefined') return;
      const wb = XLSX.utils.book_new();
      const dataRows = window.transactions.filter(t => t.type === 'expense').map(t => ({
        "Transaction Date": t.date,
        "Category": t.category,
        "Details Description": t.description,
        "Amount Value (EGP)": t.amount
      }));
      const sheet = XLSX.utils.json_to_sheet(dataRows);
      XLSX.utils.book_append_sheet(wb, sheet, "Insight Report");
      XLSX.writeFile(wb, `Forecaster_Pro_Insight_${window.activeInsightId}_${new Date().toISOString().split('T')[0]}.xlsx`);
      window.triggerToast("Report spreadsheet downloaded successfully!", "success");
    } catch (err) {
      console.error(err);
      window.triggerToast("Spreadsheet compilation failure.", "error");
    }
  };

  window.downloadActiveInsightPDF = function() {
    try {
      if (!window.jspdf) return;
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(`Forecaster Pro - Financial Report`, 14, 20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 26);

      const expenseTxns = window.transactions.filter(t => t.type === 'expense');
      const tableRows = expenseTxns.slice(0, 40).map(t => [t.date, t.category, t.description, `EGP ${t.amount.toFixed(2)}`]);

      doc.autoTable({
        head: [['Date', 'Category', 'Description', 'Amount']],
        body: tableRows,
        startY: 34,
        theme: 'striped',
        styles: { fontSize: 8.5 }
      });

      doc.save(`Forecaster_Pro_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      window.triggerToast("Dynamic PDF report compiled and saved!", "success");
    } catch (err) {
      console.error(err);
      window.triggerToast("PDF generation failed.", "error");
    }
  };

  window.exportToExcel = function() {
    try {
      if (typeof XLSX === 'undefined') return;
      const wb = XLSX.utils.book_new();

      const txSheet = XLSX.utils.json_to_sheet(window.transactions);
      XLSX.utils.book_append_sheet(wb, txSheet, "Transactions");

      const invSheet = XLSX.utils.json_to_sheet(window.stockData);
      XLSX.utils.book_append_sheet(wb, invSheet, "Inventory");

      const medSheet = XLSX.utils.json_to_sheet(window.pharmacyData);
      XLSX.utils.book_append_sheet(wb, medSheet, "Pharmacy");

      XLSX.writeFile(wb, `Forecaster_Pro_Full_Spreadsheet_${new Date().toISOString().split('T')[0]}.xlsx`);
      window.triggerToast("Full spreadsheet downloaded!", "success");
    } catch (err) {
      console.error(err);
      window.triggerToast("Export failed.", "error");
    }
  };

  window.exportToPDF = function() {
    try {
      if (!window.jspdf) return;
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Forecaster Pro - Executive Wealth & Status Digest", 14, 20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Compiled: ${new Date().toLocaleString()}`, 14, 26);

      const tableRows = window.transactions.slice(0, 30).map(t => [t.date, t.type.toUpperCase(), t.category, t.description, `EGP ${t.amount.toFixed(2)}`]);
      doc.autoTable({
        head: [['Date', 'Type', 'Category', 'Description', 'Amount']],
        body: tableRows,
        startY: 34,
        theme: 'striped',
        styles: { fontSize: 8 }
      });

      doc.save(`Forecaster_Pro_Status_Digest_${new Date().toISOString().split('T')[0]}.pdf`);
      window.triggerToast("PDF status digest downloaded!", "success");
    } catch (err) {
      console.error(err);
      window.triggerToast("PDF generation failed.", "error");
    }
  };

  /* ============================================================================
   * BACKUP & RESTORE DATA ENGINE (LOCAL JSON IMPORT/EXPORT)
   * ============================================================================ */
  window.downloadBackupJSON = function() {
    try {
      const A = (k) => {
        try {
          const v = JSON.parse(localStorage.getItem(k) || '[]');
          return Array.isArray(v) ? v : [];
        } catch (e) { return []; }
      };
      const O = (k, def = null) => {
        try {
          const v = JSON.parse(localStorage.getItem(k) || 'null');
          return (v && typeof v === 'object') ? v : def;
        } catch (e) { return def; }
      };

      const backupData = {
        version: 'ForecasterPro-v1.06.12-enterprise',
        exportedAt: new Date().toISOString(),
        transactions: Array.isArray(window.transactions) && window.transactions.length > 0 ? window.transactions : A('pro_transactions'),
        stockData: Array.isArray(window.stockData) && window.stockData.length > 0 ? window.stockData : A('pro_stock'),
        pharmacyData: Array.isArray(window.pharmacyData) && window.pharmacyData.length > 0 ? window.pharmacyData : A('pro_pharmacy'),
        budgetLimits: (window.budgetLimits && typeof window.budgetLimits === 'object') ? window.budgetLimits : O('pro_budget_limits', { income: 3500, expense: 2000 }),
        accounts: Array.isArray(window.accounts) && window.accounts.length > 0 ? window.accounts : A('pro_accounts'),
        accountTransfers: Array.isArray(window.accountTransfers) ? window.accountTransfers : A('pro_account_transfers'),
        pro_vehicles: A('pro_vehicles'),
        pro_vehicle_fuel: A('pro_vehicle_fuel'),
        pro_vehicle_maintenance: A('pro_vehicle_maintenance'),
        pro_rental_contracts_v1: A('pro_rental_contracts_v1'),
        pro_rental_properties_v1: A('pro_rental_properties_v1'),
        pro_rental_notifications_v1: A('pro_rental_notifications_v1'),
        pro_rental_notification_config_v1: O('pro_rental_notification_config_v1', {}),
        forecaster_profile_user: O('forecaster_profile_user', null),
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      const filename = `forecaster_pro_backup_${new Date().toISOString().slice(0, 10)}.json`;
      downloadAnchor.href = url;
      downloadAnchor.download = filename;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);

      if (typeof window.triggerToast === 'function') {
        window.triggerToast('Backup JSON exported successfully!', 'success');
      }
    } catch (err) {
      console.error('[Forecaster Backup Export Error]', err);
      if (typeof window.triggerToast === 'function') {
        window.triggerToast('Failed to export backup: ' + err.message, 'error');
      }
    }
  };

  window.importBackupJSON = function(event) {
    const fileInput = (event && event.target) ? event.target : document.getElementById('import-json-file');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      return;
    }

    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function(e) {
      try {
        const text = e.target.result;
        const data = JSON.parse(text);

        if (!data || typeof data !== 'object') {
          throw new Error('Invalid JSON structure');
        }

        let datasetCount = 0;

        // 1. Transactions
        if (Array.isArray(data.transactions)) {
          window.transactions = data.transactions;
          localStorage.setItem('pro_transactions', JSON.stringify(data.transactions));
          datasetCount++;
        } else if (Array.isArray(data.pro_transactions)) {
          window.transactions = data.pro_transactions;
          localStorage.setItem('pro_transactions', JSON.stringify(data.pro_transactions));
          datasetCount++;
        }

        // 2. Stock / Inventory
        if (Array.isArray(data.stockData)) {
          window.stockData = data.stockData;
          localStorage.setItem('pro_stock', JSON.stringify(data.stockData));
          datasetCount++;
        } else if (Array.isArray(data.pro_stock)) {
          window.stockData = data.pro_stock;
          localStorage.setItem('pro_stock', JSON.stringify(data.pro_stock));
          datasetCount++;
        }

        // 3. Pharmacy / Medications
        if (Array.isArray(data.pharmacyData)) {
          window.pharmacyData = data.pharmacyData;
          localStorage.setItem('pro_pharmacy', JSON.stringify(data.pharmacyData));
          datasetCount++;
        } else if (Array.isArray(data.pro_pharmacy)) {
          window.pharmacyData = data.pro_pharmacy;
          localStorage.setItem('pro_pharmacy', JSON.stringify(data.pro_pharmacy));
          datasetCount++;
        }

        // 4. Budget Limits
        if (data.budgetLimits && typeof data.budgetLimits === 'object') {
          window.budgetLimits = data.budgetLimits;
          localStorage.setItem('pro_budget_limits', JSON.stringify(data.budgetLimits));
          datasetCount++;
        } else if (data.pro_budget_limits && typeof data.pro_budget_limits === 'object') {
          window.budgetLimits = data.pro_budget_limits;
          localStorage.setItem('pro_budget_limits', JSON.stringify(data.pro_budget_limits));
          datasetCount++;
        }

        // 5. Payment Accounts & Transfers
        if (Array.isArray(data.accounts)) {
          window.accounts = data.accounts;
          localStorage.setItem('pro_accounts', JSON.stringify(data.accounts));
          datasetCount++;
        } else if (Array.isArray(data.pro_accounts)) {
          window.accounts = data.pro_accounts;
          localStorage.setItem('pro_accounts', JSON.stringify(data.pro_accounts));
          datasetCount++;
        }

        if (Array.isArray(data.accountTransfers)) {
          window.accountTransfers = data.accountTransfers;
          localStorage.setItem('pro_account_transfers', JSON.stringify(data.accountTransfers));
          datasetCount++;
        } else if (Array.isArray(data.pro_account_transfers)) {
          window.accountTransfers = data.pro_account_transfers;
          localStorage.setItem('pro_account_transfers', JSON.stringify(data.pro_account_transfers));
          datasetCount++;
        }

        // 6. Vehicles, Fuel, Maintenance
        if (Array.isArray(data.pro_vehicles) || Array.isArray(data.vehicles)) {
          const v = data.pro_vehicles || data.vehicles;
          localStorage.setItem('pro_vehicles', JSON.stringify(v));
          datasetCount++;
        }
        if (Array.isArray(data.pro_vehicle_fuel) || Array.isArray(data.vehicleFuel)) {
          const vf = data.pro_vehicle_fuel || data.vehicleFuel;
          localStorage.setItem('pro_vehicle_fuel', JSON.stringify(vf));
          datasetCount++;
        }
        if (Array.isArray(data.pro_vehicle_maintenance) || Array.isArray(data.vehicleMaintenance)) {
          const vm = data.pro_vehicle_maintenance || data.vehicleMaintenance;
          localStorage.setItem('pro_vehicle_maintenance', JSON.stringify(vm));
          datasetCount++;
        }

        // 7. Rental Contracts & Properties
        if (Array.isArray(data.pro_rental_contracts_v1) || Array.isArray(data.rentalContracts)) {
          const rc = data.pro_rental_contracts_v1 || data.rentalContracts;
          localStorage.setItem('pro_rental_contracts_v1', JSON.stringify(rc));
          datasetCount++;
        }
        if (Array.isArray(data.pro_rental_properties_v1) || Array.isArray(data.rentalProperties)) {
          const rp = data.pro_rental_properties_v1 || data.rentalProperties;
          localStorage.setItem('pro_rental_properties_v1', JSON.stringify(rp));
          datasetCount++;
        }
        if (Array.isArray(data.pro_rental_notifications_v1)) {
          localStorage.setItem('pro_rental_notifications_v1', JSON.stringify(data.pro_rental_notifications_v1));
        }
        if (data.pro_rental_notification_config_v1) {
          localStorage.setItem('pro_rental_notification_config_v1', JSON.stringify(data.pro_rental_notification_config_v1));
        }

        // 8. User Profile
        if (data.forecaster_profile_user) {
          localStorage.setItem('forecaster_profile_user', JSON.stringify(data.forecaster_profile_user));
        }

        if (datasetCount === 0) {
          throw new Error('No recognized Forecaster Pro datasets found in the backup file.');
        }

        // Reset file input so re-selecting same file triggers change
        fileInput.value = '';

        // Reload data into memory
        if (typeof window.loadIntegratedDatabases === 'function') window.loadIntegratedDatabases();
        if (typeof window.loadRentalDatabase === 'function') window.loadRentalDatabase();
        if (typeof window.loadVehicleDatabase === 'function') window.loadVehicleDatabase();
        if (typeof window.rpmLoad === 'function') window.rpmLoad();

        // Re-render UI
        if (typeof window.renderAllViews === 'function') {
          window.renderAllViews();
        }

        if (typeof window.triggerToast === 'function') {
          window.triggerToast(`Backup successfully imported! (${datasetCount} datasets restored)`, 'success');
        }

        if (window.ForecasterCloudSync && typeof window.ForecasterCloudSync.notifyDataChanged === 'function') {
          window.ForecasterCloudSync.notifyDataChanged();
        }

        // Return to dashboard cleanly
        setTimeout(() => {
          if (typeof window.switchView === 'function') {
            window.switchView('dashboard');
          }
        }, 400);

      } catch (err) {
        console.error('[Forecaster Backup Import Error]', err);
        fileInput.value = '';
        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Failed to import backup: ' + err.message, 'error');
        }
      }
    };

    reader.readAsText(file);
  };

  /* ============================================================================
   * PAYMENT ACCOUNTS SPECIFIC BACKUP & UPLOAD BACKUP ENGINE
   * ============================================================================ */
  window.backupPaymentAccounts = function() {
    try {
      const accounts = Array.isArray(window.accounts) && window.accounts.length > 0
        ? window.accounts
        : JSON.parse(localStorage.getItem('pro_accounts') || '[]');
      const transfers = Array.isArray(window.accountTransfers)
        ? window.accountTransfers
        : JSON.parse(localStorage.getItem('pro_account_transfers') || '[]');

      const backupData = {
        version: 'ForecasterPro-Accounts-v1.0',
        exportedAt: new Date().toISOString(),
        type: 'payment_accounts_backup',
        accounts: accounts,
        accountTransfers: transfers,
        accountCount: accounts.length,
        transferCount: transfers.length
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      const filename = `payment_accounts_backup_${new Date().toISOString().slice(0, 10)}.json`;
      downloadAnchor.href = url;
      downloadAnchor.download = filename;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);

      if (typeof window.triggerToast === 'function') {
        window.triggerToast(`Payment accounts backup (${accounts.length} accounts, ${transfers.length} transfers) exported!`, 'success');
      }
    } catch (err) {
      console.error('[Payment Accounts Backup Export Error]', err);
      if (typeof window.triggerToast === 'function') {
        window.triggerToast('Failed to export payment accounts: ' + err.message, 'error');
      }
    }
  };

  window.importPaymentAccountsBackup = function(event) {
    const fileInput = (event && event.target) ? event.target : document.getElementById('upload-accounts-backup-file');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      return;
    }

    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function(e) {
      try {
        const text = e.target.result;
        const data = JSON.parse(text);

        if (!data || typeof data !== 'object') {
          throw new Error('Invalid JSON file format');
        }

        let newAccounts = null;
        let newTransfers = null;

        if (Array.isArray(data.accounts)) newAccounts = data.accounts;
        else if (Array.isArray(data.pro_accounts)) newAccounts = data.pro_accounts;

        if (Array.isArray(data.accountTransfers)) newTransfers = data.accountTransfers;
        else if (Array.isArray(data.pro_account_transfers)) newTransfers = data.pro_account_transfers;

        if (!newAccounts && !newTransfers) {
          throw new Error('No payment accounts or transfers found in this backup file.');
        }

        if (newAccounts && newAccounts.length > 0) {
          window.accounts = newAccounts;
          localStorage.setItem('pro_accounts', JSON.stringify(newAccounts));
        }

        if (newTransfers) {
          window.accountTransfers = newTransfers;
          localStorage.setItem('pro_account_transfers', JSON.stringify(newTransfers));
        }

        fileInput.value = '';

        // Re-render UI and dropdowns
        if (typeof window.populateAccountSelects === 'function') window.populateAccountSelects();
        if (typeof window.renderAccountsView === 'function') window.renderAccountsView();
        if (typeof window.renderDashboardAccountsAnalysis === 'function') window.renderDashboardAccountsAnalysis();
        if (typeof window.renderAllViews === 'function') window.renderAllViews();

        if (window.ForecasterCloudSync && typeof window.ForecasterCloudSync.notifyDataChanged === 'function') {
          window.ForecasterCloudSync.notifyDataChanged();
        }

        const restoredCount = newAccounts ? newAccounts.length : 0;
        if (typeof window.triggerToast === 'function') {
          window.triggerToast(`Successfully uploaded payment accounts backup! (${restoredCount} accounts restored)`, 'success');
        }
      } catch (err) {
        console.error('[Payment Accounts Backup Upload Error]', err);
        fileInput.value = '';
        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Failed to upload backup: ' + err.message, 'error');
        }
      }
    };

    reader.readAsText(file);
  };

  /* QUICK ADD TRANSACTION MODAL */
  window.openAddTransactionModal = function() {
    document.getElementById('custom-modal').classList.remove('hidden');
    document.getElementById('add-txn-modal').classList.remove('hidden');
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('input-date');
    if (dateInput) dateInput.value = today;
    window.toggleFormType('expense');
  };

  window.closeAddTransactionModal = function() {
    const modal = document.getElementById('add-txn-modal');
    if (modal) modal.classList.add('hidden');
    const customModal = document.getElementById('custom-modal');
    if (customModal) customModal.classList.add('hidden');
    const form = document.getElementById('modal-form');
    if (form) form.reset();
  };

  window.toggleFormType = function(type) {
    const expenseLabel = document.getElementById('label-type-expense');
    const incomeLabel = document.getElementById('label-type-income');
    const selectEl = document.getElementById('input-category');
    if (!selectEl) return;

    selectEl.innerHTML = '';
    const activeClass = "cursor-pointer border-2 border-blue-500 bg-blue-50 text-blue-700 p-3 rounded-xl flex items-center justify-center space-x-2 font-bold text-xs transition-all duration-150";
    const inactiveClass = "cursor-pointer border-2 border-slate-200 text-slate-600 p-3 rounded-xl flex items-center justify-center space-x-2 font-bold text-xs transition-all duration-150";

    if (type === 'expense') {
      if (expenseLabel) expenseLabel.className = activeClass;
      if (incomeLabel) incomeLabel.className = inactiveClass;

      const expCats = window.expenseCategoriesForPropertyRole();
      expCats.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        selectEl.appendChild(opt);
      });
    } else {
      if (incomeLabel) incomeLabel.className = activeClass;
      if (expenseLabel) expenseLabel.className = inactiveClass;

      const incCats = window.incomeCategoriesForPropertyRole();
      incCats.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        selectEl.appendChild(opt);
      });
    }
  };

  window.handleFormSubmission = function(event) {
    event.preventDefault();
    const type = document.querySelector('input[name="entry-type"]:checked')?.value || 'expense';
    const description = document.getElementById('input-desc').value.trim();
    const amount = parseFloat(document.getElementById('input-amount').value) || 0;
    const category = document.getElementById('input-category').value;
    const date = document.getElementById('input-date').value;

    if (amount <= 0 || !description || !date) return;

    const entry = {
      id: 'tx_' + Date.now(),
      date,
      description,
      category,
      type,
      amount,
      accountId: document.getElementById('input-account')?.value || ''
    };

    window.transactions.push(entry);
    window.saveTransactionsDatabase();
    window.closeAddTransactionModal();
    window.triggerToast("Transaction entry posted to audit ledger!", "success");
    window.renderAllViews();
  };

  window.applyFilters = function(type) {
    if (type === 'transaction') {
      window.renderConsolidatedTableRegistry();
    }
  };

  // Lifecycle boot
  window.addEventListener('DOMContentLoaded', () => {
    window.loadIntegratedDatabases();
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('form-txn-date');
    if (dateInput) dateInput.value = today;

    window.setFormType('expense');
    window.populateCategoryFilters();
    window.selectInsight('spending');
    window.switchView('dashboard');
    window.renderAllViews();

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  });
})();
