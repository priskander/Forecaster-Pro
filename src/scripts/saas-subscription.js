/**
 * FORECASTER PRO - SAAS SUBSCRIPTION & BILLING INTEGRATION HOOK POINT
 * Provides subscription tier management, pricing modals, and checkout triggers
 * compatible with Stripe, LemonSqueezy, Paddle, and iOS StoreKit / Google Play Billing webviews.
 */
(function() {
  'use strict';

  const SUBSCRIPTION_STORAGE_KEY = 'forecaster_subscription_tier_v1';

  const TIERS = {
    free: {
      id: 'free',
      name: 'Starter Sandbox',
      priceMonthly: 0,
      priceAnnual: 0,
      badge: 'Free Tier',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200'
    },
    pro: {
      id: 'pro',
      name: 'Pro Household',
      priceMonthly: 9.99,
      priceAnnual: 89.00,
      badge: 'Pro Member',
      badgeClass: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/20'
    },
    enterprise: {
      id: 'enterprise',
      name: 'Fleet & Landlord Enterprise',
      priceMonthly: 24.99,
      priceAnnual: 229.00,
      badge: 'Enterprise VIP',
      badgeClass: 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm shadow-purple-500/20'
    }
  };

  window.ForecasterSubscription = {
    getTier: function() {
      const saved = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY) || 'free';
      return TIERS[saved] ? saved : 'free';
    },

    setTier: function(tierId) {
      if (TIERS[tierId]) {
        localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, tierId);
        this.updateBadge();
        if (typeof window.triggerToast === 'function') {
          window.triggerToast(`Subscription updated to ${TIERS[tierId].name}!`, 'success');
        }
      }
    },

    openModal: function() {
      const modal = document.getElementById('saas-subscription-modal');
      if (modal) {
        modal.classList.remove('hidden');
        this.renderPlans('monthly');
      }
    },

    closeModal: function() {
      const modal = document.getElementById('saas-subscription-modal');
      if (modal) modal.classList.add('hidden');
    },

    renderPlans: function(billingCycle = 'monthly') {
      const currentTier = this.getTier();
      const isAnnual = billingCycle === 'annual';

      const proPrice = isAnnual ? '$89.00 / year' : '$9.99 / month';
      const entPrice = isAnnual ? '$229.00 / year' : '$24.99 / month';

      const proPriceEl = document.getElementById('sub-price-pro');
      const entPriceEl = document.getElementById('sub-price-ent');
      if (proPriceEl) proPriceEl.textContent = proPrice;
      if (entPriceEl) entPriceEl.textContent = entPrice;

      // Update button labels
      const proBtn = document.getElementById('sub-btn-pro');
      const entBtn = document.getElementById('sub-btn-ent');

      if (proBtn) {
        proBtn.textContent = currentTier === 'pro' ? 'Current Plan' : 'Select Pro Plan';
        proBtn.disabled = currentTier === 'pro';
        proBtn.className = currentTier === 'pro'
          ? 'w-full py-2.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 cursor-default'
          : 'w-full py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition';
      }

      if (entBtn) {
        entBtn.textContent = currentTier === 'enterprise' ? 'Current Plan' : 'Select Enterprise Plan';
        entBtn.disabled = currentTier === 'enterprise';
        entBtn.className = currentTier === 'enterprise'
          ? 'w-full py-2.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 cursor-default'
          : 'w-full py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-500/20 transition';
      }
    },

    checkout: function(planId, billingCycle = 'monthly') {
      // 1. Check if running inside App Store or Google Play WebView
      if (window.ForecasterNativeBridge && window.ForecasterNativeBridge.isWebView()) {
        window.ForecasterNativeBridge.postMessage('initiateInAppPurchase', {
          productId: `com.forecasterpro.sub.${planId}.${billingCycle}`,
          planId: planId,
          billingCycle: billingCycle
        });
        if (typeof window.triggerToast === 'function') {
          window.triggerToast('Connecting to App Store / Google Play In-App Billing...', 'info');
        }
        return;
      }

      // 2. Web Stripe / Paddle checkout hook placeholder
      console.log(`[Forecaster Subscription] Hook triggered: Checkout for ${planId} (${billingCycle})`);
      
      // Sandbox implementation: activate tier and confirm
      this.setTier(planId);
      this.closeModal();
    },

    openBillingPortal: function() {
      if (typeof window.triggerToast === 'function') {
        window.triggerToast('Connecting to Customer Billing Portal...', 'info');
      }
    },

    updateBadge: function() {
      const tierId = this.getTier();
      const tier = TIERS[tierId] || TIERS.free;

      const headerBadges = document.querySelectorAll('.saas-subscription-badge');
      headerBadges.forEach(b => {
        b.className = `saas-subscription-badge px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition ${tier.badgeClass}`;
        b.textContent = tier.badge;
      });
    }
  };

  window.addEventListener('DOMContentLoaded', function() {
    window.ForecasterSubscription.updateBadge();
  });
})();
