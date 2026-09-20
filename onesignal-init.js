/**
 * onesignal-init.js — Fæ City push notification wrapper
 * Load this BEFORE the OneSignal SDK so the deferred queue is ready.
 *
 * Exposes window.FaeOneSignal.optIn() for the custom prompt overlay.
 */
window.OneSignalDeferred = window.OneSignalDeferred || [];

window.FaeOneSignal = {
  _instance: null,

  optIn: function() {
    return new Promise(function(resolve, reject) {
      window.OneSignalDeferred.push(async function(OneSignal) {
        try {
          await OneSignal.User.PushSubscription.optIn();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
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
