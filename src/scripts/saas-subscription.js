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
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
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

    returnToFreeTier: function() {
      const currentTier = this.getTier();
      if (currentTier === 'free') {
        if (typeof window.triggerToast === 'function') {
          window.triggerToast('You are already on the Free Tier.', 'info');
        }
        return;
      }
      localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, 'free');
      this.updateBadge();
      this.renderPlans();
      if (typeof window.triggerToast === 'function') {
        window.triggerToast('Returned to Free Tier (Starter Sandbox). All local records preserved.', 'info');
      }
      this.closeModal();
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

      // Update active plan banner
      const bannerEl = document.getElementById('sub-current-plan-banner');
      if (bannerEl) {
        const curInfo = TIERS[currentTier] || TIERS.free;
        if (currentTier === 'free') {
          bannerEl.innerHTML = `
            <div class="flex items-center gap-2">
              <span class="text-slate-500 dark:text-slate-400 font-semibold">Active Plan:</span>
              <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">${curInfo.name} (${curInfo.badge})</span>
            </div>
            <span class="text-slate-400 dark:text-slate-500 text-[11px] font-medium">Free forever &bull; No card required &bull; Full local storage</span>
          `;
        } else {
          bannerEl.innerHTML = `
            <div class="flex items-center gap-2">
              <span class="text-slate-500 dark:text-slate-400 font-semibold">Active Plan:</span>
              <span class="px-2.5 py-1 rounded-lg text-xs font-bold ${curInfo.badgeClass}">${curInfo.name} (${curInfo.badge})</span>
            </div>
            <button type="button" onclick="window.ForecasterSubscription.returnToFreeTier()" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition flex items-center gap-1.5 shadow-sm">
              <span>↩️</span> Return to Free Tier
            </button>
          `;
        }
      }

      // Update button labels
      const freeBtn = document.getElementById('sub-btn-free');
      const proBtn = document.getElementById('sub-btn-pro');
      const entBtn = document.getElementById('sub-btn-ent');

      if (freeBtn) {
        const isFree = currentTier === 'free';
        freeBtn.textContent = isFree ? 'Current Plan' : 'Return to Free Tier';
        freeBtn.disabled = isFree;
        freeBtn.className = isFree
          ? 'w-full py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-default'
          : 'w-full py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20 transition cursor-pointer';
      }

      if (proBtn) {
        const isPro = currentTier === 'pro';
        proBtn.textContent = isPro ? 'Current Plan' : 'Select Pro Plan';
        proBtn.disabled = isPro;
        proBtn.className = isPro
          ? 'w-full py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-default'
          : 'w-full py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition cursor-pointer';
      }

      if (entBtn) {
        const isEnt = currentTier === 'enterprise';
        entBtn.textContent = isEnt ? 'Current Plan' : 'Select Enterprise Plan';
        entBtn.disabled = isEnt;
        entBtn.className = isEnt
          ? 'w-full py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-default'
          : 'w-full py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-500/20 transition cursor-pointer';
      }
    },

    checkout: function(planId, billingCycle = 'monthly') {
      if (planId === 'free') {
        this.returnToFreeTier();
        return;
      }

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
        const isDropdownPill = b.id === 'dropdown-user-tier';
        b.className = isDropdownPill
          ? `saas-subscription-badge inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border cursor-pointer hover:opacity-90 transition ${tier.badgeClass}`
          : `saas-subscription-badge inline-flex items-center px-2.5 py-1 rounded-xl text-[11px] font-bold border cursor-pointer transition ${tier.badgeClass}`;
        b.textContent = tier.badge;
      });

      // Quick-action return buttons in dropdown and mobile drawer
      const menuReturnBtn = document.getElementById('menu-return-free-btn');
      if (menuReturnBtn) {
        if (tierId !== 'free') {
          menuReturnBtn.classList.remove('hidden');
        } else {
          menuReturnBtn.classList.add('hidden');
        }
      }

      const drawerReturnBtn = document.getElementById('drawer-return-free-btn');
      if (drawerReturnBtn) {
        if (tierId !== 'free') {
          drawerReturnBtn.classList.remove('hidden');
        } else {
          drawerReturnBtn.classList.add('hidden');
        }
      }
    }
  };

  window.addEventListener('DOMContentLoaded', function() {
    window.ForecasterSubscription.updateBadge();
  });
})();
