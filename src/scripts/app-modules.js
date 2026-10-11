/**
 * ============================================================================
 * FORECASTER PRO - ENTERPRISE EXTENSION MODULES
 * Payment Accounts, Fleet, Rentals, Popovers, Mobile Navigation & Backup
 * ============================================================================
 */
(function() {
  'use strict';

  /* -------------------------------------------------------------------------
   * MODULE 1: PAYMENT ACCOUNTS & TRANSFERS
   * ------------------------------------------------------------------------- */
  window.accounts = [];
  window.accountTransfers = [];
  let editingAccountId = null;

  const EGYPT_BANKS_LIST = [
    "National Bank of Egypt (NBE)", "Banque Misr", "Commercial International Bank (CIB)",
    "QNB Alahli", "HSBC Egypt", "Arab African International Bank (AAIB)", "Banque du Caire",
    "Al Baraka Bank Egypt", "Faisal Islamic Bank of Egypt", "Emirates NBD Egypt",
    "Credit Agricole Egypt", "Abu Dhabi Islamic Bank Egypt (ADIB)", "Attijariwafa Bank Egypt",
    "Suez Canal Bank", "Egyptian Gulf Bank", "Housing and Development Bank",
    "Arab Investment Bank", "National Bank of Kuwait Egypt", "Alexbank", "Mashreq Bank Egypt",
    "Bank Audi Egypt", "First Abu Dhabi Bank Egypt", "Societe Arabe Internationale de Banque (SAIB)",
    "Nasser Social Bank", "Industrial Development Bank", "Egypt Post (Postal Savings)", "Other"
  ];

  const WALLET_PROVIDERS_TELECOM = ["Vodafone Cash", "Orange Money", "Etisalat Cash (Flous)", "WE Pay", "Other"];
  const WALLET_PROVIDERS_BANK = [
    "Meeza Digital Wallet", "InstaPay", "CIB Smart Wallet", "NBE Wallet", "Banque Misr Wallet",
    "AAIB Wallet", "QNB Alahli Mobile Wallet", "Fawry Wallet", "Other"
  ];

  window.loadAccountsDatabase = function() {
    const saved = localStorage.getItem('pro_accounts');
    if (saved) {
      try { window.accounts = JSON.parse(saved) || []; } catch (err) { window.accounts = []; }
    }
    if (!window.accounts.find(a => a.id === 'acc_general')) {
      window.accounts.push({ id: 'acc_general', type: 'general', label: 'General / Unidentified', locked: true });
    }
    if (!window.accounts.find(a => a.id === 'acc_cash')) {
      window.accounts.unshift({ id: 'acc_cash', type: 'cash', label: 'Cash', locked: true });
    }
    window.saveAccountsDatabase();
  };

  window.saveAccountsDatabase = function() {
    localStorage.setItem('pro_accounts', JSON.stringify(window.accounts));
  };

  window.loadAccountTransfers = function() {
    const saved = localStorage.getItem('pro_account_transfers');
    if (saved) {
      try { window.accountTransfers = JSON.parse(saved) || []; } catch (err) { window.accountTransfers = []; }
    }
  };

  window.saveAccountTransfers = function() {
    localStorage.setItem('pro_account_transfers', JSON.stringify(window.accountTransfers));
  };

  window.accountIcon = function(type) {
    if (type === 'cash') return '💵';
    if (type === 'card') return '💳';
    if (type === 'wallet') return '📱';
    return '❔';
  };

  window.getAccountLabel = function(id) {
    const acc = (window.accounts || []).find(a => a.id === id);
    return acc ? acc.label : 'General / Unidentified';
  };

  window.populateAccountSelects = function() {
    const selects = document.querySelectorAll('.payment-account-select');
    selects.forEach(sel => {
      const prevValue = sel.value;
      sel.innerHTML = '';
      (window.accounts || []).forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = `${window.accountIcon(acc.type)} ${acc.label}`;
        sel.appendChild(opt);
      });
      if (prevValue && window.accounts.find(a => a.id === prevValue)) {
        sel.value = prevValue;
      } else if (window.accounts.find(a => a.id === 'acc_cash')) {
        sel.value = 'acc_cash';
      } else if (window.accounts.length) {
        sel.value = window.accounts[0].id;
      }
    });
  };

  window.populateAccountFilterSelect = function() {
    const sel = document.getElementById('filter-txn-account');
    if (!sel) return;
    const prevValue = sel.value;
    sel.innerHTML = '<option value="">All Accounts</option>';
    (window.accounts || []).forEach(acc => {
      const opt = document.createElement('option');
      opt.value = acc.id;
      opt.textContent = `${window.accountIcon(acc.type)} ${acc.label}`;
      sel.appendChild(opt);
    });
    if (prevValue && (prevValue === '' || window.accounts.find(a => a.id === prevValue))) {
      sel.value = prevValue;
    }
  };

  window.toggleAccountTypeFields = function() {
    const typeEl = document.getElementById('account-type');
    if (!typeEl) return;
    const type = typeEl.value;
    const cardFields = document.getElementById('account-card-fields');
    const walletFields = document.getElementById('account-wallet-fields');
    if (cardFields) cardFields.classList.toggle('hidden', type !== 'card');
    if (walletFields) walletFields.classList.toggle('hidden', type !== 'wallet');

    if (type === 'card') window.populateBankSelect();
    if (type === 'wallet') window.toggleWalletProviderOptions();
  };

  window.populateBankSelect = function() {
    const sel = document.getElementById('account-card-bank');
    if (!sel || sel.options.length) return;
    EGYPT_BANKS_LIST.forEach(bank => {
      const opt = document.createElement('option');
      opt.value = bank;
      opt.textContent = bank;
      sel.appendChild(opt);
    });
    window.toggleCardBankOtherField();
  };

  window.toggleCardBankOtherField = function() {
    const sel = document.getElementById('account-card-bank');
    const other = document.getElementById('account-card-bank-other');
    if (!sel || !other) return;
    other.classList.toggle('hidden', sel.value !== 'Other');
  };

  window.toggleWalletProviderOptions = function() {
    const kindEl = document.getElementById('account-wallet-kind');
    const sel = document.getElementById('account-wallet-provider');
    if (!kindEl || !sel) return;
    const list = kindEl.value === 'Bank' ? WALLET_PROVIDERS_BANK : WALLET_PROVIDERS_TELECOM;
    sel.innerHTML = '';
    list.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      sel.appendChild(opt);
    });
    window.toggleWalletProviderOtherField();
  };

  window.toggleWalletProviderOtherField = function() {
    const sel = document.getElementById('account-wallet-provider');
    const other = document.getElementById('account-wallet-provider-other');
    if (!sel || !other) return;
    other.classList.toggle('hidden', sel.value !== 'Other');
  };

  window.handleAddAccountSubmit = function(e) {
    e.preventDefault();
    const type = document.getElementById('account-type').value;
    const nickname = (document.getElementById('account-nickname')?.value || '').trim();

    let label = '';
    let extra = {};

    if (type === 'cash') {
      label = nickname || 'Cash';
    } else if (type === 'general') {
      label = nickname || 'General / Unidentified';
    } else if (type === 'card') {
      const network = document.getElementById('account-card-network').value;
      const mode = document.getElementById('account-card-mode').value;
      const bankSelVal = document.getElementById('account-card-bank').value;
      const bank = bankSelVal === 'Other' ? (document.getElementById('account-card-bank-other')?.value || '').trim() : bankSelVal;
      extra = { network, mode, bank };
      label = nickname || `${network} ${mode} - ${bank || 'Unspecified Bank'}`;
    } else if (type === 'wallet') {
      const kind = document.getElementById('account-wallet-kind').value;
      const providerSelVal = document.getElementById('account-wallet-provider').value;
      const provider = providerSelVal === 'Other' ? (document.getElementById('account-wallet-provider-other')?.value || '').trim() : providerSelVal;
      extra = { kind, provider };
      label = nickname || `${provider || 'Unspecified Provider'} Wallet (${kind})`;
    }

    if (editingAccountId) {
      const idx = window.accounts.findIndex(a => a.id === editingAccountId);
      if (idx !== -1) {
        window.accounts[idx] = Object.assign({ id: editingAccountId, type, label, locked: window.accounts[idx].locked }, extra);
        window.saveAccountsDatabase();
        window.populateAccountSelects();
        window.populateAccountFilterSelect();
        window.renderAccountsView();
        window.triggerToast('Payment account updated successfully!', 'success');
      }
      window.cancelAccountEdit();
      return;
    }

    const account = Object.assign({
      id: 'acc_' + Date.now(),
      type: type,
      label: label,
      locked: false
    }, extra);

    window.accounts.push(account);
    window.saveAccountsDatabase();
    window.populateAccountSelects();
    window.populateAccountFilterSelect();
    window.renderAccountsView();
    window.triggerToast('Payment account registered successfully!', 'success');
    e.target.reset();
    window.toggleAccountTypeFields();
  };

  window.editAccountEntry = function(id) {
    const acc = window.accounts.find(a => a.id === id);
    if (!acc) return;
    editingAccountId = id;

    const typeEl = document.getElementById('account-type');
    if (typeEl) typeEl.value = acc.type;
    window.toggleAccountTypeFields();

    const nickEl = document.getElementById('account-nickname');
    if (nickEl) nickEl.value = acc.label || '';

    const submitBtn = document.querySelector('#account-form button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Update Account';
    const cancelBtn = document.getElementById('account-edit-cancel-btn');
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    const formEl = document.getElementById('account-form');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  window.cancelAccountEdit = function() {
    editingAccountId = null;
    const formEl = document.getElementById('account-form');
    if (formEl) formEl.reset();
    window.toggleAccountTypeFields();
    const submitBtn = document.querySelector('#account-form button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Add Account';
    const cancelBtn = document.getElementById('account-edit-cancel-btn');
    if (cancelBtn) cancelBtn.classList.add('hidden');
  };

  window.deleteAccountEntry = function(id) {
    const acc = window.accounts.find(a => a.id === id);
    if (!acc) return;
    if (acc.locked) {
      window.triggerToast('This is a default account and cannot be removed.', 'error');
      return;
    }

    window.transactions.forEach(t => { if (t.accountId === id) { t.accountId = 'acc_general'; t.accountLabel = window.getAccountLabel('acc_general'); } });
    window.stockData.forEach(s => { if (s.accountId === id) { s.accountId = 'acc_general'; s.accountLabel = window.getAccountLabel('acc_general'); } });
    window.pharmacyData.forEach(p => { if (p.accountId === id) { p.accountId = 'acc_general'; p.accountLabel = window.getAccountLabel('acc_general'); } });
    window.accountTransfers.forEach(tr => {
      if (tr.fromId === id) tr.fromId = 'acc_general';
      if (tr.toId === id) tr.toId = 'acc_general';
    });
    window.saveAccountTransfers();
    window.saveTransactionsDatabase();
    localStorage.setItem('pro_stock', JSON.stringify(window.stockData));
    localStorage.setItem('pro_pharmacy', JSON.stringify(window.pharmacyData));

    window.accounts = window.accounts.filter(a => a.id !== id);
    window.saveAccountsDatabase();
    window.populateAccountSelects();
    window.populateAccountFilterSelect();
    window.renderAccountsView();
    window.triggerToast('Payment account removed.', 'info');
  };

  window.renderAccountsView = function() {
    const container = document.getElementById('accounts-list-cards');
    if (!container) return;

    container.innerHTML = '';
    (window.accounts || []).forEach(acc => {
      const income = window.transactions.filter(t => t.type === 'income' && t.accountId === acc.id).reduce((s, t) => s + parseFloat(t.amount), 0);
      const expense = window.transactions.filter(t => t.type === 'expense' && t.accountId === acc.id).reduce((s, t) => s + parseFloat(t.amount), 0);
      const invValue = window.stockData.filter(s => s.accountId === acc.id).reduce((s, i) => s + (parseFloat(i.price) * parseFloat(i.quantity)), 0);
      const pharmValue = window.pharmacyData.filter(p => p.accountId === acc.id).reduce((s, i) => s + (parseFloat(i.price) * parseFloat(i.quantity)), 0);
      const transfersIn = window.accountTransfers.filter(tr => tr.toId === acc.id).reduce((s, tr) => s + parseFloat(tr.amount), 0);
      const transfersOut = window.accountTransfers.filter(tr => tr.fromId === acc.id).reduce((s, tr) => s + parseFloat(tr.amount), 0);
      const netBalance = income - expense + transfersIn - transfersOut;

      let subtitle = '';
      if (acc.type === 'card') subtitle = `${acc.network || ''} ${acc.mode || ''} Card${acc.bank ? ' • ' + acc.bank : ''}`;
      else if (acc.type === 'wallet') subtitle = `${acc.kind || ''} Wallet${acc.provider ? ' • ' + acc.provider : ''}`;
      else if (acc.type === 'cash') subtitle = 'Physical Cash';
      else subtitle = 'Unidentified / Fallback Account';

      container.innerHTML += `
        <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
          <div class="flex items-start justify-between">
            <div>
              <h3 class="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>${window.accountIcon(acc.type)}</span> ${acc.label}
              </h3>
              <p class="text-[10px] text-slate-404 font-bold uppercase mt-0.5">${subtitle}</p>
            </div>
            <div class="flex items-center gap-3">
              <button onclick="editAccountEntry('${acc.id}')" class="text-[10px] text-blue-600 font-bold hover:underline">Edit</button>
              ${acc.locked ? '<span class="text-[10px] font-bold text-slate-404 uppercase">Default</span>' : `<button onclick="deleteAccountEntry('${acc.id}')" class="text-[10px] text-rose-600 font-bold hover:underline">Remove</button>`}
            </div>
          </div>
          <div class="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl flex items-center justify-between text-xs font-medium">
            <span class="text-[10px] text-slate-404 uppercase font-bold">Net Balance</span>
            <span class="font-extrabold ${netBalance < 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}">EGP ${netBalance.toFixed(2)}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs font-medium">
            <div class="bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-xl">
              <span class="text-[10px] text-emerald-700 dark:text-emerald-400 block uppercase font-bold">Income</span>
              <span class="font-extrabold text-emerald-700 dark:text-emerald-400">EGP ${income.toFixed(2)}</span>
            </div>
            <div class="bg-rose-50 dark:bg-rose-950/40 p-2 rounded-xl">
              <span class="text-[10px] text-rose-700 dark:text-rose-400 block uppercase font-bold">Expenses</span>
              <span class="font-extrabold text-rose-700 dark:text-rose-400">EGP ${expense.toFixed(2)}</span>
            </div>
            <div class="bg-blue-50 dark:bg-blue-950/40 p-2 rounded-xl">
              <span class="text-[10px] text-blue-700 dark:text-blue-400 block uppercase font-bold">Inventory</span>
              <span class="font-extrabold text-blue-700 dark:text-blue-400">EGP ${invValue.toFixed(2)}</span>
            </div>
            <div class="bg-indigo-50 dark:bg-indigo-950/40 p-2 rounded-xl">
              <span class="text-[10px] text-indigo-700 dark:text-indigo-400 block uppercase font-bold">Transfers</span>
              <span class="font-extrabold text-indigo-700 dark:text-indigo-400">+${transfersIn.toFixed(0)} / -${transfersOut.toFixed(0)}</span>
            </div>
          </div>
        </div>
      `;
    });
  };

  /* -------------------------------------------------------------------------
   * MODULE 2: MOBILE NAVIGATION & DRAWER
   * ------------------------------------------------------------------------- */
  window.toggleMobileDrawer = function(force) {
    const drawer = document.getElementById('mobile-more-drawer');
    if (!drawer) return;
    const isHidden = drawer.classList.contains('hidden');
    const open = typeof force === 'boolean' ? force : isHidden;
    drawer.classList.toggle('hidden', !open);
  };

  /* -------------------------------------------------------------------------
   * INITIALIZE MODULES ON DOM READY
   * ------------------------------------------------------------------------- */
  window.addEventListener('DOMContentLoaded', () => {
    window.loadAccountsDatabase();
    window.loadAccountTransfers();
    window.populateAccountSelects();
    window.populateAccountFilterSelect();
    window.renderAccountsView();
    window.toggleAccountTypeFields();
  });
})();
