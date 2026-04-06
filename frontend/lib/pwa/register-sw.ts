export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register('/sw.js');
}
