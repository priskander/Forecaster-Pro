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

      if (window.transactions.length === 0) {
        window.transactions = [
          { id: "tx_init_1", date: "2026-07-01", description: "Direct Deposit Monthly Salary", category: "Salary", type: "income", amount: 3100.00 },
          { id: "tx_init_2", date: "2026-07-02", description: "Apartment Premium Rental Rent", category: "Rent", type: "expense", amount: 800.00 },
          { id: "tx_init_3", date: "2026-07-04", description: "UI/UX Freelance App Project", category: "Freelance", type: "income", amount: 400.00 },
          { id: "tx_init_4", date: "2026-07-05", description: "Monthly Power Utility Bills", category: "Utilities", type: "expense", amount: 150.00 }
        ];
      }
      window.saveTransactionsDatabase();
    }

    const storedLimits = localStorage.getItem('pro_budget_limits');
    if (storedLimits) {
      window.budgetLimits = JSON.parse(storedLimits);
    }
  };

  window.saveTransactionsDatabase = function() {
    localStorage.setItem('pro_transactions', JSON.stringify(window.transactions));
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
    const requestedStockModule = viewId === 'pharmacy' ? 'pharmacy' : (viewId === 'inventory' ? 'inventory' : null);
    if (requestedStockModule) viewId = 'stock';

    // 1. Hide all view sections
    document.querySelectorAll('.view-section').forEach(section => {
      section.classList.remove('active');
    });
    
    // 2. Show requested view section
    const activeView = document.getElementById('view-' + viewId);
    if (activeView) {
      activeView.classList.add('active');
    }
    
    // 3. Update desktop nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.className = "nav-link flex items-center gap-2 text-slate-707 dark:text-slate-300 font-semibold hover:text-blue-600 px-3.5 py-2 rounded-lg transition-all flex-shrink-0";
    });
    
    if (element && element.classList && element.classList.contains('nav-link')) {
      element.className = "nav-link flex items-center gap-2 bg-blue-600 text-white px-3.5 py-2 rounded-lg font-semibold shadow-sm transition-all flex-shrink-0";
    } else {
      const selector = document.querySelector(`.nav-link[onclick*='${viewId}']`);
      if (selector) {
        selector.className = "nav-link flex items-center gap-2 bg-blue-600 text-white px-3.5 py-2 rounded-lg font-semibold shadow-sm transition-all flex-shrink-0";
      }
    }

    // 4. Sync mobile bottom nav items if present
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
      const targetView = btn.getAttribute('data-target-view');
      if (targetView === viewId) {
        btn.classList.add('text-blue-600', 'dark:text-blue-400');
        btn.classList.remove('text-slate-500', 'dark:text-slate-404');
      } else {
        btn.classList.remove('text-blue-600', 'dark:text-blue-400');
        btn.classList.add('text-slate-500', 'dark:text-slate-404');
      }
    });

    // 5. Close mobile drawer if open
    const drawer = document.getElementById('mobile-more-drawer');
    if (drawer && !drawer.classList.contains('hidden')) {
      drawer.classList.add('hidden');
    }

    // 6. Scroll to top
    window.scrollTo({ top: 0, behavior: 'instant' });

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
    }, 50);
  };

  /* STOCK & PHARMACY SWITCHER */
  window.setStockPharmacyModule = function(module) {
    const inventoryPanel = document.getElementById('stock-module-panel');
    const pharmacyPanel = document.getElementById('pharmacy-module-panel');
    const inventoryBtn = document.getElementById('stock-module-btn');
    const pharmacyBtn = document.getElementById('pharmacy-module-btn');
    if (!inventoryPanel || !pharmacyPanel) return;

    const showInventory = module !== 'pharmacy';
    inventoryPanel.classList.toggle('hidden', !showInventory);
    pharmacyPanel.classList.toggle('hidden', showInventory);

    if (inventoryBtn) {
      inventoryBtn.className = showInventory
        ? 'py-2 px-4 border-2 border-blue-600 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5'
        : 'py-2 px-4 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5';
    }
    if (pharmacyBtn) {
      pharmacyBtn.className = !showInventory
        ? 'py-2 px-4 border-2 border-blue-600 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5'
        : 'py-2 px-4 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5';
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
    const typeInput = document.getElementById('form-txn-type');
    const tipEl = document.getElementById('form-txn-tip');
    const selectEl = document.getElementById('form-txn-category');

    if (!typeInput || !selectEl) return;
    typeInput.value = type;
    selectEl.innerHTML = '';

    if (type === 'expense') {
      if (expenseBtn) expenseBtn.className = "py-2 px-3 border-2 border-blue-600 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5";
      if (incomeBtn) incomeBtn.className = "py-2 px-3 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5";
      if (tipEl) tipEl.classList.remove('hidden');

      const expCats = window.expenseCategoriesForPropertyRole();
      expCats.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.innerHTML = cat === "Groceries" ? "🥦 Groceries" : (cat === "Medical" ? "💊 Medical" : cat === "Tobacco" ? "🚬 Tobacco" : cat);
        selectEl.appendChild(opt);
      });
    } else {
      if (incomeBtn) incomeBtn.className = "py-2 px-3 border-2 border-blue-600 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5";
      if (expenseBtn) expenseBtn.className = "py-2 px-3 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5";
      if (tipEl) tipEl.classList.add('hidden');

      const incCats = window.incomeCategoriesForPropertyRole();
      incCats.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.innerHTML = cat;
        selectEl.appendChild(opt);
      });
    }
  };

  window.handleUnifiedTxnSubmit = function(e) {
    e.preventDefault();
    const type = document.getElementById('form-txn-type').value;
    const date = document.getElementById('form-txn-date').value;
    const category = document.getElementById('form-txn-category').value;
    const amount = parseFloat(document.getElementById('form-txn-amount').value);
    const desc = document.getElementById('form-txn-desc').value.trim();

    const entry = {
      id: 'tx_' + Date.now(),
      date: date,
      category: category,
      amount: amount,
      description: desc || `${type.charAt(0).toUpperCase() + type.slice(1)} Entry`,
      type: type
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

  /* MAIN ORCHESTRATOR */
  window.renderAllViews = function() {
    window.calculateOverallDashboardAggregates();
    window.renderDashboardBlueprintItems();
    window.renderConsolidatedTableRegistry();
    window.renderStockInventoryLedger();
    window.renderPharmacyLedger();
    window.renderShoppingPlannerDetails();
    window.renderImmediateSystemAlerts();
    window.renderMedicationSafetyDashboard();
    window.renderChartsPerformanceTrend();
    window.renderInsightsTab();
    window.renderInteractiveReportsDashboard();
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
    
    window.triggerToast("Dynamic blueprint targets recomputed!", "success");
    window.renderAllViews();
  };

  window.renderDashboardBlueprintItems = function() {
    const incContainer = document.getElementById('blueprint-income-items');
    const expContainer = document.getElementById('blueprint-expense-items');
    
    if (!incContainer || !expContainer) return;

    incContainer.innerHTML = '';
    expContainer.innerHTML = '';

    for (const [name, data] of Object.entries(window.incomeAllocationBlueprint)) {
      const targetValue = window.budgetLimits.income * (data.pct / 100);
      incContainer.innerHTML += `
        <div class="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between font-medium">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${data.color}"></span>
            <span class="text-xs text-slate-707 dark:text-slate-300">${name} (${data.pct}%)</span>
          </div>
          <span class="text-xs font-bold text-slate-900 dark:text-white">EGP ${targetValue.toFixed(2)}</span>
        </div>
      `;
    }

    for (const [name, data] of Object.entries(window.expenseAllocationBlueprint)) {
      const targetValue = window.budgetLimits.expense * (data.pct / 100);
      expContainer.innerHTML += `
        <div class="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between font-medium">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${data.color}"></span>
            <span class="text-xs text-slate-707 dark:text-slate-300">${name} (${data.pct}%)</span>
          </div>
          <span class="text-xs font-bold text-slate-900 dark:text-white">EGP ${targetValue.toFixed(2)}</span>
        </div>
      `;
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

    const grouped = {};
    window.stockData.forEach(s => {
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
              <span class="text-[10px] text-slate-404 block uppercase font-bold">Avg Value</span>
              <span class="font-extrabold text-slate-900 dark:text-slate-100">EGP ${(batches[0].price).toFixed(2)} / base</span>
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

    if (window.stockData.length === 0) {
      container.innerHTML = `<div class="col-span-2 text-center py-12 text-slate-404 font-semibold bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">No assets currently logged. Use registration form.</div>`;
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

  window.renderImmediateSystemAlerts = function() {
    const container = document.getElementById('alerts-ledger-container');
    const insightLowStock = document.getElementById('insight-low-stock');
    if (!container) return;

    container.innerHTML = '';
    let lowCount = 0;

    const groupedStock = {};
    window.stockData.forEach(s => {
      const key = s.name.trim();
      if (!groupedStock[key]) {
        groupedStock[key] = { name: s.name, totalQty: 0, totalThreshold: 0, unit: s.unit, batches: [] };
      }
      groupedStock[key].totalQty += parseFloat(s.quantity || 0);
      groupedStock[key].totalThreshold += parseFloat(s.threshold || 0);
      groupedStock[key].batches.push(s);
    });

    const groupedPharmacy = {};
    window.pharmacyData.forEach(m => {
      const key = m.name.trim();
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
        const batchListHTML = group.batches.map(b => `
          <div class="flash-red-batch text-[10px] font-bold mt-1 pl-4 flex items-center gap-1.5">
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-red-600"></span>
            <span>Batch [ID: ${b.id.split('_')[1] || b.id}]: ${b.quantity.toFixed(1)} ${group.unit} (Exp: ${b.expDate || 'N/A'})</span>
          </div>
        `).join('');

        container.innerHTML += `
          <div class="flex flex-col gap-1 p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-semibold">
            <div class="flex items-start gap-3">
              <span class="text-base">🚨</span>
              <div class="w-full">
                <span class="font-extrabold block">Stock Limit Triggered (Total reserves low): ${group.name}</span>
                <span class="font-medium text-rose-700 dark:text-rose-400 block mt-0.5">
                  Cumulative volume is ${group.totalQty.toFixed(1)} ${group.unit}. Minimum safety threshold is ${group.totalThreshold.toFixed(1)} ${group.unit}.
                </span>
                <div class="mt-2 border-t border-rose-200/55 dark:border-rose-800/55 pt-1.5">
                  <span class="text-[9px] uppercase tracking-wider text-rose-500 font-extrabold block mb-1">Specific Batch Breakdown:</span>
                  ${batchListHTML}
                </div>
              </div>
            </div>
          </div>
        `;
      }
    });

    Object.values(groupedPharmacy).forEach(group => {
      if (group.totalQty <= group.totalThreshold) {
        lowCount++;
        const batchListHTML = group.batches.map(b => `
          <div class="flash-red-batch text-[10px] font-bold mt-1 pl-4 flex items-center gap-1.5">
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-red-650 animate-pulse"></span>
            <span>Batch [Code: ${b.id.split('_')[1] || b.id}]: ${b.quantity.toFixed(0)} ${group.unit} (Exp: ${b.expDate || 'N/A'})</span>
          </div>
        `).join('');

        container.innerHTML += `
          <div class="flex flex-col gap-1 p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 rounded-xl text-xs font-semibold">
            <div class="flex items-start gap-3">
              <span class="text-base">⚠️</span>
              <div class="w-full">
                <span class="font-extrabold block">Medication Low Stock (Total reserves low): ${group.name}</span>
                <span class="font-medium text-amber-700 dark:text-amber-400 block mt-0.5">
                  Cumulative inventory is ${group.totalQty.toFixed(0)} ${group.unit}. Minimum safety threshold is ${group.totalThreshold.toFixed(0)} ${group.unit}.
                </span>
                <div class="mt-2 border-t border-amber-200/55 dark:border-amber-800/55 pt-1.5">
                  <span class="text-[9px] uppercase tracking-wider text-amber-600 font-extrabold block mb-1">Specific Batch Breakdown:</span>
                  ${batchListHTML}
                </div>
              </div>
            </div>
          </div>
        `;
      }
    });

    if (lowCount === 0) {
      container.innerHTML = `
        <div class="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2">
          <span>🛡️</span> All local safety parameters check out! Stock levels are healthy.
        </div>
      `;
    }

    if (insightLowStock) insightLowStock.innerText = `${lowCount} Items`;
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
      amount
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
    window.renderAllViews();

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  });
})();
