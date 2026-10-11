// Chrome'un "Uygulamayı yükle" önerisi için gereken en küçük servis çalışanı.
// Hiçbir şeyi önbelleğe almaz; tüm istekler doğrudan ağa gider (canlı veri bozulmaz).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
