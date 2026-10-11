/* Forecaster Pro standalone navigation controller.
   Kept separate from app-core.js so navigation still works if another
   legacy module throws during initialization. */
(function () {
  'use strict';

  const desktopDefault = 'nav-link flex items-center gap-2 text-slate-707 dark:text-slate-300 font-semibold hover:text-blue-600 px-3.5 py-2 rounded-lg transition-all flex-shrink-0';
  const desktopActive = 'nav-link is-active flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition-all flex-shrink-0';
  const mobileDefault = 'mobile-nav-item flex flex-col items-center gap-1 text-slate-500 dark:text-slate-404 text-[10px] font-bold p-1 transition';
  const mobileActive = 'mobile-nav-item is-active flex flex-col items-center gap-1 text-[10px] font-bold p-1 transition';

  function getRequestedView(control) {
    if (control.dataset && control.dataset.targetView) return control.dataset.targetView;
    const inlineHandler = control.getAttribute('onclick') || '';
    const match = inlineHandler.match(/switchView\s*\(\s*['"]([^'"]+)['"]/);
    return match ? match[1] : null;
  }

  function activateView(requestedView, control) {
    const stockModule = requestedView === 'pharmacy' ? 'pharmacy'
      : requestedView === 'inventory' ? 'inventory' : null;
    const viewId = stockModule ? 'stock' : requestedView;
    const target = document.getElementById('view-' + viewId);

    if (!target) {
      console.error('[Forecaster Pro navigation] Missing view container:', 'view-' + viewId);
      return;
    }

    document.querySelectorAll('.view-section').forEach(function (section) {
      section.classList.remove('active');
      section.setAttribute('aria-hidden', 'true');
    });
    target.classList.add('active');
    target.setAttribute('aria-hidden', 'false');

    document.querySelectorAll('#desktop-navigation .nav-link').forEach(function (link) {
      link.className = desktopDefault;
      link.removeAttribute('aria-current');
    });
    document.querySelectorAll('#mobile-bottom-nav .mobile-nav-item').forEach(function (button) {
      button.className = mobileDefault;
      button.removeAttribute('aria-current');
    });

    if (control && control.matches('#desktop-navigation .nav-link')) {
      control.className = desktopActive;
      control.setAttribute('aria-current', 'page');
    } else {
      const desktopLink = Array.from(document.querySelectorAll('#desktop-navigation .nav-link')).find(function (link) {
        return (link.getAttribute('onclick') || '').includes("'" + requestedView + "'");
      });
      if (desktopLink) {
        desktopLink.className = desktopActive;
        desktopLink.setAttribute('aria-current', 'page');
      }
    }

    const mobileButton = document.querySelector('#mobile-bottom-nav .mobile-nav-item[data-target-view="' + viewId + '"]');
    if (mobileButton) {
      mobileButton.className = mobileActive;
      mobileButton.setAttribute('aria-current', 'page');
    }

    if (stockModule && typeof window.setStockPharmacyModule === 'function') {
      try { window.setStockPharmacyModule(stockModule); }
      catch (error) { console.error('[Forecaster Pro navigation] Stock module switch failed:', error); }
    } else if (viewId === 'stock' && control && control.matches('#desktop-navigation .nav-link')) {
      if (typeof window.setStockPharmacyModule === 'function') {
        try { window.setStockPharmacyModule('inventory'); } catch (error) { console.error(error); }
      }
    }

    if (typeof window.renderAllViews === 'function') {
      try { window.renderAllViews(); }
      catch (error) { console.error('[Forecaster Pro navigation] View rendering failed:', error); }
    }

    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
    } catch (_) {}

    window.dispatchEvent(new CustomEvent('forecaster:viewchange', { detail: { viewId: viewId } }));
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  // Capture phase deliberately intercepts links before inline onclick handlers.
  document.addEventListener('click', function (event) {
    const control = event.target.closest('#desktop-navigation .nav-link, #mobile-bottom-nav .mobile-nav-item');
    if (!control) return;
    const requestedView = getRequestedView(control);
    if (!requestedView) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    activateView(requestedView, control);
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    const initial = document.querySelector('.view-section.active') || document.getElementById('view-dashboard');
    if (initial) initial.setAttribute('aria-hidden', 'false');
  });
})();
