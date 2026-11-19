// Supabase bağlantı durumu + gönderilemeyen kayıtların kuyruğu.
// Supabase istemcisine özel bir fetch olarak takılır (services/supabase.js): Supabase'e giden her KAYIT isteği
// (ekleme, güncelleme, silme, masa işlemleri) gidemezse kuyruğa yazılır ve uygulamaya "kaydedildi" denir;
// Supabase gelince sırasıyla aktarılır. Okuma (GET) istekleri kuyruğa girmez; onlar yerel kopyadan karşılanır.
import { basarisizaEkle, kuyrugaEkle, kuyrukGuncelle, kuyrukIlk, kuyrukSayisi, kuyrukSil } from './yerelDepo';

const durum = { sunucuYok: false, bekleyen: 0, aktariliyor: false };
const aboneler = new Set();
const aktarimSonrasi = new Set();
function yay() {
  const kopya = { ...durum };
  aboneler.forEach((fn) => { try { fn(kopya); } catch { /* yok say */ } });
}
export function baglantiAbone(fn) {
  aboneler.add(fn);
  fn({ ...durum });
  return () => aboneler.delete(fn);
}
// Kuyruk boşalınca (Supabase geri geldi, kayıtlar aktarıldı) çağrılır — taze veriyi çekmek için.
export function aktarimBitinceAbone(fn) {
  aktarimSonrasi.add(fn);
  return () => aktarimSonrasi.delete(fn);
}
export const baglantiDurumu = () => ({ ...durum });

function sunucuYokIsaretle() {
  if (!durum.sunucuYok) { durum.sunucuYok = true; yay(); }
}
function sunucuVarIsaretle() {
  if (durum.sunucuYok) { durum.sunucuYok = false; yay(); }
}
async function bekleyenGuncelle() {
  const n = await kuyrukSayisi();
  if (n !== durum.bekleyen) { durum.bekleyen = n; yay(); }
  return n;
}
export const bekleyenSayisi = bekleyenGuncelle;

// 5xx: Supabase/ağ geçidi tarafı hatası (bugünkü 555 dahil) — geçici kabul edilir.
const gecici = (st) => st >= 500 || st === 0 || st === 408 || st === 429;

const KUYRUK_ISARETI = 'No Content (yerel kuyruk)';
function sahteBasari() {
  return new Response(null, { status: 204, statusText: KUYRUK_ISARETI });
}
// Supabase sonucunun gerçekte gitmeyip yerel kuyruğa alındığını söyler.
export const kuyrugaAlindi = (sonuc) => sonuc?.statusText === KUYRUK_ISARETI;

function istekCoz(input, init) {
  const istekNesnesi = typeof Request !== 'undefined' && input instanceof Request;
  const url = istekNesnesi ? input.url : String(input instanceof URL ? input.href : input);
  const method = String(init?.method || (istekNesnesi && input.method) || 'GET').toUpperCase();
  const basliklar = {};
  new Headers(init?.headers || (istekNesnesi ? input.headers : undefined)).forEach((v, k) => { basliklar[k] = v; });
  return { url, method, basliklar, body: typeof init?.body === 'string' ? init.body : init?.body == null ? null : undefined };
}

export function supabaseFetchOlustur(supabaseUrl) {
  const rest = `${String(supabaseUrl).replace(/\/$/, '')}/rest/v1/`;
  const ag = (...a) => fetch(...a);

  return async function hipposFetch(input, init) {
    const ist = istekCoz(input, init);
    const restIstegi = ist.url.startsWith(rest);
    const okuma = ist.method === 'GET' || ist.method === 'HEAD';
    // Dönen satırı bekleyen (insert().select()) ya da gövdesi metin olmayan istekler kuyruğa alınamaz — eskisi gibi davranır.
    const kuyruklanabilir = restIstegi && !okuma && ist.body !== undefined && !(ist.basliklar.prefer || '').includes('return=representation');

    if (!kuyruklanabilir) {
      try {
        const r = await ag(input, init);
        if (restIstegi) {
          if (gecici(r.status)) sunucuYokIsaretle();
          else sunucuVarIsaretle();
        }
        return r;
      } catch (e) {
        if (restIstegi) sunucuYokIsaretle();
        throw e;
      }
    }

    const kayit = { url: ist.url, method: ist.method, basliklar: ist.basliklar, body: ist.body, deneme: 0, eklenme: Date.now() };
    // Sıra bozulmasın: kuyrukta bekleyen varsa yeni kayıt da doğrudan arkasına girer.
    if ((await bekleyenGuncelle()) > 0) {
      await kuyrugaEkle(kayit);
      await bekleyenGuncelle();
      aktarimiTetikle(300);
      return sahteBasari();
    }
    try {
      const r = await ag(input, init);
      if (!gecici(r.status)) {
        sunucuVarIsaretle();
        return r;
      }
    } catch {
      /* ağ hatası — aşağıda kuyruğa alınır */
    }
    sunucuYokIsaretle();
    await kuyrugaEkle(kayit);
    await bekleyenGuncelle();
    aktarimiTetikle(4000);
    return sahteBasari();
  };
}

// ---- Aktarım (kuyruğu Supabase'e boşaltma) ----
let zamanlayici = null;
let calisiyor = false;
export function aktarimiTetikle(gecikme = 0) {
  if (zamanlayici) clearTimeout(zamanlayici);
  zamanlayici = setTimeout(() => { zamanlayici = null; kuyruguAktar(); }, gecikme);
}

async function kilitle(fn) {
  // Aynı bilgisayarda iki Hippos sekmesi açıksa kuyruğu aynı anda iki kez göndermesin.
  if (typeof navigator !== 'undefined' && navigator.locks?.request) return navigator.locks.request('hippos-kuyruk', fn);
  return fn();
}

// true: kuyruk tamamen boşaldı. false: Supabase hâlâ yok, sonra tekrar denenecek.
export async function kuyruguAktar() {
  if (calisiyor) return false;
  calisiyor = true;
  durum.aktariliyor = true;
  yay();
  let bosaldi = false;
  try {
    bosaldi = await kilitle(async () => {
      for (;;) {
        const k = await kuyrukIlk();
        if (!k) return true;
        let st = 0;
        try {
          const r = await fetch(k.url, { method: k.method, headers: k.basliklar, body: k.body });
          st = r.status;
        } catch {
          st = 0;
        }
        if (st >= 200 && st < 300) {
          await kuyrukSil(k.sira);
        } else if (st === 409) {
          // Kayıt zaten yazılmış (istek aslında gitmiş, cevabı gelmemişti) — çift kayıt olmasın.
          await kuyrukSil(k.sira);
        } else if (st === 500 && k.deneme >= 9) {
          // Sunucu ayakta ama bu kayıt sürekli reddediliyor — kuyruğu kilitlemesin, ayrı listeye al.
          console.error('Kayıt aktarılamadı, ayrıldı:', k.method, k.url);
          await basarisizaEkle({ ...k, sonDurum: st });
          await kuyrukSil(k.sira);
        } else if (gecici(st)) {
          await kuyrukGuncelle({ ...k, deneme: (k.deneme || 0) + 1 });
          sunucuYokIsaretle();
          return false;
        } else {
          console.error('Kayıt Supabase tarafından reddedildi, ayrıldı:', st, k.method, k.url);
          await basarisizaEkle({ ...k, sonDurum: st });
          await kuyrukSil(k.sira);
        }
        sunucuVarIsaretle();
        await bekleyenGuncelle();
      }
    });
  } catch (e) {
    console.error('kuyruk aktarımı:', e?.message);
    bosaldi = false;
  }
  calisiyor = false;
  durum.aktariliyor = false;
  await bekleyenGuncelle();
  yay();
  if (bosaldi) {
    sunucuVarIsaretle();
    aktarimSonrasi.forEach((fn) => { try { fn(); } catch { /* yok say */ } });
  } else if (durum.bekleyen > 0) {
    aktarimiTetikle(8000);
  }
  return bosaldi;
}

// Açılışta kuyrukta kayıt kaldıysa (önceki oturumdan) aktarmayı dene; internet geri gelince de dene.
if (typeof window !== 'undefined') {
  setTimeout(() => { bekleyenGuncelle().then((n) => { if (n > 0) aktarimiTetikle(0); }); }, 1500);
  window.addEventListener('online', () => aktarimiTetikle(500));
}
