/**
 * onesignal-init.js — Fæ City push notification wrapper
 * Load this BEFORE the OneSignal SDK so the deferred queue is ready.
 *
 * Exposes window.FaeOneSignal.optIn() for the custom prompt overlay.
 */
window.OneSignalDeferred = window.OneSignalDeferred || [];

window.FaeOneSignal = {
  _instance: null,

  // Called directly from onclick — must stay synchronous to preserve iOS gesture chain
  optIn: function() {
    if (window.FaeOneSignal._instance) {
      return window.FaeOneSignal._instance.User.PushSubscription.optIn()
        .catch(function(e) { console.warn('[Fæ push] optIn error:', e); });
    }
    // Fallback: standard Notification.requestPermission if SDK not ready
    if ('Notification' in window) {
      return Notification.requestPermission();
    }
  },
};

window.OneSignalDeferred.push(async function(OneSignal) {
  await OneSignal.init({
    appId: "48cbcf43-f520-403e-977f-6c4ca96c83dc",
    notifyButton: { enable: false },
    serviceWorkerParam: { scope: "/" },
  });
  window.FaeOneSignal._instance = OneSignal;
});
