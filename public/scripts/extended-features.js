/**
 * ============================================================================
 * FORECASTER PRO - EXTENDED ENTERPRISE MODULES
 * Rental Management, Vehicle Fleet, Spare Parts, Popovers, Profile & Properties
 * ============================================================================
 */

/* ----------------------------------------------------------------------------
 * 1. RENTAL LEASE MANAGEMENT SYSTEM & TENANT WEBHOOKS
 * ---------------------------------------------------------------------------- */
(function() {
  'use strict';

  const RENTAL_DB_KEY = 'pro_rental_contracts_v1';
  const RENTAL_LOG_KEY = 'pro_rental_notification_log_v1';
  const RENTAL_CONFIG_KEY = 'pro_rental_notification_config_v1';
  let rentalContracts = [];
  let rentalNotificationLog = [];
  let rentalNotificationConfig = { emailWebhook: '', smsWebhook: '' };

  function rentalUid(prefix) {
    if (window.crypto && crypto.randomUUID) return prefix + '_' + crypto.randomUUID();
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  function rentalEscape(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function rentalDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
      const copy = new Date(value.getTime());
      copy.setHours(0, 0, 0, 0);
      return Number.isNaN(copy.getTime()) ? null : copy;
    }
    const d = new Date(String(value).length === 10 ? String(value) + 'T00:00:00' : value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function rentalToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function rentalDateInput(value) {
    const d = rentalDate(value);
    if (!d) return '';
    return d.toISOString().slice(0, 10);
  }

  function rentalDaysUntil(value) {
    const d = rentalDate(value);
    if (!d) return null;
    return Math.ceil((d - rentalToday()) / 86400000);
  }

  function rentalFormatDate(value) {
    const d = rentalDate(value);
    return d ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : '—';
  }

  function rentalFormatMoney(value) {
    return 'EGP ' + (parseFloat(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function loadRentalDatabase() {
    try { rentalContracts = JSON.parse(localStorage.getItem(RENTAL_DB_KEY) || '[]'); } catch (e) { rentalContracts = []; }
    try { rentalNotificationLog = JSON.parse(localStorage.getItem(RENTAL_LOG_KEY) || '[]'); } catch (e) { rentalNotificationLog = []; }
    try { rentalNotificationConfig = Object.assign({ emailWebhook: '', smsWebhook: '' }, JSON.parse(localStorage.getItem(RENTAL_CONFIG_KEY) || '{}')); } catch (e) { rentalNotificationConfig = { emailWebhook: '', smsWebhook: '' }; }
    const email = document.getElementById('rental-email-webhook');
    const sms = document.getElementById('rental-sms-webhook');
    if (email) email.value = rentalNotificationConfig.emailWebhook || '';
    if (sms) sms.value = rentalNotificationConfig.smsWebhook || '';
  }

  function saveRentalDatabase() {
    localStorage.setItem(RENTAL_DB_KEY, JSON.stringify(rentalContracts));
  }

  function saveRentalLog() {
    localStorage.setItem(RENTAL_LOG_KEY, JSON.stringify(rentalNotificationLog.slice(0, 300)));
  }

  function saveRentalConfig() {
    localStorage.setItem(RENTAL_CONFIG_KEY, JSON.stringify(rentalNotificationConfig));
  }

  window.updateRentalDurationPreview = function () {
    const start = rentalDate(document.getElementById('rental-start-date')?.value);
    const end = rentalDate(document.getElementById('rental-end-date')?.value);
    const box = document.getElementById('rental-duration-preview');
    if (!box || !start || !end || end < start) { if (box) box.classList.add('hidden'); return; }
    const days = Math.ceil((end - start) / 86400000) + 1;
    const months = (days / 30.4375).toFixed(1);
    box.textContent = `Lease duration: ${days} day${days === 1 ? '' : 's'} (~${months} months)`;
    box.classList.remove('hidden');
  };

  function rentalEffectiveStatus(c) {
    const days = rentalDaysUntil(c.endDate);
    if (c.status === 'Terminated') return 'Terminated';
    if (days !== null && days < 0) return 'Expired';
    if (c.renewalDecision === 'non-renew') return 'Pending Renewal';
    if (days !== null && days <= (parseInt(c.alertDays, 10) || 60)) return 'Pending Renewal';
    return c.status || 'Active';
  }

  function rentalPaymentState(c) {
    if (!c.nextPaymentDate) return 'none';
    const days = rentalDaysUntil(c.nextPaymentDate);
    if (days < 0) return 'overdue';
    if (days <= 30) return 'upcoming';
    return 'scheduled';
  }

  function filteredRentalContracts() {
    const status = document.getElementById('rental-filter-status')?.value || 'all';
    const renewal = document.getElementById('rental-filter-renewal')?.value || 'all';
    const payment = document.getElementById('rental-filter-payment')?.value || 'all';
    const search = (document.getElementById('rental-filter-search')?.value || '').trim().toLowerCase();
    return rentalContracts.filter(c => {
      const effective = rentalEffectiveStatus(c);
      const days = rentalDaysUntil(c.endDate);
      const pay = rentalPaymentState(c);
      if (status !== 'all' && effective !== status) return false;
      if (renewal === 'overdue' && !(days !== null && days < 0)) return false;
      if (['30','60','90'].includes(renewal) && !(days !== null && days >= 0 && days <= parseInt(renewal, 10))) return false;
      if (payment !== 'all' && pay !== payment) return false;
      if (search) {
        const hay = [c.tenantName, c.phone, c.email, c.property, c.notes].join(' ').toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }

  window.handleRentalSubmit = function (event) {
    event.preventDefault();
    const start = document.getElementById('rental-start-date').value;
    const end = document.getElementById('rental-end-date').value;
    if (!start || !end || end < start) { if (typeof window.triggerToast === 'function') window.triggerToast('Lease end date must be on or after the start date.', 'error'); return; }
    const editId = document.getElementById('rental-edit-id').value;
    const record = {
      id: editId || rentalUid('rent'),
      tenantName: document.getElementById('rental-tenant-name').value.trim(),
      phone: document.getElementById('rental-tenant-phone').value.trim(),
      email: document.getElementById('rental-tenant-email').value.trim(),
      property: document.getElementById('rental-property').value.trim(),
      startDate: start,
      endDate: end,
      rentAmount: parseFloat(document.getElementById('rental-rent').value) || 0,
      deposit: parseFloat(document.getElementById('rental-deposit').value) || 0,
      frequency: document.getElementById('rental-frequency').value,
      nextPaymentDate: document.getElementById('rental-next-payment').value,
      status: document.getElementById('rental-status').value,
      alertDays: parseInt(document.getElementById('rental-alert-days').value, 10) || 60,
      documentLink: document.getElementById('rental-document-link').value.trim(),
      notes: document.getElementById('rental-notes').value.trim(),
      renewalDecision: '',
      updatedAt: new Date().toISOString()
    };
    if (editId) rentalContracts = rentalContracts.map(c => c.id === editId ? Object.assign({}, c, record) : c);
    else { record.createdAt = new Date().toISOString(); rentalContracts.unshift(record); }
    saveRentalDatabase();
    resetRentalForm();
    renderRentalManagement();
    runRentalAutomation(true);
    if (typeof window.triggerToast === 'function') window.triggerToast(editId ? 'Rental contract updated.' : 'Rental contract saved.', 'success');
  };

  function resetRentalForm() {
    const form = document.getElementById('rental-contract-form');
    if (!form) return;
    form.reset();
    document.getElementById('rental-edit-id').value = '';
    document.getElementById('rental-form-title').innerHTML = '<span>🏠</span> Log New Rental Contract';
    document.getElementById('rental-edit-state')?.classList.add('hidden');
    document.getElementById('rental-cancel-btn')?.classList.add('hidden');
    document.getElementById('rental-save-btn').textContent = 'Save Contract';
    document.getElementById('rental-alert-days').value = '60';
    window.updateRentalDurationPreview();
  }

  window.cancelRentalEdit = resetRentalForm;

  window.editRentalContract = function (id) {
    const c = rentalContracts.find(x => x.id === id); if (!c) return;
    document.getElementById('rental-edit-id').value = c.id;
    document.getElementById('rental-tenant-name').value = c.tenantName || '';
    document.getElementById('rental-tenant-phone').value = c.phone || '';
    document.getElementById('rental-tenant-email').value = c.email || '';
    document.getElementById('rental-property').value = c.property || '';
    document.getElementById('rental-start-date').value = rentalDateInput(c.startDate);
    document.getElementById('rental-end-date').value = rentalDateInput(c.endDate);
    document.getElementById('rental-rent').value = c.rentAmount ?? '';
    document.getElementById('rental-deposit').value = c.deposit ?? '';
    document.getElementById('rental-frequency').value = c.frequency || 'Monthly';
    document.getElementById('rental-next-payment').value = rentalDateInput(c.nextPaymentDate);
    document.getElementById('rental-status').value = c.status || 'Active';
    document.getElementById('rental-alert-days').value = String(c.alertDays || 60);
    document.getElementById('rental-document-link').value = c.documentLink || '';
    document.getElementById('rental-notes').value = c.notes || '';
    document.getElementById('rental-form-title').innerHTML = '<span>✏️</span> Edit Rental Contract';
    document.getElementById('rental-edit-state')?.classList.remove('hidden');
    document.getElementById('rental-cancel-btn')?.classList.remove('hidden');
    document.getElementById('rental-save-btn').textContent = 'Update Contract';
    window.updateRentalDurationPreview();
    document.getElementById('view-rentals')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window.deleteRentalContract = function (id) {
    const c = rentalContracts.find(x => x.id === id); if (!c) return;
    if (!confirm(`Delete the rental contract for ${c.tenantName || 'this tenant'}?`)) return;
    rentalContracts = rentalContracts.filter(x => x.id !== id);
    saveRentalDatabase();
    renderRentalManagement();
    if (typeof window.triggerToast === 'function') window.triggerToast('Rental contract deleted.', 'info');
  };

  window.renewRentalContract = function (id) {
    const c = rentalContracts.find(x => x.id === id); if (!c) return;
    const newEnd = prompt('Enter the new lease end date (YYYY-MM-DD):', rentalDateInput(c.endDate));
    if (!newEnd || !/^\d{4}-\d{2}-\d{2}$/.test(newEnd)) return;
    if (!rentalDate(newEnd) || rentalDate(newEnd) <= rentalDate(c.endDate)) { if (typeof window.triggerToast === 'function') window.triggerToast('New lease end date must be after current end date.', 'error'); return; }
    const newRent = prompt('Enter the renewed rent amount (EGP):', String(c.rentAmount || 0));
    if (newRent === null || Number.isNaN(parseFloat(newRent))) return;
    c.startDate = rentalDateInput(new Date(rentalDate(c.endDate).getTime() + 86400000));
    c.endDate = newEnd;
    c.rentAmount = parseFloat(newRent) || 0;
    c.status = 'Active';
    c.renewalDecision = 'renewed';
    c.updatedAt = new Date().toISOString();
    saveRentalDatabase();
    renderRentalManagement();
    if (typeof window.triggerToast === 'function') window.triggerToast('Contract renewed with updated lease terms.', 'success');
  };

  window.flagRentalNonRenewal = function (id) {
    const c = rentalContracts.find(x => x.id === id); if (!c) return;
    c.renewalDecision = 'non-renew';
    c.status = 'Pending Renewal';
    c.updatedAt = new Date().toISOString();
    saveRentalDatabase();
    renderRentalManagement();
    if (typeof window.triggerToast === 'function') window.triggerToast('Contract flagged for non-renewal.', 'info');
  };

  window.openRentalDocument = function (url) { if (url) window.open(url, '_blank', 'noopener,noreferrer'); };

  window.toggleRentalPayType = function(type) {
    const incLbl = document.getElementById('rental-pay-type-income-lbl');
    const expLbl = document.getElementById('rental-pay-type-expense-lbl');
    if (!incLbl || !expLbl) return;
    if (type === 'income') {
      incLbl.className = 'cursor-pointer border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 p-2.5 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs';
      expLbl.className = 'cursor-pointer border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 p-2.5 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs';
    } else {
      expLbl.className = 'cursor-pointer border-2 border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 p-2.5 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs';
      incLbl.className = 'cursor-pointer border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 p-2.5 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs';
    }
  };

  window.openRentalPaymentModal = function(contractId) {
    const c = rentalContracts.find(x => x.id === contractId);
    if (!c) return;

    const modal = document.getElementById('custom-modal');
    const payModal = document.getElementById('rental-payment-modal');
    if (!modal || !payModal) return;

    if (typeof window.closeModal === 'function') window.closeModal();

    modal.classList.remove('hidden');
    payModal.classList.remove('hidden');

    document.getElementById('rental-pay-contract-id').value = c.id;
    document.getElementById('rental-pay-tenant-name').textContent = c.tenantName || 'Tenant';
    document.getElementById('rental-pay-property').textContent = c.property || 'Property Unit';

    const role = (typeof window.getPropertyRole === 'function') ? window.getPropertyRole() : 'landlord';
    const defaultType = (role === 'tenant') ? 'expense' : 'income';
    const radio = document.querySelector(`input[name="rental-pay-type"][value="${defaultType}"]`);
    if (radio) radio.checked = true;
    window.toggleRentalPayType(defaultType);

    document.getElementById('rental-pay-amount').value = c.rentAmount || '';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('rental-pay-date').value = today;

    // Default description
    const monthName = new Date().toLocaleDateString('default', { month: 'short', year: 'numeric' });
    document.getElementById('rental-pay-desc').value = `Rental Settlement - ${c.tenantName || c.property} (${monthName})`;

    // Calculate next due date suggestion based on frequency
    let nextDate = '';
    const baseDate = c.nextPaymentDate ? rentalDate(c.nextPaymentDate) : new Date();
    if (baseDate && !isNaN(baseDate.getTime())) {
      const d = new Date(baseDate.getTime());
      const freq = (c.frequency || 'Monthly').toLowerCase();
      if (freq === 'quarterly') d.setMonth(d.getMonth() + 3);
      else if (freq === 'semi-annual') d.setMonth(d.getMonth() + 6);
      else if (freq === 'annual') d.setFullYear(d.getFullYear() + 1);
      else d.setMonth(d.getMonth() + 1); // monthly default
      nextDate = rentalDateInput(d);
    }
    const nextInput = document.getElementById('rental-pay-next-due');
    if (nextInput) nextInput.value = nextDate;

    // Populate payment accounts
    if (typeof window.populatePaymentAccountSelects === 'function') {
      window.populatePaymentAccountSelects();
    }
  };

  window.handleRentalPaymentSubmit = function(event) {
    event.preventDefault();
    const contractId = document.getElementById('rental-pay-contract-id')?.value;
    const c = rentalContracts.find(x => x.id === contractId);

    const typeRadio = document.querySelector('input[name="rental-pay-type"]:checked');
    const type = typeRadio ? typeRadio.value : 'income';
    const amount = parseFloat(document.getElementById('rental-pay-amount')?.value) || 0;
    const date = document.getElementById('rental-pay-date')?.value || new Date().toISOString().split('T')[0];
    const accountId = document.getElementById('rental-pay-account')?.value || '';
    const desc = document.getElementById('rental-pay-desc')?.value.trim() || `Rent Payment (${c ? c.tenantName : ''})`;
    const nextDue = document.getElementById('rental-pay-next-due')?.value;

    if (amount <= 0) {
      if (typeof window.triggerToast === 'function') window.triggerToast('Please provide a valid payment amount.', 'error');
      return;
    }

    // Build the linked transaction entry
    const entry = {
      id: 'tx_rent_' + Date.now(),
      date: date,
      category: 'Rent',
      subcategory: (type === 'income') ? 'Rental Inflow' : 'Lease Settlement',
      icon: '🏠',
      amount: amount,
      description: desc,
      type: type,
      accountId: accountId,
      contractId: contractId || null
    };

    if (!Array.isArray(window.transactions)) window.transactions = [];
    window._lastAddedTxnId = entry.id;
    window.transactions.push(entry);

    // Save transactions database & sync cloud
    if (typeof window.saveTransactionsDatabase === 'function') {
      window.saveTransactionsDatabase();
    }

    // Advance contract next payment date if supplied
    if (c && nextDue) {
      c.nextPaymentDate = nextDue;
      c.updatedAt = new Date().toISOString();
      saveRentalDatabase();
    }

    // Close modal
    if (typeof window.closeModal === 'function') window.closeModal();

    // Trigger toast notification
    if (typeof window.triggerToast === 'function') {
      window.triggerToast(`Rental payment of EGP ${amount.toLocaleString()} linked & recorded in Transactions!`, 'success');
    }

    // Re-render everything so the transaction tab, blueprint, and dashboard reflect immediately
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
    renderRentalManagement();
  };

  window.toggleRentalFilterDrawer = function () {
    document.getElementById('rental-filter-drawer')?.classList.toggle('hidden');
  };

  function rentalStatusBadge(status) {
    const map = {
      Active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      'Pending Renewal': 'bg-amber-50 text-amber-700 border-amber-100',
      Expired: 'bg-rose-50 text-rose-700 border-rose-100',
      Terminated: 'bg-slate-100 text-slate-600 border-slate-200'
    };
    return `<span class="inline-flex items-center px-2 py-1 rounded-lg border text-[9px] font-black uppercase ${map[status] || map.Active}">${rentalEscape(status)}</span>`;
  }

  function renderRentalManagement() {
    const table = document.getElementById('rental-contracts-table-body');
    if (!table) return;
    const rows = filteredRentalContracts();
    const active = rentalContracts.filter(c => rentalEffectiveStatus(c) === 'Active').length;
    const renewal = rentalContracts.filter(c => rentalEffectiveStatus(c) === 'Pending Renewal').length;
    const expired = rentalContracts.filter(c => rentalEffectiveStatus(c) === 'Expired').length;
    const overdue = rentalContracts.filter(c => rentalPaymentState(c) === 'overdue').length;

    const summary = document.getElementById('rental-summary-cards');
    if (summary) summary.innerHTML = [
      ['Active', active, 'text-emerald-700', 'bg-emerald-50'],
      ['Renewals Due', renewal, 'text-amber-700', 'bg-amber-50'],
      ['Expired', expired, 'text-rose-700', 'bg-rose-50'],
      ['Payments Overdue', overdue, 'text-indigo-700', 'bg-indigo-50']
    ].map(x => `<div class="${x[3]} border border-slate-100 rounded-xl p-3"><div class="text-[9px] uppercase tracking-wider font-black text-slate-404">${x[0]}</div><div class="text-xl font-black ${x[2]} mt-1">${x[1]}</div></div>`).join('');

    const alerts = document.getElementById('rental-renewal-alerts');
    const upcoming = rentalContracts.filter(c => {
      const d = rentalDaysUntil(c.endDate); return d !== null && d >= 0 && d <= (parseInt(c.alertDays,10) || 60) && rentalEffectiveStatus(c) !== 'Terminated';
    }).sort((a,b) => rentalDaysUntil(a.endDate) - rentalDaysUntil(b.endDate));
    
    if (alerts) alerts.innerHTML = upcoming.slice(0, 5).map(c => {
      const d = rentalDaysUntil(c.endDate);
      const urgency = d <= 30 ? { border: 'border-rose-100', bg: 'bg-rose-50', text: 'text-rose-700' } : { border: 'border-amber-100', bg: 'bg-amber-50', text: 'text-amber-700' };
      return `<div class="border ${urgency.border} ${urgency.bg} rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div><div class="text-xs font-black text-slate-800">🔔 Renewal: ${rentalEscape(c.tenantName)} — ${rentalEscape(c.property)}</div><div class="text-[10px] ${urgency.text} font-bold mt-1">Lease ends ${rentalFormatDate(c.endDate)} • ${d} day${d===1?'':'s'} remaining</div></div>
        <div class="flex gap-2">
          <button onclick="openRentalPaymentModal('${c.id}')" class="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded hover:bg-emerald-100">💳 Pay</button>
          <button onclick="sendRentalReminder('${c.id}','email')" class="text-[10px] font-bold text-indigo-700 hover:underline">✉️ Email</button>
          <button onclick="sendRentalReminder('${c.id}','sms')" class="text-[10px] font-bold text-sky-700 hover:underline">📱 SMS</button>
          <button onclick="renewRentalContract('${c.id}')" class="text-[10px] font-bold text-emerald-700 hover:underline">Renew</button>
        </div>
      </div>`;
    }).join('') || '';

    table.innerHTML = rows.length ? rows.map(c => {
      const effective = rentalEffectiveStatus(c);
      const paymentState = rentalPaymentState(c);
      const days = rentalDaysUntil(c.endDate);
      const paymentText = !c.nextPaymentDate ? 'Not set' : `${rentalFormatDate(c.nextPaymentDate)}${paymentState === 'overdue' ? ' • OVERDUE' : paymentState === 'upcoming' ? ` • ${rentalDaysUntil(c.nextPaymentDate)}d` : ''}`;
      const paymentClass = paymentState === 'overdue' ? 'text-rose-600 font-black' : paymentState === 'upcoming' ? 'text-amber-700 font-bold' : 'text-slate-707';
      const renewalText = days !== null && days >= 0 && days <= (parseInt(c.alertDays,10)||60) ? `<div class="text-[9px] text-amber-700 font-bold mt-1">Renewal in ${days}d</div>` : days !== null && days < 0 ? `<div class="text-[9px] text-rose-600 font-bold mt-1">Expired ${Math.abs(days)}d ago</div>` : '';
      return `<tr>
        <td class="py-3 px-2 align-top"><div class="font-black text-slate-800">${rentalEscape(c.tenantName)}</div><div class="text-[10px] text-slate-404 mt-0.5">${rentalEscape(c.phone)}</div><div class="text-[10px] text-slate-505 font-semibold mt-1">🏠 ${rentalEscape(c.property)}</div></td>
        <td class="py-3 px-2 align-top"><div class="font-semibold">${rentalFormatDate(c.startDate)}</div><div class="text-[10px] text-slate-404">to ${rentalFormatDate(c.endDate)}</div>${renewalText}</td>
        <td class="py-3 px-2 align-top"><div class="font-black text-slate-900">${rentalFormatMoney(c.rentAmount)}</div><div class="text-[9px] text-slate-404">${rentalEscape(c.frequency)}</div></td>
        <td class="py-3 px-2 align-top">${rentalStatusBadge(effective)}${c.renewalDecision==='non-renew' ? '<div class="text-[9px] text-rose-600 font-bold mt-1">Non-renewal flagged</div>' : ''}</td>
        <td class="py-3 px-2 align-top ${paymentClass}">${rentalEscape(paymentText)}</td>
        <td class="py-3 px-2 align-top"><div class="flex flex-wrap gap-2 justify-center">
          <button onclick="openRentalPaymentModal('${c.id}')" class="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded font-black hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition shadow-2xs">💳 Pay</button>
          <button onclick="editRentalContract('${c.id}')" class="text-[10px] text-blue-600 font-bold hover:underline">Edit</button>
          <button onclick="renewRentalContract('${c.id}')" class="text-[10px] text-emerald-600 font-bold hover:underline">Renew</button>
          <button onclick="flagRentalNonRenewal('${c.id}')" class="text-[10px] text-amber-600 font-bold hover:underline">Non-Renew</button>
          <button onclick="sendRentalReminder('${c.id}','email')" class="text-[10px] text-indigo-600 font-bold hover:underline">Email</button>
          <button onclick="sendRentalReminder('${c.id}','sms')" class="text-[10px] text-sky-600 font-bold hover:underline">SMS</button>
          ${c.documentLink ? `<button data-rental-url="${rentalEscape(c.documentLink)}" onclick="openRentalDocument(this.dataset.rentalUrl)" class="text-[10px] text-slate-600 font-bold hover:underline">Doc</button>` : ''}
          <button onclick="deleteRentalContract('${c.id}')" class="text-[10px] text-rose-600 font-bold hover:underline">Delete</button>
        </div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="6" class="py-10 text-center text-xs font-semibold text-slate-404">No rental contracts match current filters.</td></tr>`;
    renderRentalNotificationLog();
  }

  window.saveRentalNotificationConfig = function () {
    rentalNotificationConfig.emailWebhook = document.getElementById('rental-email-webhook')?.value.trim() || '';
    rentalNotificationConfig.smsWebhook = document.getElementById('rental-sms-webhook')?.value.trim() || '';
    saveRentalConfig();
    updateRentalAutomationStatus();
    if (typeof window.triggerToast === 'function') window.triggerToast('Rental notification webhook configuration saved.', 'success');
  };

  function addRentalLog(entry) {
    rentalNotificationLog.unshift(Object.assign({ id: rentalUid('msg'), createdAt: new Date().toISOString() }, entry));
    saveRentalLog();
    renderRentalNotificationLog();
  }

  function renderRentalNotificationLog() {
    const box = document.getElementById('rental-notification-log'); if (!box) return;
    if (!rentalNotificationLog.length) { box.innerHTML = '<div class="text-center py-8 text-xs font-semibold text-slate-404">No tenant messages logged yet.</div>'; return; }
    box.innerHTML = rentalNotificationLog.slice(0, 50).map(m => `<div class="border border-slate-100 rounded-xl p-3 bg-slate-50"><div class="flex items-center justify-between gap-2"><span class="text-[10px] font-black uppercase ${m.status==='sent' ? 'text-emerald-700' : m.status==='failed' ? 'text-rose-600' : 'text-amber-700'}">${rentalEscape(m.status || 'queued')}</span><span class="text-[9px] text-slate-404">${new Date(m.createdAt).toLocaleString()}</span></div><div class="text-xs font-bold text-slate-800 mt-1">${rentalEscape(m.channel || '').toUpperCase()} • ${rentalEscape(m.subject || m.type || 'Notification')}</div><div class="text-[10px] text-slate-505 mt-1">${rentalEscape(m.recipient || '')}</div><div class="text-[10px] text-slate-404 mt-1">${rentalEscape(m.detail || '')}</div></div>`).join('');
  }

  function updateRentalAutomationStatus() {
    const el = document.getElementById('rental-automation-status'); if (!el) return;
    const emailReady = !!rentalNotificationConfig.emailWebhook;
    const smsReady = !!rentalNotificationConfig.smsWebhook;
    el.innerHTML = `Automation status: Email ${emailReady ? '<span class="text-emerald-700 font-black">configured</span>' : '<span class="text-amber-700 font-black">not configured</span>'} • SMS ${smsReady ? '<span class="text-emerald-700 font-black">configured</span>' : '<span class="text-amber-700 font-black">not configured</span>'}.`;
  }

  async function postRentalWebhook(channel, payload) {
    const url = channel === 'email' ? rentalNotificationConfig.emailWebhook : rentalNotificationConfig.smsWebhook;
    if (!url) return { ok: false, skipped: true, reason: 'No webhook configured' };
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      return { ok: response.ok, status: response.status };
    } catch (err) { return { ok: false, error: err.message }; }
  }

  async function dispatchRentalNotification(contract, channel, type, subject, message) {
    const destination = channel === 'email' ? contract.email : contract.phone;
    if (!destination) {
      addRentalLog({ channel, type, subject, recipient: contract.tenantName, status: 'failed', detail: `Missing ${channel === 'email' ? 'email' : 'phone'}.` });
      return;
    }
    const payload = { event: 'rental_notification', channel, type, tenant: { name: contract.tenantName, phone: contract.phone, email: contract.email }, property: contract.property, contractId: contract.id, subject, message };
    const result = await postRentalWebhook(channel, payload);
    if (result.skipped) {
      addRentalLog({ channel, type, subject, recipient: destination, status: 'queued', detail: 'Webhook not configured.' });
      if (typeof window.triggerToast === 'function') window.triggerToast(`${channel.toUpperCase()} message prepared. Configure webhook to transmit.`, 'info');
    } else if (result.ok) {
      addRentalLog({ channel, type, subject, recipient: destination, status: 'sent', detail: `Accepted (HTTP ${result.status}).` });
      if (typeof window.triggerToast === 'function') window.triggerToast(`${channel.toUpperCase()} notification sent.`, 'success');
    } else {
      addRentalLog({ channel, type, subject, recipient: destination, status: 'failed', detail: `Failed (HTTP ${result.status}).` });
      if (typeof window.triggerToast === 'function') window.triggerToast(`${channel.toUpperCase()} notification failed.`, 'error');
    }
  }

  window.sendRentalReminder = function (id, channel) {
    const c = rentalContracts.find(x => x.id === id); if (!c) return;
    const days = rentalDaysUntil(c.endDate);
    const paymentState = rentalPaymentState(c);
    let type = 'lease_renewal_reminder', subject = `Rental update for ${c.property}`, message = `Dear ${c.tenantName}, this is a reminder regarding your rental contract for ${c.property}. The lease ends on ${rentalFormatDate(c.endDate)}.`;
    if (paymentState === 'overdue') { type = 'overdue_payment_notice'; subject = `Overdue rent notice — ${c.property}`; message = `Dear ${c.tenantName}, our records show payment due on ${rentalFormatDate(c.nextPaymentDate)} is overdue.`; }
    else if (paymentState === 'upcoming') { type = 'upcoming_payment_notice'; subject = `Upcoming rent payment — ${c.property}`; message = `Dear ${c.tenantName}, your next rental payment is due on ${rentalFormatDate(c.nextPaymentDate)}.`; }
    else if (days !== null && days >= 0) { message += ` Approximately ${days} day${days===1?'':'s'} remaining.`; }
    dispatchRentalNotification(c, channel, type, subject, message);
  };

  window.openRentalBroadcast = function (channel) {
    document.getElementById('rental-broadcast-channel').value = channel || 'email';
    document.getElementById('rental-broadcast-message').value = '';
    document.getElementById('rental-broadcast-subject').value = '';
    document.getElementById('rental-broadcast-modal').classList.remove('hidden');
    window.updateRentalBroadcastTitle();
  };
  window.closeRentalBroadcast = function () { document.getElementById('rental-broadcast-modal')?.classList.add('hidden'); };
  window.updateRentalBroadcastTitle = function () {
    const channel = document.getElementById('rental-broadcast-channel').value;
    document.getElementById('rental-broadcast-title').textContent = channel === 'sms' ? '📱 SMS Tenant Broadcast' : '✉️ Email Tenant Broadcast';
    document.getElementById('rental-broadcast-subject-wrap').classList.toggle('hidden', channel === 'sms');
  };
  window.sendRentalBroadcast = async function () {
    const channel = document.getElementById('rental-broadcast-channel').value;
    const recipient = document.getElementById('rental-broadcast-recipient').value;
    const message = document.getElementById('rental-broadcast-message').value.trim();
    const subject = document.getElementById('rental-broadcast-subject').value.trim();
    if (!message) { if (typeof window.triggerToast === 'function') window.triggerToast('Enter a broadcast message first.', 'error'); return; }
    let targets = rentalContracts.filter(c => rentalEffectiveStatus(c) !== 'Terminated');
    if (recipient === 'renewal') targets = targets.filter(c => rentalEffectiveStatus(c) === 'Pending Renewal');
    if (recipient === 'overdue') targets = targets.filter(c => rentalPaymentState(c) === 'overdue');
    if (!targets.length) { if (typeof window.triggerToast === 'function') window.triggerToast('No tenants match the audience.', 'info'); return; }
    window.closeRentalBroadcast();
    for (const c of targets) await dispatchRentalNotification(c, channel, 'custom_broadcast', subject || 'Rental Management Update', message);
    if (typeof window.triggerToast === 'function') window.triggerToast(`Broadcast processed for ${targets.length} tenant(s).`, 'success');
  };

  window.clearRentalNotificationLog = function () {
    if (!confirm('Clear the delivery log?')) return;
    rentalNotificationLog = []; saveRentalLog(); renderRentalNotificationLog();
  };

  window.exportRentalContracts = function () {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), contracts: rentalContracts }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'rental-contracts.json'; a.click(); URL.revokeObjectURL(url);
  };

  async function runRentalAutomation(force) {
    const todayKey = new Date().toISOString().slice(0,10);
    let changed = false;
    for (const c of rentalContracts) {
      if (c.status === 'Terminated') continue;
      const renewalDays = rentalDaysUntil(c.endDate);
      const paymentDays = rentalDaysUntil(c.nextPaymentDate);
      const alertWindow = parseInt(c.alertDays, 10) || 60;
      const renewalDue = renewalDays !== null && renewalDays >= 0 && renewalDays <= alertWindow;
      const paymentDue = paymentDays !== null && paymentDays <= 7;
      const overdue = paymentDays !== null && paymentDays < 0;
      c.automationLog = c.automationLog || {};
      if (renewalDue && c.automationLog.renewal !== todayKey) {
        c.automationLog.renewal = todayKey; changed = true;
        const subject = `Lease renewal reminder — ${c.property}`;
        const message = `Dear ${c.tenantName}, your lease for ${c.property} ends on ${rentalFormatDate(c.endDate)}.`;
        if (c.email) await dispatchRentalNotification(c, 'email', 'lease_renewal_reminder', subject, message);
        if (c.phone) await dispatchRentalNotification(c, 'sms', 'lease_renewal_reminder', subject, message);
      }
      if ((paymentDue || overdue) && c.automationLog.payment !== todayKey) {
        c.automationLog.payment = todayKey; changed = true;
        const type = overdue ? 'overdue_payment_notice' : 'upcoming_payment_notice';
        const subject = overdue ? `Overdue rent notice — ${c.property}` : `Upcoming rent payment — ${c.property}`;
        const message = overdue ? `Dear ${c.tenantName}, rent due on ${rentalFormatDate(c.nextPaymentDate)} is overdue.` : `Dear ${c.tenantName}, rent payment of ${rentalFormatMoney(c.rentAmount)} is due on ${rentalFormatDate(c.nextPaymentDate)}.`;
        if (c.email) await dispatchRentalNotification(c, 'email', type, subject, message);
        if (c.phone) await dispatchRentalNotification(c, 'sms', type, subject, message);
      }
    }
    if (changed) saveRentalDatabase();
    if (force) renderRentalManagement();
    updateRentalAutomationStatus();
  }

  window.renderRentalManagement = renderRentalManagement;
  window.loadRentalDatabase = loadRentalDatabase;

  function initRentals() {
    loadRentalDatabase();
    renderRentalManagement();
    updateRentalAutomationStatus();
    runRentalAutomation(false);
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initRentals);
  } else {
    initRentals();
  }
})();

/* ----------------------------------------------------------------------------
 * 2. VEHICLE FLEET & MOBILITY MANAGEMENT
 * ---------------------------------------------------------------------------- */
(function(){
  'use strict';
  const VDB='pro_vehicles', VFU='pro_vehicle_fuel', VMN='pro_vehicle_maintenance', PART='vehicle-spare-part';
  let vehicles=[], fuels=[], maint=[];

  Object.defineProperty(window,'vehicles',{get:()=>vehicles,set:(v)=>{vehicles=Array.isArray(v)?v:[];},configurable:true});
  Object.defineProperty(window,'fuels',{get:()=>fuels,set:(f)=>{fuels=Array.isArray(f)?f:[];},configurable:true});
  Object.defineProperty(window,'maint',{get:()=>maint,set:(m)=>{maint=Array.isArray(m)?m:[];},configurable:true});

  const SEED_VEHICLES = [
    {
      id: 'veh_toyota_corolla',
      make: 'Toyota',
      model: 'Corolla',
      year: 2024,
      plate: 'ABC 1234',
      odometer: 45250,
      nextMaintenanceOdometer: 50000,
      createdAt: '2026-08-01T10:00:00.000Z'
    }
  ];

  const SEED_FUELS = [
    {
      id: 'fuel_toyota_1',
      vehicleId: 'veh_toyota_corolla',
      dateTime: '2026-10-22T15:30',
      odometer: 44600,
      liters: 42.5,
      cost: 595,
      accountId: 'acc_general',
      notes: 'Full tank - Octane 95',
      transportationType: 'Fuel'
    },
    {
      id: 'fuel_toyota_2',
      vehicleId: 'veh_toyota_corolla',
      dateTime: '2026-10-30T11:45',
      odometer: 45250,
      liters: 38.0,
      cost: 532,
      accountId: 'acc_general',
      notes: 'Highway & City driving fill-up',
      transportationType: 'Fuel'
    }
  ];

  const SEED_MAINT = [
    {
      id: 'mnt_toyota_40k',
      vehicleId: 'veh_toyota_corolla',
      date: '2026-10-15',
      odometer: 40000,
      nextMaintenanceOdometer: 50000,
      description: '40,000 km Periodic Service: Synthetic Engine Oil, Filter & Spark Plugs',
      laborCost: 450,
      partsCost: 850,
      totalCost: 1300,
      parts: [
        { partId: 'part_engine_oil', name: 'Synthetic Motor Oil 5W-30', quantity: 1, unit: 'bottle', unitCost: 650, lifespan: 10000 },
        { partId: 'part_oil_filter', name: 'OEM Oil Filter Cartridge', quantity: 1, unit: 'pcs', unitCost: 200, lifespan: 10000 }
      ],
      accountId: 'acc_general',
      txnId: 'exp_mnt_mnt_toyota_40k'
    }
  ];

  const SEED_PARTS = [
    {
      id: 'part_engine_oil',
      name: 'Synthetic Motor Oil 5W-30',
      itemType: 'vehicle-spare-part',
      category: 'Spare Parts',
      targetVehicleOrUnit: 'Toyota Corolla (ABC 1234)',
      quantity: 5,
      unit: 'bottle',
      price: 650,
      threshold: 2,
      lifespan: 10000,
      sku: 'OIL-SYN-5W30',
      consumptionLogs: []
    },
    {
      id: 'part_oil_filter',
      name: 'OEM Oil Filter Cartridge',
      itemType: 'vehicle-spare-part',
      category: 'Spare Parts',
      targetVehicleOrUnit: 'Toyota Corolla (ABC 1234)',
      quantity: 4,
      unit: 'pcs',
      price: 200,
      threshold: 1,
      lifespan: 10000,
      sku: 'FLT-OEM-123',
      consumptionLogs: []
    },
    {
      id: 'part_brake_pads',
      name: 'Front Ceramic Brake Pads',
      itemType: 'vehicle-spare-part',
      category: 'Spare Parts',
      targetVehicleOrUnit: 'Toyota Corolla (ABC 1234)',
      quantity: 2,
      unit: 'set',
      price: 850,
      threshold: 1,
      lifespan: 40000,
      sku: 'BRK-CER-F',
      consumptionLogs: []
    }
  ];

  const save=()=>{localStorage.setItem(VDB,JSON.stringify(vehicles));localStorage.setItem(VFU,JSON.stringify(fuels));localStorage.setItem(VMN,JSON.stringify(maint))};
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money=v=>`EGP ${Number(v||0).toFixed(2)}`;
  const vget=id=>Array.isArray(vehicles)?vehicles.find(v=>v&&v.id===id):null;

  window.restoreRegisteredVehicles = function(force = false) {
    if (!force && vehicles && vehicles.length > 0) return false;

    if (force || !vehicles || vehicles.length === 0) {
      vehicles = JSON.parse(JSON.stringify(SEED_VEHICLES));
    } else {
      SEED_VEHICLES.forEach(sv => {
        if (!vehicles.some(v => v.id === sv.id || v.plate === sv.plate)) vehicles.push(JSON.parse(JSON.stringify(sv)));
      });
    }

    if (force || !fuels || fuels.length === 0) {
      fuels = JSON.parse(JSON.stringify(SEED_FUELS));
    } else {
      SEED_FUELS.forEach(sf => {
        if (!fuels.some(f => f.id === sf.id)) fuels.push(JSON.parse(JSON.stringify(sf)));
      });
    }

    if (force || !maint || maint.length === 0) {
      maint = JSON.parse(JSON.stringify(SEED_MAINT));
    } else {
      SEED_MAINT.forEach(sm => {
        if (!maint.some(m => m.id === sm.id)) maint.push(JSON.parse(JSON.stringify(sm)));
      });
    }

    // Ensure spare parts with lifespans are populated in stockData
    if (!Array.isArray(window.stockData)) window.stockData = [];
    SEED_PARTS.forEach(sp => {
      const existing = window.stockData.find(p => p.id === sp.id || (p.name && p.name.toLowerCase() === sp.name.toLowerCase()));
      if (!existing) {
        window.stockData.push(JSON.parse(JSON.stringify(sp)));
      } else if (!existing.lifespan) {
        existing.lifespan = sp.lifespan;
      }
    });
    localStorage.setItem('pro_stock', JSON.stringify(window.stockData));

    save();

    // Ensure associated transactions are synced into window.transactions under Transportation
    if (!Array.isArray(window.transactions)) window.transactions = [];

    // Sync maintenance expenses
    maint.forEach(m => {
      const txnId = m.txnId || ('exp_mnt_' + m.id);
      if (!window.transactions.some(t => t.id === txnId || t.refId === m.id)) {
        const v = vget(m.vehicleId);
        window.transactions.unshift({
          id: txnId,
          date: m.date,
          category: 'Transportation',
          subcategory: 'Vehicle Maintenance',
          icon: '🚗',
          amount: parseFloat(Number(m.totalCost || 0).toFixed(2)),
          description: `Vehicle Maintenance: ${v ? `${v.make} ${v.model} (${v.plate})` : 'Toyota Corolla'} — ${m.description}`,
          type: 'expense',
          accountId: m.accountId || 'acc_general',
          refType: 'maintenance',
          refId: m.id
        });
      }
    });

    // Sync fuel expenses
    fuels.forEach(f => {
      const fuelTxnId = 'exp_fuel_' + f.id;
      if (!window.transactions.some(t => t.id === fuelTxnId || t.refId === f.id)) {
        const v = vget(f.vehicleId);
        window.transactions.unshift({
          id: fuelTxnId,
          date: f.dateTime ? f.dateTime.slice(0, 10) : new Date().toISOString().slice(0, 10),
          category: 'Transportation',
          subcategory: 'Fuel & Petrol',
          icon: '🚗',
          amount: parseFloat(Number(f.cost || 0).toFixed(2)),
          description: `Vehicle Fuel: ${v ? `${v.make} ${v.model} (${v.plate})` : 'Toyota Corolla'} — ${f.liters}L (${f.notes || 'Refuel'})`,
          type: 'expense',
          accountId: f.accountId || 'acc_general',
          refType: 'fuel',
          refId: f.id
        });
      }
    });

    if (typeof window.saveTransactionsDatabase === 'function') window.saveTransactionsDatabase();

    window.renderVehicleManagement();
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
    if (force && typeof window.triggerToast === 'function') {
      window.triggerToast('Registered vehicle, maintenance, and fuel records restored successfully!', 'success');
    }
    return true;
  };

  const load=()=>{
    try{vehicles=JSON.parse(localStorage.getItem(VDB)||'[]')}catch(e){vehicles=[]}
    try{fuels=JSON.parse(localStorage.getItem(VFU)||'[]')}catch(e){fuels=[]}
    try{maint=JSON.parse(localStorage.getItem(VMN)||'[]')}catch(e){maint=[]}
    if (vehicles.length === 0) {
      window.restoreRegisteredVehicles(false);
    } else if (Array.isArray(window.stockData)) {
      SEED_PARTS.forEach(sp => {
        const existing = window.stockData.find(p => p.id === sp.id || (p.name && p.name.toLowerCase() === sp.name.toLowerCase()));
        if (existing && !existing.lifespan) {
          existing.lifespan = sp.lifespan;
        }
      });
    }
  };
  window.loadVehicleDatabase = load;
  const parts=()=>Array.isArray(window.stockData)?window.stockData.filter(p=>p&&!p.isHidden&&(p.itemType===PART||p.itemType==='residential-spare-part')):[];
  const pget=id=>Array.isArray(window.stockData)?window.stockData.find(p=>p.id===id):null;
  const nowInput=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)};
  const today=()=>new Date().toISOString().slice(0,10);

  function populateVehicles(){
    ['vehicle-fuel-vehicle','vehicle-maint-vehicle'].forEach(id=>{
      const el=document.getElementById(id);if(!el)return;
      const old=el.value;
      el.innerHTML='<option value="">Select vehicle...</option>'+vehicles.map(v=>`<option value="${esc(v.id)}">${esc(v.make)} ${esc(v.model)} • ${esc(v.plate)}</option>`).join('');
      if(old&&vget(old))el.value=old;
    });
    const mv=document.getElementById('vehicle-maint-vehicle');
    if(mv&&!mv._hasAutoOdo){
      mv._hasAutoOdo=true;
      mv.addEventListener('change',function(){
        const v=vget(this.value);
        if(v){
          const odEl=document.getElementById('vehicle-maint-odometer');
          if(odEl && (!odEl.value || parseFloat(odEl.value) <= 0)) odEl.value=v.odometer||0;
          window.updateCalculatedNextMaintenanceOdo();
        }
      });
    }
  }

  function populatePartSelect(el){
    if(!el)return;
    const old=el.value;
    el.innerHTML='<option value="">Select spare part...</option>'+parts().map(p=>{
      const ls=Number(p.lifespan||0)>0?` • Lifespan: ${Number(p.lifespan).toLocaleString()} km`:'';
      return `<option value="${esc(p.id)}">${esc(p.name)} • ${Number(p.quantity||0)} ${esc(p.unit||'units')} @ ${money(p.price)}${ls}</option>`;
    }).join('');
    if(old&&pget(old))el.value=old;
  }

  function refreshParts(){document.querySelectorAll('.vehicle-part-select').forEach(populatePartSelect);}

  window.updateVehiclePartRowLifespan = function(row) {
    if(!row) return;
    const select = row.querySelector('.vehicle-part-select');
    const badge = row.querySelector('.part-lifespan-badge');
    if(!select || !badge) return;
    const p = pget(select.value);
    const ls = Number(p?.lifespan || 0);
    if(p && ls > 0){
      badge.textContent = `⏱️ Lifespan: +${ls.toLocaleString()} km`;
      badge.classList.remove('hidden');
    } else {
      badge.textContent = '';
      badge.classList.add('hidden');
    }
  };

  window.updateCalculatedNextMaintenanceOdo = function() {
    const curOdoInput = document.getElementById('vehicle-maint-odometer');
    const nextOdoInput = document.getElementById('vehicle-maint-next-odometer');
    const hintEl = document.getElementById('vehicle-maint-next-odo-hint');
    if (!curOdoInput || !nextOdoInput) return;

    let curOdo = parseFloat(curOdoInput.value);
    if (!Number.isFinite(curOdo) || curOdo <= 0) {
      const vId = document.getElementById('vehicle-maint-vehicle')?.value;
      const v = vget(vId);
      if (v && Number(v.odometer || 0) > 0) {
        curOdo = Number(v.odometer);
      }
    }

    const rows = document.querySelectorAll('#vehicle-maint-parts .vehicle-part-row');
    const lifespans = [];
    rows.forEach(r => {
      const select = r.querySelector('.vehicle-part-select');
      const p = pget(select?.value);
      if (p && Number(p.lifespan || 0) > 0) {
        lifespans.push(Number(p.lifespan));
      }
    });

    if (lifespans.length > 0 && Number.isFinite(curOdo) && curOdo >= 0) {
      const minLifespan = Math.min(...lifespans);
      const calculated = curOdo + minLifespan;
      nextOdoInput.value = calculated;
      if (hintEl) {
        hintEl.textContent = `⚡ Next service auto-calculated: ${curOdo.toLocaleString()} km (Current) + ${minLifespan.toLocaleString()} km (Lifespan) = ${calculated.toLocaleString()} km`;
        hintEl.classList.remove('hidden');
      }
    } else if (hintEl) {
      hintEl.classList.add('hidden');
    }
  };

  window.addVehiclePartRow=function(){
    const box=document.getElementById('vehicle-maint-parts');if(!box)return;
    const row=document.createElement('div');row.className='vehicle-part-row flex items-start gap-2';
    row.innerHTML='<div class="flex-1 min-w-0"><div class="flex items-center justify-between mb-1"><label class="block text-[9px] font-bold text-slate-404">Part</label><span class="part-lifespan-badge text-[10px] text-blue-600 dark:text-blue-400 font-bold hidden"></span></div><select class="vehicle-part-select w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-semibold"></select></div><div class="w-20"><label class="block text-[9px] font-bold text-slate-404 mb-1">Qty</label><input type="number" min="0.01" step="0.01" value="1" class="vehicle-part-qty w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-semibold"></div><button type="button" class="h-[34px] self-end bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-black px-2.5" onclick="this.closest(\'.vehicle-part-row\').remove();updateVehiclePartsTotal();updateCalculatedNextMaintenanceOdo();">×</button>';
    box.appendChild(row);
    const sel=row.querySelector('select');
    populatePartSelect(sel);
    sel.addEventListener('change',()=>{
      window.updateVehiclePartsTotal();
      window.updateVehiclePartRowLifespan(row);
      window.updateCalculatedNextMaintenanceOdo();
    });
    row.querySelector('input').addEventListener('input',()=>{
      window.updateVehiclePartsTotal();
    });
    window.updateVehiclePartsTotal();
  };

  window.updateVehiclePartsTotal=function(){
    const total=[...document.querySelectorAll('#vehicle-maint-parts .vehicle-part-row')].reduce((sum,r)=>{
      const p=pget(r.querySelector('select')?.value);
      return sum+(p?Number(r.querySelector('input')?.value||0)*Number(p.price||0):0);
    },0);
    const el=document.getElementById('vehicle-maint-parts-total');
    if(el) el.textContent=`Parts value: ${money(total)}`;
  };

  window.resetVehicleForm=function(){
    document.getElementById('vehicle-registration-form')?.reset();
    document.getElementById('vehicle-edit-id').value='';
    const nextOdoEl = document.getElementById('vehicle-next-odometer');
    if (nextOdoEl) nextOdoEl.value = '';
    document.getElementById('vehicle-save-btn').textContent='Register Vehicle';
  };

  window.handleVehicleRegistration=function(e){
    e.preventDefault();
    const make=document.getElementById('vehicle-make').value.trim(),model=document.getElementById('vehicle-model').value.trim(),year=Number(document.getElementById('vehicle-year').value),plate=document.getElementById('vehicle-plate').value.trim(),odo=Number(document.getElementById('vehicle-odometer').value),edit=document.getElementById('vehicle-edit-id').value;
    const nextOdo=Number(document.getElementById('vehicle-next-odometer')?.value)||0;
    if(!make||!model||!plate||!Number.isFinite(year)||!Number.isFinite(odo)||odo<0){if (typeof window.triggerToast === 'function') window.triggerToast('Complete the vehicle fields with valid values.','error');return}
    const key=plate.replace(/\s+/g,'').toUpperCase();
    if(vehicles.some(v=>v.id!==edit&&String(v.plate).replace(/\s+/g,'').toUpperCase()===key)){if (typeof window.triggerToast === 'function') window.triggerToast('Duplicate License Plate / ID.','error');return}
    if(edit){
      const v=vget(edit);
      if(odo<Number(v.odometer||0)){if (typeof window.triggerToast === 'function') window.triggerToast('Odometer cannot move backwards.','error');return}
      Object.assign(v,{make,model,year,plate,odometer:odo,nextMaintenanceOdometer:nextOdo});
      if (typeof window.triggerToast === 'function') window.triggerToast('Vehicle updated.','success');
    }else{
      vehicles.push({id:'veh_'+Date.now()+Math.random().toString(36).slice(2,6),make,model,year,plate,odometer:odo,nextMaintenanceOdometer:nextOdo,createdAt:new Date().toISOString()});
      if (typeof window.triggerToast === 'function') window.triggerToast('Vehicle registered.','success');
    }
    save();window.resetVehicleForm();window.renderVehicleManagement();
  };

  window.editVehicle=function(id){
    const v=vget(id);if(!v)return;
    ['make','model','year','plate','odometer'].forEach(k=>{const el=document.getElementById('vehicle-'+k);if(el)el.value=v[k]});
    const nextEl=document.getElementById('vehicle-next-odometer');if(nextEl)nextEl.value=v.nextMaintenanceOdometer||'';
    document.getElementById('vehicle-edit-id').value=id;
    document.getElementById('vehicle-save-btn').textContent='Update Vehicle';
    document.getElementById('view-vehicles')?.scrollIntoView({behavior:'smooth',block:'start'});
  };

  window.deleteVehicle=function(id){
    if(fuels.some(x=>x.vehicleId===id)||maint.some(x=>x.vehicleId===id)){if (typeof window.triggerToast === 'function') window.triggerToast('Vehicle cannot be deleted while history exists.','error');return}
    if(!confirm('Delete this vehicle?'))return;
    vehicles=vehicles.filter(v=>v.id!==id);
    save();window.renderVehicleManagement();
    if (typeof window.triggerToast === 'function') window.triggerToast('Vehicle removed.','success');
  };

  window.handleVehicleFuel=function(e){
    e.preventDefault();
    const editId = document.getElementById('vehicle-fuel-edit-id')?.value || '';
    const vehicleId = document.getElementById('vehicle-fuel-vehicle').value;
    const v = vget(vehicleId);
    const od = Number(document.getElementById('vehicle-fuel-odometer').value);
    const lit = Number(document.getElementById('vehicle-fuel-liters').value);
    const cost = Number(document.getElementById('vehicle-fuel-cost').value);
    const dt = document.getElementById('vehicle-fuel-datetime').value;
    const accountId = document.getElementById('vehicle-fuel-account')?.value || 'acc_general';
    const notes = (document.getElementById('vehicle-fuel-notes')?.value || '').trim();

    if(!v||!dt||!Number.isFinite(od)||od<0||lit<=0||cost<0){if (typeof window.triggerToast === 'function') window.triggerToast('Enter valid fueling details.','error');return;}

    if(editId){
      const fuel = fuels.find(x=>x.id===editId);
      if(fuel){
        fuel.vehicleId=vehicleId; fuel.dateTime=dt; fuel.odometer=od; fuel.liters=lit; fuel.cost=cost; fuel.accountId=accountId; fuel.notes=notes;
        v.odometer=Math.max(Number(v.odometer||0),od);
        save();
        e.target.reset();
        document.getElementById('vehicle-fuel-edit-id').value='';
        document.getElementById('vehicle-fuel-datetime').value=nowInput();
        document.getElementById('vehicle-fuel-save-btn').textContent='Save Fuel Transaction';
        window.renderVehicleManagement();
        if (typeof window.triggerToast === 'function') window.triggerToast('Fuel transaction updated.','success');
        return;
      }
    }

    const fuel={id:'fuel_'+Date.now(),vehicleId,dateTime:dt,odometer:od,liters:lit,cost,accountId,notes,transportationType:'Fuel'};
    fuels.unshift(fuel);
    v.odometer=Math.max(Number(v.odometer||0),od);
    save();
    if(typeof window.logAutomaticExpense==='function') window.logAutomaticExpense(`Fuel — ${v.make} ${v.model} (${v.plate})`,cost,'Transportation');
    e.target.reset();
    document.getElementById('vehicle-fuel-datetime').value=nowInput();
    window.renderVehicleManagement();
    if (typeof window.triggerToast === 'function') window.triggerToast('Fuel transaction saved.','success');
  };

  window.editVehicleFuel = function(id) {
    const f = fuels.find(x => x.id === id);
    if (!f) return;
    const vEl = document.getElementById('vehicle-fuel-vehicle');
    if (vEl) vEl.value = f.vehicleId;
    const dtEl = document.getElementById('vehicle-fuel-datetime');
    if (dtEl) dtEl.value = f.dateTime || '';
    const odEl = document.getElementById('vehicle-fuel-odometer');
    if (odEl) odEl.value = f.odometer || '';
    const litEl = document.getElementById('vehicle-fuel-liters');
    if (litEl) litEl.value = f.liters || '';
    const costEl = document.getElementById('vehicle-fuel-cost');
    if (costEl) costEl.value = f.cost || '';
    const accEl = document.getElementById('vehicle-fuel-account');
    if (accEl) accEl.value = f.accountId || 'acc_general';
    const notesEl = document.getElementById('vehicle-fuel-notes');
    if (notesEl) notesEl.value = f.notes || '';
    const editIdEl = document.getElementById('vehicle-fuel-edit-id');
    if (editIdEl) editIdEl.value = id;
    const btn = document.getElementById('vehicle-fuel-save-btn');
    if (btn) btn.textContent = 'Update Fuel Transaction';
    document.getElementById('vehicle-fuel-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  window.deleteVehicleFuel = function(id) {
    const f = fuels.find(x => x.id === id);
    if (!f) return;
    if (!confirm('Delete this fuel transaction?')) return;
    fuels = fuels.filter(x => x.id !== id);
    if (Array.isArray(window.transactions)) {
      window.transactions = window.transactions.filter(t => t.refId !== id && t.id !== ('exp_fuel_' + id));
      if (typeof window.saveTransactionsDatabase === 'function') window.saveTransactionsDatabase();
    }
    save();
    window.renderVehicleManagement();
    if (typeof window.renderAllViews === 'function') window.renderAllViews();
    if (typeof window.triggerToast === 'function') window.triggerToast('Fuel transaction deleted.', 'success');
  };

  window.currentVehicleHistoryTab = 'maintenance';
  window.setVehicleHistoryTab = function(tab) {
    window.currentVehicleHistoryTab = tab;
    ['maintenance', 'fuel', 'all'].forEach(t => {
      const btn = document.getElementById(`btn-vh-${t}`);
      const pane = document.getElementById(`vh-pane-${t}`);
      if (btn) {
        if (t === tab) {
          btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-xs';
        } else {
          btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900';
        }
      }
      if (pane) {
        pane.classList.toggle('hidden', t !== tab);
      }
    });
  };

  window.syncMaintenanceHistoryToLedgerAndStock = function() {
    if (!Array.isArray(window.transactions)) window.transactions = [];
    let changed = false;

    // Migrate any existing maintenance transactions to Transportation / Vehicle Maintenance
    window.transactions.forEach(t => {
      if (t.refType === 'maintenance' || t.category === 'Vehicle Maintenance') {
        t.category = 'Transportation';
        t.subcategory = 'Vehicle Maintenance';
        t.icon = '🚗';
        changed = true;
      }
    });

    if (Array.isArray(maint)) {
      maint.forEach(m => {
        const total = Number(m.totalCost || 0);
        if (total <= 0) return;
        const expectedTxnId = m.txnId || ('exp_mnt_' + m.id);
        const existingTxn = window.transactions.find(t => t.id === expectedTxnId || t.refId === m.id);
        if (!existingTxn) {
          const v = vget(m.vehicleId);
          const vTitle = v ? `${v.make} ${v.model} (${v.plate})` : 'Fleet Vehicle';
          window.transactions.unshift({
            id: expectedTxnId,
            date: m.date || new Date().toISOString().slice(0, 10),
            category: 'Transportation',
            subcategory: 'Vehicle Maintenance',
            icon: '🚗',
            amount: parseFloat(total.toFixed(2)),
            description: `Vehicle Maintenance: ${vTitle} — ${m.description || 'Service'}`,
            type: 'expense',
            accountId: m.accountId || 'acc_general',
            refType: 'maintenance',
            refId: m.id
          });
          m.txnId = expectedTxnId;
          changed = true;
        } else if (existingTxn.category !== 'Transportation' || existingTxn.subcategory !== 'Vehicle Maintenance') {
          existingTxn.category = 'Transportation';
          existingTxn.subcategory = 'Vehicle Maintenance';
          existingTxn.icon = '🚗';
          changed = true;
        }
      });
    }

    if (changed) {
      save();
      if (typeof window.saveTransactionsDatabase === 'function') window.saveTransactionsDatabase();
    }
  };

  window.handleVehicleMaintenance=function(e){
    e.preventDefault();
    const vehicleId=document.getElementById('vehicle-maint-vehicle').value,v=vget(vehicleId);
    const date=document.getElementById('vehicle-maint-date').value,od=Number(document.getElementById('vehicle-maint-odometer').value);
    const nextMaintOd=Number(document.getElementById('vehicle-maint-next-odometer')?.value)||0;
    const desc=document.getElementById('vehicle-maint-description').value.trim(),labor=Number(document.getElementById('vehicle-maint-labor').value)||0;
    const acctEl=document.getElementById('vehicle-maint-account');
    const accountId=acctEl?.value||'acc_general';

    if(!v||!date||!desc||!Number.isFinite(od)||od<0||labor<0){if (typeof window.triggerToast === 'function') window.triggerToast('Invalid maintenance data.','error');return}

    const aggregate={};
    document.querySelectorAll('#vehicle-maint-parts .vehicle-part-row').forEach(r=>{
      const id=r.querySelector('select')?.value,q=Number(r.querySelector('input')?.value||0);
      if(id&&q>0)aggregate[id]=(aggregate[id]||0)+q;
    });

    const used=[];let partsCost=0;
    for(const id of Object.keys(aggregate)){
      const p=pget(id),q=aggregate[id];
      if(!p){if (typeof window.triggerToast === 'function') window.triggerToast('Spare part missing.','error');return}
      if(q>Number(p.quantity||0)){if (typeof window.triggerToast === 'function') window.triggerToast(`Insufficient stock for ${p.name}.`,'error');return}
      used.push({partId:id,name:p.name,quantity:q,unit:p.unit||'units',unitCost:Number(p.price||0),lifespan:Number(p.lifespan||0)});
      partsCost+=q*Number(p.price||0);
    }

    used.forEach(d=>{
      const p=pget(d.partId);
      if(p){
        p.quantity=Math.max(0,Number(p.quantity||0)-d.quantity);
        p.consumptionLogs=Array.isArray(p.consumptionLogs)?p.consumptionLogs:[];
        p.consumptionLogs.push({date,quantity:d.quantity,amount:d.quantity,type:'consumed',reason:`Vehicle maintenance — ${v.make} ${v.model} (${v.plate})`});
      }
    });

    const total=labor+partsCost;
    const maintId='mnt_'+Date.now();
    const txnId='exp_mnt_'+maintId;

    if(nextMaintOd>0){
      v.nextMaintenanceOdometer=nextMaintOd;
    }

    // Direct synchronization to window.transactions under Transportation / Vehicle Maintenance
    if(total>0){
      if(!Array.isArray(window.transactions)) window.transactions=[];
      window.transactions.unshift({
        id: txnId,
        date: date,
        category: 'Transportation',
        subcategory: 'Vehicle Maintenance',
        icon: '🚗',
        amount: parseFloat(total.toFixed(2)),
        description: `Vehicle Maintenance: ${v.make} ${v.model} (${v.plate}) — ${desc}`,
        type: 'expense',
        accountId: accountId,
        refType: 'maintenance',
        refId: maintId
      });
      if(typeof window.saveTransactionsDatabase==='function') window.saveTransactionsDatabase();
    }

    maint.unshift({
      id: maintId,
      vehicleId,
      date,
      odometer: od,
      nextMaintenanceOdometer: nextMaintOd>0?nextMaintOd:(v.nextMaintenanceOdometer||0),
      description: desc,
      laborCost: labor,
      partsCost,
      totalCost: total,
      parts: used,
      accountId,
      txnId: total>0?txnId:''
    });

    v.odometer=Math.max(Number(v.odometer||0),od);
    localStorage.setItem('pro_stock',JSON.stringify(window.stockData));
    save();

    e.target.reset();
    document.getElementById('vehicle-maint-date').value=today();
    const nextMaintInput=document.getElementById('vehicle-maint-next-odometer');
    if(nextMaintInput) nextMaintInput.value='';
    document.getElementById('vehicle-maint-parts').innerHTML='';
    window.addVehiclePartRow();
    window.renderVehicleManagement();
    if(typeof window.renderSparePartsLedger==='function') window.renderSparePartsLedger();
    if(typeof window.renderAllViews==='function') window.renderAllViews();
    if(typeof window.triggerToast === 'function') window.triggerToast(`Maintenance saved. Transaction synced and spare parts updated.`,'success');
  };

  window.deleteVehicleMaintenance=function(id){
    const m=maint.find(x=>x.id===id);if(!m)return;
    if(!confirm('Delete this maintenance record, restore spare parts, and remove the synced transaction?'))return;

    // Restore spare parts in stock
    (m.parts||[]).forEach(d=>{
      const p=pget(d.partId);
      if(p){
        p.quantity=Number(p.quantity||0)+Number(d.quantity||0);
        if(Array.isArray(p.consumptionLogs)){
          p.consumptionLogs.push({
            date: new Date().toISOString().slice(0,10),
            amount: d.quantity,
            type: 'restored',
            reason: `Restored: Deleted maintenance record for vehicle ${m.vehicleId}`
          });
        }
      }
    });

    // Remove synced transaction from transactions ledger
    if(Array.isArray(window.transactions)){
      window.transactions=window.transactions.filter(t=>t.refId!==id&&t.id!==m.txnId&&t.id!==('exp_mnt_'+id));
      if(typeof window.saveTransactionsDatabase==='function') window.saveTransactionsDatabase();
    }

    maint=maint.filter(x=>x.id!==id);
    localStorage.setItem('pro_stock',JSON.stringify(window.stockData));
    save();
    window.renderVehicleManagement();
    if(typeof window.renderSparePartsLedger==='function') window.renderSparePartsLedger();
    if(typeof window.renderAllViews==='function') window.renderAllViews();
    if(typeof window.triggerToast === 'function') window.triggerToast('Maintenance deleted, spare parts restored, and transaction removed.','success');
  };

  window.renderVehicleManagement=function(){
    try {
      if (!vehicles || vehicles.length === 0) {
        load();
      }
      populateVehicles();
      refreshParts();
      window.syncMaintenanceHistoryToLedgerAndStock();

      const search=(document.getElementById('vehicle-search')?.value||'').toLowerCase();
      const vb=document.getElementById('vehicle-register-body');
      if(vb){
        const rows=(vehicles||[]).filter(v=>v && `${v.make||''} ${v.model||''} ${v.plate||''} ${v.year||''}`.toLowerCase().includes(search));
        vb.innerHTML=rows.length?rows.map(v=>{
          const nextOdoVal=Number(v.nextMaintenanceOdometer||0);
          let nextOdoBadge='';
          if(nextOdoVal>0){
            const remaining=nextOdoVal-Number(v.odometer||0);
            if(remaining<=0){
              nextOdoBadge=`<div class="font-bold text-rose-600 dark:text-rose-400">${nextOdoVal.toFixed(1)} km</div><span class="inline-block mt-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">Overdue by ${Math.abs(remaining).toFixed(0)} km</span>`;
            }else if(remaining<=500){
              nextOdoBadge=`<div class="font-bold text-amber-600 dark:text-amber-400">${nextOdoVal.toFixed(1)} km</div><span class="inline-block mt-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Due in ${remaining.toFixed(0)} km</span>`;
            }else{
              nextOdoBadge=`<div class="font-bold text-slate-800 dark:text-slate-200">${nextOdoVal.toFixed(1)} km</div><span class="inline-block mt-0.5 text-[9px] font-semibold text-slate-404">in ${remaining.toFixed(0)} km</span>`;
            }
          }else{
            nextOdoBadge=`<span class="text-slate-404 text-[11px] italic">Not set</span>`;
          }
          return `<tr class="vehicle-register-row"><td class="py-3 px-2"><div class="font-bold text-slate-900 dark:text-white">${esc(v.make)} ${esc(v.model)}</div><div class="text-[10px] text-slate-404">${esc(v.id)}</div></td><td class="py-3 px-2 font-semibold">${esc(v.plate)}</td><td class="py-3 px-2 font-bold">${Number(v.odometer||0).toFixed(1)} km</td><td class="py-3 px-2">${nextOdoBadge}</td><td class="py-3 px-2">${esc(v.year)}</td><td class="py-3 px-2 text-center"><button onclick="editVehicle('${esc(v.id)}')" class="text-[10px] text-blue-600 font-bold">Edit</button><span class="text-slate-300 mx-1">|</span><button onclick="deleteVehicle('${esc(v.id)}')" class="text-[10px] text-rose-600 font-bold">Delete</button></td></tr>`;
        }).join(''):'<tr><td colspan="6" class="py-8 text-center text-xs text-slate-404">No vehicles registered yet.</td></tr>';
      }

      // 1. Maintenance History Table
      const mb=document.getElementById('vehicle-maint-body');
      const filteredMaint = search ? (maint||[]).filter(x => {
        if (!x) return false;
        const v = vget(x.vehicleId);
        return `${x.date||''} ${x.description||''} ${v ? `${v.make} ${v.model} ${v.plate}` : ''}`.toLowerCase().includes(search);
      }) : (maint||[]).filter(Boolean);

      if(mb){
        mb.innerHTML=filteredMaint.slice(0,100).map(x=>{
          const v=vget(x.vehicleId);
          const plist=(x.parts||[]).filter(Boolean).map(p=>{
            const pRecord = pget(p.partId);
            const ls = Number(p.lifespan || (pRecord && pRecord.lifespan) || 0);
            return `${esc(p.name)} × ${p.quantity}${ls > 0 ? ` <span class="text-blue-600 dark:text-blue-400 font-bold">(Lifespan: +${ls.toLocaleString()} km)</span>` : ''}`;
          }).join(', ')||'None';
          return `<tr><td class="py-3 px-2">${esc(x.date)}</td><td class="py-3 px-2 font-bold">${v?esc(v.make+' '+v.model):'Unknown'}</td><td class="py-3 px-2"><div class="font-semibold">${esc(x.description)}</div><div class="text-[9px] text-slate-404 mt-1">Labor ${money(x.laborCost)} • ${plist}</div></td><td class="py-3 px-2 font-semibold">${Number(x.odometer||0).toFixed(1)} km</td><td class="py-3 px-2 text-right">${money(x.laborCost)}</td><td class="py-3 px-2 text-right">${money(x.partsCost)}</td><td class="py-3 px-2 text-right font-black text-rose-600">${money(x.totalCost)}</td><td class="py-3 px-2 text-center"><button onclick="deleteVehicleMaintenance('${esc(x.id)}')" class="text-[10px] text-rose-600 font-bold hover:underline">Delete</button></td></tr>`;
        }).join('')||'<tr><td colspan="8" class="py-8 text-center text-xs text-slate-404">No maintenance records found.</td></tr>';
      }

      // 2. Fueling History Table
      const fb=document.getElementById('vehicle-fuel-body');
      const filteredFuels = search ? (fuels||[]).filter(x => {
        if (!x) return false;
        const v = vget(x.vehicleId);
        return `${x.dateTime||''} ${x.notes||''} ${v ? `${v.make} ${v.model} ${v.plate}` : ''}`.toLowerCase().includes(search);
      }) : (fuels||[]).filter(Boolean);

      if(fb){
        fb.innerHTML=filteredFuels.slice(0,100).map(x=>{
          const v=vget(x.vehicleId);
          const dtStr = x.dateTime ? String(x.dateTime).replace('T', ' ') : 'N/A';
          const acc = (window.accounts || []).find(a => a && a.id === x.accountId);
          const accLabel = acc ? acc.label : (x.accountId || 'General');
          return `<tr><td class="py-3 px-2 font-semibold text-slate-600 dark:text-slate-300">${esc(dtStr)}</td><td class="py-3 px-2 font-bold">${v?esc(v.make+' '+v.model):'Unknown'}</td><td class="py-3 px-2 font-semibold">${Number(x.odometer||0).toFixed(1)} km</td><td class="py-3 px-2 text-right font-bold text-blue-600">${Number(x.liters||0).toFixed(2)} L</td><td class="py-3 px-2 text-right font-black text-rose-600">${money(x.cost)}</td><td class="py-3 px-2 text-slate-500">${esc(accLabel)}</td><td class="py-3 px-2 text-slate-500 italic">${esc(x.notes||'—')}</td><td class="py-3 px-2 text-center whitespace-nowrap"><button onclick="editVehicleFuel('${esc(x.id)}')" class="text-[10px] text-blue-600 font-bold hover:underline">Edit</button><span class="text-slate-300 mx-1">|</span><button onclick="deleteVehicleFuel('${esc(x.id)}')" class="text-[10px] text-rose-600 font-bold hover:underline">Delete</button></td></tr>`;
        }).join('')||'<tr><td colspan="8" class="py-8 text-center text-xs text-slate-404">No fueling records found.</td></tr>';
      }

      // 3. Combined Activity Timeline Table
      const ab=document.getElementById('vehicle-all-history-body');
      if(ab){
        const combined = [
          ...(maint||[]).filter(Boolean).map(m => ({ ...m, _type: 'maintenance', _sortDate: m.date || '' })),
          ...(fuels||[]).filter(Boolean).map(f => ({ ...f, _type: 'fuel', _sortDate: (f.dateTime ? String(f.dateTime).slice(0,10) : '') }))
        ].sort((a,b) => (b._sortDate || '').localeCompare(a._sortDate || '') || (Number(b.odometer||0) - Number(a.odometer||0)));

        const filteredCombined = search ? combined.filter(x => {
          const v = vget(x.vehicleId);
          const txt = `${x._sortDate||''} ${x.description||''} ${x.notes||''} ${v ? `${v.make} ${v.model} ${v.plate}` : ''}`;
          return txt.toLowerCase().includes(search);
        }) : combined;

        ab.innerHTML=filteredCombined.slice(0,100).map(x=>{
          const v=vget(x.vehicleId);
          const isMaint = x._type === 'maintenance';
          const typeBadge = isMaint
            ? '<span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">🔧 Maintenance</span>'
            : '<span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">⛽ Fueling</span>';
          const details = isMaint
            ? esc(x.description || 'Service')
            : `${Number(x.liters||0).toFixed(2)} Liters ${x.notes ? `• ${esc(x.notes)}` : ''}`;
          const amt = isMaint ? Number(x.totalCost || 0) : Number(x.cost || 0);
          const actionBtn = isMaint
            ? `<button onclick="deleteVehicleMaintenance('${esc(x.id)}')" class="text-[10px] text-rose-600 font-bold hover:underline">Delete</button>`
            : `<button onclick="editVehicleFuel('${esc(x.id)}')" class="text-[10px] text-blue-600 font-bold hover:underline">Edit</button><span class="text-slate-300 mx-1">|</span><button onclick="deleteVehicleFuel('${esc(x.id)}')" class="text-[10px] text-rose-600 font-bold hover:underline">Delete</button>`;

          return `<tr><td class="py-3 px-2">${esc(x._sortDate)}</td><td class="py-3 px-2">${typeBadge}</td><td class="py-3 px-2 font-bold">${v?esc(v.make+' '+v.model):'Unknown'}</td><td class="py-3 px-2 font-semibold">${Number(x.odometer||0).toFixed(1)} km</td><td class="py-3 px-2">${details}</td><td class="py-3 px-2 text-right font-black text-rose-600">${money(amt)}</td><td class="py-3 px-2 text-center whitespace-nowrap">${actionBtn}</td></tr>`;
        }).join('')||'<tr><td colspan="7" class="py-8 text-center text-xs text-slate-404">No vehicle activity records found.</td></tr>';
      }

      // Counts
      const cm = document.getElementById('vh-count-maint');
      const cf = document.getElementById('vh-count-fuel');
      const ca = document.getElementById('vh-count-all');
      if (cm) cm.textContent = (maint||[]).length;
      if (cf) cf.textContent = (fuels||[]).length;
      if (ca) ca.textContent = (maint||[]).length + (fuels||[]).length;

      const fc=document.getElementById('vehicle-kpi-count'),ff=document.getElementById('vehicle-kpi-fuel'),fml=document.getElementById('vehicle-kpi-maint-labor'),fmp=document.getElementById('vehicle-kpi-maint-parts'),fp=document.getElementById('vehicle-kpi-parts');
      if(fc)fc.textContent=(vehicles||[]).length;
      if(ff)ff.textContent=money((fuels||[]).reduce((s,x)=>s+Number(x?.cost||0),0));
      if(fml)fml.textContent=money((maint||[]).reduce((s,x)=>s+Number(x?.laborCost||0),0));
      if(fmp)fmp.textContent=money((maint||[]).reduce((s,x)=>s+Number(x?.partsCost||0),0));
      if(fp)fp.textContent=money(parts().reduce((s,p)=>s+Number(p?.quantity||0)*Number(p?.price||0),0));

      // Vehicle Maintenance Health Widget Rendering
      const healthContainer = document.getElementById('vehicle-health-cards-container');
      const healthSummaryCount = document.getElementById('vehicle-health-summary-count');
      if (healthContainer) {
        if (healthSummaryCount) healthSummaryCount.textContent = `${(vehicles||[]).length} vehicle${(vehicles||[]).length === 1 ? '' : 's'} tracked`;
        if (!(vehicles||[]).length) {
          healthContainer.innerHTML = '<div class="col-span-full py-6 text-center text-xs text-slate-404">No vehicles registered yet. Register a vehicle to monitor maintenance health.</div>';
        } else {
          healthContainer.innerHTML = (vehicles||[]).map(v => {
            if (!v) return '';
            const currentOdo = Number(v.odometer || 0);
            const nextOdo = Number(v.nextMaintenanceOdometer || 0);
            const vehicleHistory = (maint||[]).filter(m => m && m.vehicleId === v.id).sort((a,b) => new Date(b.date) - new Date(a.date) || Number(b.odometer || 0) - Number(a.odometer || 0));
            const lastRecord = vehicleHistory[0];
            const lastOdo = lastRecord ? Number(lastRecord.odometer || 0) : Math.max(0, nextOdo > 0 ? (nextOdo - 10000) : 0);

            let pct = 0;
            let barColor = 'bg-blue-600';
            let statusBadge = '';
            let statusDesc = '';

            if (nextOdo > 0) {
              const span = Math.max(1, nextOdo - lastOdo);
              const elapsed = Math.max(0, currentOdo - lastOdo);
              const remaining = nextOdo - currentOdo;
              pct = Math.min(100, Math.max(0, (elapsed / span) * 100));

              if (remaining <= 0) {
                pct = 100;
                barColor = 'bg-rose-500';
                statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">Overdue</span>`;
                statusDesc = `<span class="text-rose-600 dark:text-rose-400 font-extrabold text-[11px]">${Math.abs(remaining).toFixed(1)} km overdue</span>`;
              } else if (remaining <= 500) {
                barColor = 'bg-amber-500';
                statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Due Soon</span>`;
                statusDesc = `<span class="text-amber-600 dark:text-amber-400 font-extrabold text-[11px]">${remaining.toFixed(1)} km left</span>`;
              } else {
                barColor = pct > 75 ? 'bg-amber-500' : 'bg-emerald-500';
                statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Healthy</span>`;
                statusDesc = `<span class="text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">${remaining.toFixed(1)} km remaining</span>`;
              }
            } else {
              statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Unscheduled</span>`;
              statusDesc = `<button type="button" onclick="editVehicle('${esc(v.id)}')" class="text-blue-600 hover:underline font-bold text-xs">Set next odometer</button>`;
            }

            return `
              <div class="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-3">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>🚗</span> ${esc(v.make)} ${esc(v.model)}
                    </div>
                    <div class="text-[10px] text-slate-404 font-semibold mt-0.5">${esc(v.plate)} • ${esc(v.year)}</div>
                  </div>
                  ${statusBadge}
                </div>

                <div class="space-y-1.5">
                  <div class="flex items-center justify-between text-[11px] font-semibold">
                    <span class="text-slate-500 dark:text-slate-400">Current: <strong class="text-slate-800 dark:text-slate-200">${currentOdo.toFixed(1)} km</strong></span>
                    <span class="text-slate-500 dark:text-slate-400">Next: <strong class="text-slate-800 dark:text-slate-200">${nextOdo > 0 ? nextOdo.toFixed(1) + ' km' : 'None'}</strong></span>
                  </div>
                  <div class="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                    <div class="${barColor} h-full rounded-full transition-all duration-300" style="width: ${pct.toFixed(1)}%"></div>
                  </div>
                  <div class="flex items-center justify-between text-[10px]">
                    <span class="text-slate-404 font-medium">${nextOdo > 0 ? `${pct.toFixed(0)}% of interval reached` : 'No interval target'}</span>
                    <div>${statusDesc}</div>
                  </div>
                </div>
              </div>
            `;
          }).join('');
        }
      }

      window.updateVehiclePartsTotal();
    } catch(err) {
      console.error('[Forecaster] renderVehicleManagement error:', err);
    }
  };

  function initVehicles(){
    load();
    const f=document.getElementById('vehicle-fuel-datetime'),m=document.getElementById('vehicle-maint-date');
    if(f&&!f.value)f.value=nowInput();
    if(m&&!m.value)m.value=today();
    if(!document.querySelector('#vehicle-maint-parts .vehicle-part-row'))window.addVehiclePartRow();
    window.renderVehicleManagement();
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initVehicles);
  } else {
    initVehicles();
  }
})();

/* ----------------------------------------------------------------------------
 * 3. PROPERTY / UNIT MANAGER MODAL & HOOK
 * ---------------------------------------------------------------------------- */
(function () {
  const RPM_DB_KEY = 'pro_rental_properties_v1';
  let rpmProperties = [];

  function rpmLoad() {
    try { rpmProperties = JSON.parse(localStorage.getItem(RPM_DB_KEY) || '[]'); }
    catch (e) { rpmProperties = []; }
  }
  window.rpmLoad = rpmLoad;

  function rpmSave() {
    localStorage.setItem(RPM_DB_KEY, JSON.stringify(rpmProperties));
  }

  window.openPropertyManagerModal = function() {
    rpmLoad();
    window.rpmRenderModalList();
    const wrap = document.getElementById('rpm-modal-backdrop');
    if (wrap) wrap.classList.remove('hidden');
  };

  window.closePropertyManagerModal = function() {
    const wrap = document.getElementById('rpm-modal-backdrop');
    if (wrap) wrap.classList.add('hidden');
  };

  window.rpmRenderModalList = function() {
    const list = document.getElementById('rpm-property-list');
    if (!list) return;
    if (!rpmProperties.length) {
      list.innerHTML = '<div class="text-center py-6 text-slate-404 font-semibold text-xs">No properties yet. Add your first one above.</div>';
      return;
    }
    list.innerHTML = rpmProperties.map(p => `
      <div class="flex items-start justify-between gap-2 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
        <div>
          <p class="text-xs font-bold text-slate-900 dark:text-white">${p.name}</p>
        </div>
        <button type="button" onclick="window.rpmDeleteProperty('${p.id}')" class="text-[10px] text-rose-600 font-bold hover:underline shrink-0">Remove</button>
      </div>
    `).join('');
  };

  window.rpmDeleteProperty = function(id) {
    rpmProperties = rpmProperties.filter(p => p.id !== id);
    rpmSave();
    window.rpmRenderModalList();
    window.rpmRenderDropdown();
    if (typeof window.triggerToast === 'function') window.triggerToast('Property / Unit removed.', 'info');
  };

  window.rpmRenderDropdown = function() {
    const select = document.getElementById('rental-property');
    if (!select || select.tagName !== 'SELECT') return;
    const currentValue = select.value;
    let html = '<option value="" disabled' + (currentValue ? '' : ' selected') + '>Select Property / Unit...</option>';
    rpmProperties.forEach(p => {
      html += `<option value="${p.name}">${p.name}</option>`;
    });
    if (currentValue && !rpmProperties.some(p => p.name === currentValue)) {
      html += `<option value="${currentValue}">${currentValue} (legacy)</option>`;
    }
    select.innerHTML = html;
    select.value = currentValue || '';
  };

  window.addEventListener('DOMContentLoaded', () => {
    rpmLoad();
    window.rpmRenderDropdown();
  });
})();
