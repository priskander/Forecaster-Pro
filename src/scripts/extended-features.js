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
        <div class="flex gap-2"><button onclick="sendRentalReminder('${c.id}','email')" class="text-[10px] font-bold text-indigo-700 hover:underline">✉️ Email</button><button onclick="sendRentalReminder('${c.id}','sms')" class="text-[10px] font-bold text-sky-700 hover:underline">📱 SMS</button><button onclick="renewRentalContract('${c.id}')" class="text-[10px] font-bold text-emerald-700 hover:underline">Renew</button></div>
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

  window.addEventListener('DOMContentLoaded', function () {
    loadRentalDatabase();
    renderRentalManagement();
    updateRentalAutomationStatus();
    runRentalAutomation(false);
  });
})();

/* ----------------------------------------------------------------------------
 * 2. VEHICLE FLEET & MOBILITY MANAGEMENT
 * ---------------------------------------------------------------------------- */
(function(){
  'use strict';
  const VDB='pro_vehicles', VFU='pro_vehicle_fuel', VMN='pro_vehicle_maintenance', PART='vehicle-spare-part';
  let vehicles=[], fuels=[], maint=[];

  Object.defineProperty(window,'vehicles',{get:()=>vehicles,configurable:true});
  Object.defineProperty(window,'fuels',{get:()=>fuels,configurable:true});
  Object.defineProperty(window,'maint',{get:()=>maint,configurable:true});

  const load=()=>{try{vehicles=JSON.parse(localStorage.getItem(VDB)||'[]')}catch(e){vehicles=[]}try{fuels=JSON.parse(localStorage.getItem(VFU)||'[]')}catch(e){fuels=[]}try{maint=JSON.parse(localStorage.getItem(VMN)||'[]')}catch(e){maint=[]}};
  window.loadVehicleDatabase = load;
  const save=()=>{localStorage.setItem(VDB,JSON.stringify(vehicles));localStorage.setItem(VFU,JSON.stringify(fuels));localStorage.setItem(VMN,JSON.stringify(maint))};
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money=v=>`EGP ${Number(v||0).toFixed(2)}`;
  const vget=id=>vehicles.find(v=>v.id===id);
  const parts=()=>Array.isArray(window.stockData)?window.stockData.filter(p=>p&&!p.isHidden&&(p.itemType===PART||p.itemType==='residential-spare-part')):[];
  const pget=id=>Array.isArray(window.stockData)?window.stockData.find(p=>p.id===id):null;
  const nowInput=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)};
  const today=()=>new Date().toISOString().slice(0,10);

  function populateVehicles(){['vehicle-fuel-vehicle','vehicle-maint-vehicle'].forEach(id=>{const el=document.getElementById(id);if(!el)return;const old=el.value;el.innerHTML='<option value="">Select vehicle...</option>'+vehicles.map(v=>`<option value="${esc(v.id)}">${esc(v.make)} ${esc(v.model)} • ${esc(v.plate)}</option>`).join('');if(old&&vget(old))el.value=old})}
  function populatePartSelect(el){if(!el)return;const old=el.value;el.innerHTML='<option value="">Select spare part...</option>'+parts().map(p=>`<option value="${esc(p.id)}">${esc(p.name)} • ${Number(p.quantity||0)} ${esc(p.unit||'units')} @ ${money(p.price)}</option>`).join('');if(old&&pget(old))el.value=old}
  function refreshParts(){document.querySelectorAll('.vehicle-part-select').forEach(populatePartSelect);}

  window.addVehiclePartRow=function(){
    const box=document.getElementById('vehicle-maint-parts');if(!box)return;
    const row=document.createElement('div');row.className='vehicle-part-row';
    row.innerHTML='<div><label class="block text-[9px] font-bold text-slate-404 mb-1">Part</label><select class="vehicle-part-select w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-semibold"></select></div><div><label class="block text-[9px] font-bold text-slate-404 mb-1">Qty</label><input type="number" min="0.01" step="0.01" value="1" class="vehicle-part-qty w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-semibold"></div><button type="button" class="h-[34px] bg-slate-100 text-slate-600 rounded-xl font-black" onclick="this.closest(\'.vehicle-part-row\').remove();updateVehiclePartsTotal()">×</button>';
    box.appendChild(row);
    populatePartSelect(row.querySelector('select'));
    row.querySelector('select').addEventListener('change',window.updateVehiclePartsTotal);
    row.querySelector('input').addEventListener('input',window.updateVehiclePartsTotal);
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
    document.getElementById('vehicle-save-btn').textContent='Register Vehicle';
  };

  window.handleVehicleRegistration=function(e){
    e.preventDefault();
    const make=document.getElementById('vehicle-make').value.trim(),model=document.getElementById('vehicle-model').value.trim(),year=Number(document.getElementById('vehicle-year').value),plate=document.getElementById('vehicle-plate').value.trim(),odo=Number(document.getElementById('vehicle-odometer').value),edit=document.getElementById('vehicle-edit-id').value;
    if(!make||!model||!plate||!Number.isFinite(year)||!Number.isFinite(odo)||odo<0){if (typeof window.triggerToast === 'function') window.triggerToast('Complete the vehicle fields with valid values.','error');return}
    const key=plate.replace(/\s+/g,'').toUpperCase();
    if(vehicles.some(v=>v.id!==edit&&String(v.plate).replace(/\s+/g,'').toUpperCase()===key)){if (typeof window.triggerToast === 'function') window.triggerToast('Duplicate License Plate / ID.','error');return}
    if(edit){
      const v=vget(edit);
      if(odo<Number(v.odometer||0)){if (typeof window.triggerToast === 'function') window.triggerToast('Odometer cannot move backwards.','error');return}
      Object.assign(v,{make,model,year,plate,odometer:odo});
      if (typeof window.triggerToast === 'function') window.triggerToast('Vehicle updated.','success');
    }else{
      vehicles.push({id:'veh_'+Date.now()+Math.random().toString(36).slice(2,6),make,model,year,plate,odometer:odo,createdAt:new Date().toISOString()});
      if (typeof window.triggerToast === 'function') window.triggerToast('Vehicle registered.','success');
    }
    save();window.resetVehicleForm();window.renderVehicleManagement();
  };

  window.editVehicle=function(id){
    const v=vget(id);if(!v)return;
    ['make','model','year','plate','odometer'].forEach(k=>{const el=document.getElementById('vehicle-'+k);if(el)el.value=v[k]});
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

  window.handleVehicleMaintenance=function(e){
    e.preventDefault();
    const vehicleId=document.getElementById('vehicle-maint-vehicle').value,v=vget(vehicleId);
    const date=document.getElementById('vehicle-maint-date').value,od=Number(document.getElementById('vehicle-maint-odometer').value);
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
      used.push({partId:id,name:p.name,quantity:q,unit:p.unit||'units',unitCost:Number(p.price||0)});
      partsCost+=q*Number(p.price||0);
    }

    used.forEach(d=>{
      const p=pget(d.partId);
      p.quantity-=d.quantity;
      p.consumptionLogs=Array.isArray(p.consumptionLogs)?p.consumptionLogs:[];
      p.consumptionLogs.push({date,quantity:d.quantity,reason:`Vehicle maintenance — ${v.make} ${v.model} (${v.plate})`});
    });

    const total=labor+partsCost;
    maint.unshift({id:'mnt_'+Date.now(),vehicleId,date,odometer:od,description:desc,laborCost:labor,partsCost,totalCost:total,parts:used,accountId});
    v.odometer=Math.max(Number(v.odometer||0),od);
    localStorage.setItem('pro_stock',JSON.stringify(window.stockData));
    save();

    if(typeof window.logAutomaticExpense==='function'&&total>0) window.logAutomaticExpense(`Maintenance — ${v.make} ${v.model} (${v.plate}): ${desc}`,total,'Transportation');
    e.target.reset();
    document.getElementById('vehicle-maint-date').value=today();
    document.getElementById('vehicle-maint-parts').innerHTML='';
    window.addVehiclePartRow();
    window.renderVehicleManagement();
    if(typeof window.renderAllViews==='function') window.renderAllViews();
    if (typeof window.triggerToast === 'function') window.triggerToast(`Maintenance saved. ${money(partsCost)} parts consumed.`,'success');
  };

  window.deleteVehicleMaintenance=function(id){
    const m=maint.find(x=>x.id===id);if(!m)return;
    if(!confirm('Delete this maintenance record and restore spare parts?'))return;
    (m.parts||[]).forEach(d=>{
      const p=pget(d.partId);
      if(p)p.quantity=Number(p.quantity||0)+Number(d.quantity||0);
    });
    maint=maint.filter(x=>x.id!==id);
    localStorage.setItem('pro_stock',JSON.stringify(window.stockData));
    save();
    window.renderVehicleManagement();
    if(typeof window.renderAllViews==='function') window.renderAllViews();
    if (typeof window.triggerToast === 'function') window.triggerToast('Maintenance deleted and spare parts restored.','success');
  };

  window.renderVehicleManagement=function(){
    populateVehicles();
    refreshParts();

    const search=(document.getElementById('vehicle-search')?.value||'').toLowerCase();
    const vb=document.getElementById('vehicle-register-body');
    if(vb){
      const rows=vehicles.filter(v=>`${v.make} ${v.model} ${v.plate} ${v.year}`.toLowerCase().includes(search));
      vb.innerHTML=rows.length?rows.map(v=>`<tr class="vehicle-register-row"><td class="py-3 px-2"><div class="font-bold text-slate-900 dark:text-white">${esc(v.make)} ${esc(v.model)}</div><div class="text-[10px] text-slate-404">${esc(v.id)}</div></td><td class="py-3 px-2 font-semibold">${esc(v.plate)}</td><td class="py-3 px-2 font-bold">${Number(v.odometer||0).toFixed(1)} km</td><td class="py-3 px-2">${esc(v.year)}</td><td class="py-3 px-2 text-center"><button onclick="editVehicle('${esc(v.id)}')" class="text-[10px] text-blue-600 font-bold">Edit</button><span class="text-slate-300 mx-1">|</span><button onclick="deleteVehicle('${esc(v.id)}')" class="text-[10px] text-rose-600 font-bold">Delete</button></td></tr>`).join(''):'<tr><td colspan="5" class="py-8 text-center text-xs text-slate-404">No vehicles registered yet.</td></tr>';
    }

    const mb=document.getElementById('vehicle-maint-body');
    if(mb){
      mb.innerHTML=maint.slice(0,100).map(x=>{
        const v=vget(x.vehicleId),plist=(x.parts||[]).map(p=>`${esc(p.name)} × ${p.quantity}`).join(', ')||'None';
        return `<tr><td class="py-3 px-2">${esc(x.date)}</td><td class="py-3 px-2 font-bold">${v?esc(v.make+' '+v.model):'Unknown'}</td><td class="py-3 px-2"><div class="font-semibold">${esc(x.description)}</div><div class="text-[9px] text-slate-404 mt-1">Labor ${money(x.laborCost)} • ${plist}</div></td><td class="py-3 px-2">${Number(x.odometer).toFixed(1)} km</td><td class="py-3 px-2 text-right">${money(x.laborCost)}</td><td class="py-3 px-2 text-right">${money(x.partsCost)}</td><td class="py-3 px-2 text-right font-black">${money(x.totalCost)}</td><td class="py-3 px-2 text-center"><button onclick="deleteVehicleMaintenance('${esc(x.id)}')" class="text-[10px] text-rose-600 font-bold">Delete</button></td></tr>`;
      }).join('')||'<tr><td colspan="8" class="py-8 text-center text-xs text-slate-404">No maintenance records yet.</td></tr>';
    }

    const fc=document.getElementById('vehicle-kpi-count'),ff=document.getElementById('vehicle-kpi-fuel'),fml=document.getElementById('vehicle-kpi-maint-labor'),fmp=document.getElementById('vehicle-kpi-maint-parts'),fp=document.getElementById('vehicle-kpi-parts');
    if(fc)fc.textContent=vehicles.length;
    if(ff)ff.textContent=money(fuels.reduce((s,x)=>s+Number(x.cost||0),0));
    if(fml)fml.textContent=money(maint.reduce((s,x)=>s+Number(x.laborCost||0),0));
    if(fmp)fmp.textContent=money(maint.reduce((s,x)=>s+Number(x.partsCost||0),0));
    if(fp)fp.textContent=money(parts().reduce((s,p)=>s+Number(p.quantity||0)*Number(p.price||0),0));

    window.updateVehiclePartsTotal();
  };

  window.addEventListener('DOMContentLoaded',function(){
    load();
    const f=document.getElementById('vehicle-fuel-datetime'),m=document.getElementById('vehicle-maint-date');
    if(f&&!f.value)f.value=nowInput();
    if(m&&!m.value)m.value=today();
    if(!document.querySelector('#vehicle-maint-parts .vehicle-part-row'))window.addVehiclePartRow();
    window.renderVehicleManagement();
  });
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
