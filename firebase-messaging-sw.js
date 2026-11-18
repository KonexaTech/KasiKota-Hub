/* Retired Firebase messaging worker. No Firebase code is loaded. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.registration.unregister()));
