/**
 * FORECASTER PRO - ENTERPRISE PWA & WEBVIEW BRIDGE
 * Handles System Preferences, Service Worker registration, in-app PWA install flow,
 * offline connectivity status, and native iOS/Android WebView messaging.
 */
(function() {
  'use strict';

  // 1. System Preference Theme Detection
  const colorSchemeQuery = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (colorSchemeQuery) {
    colorSchemeQuery.addEventListener('change', function(e) {
      const savedTheme = localStorage.getItem('pro_theme');
      // If user hasn't explicitly set a preference, or selected system, follow OS
      if (!savedTheme) {
        if (e.matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        if (typeof window.syncChartDefaultsToTheme === 'function') {
          window.syncChartDefaultsToTheme();
        }
        if (typeof window.renderAllViews === 'function') {
          window.renderAllViews();
        }
      }
    });
  }

  // 2. Service Worker Registration
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js').then(function(reg) {
        console.log('[Forecaster PWA] Service Worker registered with scope:', reg.scope);
      }).catch(function(err) {
        console.warn('[Forecaster PWA] Service Worker registration failed:', err);
      });
    });
  }

  // 3. In-App PWA Install Flow
  let deferredPrompt = null;
  const isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone === true;

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    window.showPWAInstallButtons(true);
  });

  window.addEventListener('appinstalled', function() {
    deferredPrompt = null;
    window.showPWAInstallButtons(false);
    if (typeof window.triggerToast === 'function') {
      window.triggerToast('Forecaster Pro installed successfully!', 'success');
    }
  });

  window.showPWAInstallButtons = function(show) {
    const headerBtn = document.getElementById('header-pwa-install-btn');
    const drawerBtn = document.getElementById('drawer-pwa-install-btn');
    if (headerBtn) headerBtn.classList.toggle('hidden', !show);
    if (drawerBtn) drawerBtn.classList.toggle('hidden', !show);
  };

  window.triggerPWAInstall = async function() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        window.showPWAInstallButtons(false);
      }
      deferredPrompt = null;
    } else if (isIOS && !isStandalone) {
      window.openIOSInstallGuide();
    } else {
      if (typeof window.triggerToast === 'function') {
        window.triggerToast('App is already running in installed standalone mode or unsupported browser.', 'info');
      }
    }
  };

  window.openIOSInstallGuide = function() {
    const modal = document.getElementById('pwa-ios-guide-modal');
    if (modal) modal.classList.remove('hidden');
  };

  window.closeIOSInstallGuide = function() {
    const modal = document.getElementById('pwa-ios-guide-modal');
    if (modal) modal.classList.add('hidden');
  };

  // 4. Offline Connectivity Listener
  function updateOnlineStatus() {
    const banner = document.getElementById('pwa-offline-indicator');
    if (!banner) return;
    if (navigator.onLine) {
      banner.classList.add('hidden');
    } else {
      banner.classList.remove('hidden');
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  window.addEventListener('DOMContentLoaded', function() {
    updateOnlineStatus();
    if (isIOS && !isStandalone) {
      // Show iOS install option in menu
      window.showPWAInstallButtons(true);
    }
  });

  // 5. Native WebView Bridge
  window.ForecasterNativeBridge = {
    isWebView: function() {
      const ua = navigator.userAgent;
      return /(wv|WebView|iPhone.*Mobile.*Safari.*AppleWebKit(?!.*Version))/i.test(ua) ||
             !!(window.webkit && window.webkit.messageHandlers) ||
             !!window.AndroidBridge ||
             !!window.ReactNativeWebView;
    },
    postMessage: function(action, payload) {
      const msg = JSON.stringify({ action: action, payload: payload, timestamp: Date.now() });
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(msg);
      } else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.forecaster) {
        window.webkit.messageHandlers.forecaster.postMessage(msg);
      } else if (window.AndroidBridge && window.AndroidBridge.postMessage) {
        window.AndroidBridge.postMessage(msg);
      }
    },
    haptic: function(type = 'light') {
      this.postMessage('hapticFeedback', { type: type });
      if (navigator.vibrate) {
        navigator.vibrate(type === 'heavy' ? [30, 40, 30] : [15]);
      }
    }
  };
})();
