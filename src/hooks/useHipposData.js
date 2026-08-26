import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../services/supabase';


export const QUICK_SALE = '⚡ Hızlı Satış';

// Ekmek Stok Ekleme özelliği için — 4 sabit ekmek türü + her biri için "bu adedin altına
// düşünce uyar" eşiği ve hazır sipariş metni. Hem Yönetim Paneli'ndeki stok modalında hem
// Masalar'daki Mutfağa Not > Ekmek Gönderme panelinde (stoktan düşme için) kullanılıyor.
export const EKMEK_TURLERI_STOK = [
  {
    key: 'buyukBeyaz',
    label: 'Büyük Beyaz Ekmek',
    esik: 120,
    uyariMesaji: 'Stok 120\'nin altına düştü, 2 koli sipariş edelim.',
    siparisMetni: '2 Koli 1027053 Don.Baget Fransız YP 1/2 (40*160 Gr) Ulker Marifet',
  },
  {
    key: 'kucukBeyaz',
    label: 'Küçük Beyaz Ekmek',
    esik: 100,
    uyariMesaji: 'Stok 100\'ün altına düştü, 2 koli sipariş edelim.',
    siparisMetni: '2 Koli 4400064 1/3 Baget Sade 95 Gr. 50/36',
  },
  {
    key: 'domatesli',
    label: 'Domatesli/Fesleğenli Ekmek',
    esik: 50,
    uyariMesaji: 'Stok 50\'nin altına düştü, 1 koli sipariş edelim.',
    siparisMetni: '1 Koli 4400191 1/2 Artısan Baget Domates&Fesleğen',
  },
  {
    key: 'kucukKepek',
    label: 'Küçük Kepek Ekmeği',
    esik: 75,
    uyariMesaji: 'Stok 75\'in altına düştü, 1 koli sipariş edelim.',
    siparisMetni: '1 Koli 1033506 1/3 Küçük Tahıl Ekmek (70 Ad)',
  },
];
export const SALON_TABLES = ['Masa 1', 'Masa 2', 'Masa 3', 'Masa 4', 'Masa 5', 'Masa 6', 'Masa 7', 'Masa 8', 'Masa 9', 'Masa 10', 'Masa 11'];
export const ALT_TABLES = ['Alt Masa 1', 'Alt Masa 2', 'Alt Masa 3', 'Alt Masa 4', 'Alt Masa 5', 'Alt Masa 6'];
// Fiziksel olarak birleşik duran masalar (görsel gruplama için) — birleştirme yine serbest.
export const TABLE_PAIRS = [['Masa 3', 'Masa 4'], ['Masa 10', 'Masa 11']];
const FIXED_TABLES = [QUICK_SALE, ...SALON_TABLES, ...ALT_TABLES];

export const TL = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺';

function loadLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function emptyTableMap(tables, fill) {
  const o = {};
  tables.forEach((t) => (o[t] = typeof fill === 'function' ? fill() : fill));
  return o;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ---- Masa rengi: geçen süreye göre kademe (30 dk aralıklarla) ----
export function getElapsedMinutes(openedAt) {
  if (!openedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - openedAt) / 60000));
}
export function getColorTier(openedAt) {
  if (!openedAt) return -1; // boş masa
  const mins = getElapsedMinutes(openedAt);
  if (mins < 30) return 0; // yeşil
  if (mins < 60) return 1; // turuncu
  return 2; // kırmızı
}

// ---- Supabase satırı <-> uygulama nesnesi dönüşümleri ----
function rowToProduct(r) {
  return {
    id: r.id,
    kategori: r.kategori,
    altKategori: r.alt_kategori || '',
    ad: r.ad,
    fiyat: Number(r.fiyat),
    durum: r.durum,
    menuSirasi: r.menu_sirasi,
    sabit: r.sabit,
    azPorsiyon: r.az_porsiyon,
    azFiyat: r.az_fiyat === null || r.az_fiyat === undefined ? null : Number(r.az_fiyat),
    parentId: r.parent_id,
    isAzVariant: r.is_az_variant,
    gununMenusuKategori: r.gunun_menusu_kategori || null,
    gununMenusuSira: r.gunun_menusu_sira === null || r.gunun_menusu_sira === undefined ? null : Number(r.gunun_menusu_sira),
    bicakGerekli: !!r.bicak_gerekli,
    ekmekGerekli: !!r.ekmek_gerekli,
    satisAdi: r.satis_adi || null,
    butonRengi: r.buton_rengi || null,
    butonYaziRengi: r.buton_yazi_rengi || null,
    italik: r.italik === null || r.italik === undefined ? null : !!r.italik,
    ikon: r.ikon || null,
  };
}
function rowToCategory(r) {
  return {
    name: r.name,
    menuSirasi: r.menu_sirasi,
    sabit: r.sabit,
    butonRengi: r.buton_rengi || null,
    butonYaziRengi: r.buton_yazi_rengi || null,
    italik: r.italik === null || r.italik === undefined ? null : !!r.italik,
    ikon: r.ikon || null,
    ikonBoyutu: r.ikon_boyutu || null,
  };
}
function rowToSubcategory(r) {
  return { kategori: r.kategori, name: r.name, menuSirasi: r.menu_sirasi };
}

function rowToSale(r) {
  return { id: r.id, ts: Number(r.ts), table: r.table_name, amount: Number(r.amount), method: r.method, itemsCount: r.items_count, date: r.date_display };
}
function rowToSoldItem(r) {
  return { id: r.id, ts: Number(r.ts), ad: r.ad, fiyat: Number(r.fiyat), kategori: r.kategori || '', altKategori: r.alt_kategori || '', table: r.table_name };
}
function rowToAction(r) {
  return { id: r.id, description: r.description, time: r.time_display, snapshot: r.snapshot };
}
function rowToCari(r) {
  return {
    id: r.id,
    tip: r.tip,
    ad: r.ad,
    telefon: r.telefon || '',
    adres: r.adres || '',
    not: r.kisa_not || '',
    aciklama: r.aciklama || '',
    iskonto: r.iskonto || 0,
    olusturmaTs: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
  };
}
function rowToHareket(r) {
  return { id: r.id, cariId: r.cari_id, ts: Number(r.ts), urunler: r.urunler || [], toplam: Number(r.toplam), mutfakNotu: r.mutfak_notu || '' };
}
function rowToOdeme(r) {
  return { id: r.id, cariId: r.cari_id, ts: Number(r.ts), tutar: Number(r.tutar), tur: r.tur };
}
function rowToFatura(r) {
  return {
    id: r.id,
    cariId: r.cari_id,
    tarih: r.tarih,
    faturaNo: r.fatura_no,
    tutar: Number(r.tutar),
    eklenmeTs: Number(r.eklenme_ts),
    donemBaslangic: r.donem_baslangic || null,
    donemBitis: r.donem_bitis || null,
    tahsilatTutar: Number(r.tahsilat_tutar || 0),
    odemeLog: Array.isArray(r.odeme_log) ? r.odeme_log : [],
  };
}
function rowToGecmis(r) {
  return { id: r.id, cariId: r.cari_id, ts: Number(r.ts), toplamTutar: Number(r.toplam_tutar), aciklama: r.aciklama };
}

function rowToPaketTeslimat(r) {
  return {
    id: r.id, paketAdi: r.paket_adi, tip: r.tip,
    tutar: r.tutar === null || r.tutar === undefined ? null : Number(r.tutar),
    odemeYontemi: r.odeme_yontemi, notMetni: r.not_metni, fotoUrl: r.foto_url,
    paketciAdi: r.paketci_adi, durum: r.durum, onayNotu: r.onay_notu,
    ts: Number(r.ts), onayTs: r.onay_ts ? Number(r.onay_ts) : null,
  };
}
function rowToCariTeslimatBildirim(r) {
  return {
    id: r.id, cariId: r.cari_id, tip: r.tip, tutar: Number(r.tutar),
    odemeYontemi: r.odeme_yontemi, notMetni: r.not_metni, fotoUrl: r.foto_url,
    paketciAdi: r.paketci_adi, durum: r.durum, onayNotu: r.onay_notu,
    ts: Number(r.ts), onayTs: r.onay_ts ? Number(r.onay_ts) : null,
  };
}
function rowToBosvar(r) {
  return {
    id: r.id, paketAdi: r.paket_adi, paketciAdi: r.paketci_adi,
    durum: r.durum, onayNotu: r.onay_notu,
    ts: Number(r.ts), onayTs: r.onay_ts ? Number(r.onay_ts) : null,
  };
}

// Tüm sayfaların (DirectSale, Tables, Reports...) paylaştığı tek veri kaynağı.
// App.jsx içinde BİR KEZ çağrılır, sonuçlar prop olarak sayfalara aktarılır.
//
// VERİ MİMARİSİ:
//  - Ürün / kategori / alt kategori / favoriler: nadiren değişir, Google Sheets ile
//    senkronize olur, tarayıcıda (localStorage) tutulur — bu kısım değişmedi.
//  - Masalar / paketler / siparişler / satış geçmişi / cari: saniyeler içinde değişir,
//    birden fazla cihaz aynı anda kullanacağı için Supabase'de tutulur ve gerçek
//    zamanlı (realtime) abonelikle her cihaza anında yansır.
export default function useHipposData(scope = 'full') {
  // ================== ÜRÜN / KATEGORİ / ALT KATEGORİ (Supabase — tüm cihazlarda ortak) ==================
  // Bunlar artık "ortak işletme verisi" — Supabase tek kaynak, gerçek zamanlı paylaşılıyor.
  // Google Sheets sadece arşiv/toplu düzenleme amaçlı — buradan asla CANLI okuma yapılmıyor.
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  // Favoriler kişisel bir tercih olduğu için tarayıcıda (localStorage) kalmaya devam ediyor.
  const [favorites, setFavorites] = useState(() => loadLS('hippos_favorites', [104, 101, 105]));
  useEffect(() => localStorage.setItem('hippos_favorites', JSON.stringify(favorites)), [favorites]);

  function toggleFavorite(id) {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  }

  // Bir ürünü aç/kapa — "Az X" varyantı varsa onu da aynı duruma çeker (bağımsız açık olamaz).
  function toggleProductStatus(id) {
    setProducts((prev) => {
      const target = prev.find((p) => p.id === id);
      if (!target) return prev;
      const nextDurum = target.durum === 'PASIF' ? 'AKTIF' : 'PASIF';
      const variant = prev.find((p) => p.parentId === id);
      const idsToUpdate = variant ? [id, variant.id] : [id];
      supabase.from('products').update({ durum: nextDurum }).in('id', idsToUpdate).then(({ error }) => {
        if (error) console.error('ürün durumu güncellenemedi:', error.message);
      });
      broadcastMenuChanged();
      return prev.map((p) => (idsToUpdate.includes(p.id) ? { ...p, durum: nextDurum } : p));
    });
  }

  // Kategori bazlı toplu aç/kapa — "Sabit Ürün" işaretli ürünler pasife alınırken atlanır.
  function bulkSetCategoryStatus(kategori, durum) {
    setProducts((prev) => {
      const affectedIds = [];
      const next = prev.map((p) => {
        if (p.kategori !== kategori) return p;
        if (durum === 'PASIF' && p.sabit) return p;
        if (p.isAzVariant) {
          const parent = prev.find((q) => q.id === p.parentId);
          if (parent && parent.sabit && durum === 'PASIF') return p;
        }
        affectedIds.push(p.id);
        return { ...p, durum };
      });
      if (affectedIds.length > 0) {
        supabase.from('products').update({ durum }).in('id', affectedIds).then(({ error }) => {
          if (error) console.error('toplu durum güncellenemedi:', error.message);
        });
        broadcastMenuChanged();
      }
      return next;
    });
  }

  // ---- Mutfak Paneli: günlük "bugün hangi yemekler/zeytinyağlılar açık" bildirimi ----
  // Sadece Yemekler + Zeytinyağlılar kategorilerindeki DEĞİŞKEN (sabit olmayan) ürünleri
  // etkiler. Seçilenler AKTİF, o kategorilerdeki seçilmeyen diğer her şey PASİF olur.
  // Sabit ürünlere ASLA dokunulmaz.
  function applyMutfakMenusu(selectedIds, relevantProductIds) {
    const selectedSet = new Set(selectedIds);
    const toActivate = [];
    const toDeactivate = [];
    setProducts((prev) => {
      const next = prev.map((p) => {
        if (!relevantProductIds.includes(p.id) || p.sabit) return p;
        const shouldBeActive = selectedSet.has(p.id);
        const nextDurum = shouldBeActive ? 'AKTIF' : 'PASIF';
        if (nextDurum === p.durum) return p;
        if (shouldBeActive) toActivate.push(p.id);
        else toDeactivate.push(p.id);
        return { ...p, durum: nextDurum };
      });
      return next;
    });
    if (toActivate.length > 0) {
      supabase.from('products').update({ durum: 'AKTIF' }).in('id', toActivate).then(({ error }) => {
        if (error) console.error('mutfak menüsü (aktif) güncellenemedi:', error.message);
      });
    }
    if (toDeactivate.length > 0) {
      supabase.from('products').update({ durum: 'PASIF' }).in('id', toDeactivate).then(({ error }) => {
        if (error) console.error('mutfak menüsü (pasif) güncellenemedi:', error.message);
      });
    }
    if (toActivate.length > 0 || toDeactivate.length > 0) broadcastMenuChanged();
  }

  function addCategory(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategories((prev) => {
      if (prev.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return prev;
      const maxOrder = prev.reduce((m, c) => Math.max(m, c.menuSirasi), 0);
      const menuSirasi = Math.min(100, maxOrder + 10) || 10;
      supabase.from('categories').insert({ name: trimmed, menu_sirasi: menuSirasi, sabit: false }).then(({ error }) => {
        if (error) console.error('kategori eklenemedi:', error.message);
      });
      broadcastMenuChanged();
      return [...prev, { name: trimmed, menuSirasi, sabit: false }];
    });
  }

  function updateCategoryMeta(name, patch) {
    setCategories((prev) => prev.map((c) => (c.name === name ? { ...c, ...patch } : c)));
    const dbPatch = {};
    if (patch.menuSirasi !== undefined) dbPatch.menu_sirasi = patch.menuSirasi;
    if (patch.sabit !== undefined) dbPatch.sabit = patch.sabit;
    if (patch.butonRengi !== undefined) dbPatch.buton_rengi = patch.butonRengi;
    if (patch.butonYaziRengi !== undefined) dbPatch.buton_yazi_rengi = patch.butonYaziRengi;
    if (patch.italik !== undefined) dbPatch.italik = patch.italik;
    if (patch.ikon !== undefined) dbPatch.ikon = patch.ikon;
    if (patch.ikonBoyutu !== undefined) dbPatch.ikon_boyutu = patch.ikonBoyutu;
    if (Object.keys(dbPatch).length === 0) return;
    supabase.from('categories').update(dbPatch).eq('name', name).then(({ error }) => {
      if (error) console.error('kategori güncellenemedi:', error.message);
    });
    broadcastMenuChanged();
  }

  // "Sheet'ten Çek" gibi birçok kategoriyi aynı anda etkileyen işlemler için — tek istek.
  function bulkUpdateCategories(patches) {
    if (!patches || patches.length === 0) return;
    setCategories((prev) => {
      const map = new Map(patches.map((p) => [p.name, p.patch]));
      return prev.map((c) => (map.has(c.name) ? { ...c, ...map.get(c.name) } : c));
    });
    const rows = patches.map(({ name, patch }) => {
      const row = { name };
      if (patch.menuSirasi !== undefined) row.menu_sirasi = patch.menuSirasi;
      if (patch.sabit !== undefined) row.sabit = patch.sabit;
      return row;
    });
    supabase.from('categories').upsert(rows, { onConflict: 'name' }).then(({ error }) => {
      if (error) console.error('toplu kategori güncellenemedi:', error.message);
    });
    broadcastMenuChanged();
  }

  function addSubcategory(kategori, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubcategories((prev) => {
      if (prev.some((s) => s.kategori === kategori && s.name.toLowerCase() === trimmed.toLowerCase())) return prev;
      const siblings = prev.filter((s) => s.kategori === kategori);
      const maxOrder = siblings.reduce((m, s) => Math.max(m, s.menuSirasi), 0);
      const menuSirasi = Math.min(100, maxOrder + 10) || 10;
      supabase.from('subcategories').insert({ kategori, name: trimmed, menu_sirasi: menuSirasi }).then(({ error }) => {
        if (error) console.error('alt kategori eklenemedi:', error.message);
      });
      broadcastMenuChanged();
      return [...prev, { kategori, name: trimmed, menuSirasi }];
    });
  }

  function updateSubcategoryMeta(kategori, name, patch) {
    setSubcategories((prev) => prev.map((s) => (s.kategori === kategori && s.name === name ? { ...s, ...patch } : s)));
    if (patch.menuSirasi === undefined) return;
    supabase
      .from('subcategories')
      .update({ menu_sirasi: patch.menuSirasi })
      .eq('kategori', kategori)
      .eq('name', name)
      .then(({ error }) => { if (error) console.error('alt kategori güncellenemedi:', error.message); });
    broadcastMenuChanged();
  }

  // "Sheet'ten Çek" gibi birçok alt kategoriyi aynı anda etkileyen işlemler için — tek istek.
  function bulkUpdateSubcategories(patches) {
    if (!patches || patches.length === 0) return;
    setSubcategories((prev) => {
      const map = new Map(patches.map((p) => [`${p.kategori}|${p.name}`, p.patch]));
      return prev.map((s) => {
        const patch = map.get(`${s.kategori}|${s.name}`);
        return patch ? { ...s, ...patch } : s;
      });
    });
    const rows = patches
      .filter(({ patch }) => patch.menuSirasi !== undefined)
      .map(({ kategori, name, patch }) => ({ kategori, name, menu_sirasi: patch.menuSirasi }));
    if (rows.length === 0) return;
    supabase.from('subcategories').upsert(rows, { onConflict: 'kategori,name' }).then(({ error }) => {
      if (error) console.error('toplu alt kategori güncellenemedi:', error.message);
    });
    broadcastMenuChanged();
  }

  function addProduct(product) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const row = {
      id,
      kategori: product.kategori,
      altKategori: product.altKategori || '',
      ad: product.ad,
      fiyat: product.fiyat || 0,
      durum: 'AKTIF',
      menuSirasi: product.menuSirasi ?? 50,
      sabit: false,
      azPorsiyon: false,
      azFiyat: null,
      parentId: null,
      isAzVariant: false,
    };
    setProducts((prev) => [...prev, row]);
    supabase
      .from('products')
      .insert({
        id, kategori: row.kategori, alt_kategori: row.altKategori, ad: row.ad, fiyat: row.fiyat,
        durum: row.durum, menu_sirasi: row.menuSirasi, sabit: false, az_porsiyon: false, az_fiyat: null,
        parent_id: null, is_az_variant: false,
      })
      .then(({ error }) => { if (error) console.error('ürün eklenemedi:', error.message); });
    broadcastMenuChanged();
    return id;
  }

  function updateProduct(id, patch) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const dbPatch = {};
    if (patch.ad !== undefined) dbPatch.ad = patch.ad;
    if (patch.fiyat !== undefined) dbPatch.fiyat = patch.fiyat;
    if (patch.menuSirasi !== undefined) dbPatch.menu_sirasi = patch.menuSirasi;
    if (patch.sabit !== undefined) dbPatch.sabit = patch.sabit;
    if (patch.kategori !== undefined) dbPatch.kategori = patch.kategori;
    if (patch.altKategori !== undefined) dbPatch.alt_kategori = patch.altKategori;
    if (patch.gununMenusuKategori !== undefined) dbPatch.gunun_menusu_kategori = patch.gununMenusuKategori;
    if (patch.gununMenusuSira !== undefined) dbPatch.gunun_menusu_sira = patch.gununMenusuSira;
    if (patch.bicakGerekli !== undefined) dbPatch.bicak_gerekli = patch.bicakGerekli;
    if (patch.ekmekGerekli !== undefined) dbPatch.ekmek_gerekli = patch.ekmekGerekli;
    if (patch.satisAdi !== undefined) dbPatch.satis_adi = patch.satisAdi;
    if (patch.butonRengi !== undefined) dbPatch.buton_rengi = patch.butonRengi;
    if (patch.butonYaziRengi !== undefined) dbPatch.buton_yazi_rengi = patch.butonYaziRengi;
    if (patch.italik !== undefined) dbPatch.italik = patch.italik;
    if (patch.ikon !== undefined) dbPatch.ikon = patch.ikon;
    if (Object.keys(dbPatch).length === 0) return;
    supabase.from('products').update(dbPatch).eq('id', id).then(({ error }) => {
      if (error) console.error('ürün güncellenemedi:', error.message);
    });
    broadcastMenuChanged();
  }

  // Çok sayıda ürünü TEK seferde günceller (örn. "Sheet'ten Çek" — 200 ürün değiştiyse eskiden
  // 200 ayrı .update() isteği atılıyordu, bu da 200 ayrı ağ isteği demekti; artık tek bir
  // .upsert() isteğiyle gidiyor. NOT: Postgres Realtime satır bazlı çalıştığı için mesaj sayısı
  // yine değişen satır sayısı kadar olur (bu kaçınılmaz) — buradaki asıl kazanç istek/hız
  // tarafında, yüzlerce ayrı ağ isteğinin oluşturduğu yavaşlık ve hata riskini ortadan kaldırmak.
  function bulkUpdateProducts(patches) {
    if (!patches || patches.length === 0) return;
    setProducts((prev) => {
      const map = new Map(patches.map((p) => [p.id, p.patch]));
      return prev.map((p) => (map.has(p.id) ? { ...p, ...map.get(p.id) } : p));
    });
    const rows = patches.map(({ id, patch }) => {
      const row = { id };
      if (patch.ad !== undefined) row.ad = patch.ad;
      if (patch.fiyat !== undefined) row.fiyat = patch.fiyat;
      if (patch.durum !== undefined) row.durum = patch.durum;
      if (patch.menuSirasi !== undefined) row.menu_sirasi = patch.menuSirasi;
      if (patch.sabit !== undefined) row.sabit = patch.sabit;
      if (patch.kategori !== undefined) row.kategori = patch.kategori;
      if (patch.altKategori !== undefined) row.alt_kategori = patch.altKategori;
      if (patch.gununMenusuKategori !== undefined) row.gunun_menusu_kategori = patch.gununMenusuKategori;
      if (patch.gununMenusuSira !== undefined) row.gunun_menusu_sira = patch.gununMenusuSira;
      if (patch.bicakGerekli !== undefined) row.bicak_gerekli = patch.bicakGerekli;
      if (patch.ekmekGerekli !== undefined) row.ekmek_gerekli = patch.ekmekGerekli;
      return row;
    });
    supabase.from('products').upsert(rows, { onConflict: 'id' }).then(({ error }) => {
      if (error) console.error('toplu ürün güncellenemedi:', error.message);
    });
    broadcastMenuChanged();
  }

  function deleteProduct(id) {
    setProducts((prev) => prev.filter((p) => p.id !== id && p.parentId !== id));
    supabase.from('products').delete().or(`id.eq.${id},parent_id.eq.${id}`).then(({ error }) => {
      if (error) console.error('ürün silinemedi:', error.message);
    });
    broadcastMenuChanged();
  }

  function setAzPorsiyon(id, enabled, azFiyat) {
    setProducts((prev) => {
      const parent = prev.find((p) => p.id === id);
      if (!parent) return prev;
      if (enabled) {
        const already = prev.find((p) => p.parentId === id);
        if (already) {
          supabase.from('products').update({ az_porsiyon: true, az_fiyat: azFiyat }).eq('id', id).then(({ error }) => {
            if (error) console.error(error.message);
          });
          supabase.from('products').update({ ad: `Az ${parent.ad}`, fiyat: azFiyat }).eq('id', already.id).then(({ error }) => {
            if (error) console.error(error.message);
          });
          return prev.map((p) =>
            p.id === id ? { ...p, azPorsiyon: true, azFiyat }
            : p.id === already.id ? { ...p, ad: `Az ${parent.ad}`, fiyat: azFiyat }
            : p
          );
        }
        const azId = Date.now() + Math.floor(Math.random() * 1000);
        const azProduct = {
          id: azId,
          kategori: parent.kategori,
          altKategori: parent.altKategori,
          ad: `Az ${parent.ad}`,
          fiyat: azFiyat || 0,
          durum: parent.durum,
          menuSirasi: parent.menuSirasi,
          sabit: false,
          azPorsiyon: false,
          azFiyat: null,
          parentId: id,
          isAzVariant: true,
        };
        supabase.from('products').update({ az_porsiyon: true, az_fiyat: azFiyat }).eq('id', id).then(({ error }) => {
          if (error) console.error(error.message);
        });
        supabase
          .from('products')
          .insert({
            id: azId, kategori: azProduct.kategori, alt_kategori: azProduct.altKategori, ad: azProduct.ad,
            fiyat: azProduct.fiyat, durum: azProduct.durum, menu_sirasi: azProduct.menuSirasi, sabit: false,
            az_porsiyon: false, az_fiyat: null, parent_id: id, is_az_variant: true,
          })
          .then(({ error }) => { if (error) console.error(error.message); });
        return [...prev.map((p) => (p.id === id ? { ...p, azPorsiyon: true, azFiyat } : p)), azProduct];
      }
      supabase.from('products').update({ az_porsiyon: false, az_fiyat: null }).eq('id', id).then(({ error }) => {
        if (error) console.error(error.message);
      });
      supabase.from('products').delete().eq('parent_id', id).then(({ error }) => {
        if (error) console.error(error.message);
      });
      return prev
        .filter((p) => p.parentId !== id)
        .map((p) => (p.id === id ? { ...p, azPorsiyon: false, azFiyat: null } : p));
    });
    broadcastMenuChanged();
  }

  // ================== CANLI VERİ (Supabase + gerçek zamanlı) ==================
  const [orders, setOrders] = useState(() => emptyTableMap(FIXED_TABLES, []));
  const [tableNotes, setTableNotes] = useState(() => emptyTableMap(FIXED_TABLES, ''));
  const [tableDiscounts, setTableDiscounts] = useState(() => emptyTableMap(FIXED_TABLES, () => ({ type: null, value: 0 })));
  const [tableOpenedAt, setTableOpenedAt] = useState({});
  const [tableBosvars, setTableBosvars] = useState({});
  const [packages, setPackages] = useState([]);
  const [packageMeta, setPackageMeta] = useState({ date: todayStr(), next: 1 });
  const [salesHistory, setSalesHistory] = useState([]);
  const [soldItems, setSoldItems] = useState([]);
  const [actionHistory, setActionHistory] = useState([]);
  const [cariler, setCariler] = useState([]);
  const [cariHareketler, setCariHareketler] = useState([]);
  const [cariOdemeler, setCariOdemeler] = useState([]);
  const [cariFaturalar, setCariFaturalar] = useState([]);
  const [cariGecmis, setCariGecmis] = useState([]);
  // İlk Supabase yüklemesi bitince true olur — sayfalar, gerçek veri gelmeden eski/boş
  // durumu "kesin doğru" sanıp yerel taslak oluşturmasın diye bunu bekleyebilir.
  const [dataLoaded, setDataLoaded] = useState(false);
  // Paketçi mobil panelinden gelen bildirimler — bunlar SATIŞ VERİSİ DEĞİL, ayrı bir
  // "bildirim/onay" katmanı. Yönetici onaylamadan hiçbir satış/cari kaydını etkilemez.
  const [paketTeslimatlari, setPaketTeslimatlari] = useState([]);
  const [cariTeslimatBildirimleri, setCariTeslimatBildirimleri] = useState([]);
  const [bosvarBildirimleri, setBosvarBildirimleri] = useState([]);
  const [mutfakHazirNotlar, setMutfakHazirNotlar] = useState([]);
  // Ekmek Stok — Yönetim Paneli'nde elle eklenir (Ekmek Stok Ekleme), Masalar'daki
  // Mutfağa Not > Ekmek Gönderme'de mutfağa fiilen giden miktar kadar düşülür. Supabase'de
  // satır bazlı (her tür kendi satırında: key/urun_adi/adet/guncellenme_zamani),
  // increment_ekmek_stok RPC'siyle atomik güncellenir.
  // Ekmek Stok — Google Sheets tek kaynak ("Ekmek Stok" sekmesi, api/ekmekstok.js).
  // Yönetim Paneli'nde elle eklenir (Ekmek Stok Ekleme), Masalar'daki Mutfağa Not >
  // Ekmek Gönderme'de mutfağa fiilen giden miktar kadar düşülür. Her hareket Sheets'e
  // ayrı bir satır olarak yazılır (tarih/saat/tür/değişim/kaynak), güncel stok bu
  // hareketlerin toplamından hesaplanır — Supabase'e hiç dokunmaz.
  const [ekmekStok, setEkmekStok] = useState({ buyukBeyaz: 0, kucukBeyaz: 0, domatesli: 0, kucukKepek: 0 });
  const [harcamaTaslagi, setHarcamaTaslagi] = useState({ anaKasa: [], gunlukKasa: [] });

  const allTables = useMemo(() => [...FIXED_TABLES, ...packages.map((p) => p.name)], [packages]);
  
  // ================== "Kim nerede" — aynı masaya iki cihazın aynı anda girmesini uyarmak için ==================
  const deviceIdRef = useRef(Math.random().toString(36).slice(2, 10));
  const presenceChannelRef = useRef(null);
  const [presenceMap, setPresenceMap] = useState({}); // { [tableName]: [deviceId, ...] }

  // ---- products/categories/subcategories artık Broadcast ile senkron ----
  const liveChannelRef = useRef(null);
  async function refetchMenuData() {
    const [pr, cat, sub] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('categories').select('*'),
      supabase.from('subcategories').select('*'),
    ]);
    setProducts((pr.data || []).map(rowToProduct));
    setCategories((cat.data || []).map(rowToCategory));
    setSubcategories((sub.data || []).map(rowToSubcategory));
  }

  // ---- store_settings — global font/ikon boyutu (satış sayfası). Tek satır (id=1),
  // broadcastMenuChanged akışına dahil edilir ki değişiklik anında tüm cihazlara yansısın.
  const [storeSettings, setStoreSettings] = useState({ globalFontSize: 13, globalIconSize: 22 });
  async function refetchStoreSettings() {
    const { data } = await supabase.from('store_settings').select('*').eq('id', 1).maybeSingle();
    if (data) {
      setStoreSettings({
        globalFontSize: data.global_font_size ?? 13,
        globalIconSize: data.global_icon_size ?? 22,
      });
    }
  }
  function updateStoreSettings(patch) {
    setStoreSettings((prev) => ({ ...prev, ...patch }));
    const dbPatch = { id: 1, updated_at: new Date().toISOString() };
    if (patch.globalFontSize !== undefined) dbPatch.global_font_size = patch.globalFontSize;
    if (patch.globalIconSize !== undefined) dbPatch.global_icon_size = patch.globalIconSize;
    supabase.from('store_settings').upsert([dbPatch], { onConflict: 'id' }).then(({ error }) => {
      if (error) console.error('store_settings güncellenemedi:', error.message);
    });
    broadcastMenuChanged();
  }
  // Ürün/kategori/alt kategoriyi DEĞİŞTİREN her fonksiyon (tekil ya da toplu, fark etmez),
  // kendi Supabase yazmasından sonra bunu çağırır. TEK bir broadcast mesajı gönderir — 200
  // ürün de değişse 1 ürün de değişse, diğer cihazlara giden mesaj sayısı hep 1'dir.
  function broadcastMenuChanged() {
    liveChannelRef.current?.send({ type: 'broadcast', event: 'menu_changed', payload: {} });
  }

  // ---- Ekmek Stok — Google Sheets tek kaynak, Supabase kullanılmıyor.
  async function refetchEkmekStok() {
    try {
      const res = await fetch('/api/ekmekstok');
      const json = await res.json();
      if (json.stok) setEkmekStok(json.stok);
    } catch (err) {
      console.error('ekmek stoğu okunamadı:', err.message);
    }
  }
  async function ekmekStokHareketYaz(delta, kaynak) {
    const hareketler = Object.entries(delta)
      .filter(([, v]) => Number(v) !== 0)
      .map(([tur, v]) => ({ tur, degisim: Number(v), kaynak }));
    if (hareketler.length === 0) return { success: true };
    try {
      const res = await fetch('/api/ekmekstok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hareketler }),
      });
      const json = await res.json();
      if (!res.ok) return { success: false, message: json.error || 'Kaydedilemedi' };
      if (json.stok) setEkmekStok(json.stok);
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
  async function ekmekStokEkle(delta) {
    return ekmekStokHareketYaz(delta, 'Stok Ekleme');
  }
  async function ekmekStoktanDus(miktar) {
    return ekmekStokHareketYaz(
      {
        buyukBeyaz: -(Number(miktar.buyukBeyaz) || 0),
        kucukBeyaz: -(Number(miktar.kucukBeyaz) || 0),
        domatesli: -(Number(miktar.domatesli) || 0),
        kucukKepek: -(Number(miktar.kucukKepek) || 0),
      },
      'Mutfağa Gönderim'
    );
  }

  async function refetchHarcamaTaslagi() {
    const { data } = await supabase.from('gunluk_harcama_taslak').select('*').eq('id', 1).maybeSingle();
    if (data) {
      setHarcamaTaslagi({
        anaKasa: Array.isArray(data.ana_kasa) ? data.ana_kasa : [],
        gunlukKasa: Array.isArray(data.gunluk_kasa) ? data.gunluk_kasa : [],
      });
    }
  }
  async function saveHarcamaTaslagi(taslak) {
    setHarcamaTaslagi(taslak);
    const { error } = await supabase
      .from('gunluk_harcama_taslak')
      .upsert([{ id: 1, ana_kasa: taslak.anaKasa, gunluk_kasa: taslak.gunlukKasa, updated_at: new Date().toISOString() }], { onConflict: 'id' });
    if (error) console.error('Harcama taslağı kaydedilemedi:', error.message);
  }
  async function clearHarcamaTaslagi() {
    setHarcamaTaslagi({ anaKasa: [], gunlukKasa: [] });
    const { error } = await supabase
      .from('gunluk_harcama_taslak')
      .upsert([{ id: 1, ana_kasa: [], gunluk_kasa: [], updated_at: new Date().toISOString() }], { onConflict: 'id' });
    if (error) console.error('Harcama taslağı temizlenemedi:', error.message);
  }

  // ---- Realtime Kullanım Sayacı — SADECE Yönetim Paneli'ndeki gösterge için, kendisi
  // sıfır realtime mesajı tüketiyor (realtime_usage_log tablosuna hiçbir dinleyici abone
  // değil, o yüzden buraya yazmak Supabase'in kendi tanımıyla "0 dinleyiciye giden mesaj").
  // Bu client'ın ALDIĞI her postgres_changes olayında bumpUsageCounter(tablo) çağrılır ve
  // {tablo, saat} olarak arabelleğe eklenir; bu tabloya yazma HİÇ bir dinleyiciyi tetiklemediği
  // için (kotaya dokunmadığı için) sık sık (10sn'de bir) ve ayrıntılı yazabiliyoruz — "son 30
  // mesaj hangi tablodandı" sorusuna cevap verebilmek için.
  const usageBufferRef = useRef([]); // [{ table, ts, detail, dbTs }, ...]
  function bumpUsageCounter(table, info) {
    const detail = typeof info === 'object' && info ? info.summary : (info || '');
    const dbTs = typeof info === 'object' && info ? info.dbTs : null;
    usageBufferRef.current.push({ table, ts: Date.now(), detail, dbTs });
  }
  // Gelen payload'dan (zaten elimizde olan veriden, EK bir sorgu atmadan) "ne oldu" özetini
  // çıkarır — hangi masa, kaç ürün, hangi işlem (INSERT/UPDATE/DELETE) gibi. Sayaç panelindeki
  // "son mesajlar" listesinde bu özet görünüyor, tahmin etmek yerine gerçekten anlayabilelim diye.
  function summarizeRealtimePayload(table, payload) {
    const row = payload?.new && Object.keys(payload.new).length > 0 ? payload.new : payload?.old;
    const ev = payload?.eventType || '?';
    // Veritabanındaki GERÇEK değişme zamanı — bizim aldığımız an (Date.now()) ile karıştırılmasın.
    // Eğer aynı anda gelen birden fazla mesajın dbTs'leri birbirinden FARKLIYSA, bu bir "aradaki
    // kaçırılan değişiklikleri toparlama" (reconnect telafisi) demektir — gerçekten aynı anda
    // olmuş bir şey değildir. dbTs'ler de aynıysa, gerçekten aynı anda bir toplu işlem olmuştur.
    const dbTs = row?.updated_at || row?.ts || row?.created_at || null;
    if (!row) return { summary: ev, dbTs };
    if (table === 'table_state') {
      const itemCount = Array.isArray(row.items) ? row.items.length : '?';
      return { summary: `${row.table_name || '?'} — ${ev} — ${itemCount} ürün${row.note ? ' — not var' : ''}`, dbTs };
    }
    if (table === 'cariler') return { summary: `${row.ad || '?'} — ${ev}`, dbTs };
    if (table === 'products') return { summary: `${row.ad || '?'} — ${ev}`, dbTs };
    if (table === 'categories') return { summary: `${row.name || '?'} — ${ev}`, dbTs };
    if (table === 'subcategories') return { summary: `${row.kategori || ''}/${row.name || '?'} — ${ev}`, dbTs };
    if (table === 'cari_hareketler' || table === 'cari_odemeler' || table === 'cari_faturalar') {
      return { summary: `${row.toplam ?? row.tutar ?? '?'} ₺ — ${ev}`, dbTs };
    }
    if (table === 'cari_gecmis') return { summary: `cari:${row.cari_id || '?'} — ${ev}`, dbTs };
    if (table === 'paket_teslimatlari') return { summary: `${row.paket_adi || '?'} — ${ev}`, dbTs };
    if (table === 'cari_teslimat_bildirimleri') return { summary: `${row.cari_adi || '?'} — ${ev}`, dbTs };
    if (table === 'mutfak_hazir_notlar') return { summary: `"${(row.metin || '').slice(0, 24)}" — ${ev}`, dbTs };
    if (table === 'sales_history') return { summary: `${row.table || '?'} — ${row.amount ?? '?'} ₺`, dbTs };
    if (table === 'sold_items') return { summary: `${row.ad || '?'}`, dbTs };
    if (table === 'action_history') return { summary: `${row.description || '?'}`, dbTs };
    return { summary: ev, dbTs };
  }
  useEffect(() => {
    const id = setInterval(() => {
      const events = usageBufferRef.current;
      usageBufferRef.current = [];
      if (events.length === 0) return;
      supabase.from('realtime_usage_log').insert({
        id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
        message_count: events.length,
        events,
        device_id: deviceIdRef.current,
        scope,
      }).then(({ error }) => {
        if (error) console.error('kullanım sayacı yazılamadı:', error.message);
      });
    }, 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // KOTA OPTİMİZASYONU: presence kanalı SADECE "başka cihazda açık mı" masa kilidini
    // gösteren satış/masalar sayfaları için gerekli — bunlar yalnızca 'full' scope'ta
    // render edilir. Paketçi (/paketci) ve mutfak (/mutfak) panelleri bu kilidi HİÇ
    // kullanmaz (isTableOccupiedElsewhere/announceViewingTable o sayfalarda çağrılmıyor),
    // ama eskiden yine de presence kanalına bağlanıp her masa navigasyonunda tüm cihazlara
    // gereksiz sync/join/leave mesajı ürettiriyorlardı. Artık full dışındaki scope'lar
    // presence'e HİÇ bağlanmıyor. announceViewingTable/clearViewingTable zaten null-güvenli
    // (?.track / ?.untrack), presenceChannelRef null kaldığında sessizce no-op olurlar.
    if (scope !== 'full') return;
    const channel = supabase.channel('hippos-presence', {
      config: { presence: { key: deviceIdRef.current } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        bumpUsageCounter('presence (sync)', 'durum senkronu');
        const state = channel.presenceState();
        const map = {};
        Object.entries(state).forEach(([deviceId, metas]) => {
          const meta = metas[metas.length - 1];
          if (meta && meta.table) {
            (map[meta.table] = map[meta.table] || []).push(deviceId);
          }
        });
        setPresenceMap(map);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        bumpUsageCounter('presence (join)', `cihaz katıldı: ${key}`);
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        bumpUsageCounter('presence (leave)', `cihaz ayrıldı: ${key}`);
      })
      .subscribe();
    presenceChannelRef.current = channel;
    return () => supabase.removeChannel(channel);
  }, []);

  // Bir cihaz bir masayı ekranda açtığında çağrılır — diğer cihazlar bunu anında görür.
  function announceViewingTable(table) {
    presenceChannelRef.current?.track({ table, ts: Date.now() });
  }

  // Cihaz Hızlı Satış ekranından tamamen ayrılınca (Masalar/Ayarlar'a geçince) çağrılır —
  // yoksa son bakılan masa "başka cihazda açık" görünmeye sonsuza kadar devam eder.
  function clearViewingTable() {
    presenceChannelRef.current?.untrack();
  }

  // Bir masada, KENDİMİZ DIŞINDA, o an ekranında duran başka bir cihaz var mı?
  function isTableOccupiedElsewhere(table) {
    const viewers = presenceMap[table] || [];
    return viewers.some((id) => id !== deviceIdRef.current);
  }

  // ---- İlk yükleme + gerçek zamanlı abonelikler ----
  const lastAppliedUpdatedAtRef = useRef({});
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      const [ts, pk, pm, sh, si, ah, cr, ch, co, cf, cg, pr, cat, sub, pt, ctb, mhn, ss, bv] = await Promise.all([
        supabase.from('table_state').select('*'),
        supabase.from('packages').select('*'),
        supabase.from('package_meta').select('*').eq('id', 1).maybeSingle(),
        supabase.from('sales_history').select('*').gte('ts', (() => { const t = new Date(); t.setHours(0,0,0,0); return t.getTime(); })()),
        supabase.from('sold_items').select('*').gte('ts', (() => { const t = new Date(); t.setHours(0,0,0,0); return t.getTime(); })()),
        supabase.from('action_history').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('cariler').select('*'),
        supabase.from('cari_hareketler').select('*'),
        supabase.from('cari_odemeler').select('*'),
        supabase.from('cari_faturalar').select('*'),
        supabase.from('cari_gecmis').select('*'),
        supabase.from('products').select('*'),
        supabase.from('categories').select('*'),
        supabase.from('subcategories').select('*'),
        supabase.from('paket_teslimatlari').select('*'),
        supabase.from('cari_teslimat_bildirimleri').select('*'),
        supabase.from('mutfak_hazir_notlar').select('*').order('created_at', { ascending: true }),
        supabase.from('store_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('bosvar_bildirimleri').select('*'),
      ]);
      if (cancelled) return;

      setProducts((pr.data || []).map(rowToProduct));
      setCategories((cat.data || []).map(rowToCategory));
      setSubcategories((sub.data || []).map(rowToSubcategory));
      if (ss.data) {
        setStoreSettings({
          globalFontSize: ss.data.global_font_size ?? 13,
          globalIconSize: ss.data.global_icon_size ?? 22,
        });
      }
      setPaketTeslimatlari((pt.data || []).map(rowToPaketTeslimat).sort((a, b) => b.ts - a.ts));
      setCariTeslimatBildirimleri((ctb.data || []).map(rowToCariTeslimatBildirim).sort((a, b) => b.ts - a.ts));
      setBosvarBildirimleri((bv.data || []).map(rowToBosvar).sort((a, b) => b.ts - a.ts));
      setMutfakHazirNotlar((mhn.data || []).map((r) => ({ id: r.id, metin: r.metin })));
      refetchEkmekStok(); // Sheets'ten — Supabase'in loadAll'ından bağımsız.
      refetchHarcamaTaslagi(); // Supabase'ten — kendi bağımsız fetch'i.

      const o = emptyTableMap(FIXED_TABLES, []);
      const n = emptyTableMap(FIXED_TABLES, '');
      const d = emptyTableMap(FIXED_TABLES, () => ({ type: null, value: 0 }));
      const oa = {};
      (ts.data || []).forEach((row) => {
        o[row.table_name] = row.items || [];
        n[row.table_name] = row.note || '';
        d[row.table_name] = { type: row.discount_type, value: row.discount_value || 0 };
        if (row.opened_at) oa[row.table_name] = new Date(row.opened_at).getTime();
        if (row.bosvar) bv[row.table_name] = true;
      });
      setOrders(o);
      setTableNotes(n);
      setTableDiscounts(d);
      setTableOpenedAt(oa);
      setTableBosvars(bv);
      setPackages((pk.data || []).map((r) => ({ name: r.name, num: r.num })));
      if (pm.data) setPackageMeta({ date: pm.data.meta_date, next: pm.data.next_num });
      setSalesHistory((sh.data || []).map(rowToSale).sort((a, b) => b.ts - a.ts));
      setSoldItems((si.data || []).map(rowToSoldItem));
      setActionHistory((ah.data || []).map(rowToAction));
      setCariler((cr.data || []).map(rowToCari));
      setCariHareketler((ch.data || []).map(rowToHareket));
      setCariOdemeler((co.data || []).map(rowToOdeme));
      setCariFaturalar((cf.data || []).map(rowToFatura));
      setCariGecmis((cg.data || []).map(rowToGecmis));
      setDataLoaded(true);
    }
    loadAll();

    // Realtime kotasını (aylık mesaj sınırı) boşuna doldurmamak için: hangi ekran/cihaz
    // olduğuna göre SADECE ihtiyacı olan tabloları dinliyoruz. Paketçinin telefonu cari
    // hareketlerini/satış geçmişini/ürün düzenleme geçmişini hiç bilmesine gerek yok;
    // mutfak tableti sadece ürünleri bilsin yeter. Ana panel ('full') eskisi gibi her şeyi
    // dinlemeye devam ediyor — davranışta hiçbir değişiklik yok.
    const need = (tables) => scope === 'full' || tables.includes(scope);
    // 'full' => her tablo; 'paketci' => sadece kendi tablosu adı listede geçenler; aynı şekilde 'mutfak'.
    const wants = {
      products: need(['paketci', 'mutfak']),
      categories: need(['paketci', 'mutfak']),
      subcategories: need(['mutfak']),
      table_state: need(['paketci']),
      packages: need(['paketci']),
      package_meta: need(['paketci']),
      sales_history: need([]),
      // sold_items: kimse tekil satılan ürünü CANLI izlemiyor (satış verisi zaten Supabase'de
      // ve Sheets'te güvenle saklanıyor, Yönetim Paneli'ndeki "en çok satılan" listesi sayfa
      // yenilenince zaten güncel veriyi çeker) — bu yüzden hiçbir scope'ta dinlenmiyor.
      sold_items: false,
      action_history: need([]),
      cariler: need(['paketci']),
      cari_hareketler: need([]),
      cari_odemeler: need([]),
      cari_faturalar: need([]),
      cari_gecmis: need([]),
      paket_teslimatlari: need(['paketci']),
      cari_teslimat_bildirimleri: need([]),             // ← OLMALI (full + paketci, yani herkes)
      bosvar_bildirimleri: need(['paketci']),
      mutfak_hazir_notlar: need([]),
    };

    let channel = supabase.channel('hippos-live');

    // ÖNEMLİ MİMARİ DEĞİŞİKLİĞİ: products/categories/subcategories artık postgres_changes
    // (satır bazlı, otomatik) yerine BROADCAST (elle, tek mesajlık) ile senkronize ediliyor.
    // Sebep: postgres_changes satır bazlı çalıştığı için "200 ürünü toplu pasife al" gibi bir
    // işlem 200 ayrı realtime mesajı üretiyordu — bunu hiçbir bulk/`.in()` sorgusu azaltamaz,
    // Postgres'in replikasyon mantığının doğal sonucu. Broadcast ile: bir cihaz ürün/kategori
    // değiştirdiğinde (tek bir ürün olsun, 200 ürün olsun fark etmez) SADECE "menü değişti"
    // diye TEK bir mesaj gönderiyor; bunu alan diğer cihazlar normal (Realtime OLMAYAN) bir
    // sorguyla kendilerini tazeliyor. Sonuç: en büyük toplu işlem bile artık 1 mesaj.
    if (wants.products || wants.categories || wants.subcategories) {
      channel = channel.on('broadcast', { event: 'menu_changed' }, () => {
        bumpUsageCounter('menu_changed (broadcast)', 'toplu/tekil ürün-kategori senkronu');
        refetchMenuData();
        refetchStoreSettings(); // buton görünüm ayarları da aynı broadcast ile yayılıyor
      });
    }
    if (wants.ekmek_stok) {
      channel = channel.on('broadcast', { event: 'ekmek_stok_changed' }, () => {
        bumpUsageCounter('ekmek_stok_changed (broadcast)', 'ekmek stok güncellemesi');
        refetchEkmekStok();
      });
    }
    if (wants.table_state) {
      // KOTA OPTİMİZASYONU (Seçenek A, dar kapsamlı): event:'*' yerine sadece INSERT+UPDATE
      // dinleniyor. DELETE dalı callback içinde zaten "bumpUsageCounter'dan sonra hemen return"
      // şeklinde no-op'tu — davranış DEĞİŞMİYOR, sadece işlevsiz mesajlar sunucudan hiç gelmiyor.
      const tableStateHandler = (payload) => {
        bumpUsageCounter('table_state', summarizeRealtimePayload('table_state', payload));
        if (payload.eventType === 'DELETE') return;
        const row = payload.new;
        const t = row.table_name;
        const incomingTs = row.updated_at ? new Date(row.updated_at).getTime() : 0;
        const lastTs = lastAppliedUpdatedAtRef.current[t] || 0;
        lastAppliedUpdatedAtRef.current[t] = Math.max(incomingTs, lastTs);
        setOrders((prev) => ({ ...prev, [t]: row.items || [] }));
        // GEÇİCİ TEŞHİS: guard koşulu kaldırıldı, her update koşulsuz uygulanıyor.
        setTableNotes((prev) => ({ ...prev, [t]: row.note || '' }));
        setTableDiscounts((prev) => ({ ...prev, [t]: { type: row.discount_type, value: row.discount_value || 0 } }));
        setTableOpenedAt((prev) => {
          const next = { ...prev };
          if (row.opened_at) next[t] = new Date(row.opened_at).getTime();
          else delete next[t];
          return next;
        });
        setTableBosvars((prev) => {
          if (!!row.bosvar === !!prev[t]) return prev;
          const next = { ...prev };
          if (row.bosvar) next[t] = true; else delete next[t];
          return next;
        });
      };
      channel = channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'table_state' }, tableStateHandler)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'table_state' }, tableStateHandler);
    }
    if (wants.packages) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'packages' }, (payload) => {
        bumpUsageCounter('packages', summarizeRealtimePayload('packages', payload));
        supabase.from('packages').select('*').then(({ data }) => setPackages((data || []).map((r) => ({ name: r.name, num: r.num }))));
      });
    }
    if (wants.package_meta) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'package_meta' }, (payload) => {
        bumpUsageCounter('package_meta', summarizeRealtimePayload('package_meta', payload));
        if (payload.new) setPackageMeta({ date: payload.new.meta_date, next: payload.new.next_num });
      });
    }
    if (wants.sales_history) {
      channel = channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales_history' }, (payload) => {
        bumpUsageCounter('sales_history', summarizeRealtimePayload('sales_history', payload));
        setSalesHistory((prev) => (prev.some((s) => s.id === payload.new.id) ? prev : [rowToSale(payload.new), ...prev]));
      });
    }
    if (wants.sold_items) {
      channel = channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sold_items' }, (payload) => {
        bumpUsageCounter('sold_items', summarizeRealtimePayload('sold_items', payload));
        setSoldItems((prev) => (prev.some((s) => s.id === payload.new.id) ? prev : [rowToSoldItem(payload.new), ...prev]));
      });
    }
    if (wants.action_history) {
      channel = channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'action_history' }, (payload) => {
        bumpUsageCounter('action_history', summarizeRealtimePayload('action_history', payload));
        setActionHistory((prev) => (prev.some((a) => a.id === payload.new.id) ? prev : [rowToAction(payload.new), ...prev].slice(0, 5)));
      });
    }
    if (wants.cariler) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'cariler' }, (payload) => {
        bumpUsageCounter('cariler', summarizeRealtimePayload('cariler', payload));
        if (payload.eventType === 'DELETE') {
          setCariler((prev) => prev.filter((c) => c.id !== payload.old.id));
          return;
        }
        const row = rowToCari(payload.new);
        setCariler((prev) => (prev.some((c) => c.id === row.id) ? prev.map((c) => (c.id === row.id ? row : c)) : [...prev, row]));
      });
    }
    if (wants.cari_hareketler) {
      channel = channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cari_hareketler' }, (payload) => {
        bumpUsageCounter('cari_hareketler', summarizeRealtimePayload('cari_hareketler', payload));
          setCariHareketler((prev) => (prev.some((h) => h.id === payload.new.id) ? prev : [...prev, rowToHareket(payload.new)]));
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cari_hareketler' }, (payload) => {
        bumpUsageCounter('cari_hareketler', summarizeRealtimePayload('cari_hareketler', payload));
          setCariHareketler((prev) => prev.filter((h) => h.id !== payload.old.id));
        });
    }
    if (wants.cari_odemeler) {
      channel = channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cari_odemeler' }, (payload) => {
        bumpUsageCounter('cari_odemeler', summarizeRealtimePayload('cari_odemeler', payload));
          setCariOdemeler((prev) => (prev.some((o) => o.id === payload.new.id) ? prev : [...prev, rowToOdeme(payload.new)]));
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cari_odemeler' }, (payload) => {
        bumpUsageCounter('cari_odemeler', summarizeRealtimePayload('cari_odemeler', payload));
          setCariOdemeler((prev) => prev.filter((o) => o.id !== payload.old.id));
        });
    }
    if (wants.cari_faturalar) {
      channel = channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cari_faturalar' }, (payload) => {
        bumpUsageCounter('cari_faturalar', summarizeRealtimePayload('cari_faturalar', payload));
          setCariFaturalar((prev) => (prev.some((f) => f.id === payload.new.id) ? prev : [...prev, rowToFatura(payload.new)]));
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cari_faturalar' }, (payload) => {
        bumpUsageCounter('cari_faturalar', summarizeRealtimePayload('cari_faturalar', payload));
          setCariFaturalar((prev) => prev.filter((f) => f.id !== payload.old.id));
        });
    }
    if (wants.cari_gecmis) {
      channel = channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cari_gecmis' }, (payload) => {
        bumpUsageCounter('cari_gecmis', summarizeRealtimePayload('cari_gecmis', payload));
        setCariGecmis((prev) => (prev.some((g) => g.id === payload.new.id) ? prev : [...prev, rowToGecmis(payload.new)]));
      });
    }
    if (wants.paket_teslimatlari) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'paket_teslimatlari' }, (payload) => {
        bumpUsageCounter('paket_teslimatlari', summarizeRealtimePayload('paket_teslimatlari', payload));
        if (payload.eventType === 'DELETE') {
          setPaketTeslimatlari((prev) => prev.filter((p) => p.id !== payload.old.id));
          return;
        }
        const row = rowToPaketTeslimat(payload.new);
        setPaketTeslimatlari((prev) =>
          prev.some((p) => p.id === row.id) ? prev.map((p) => (p.id === row.id ? row : p)) : [row, ...prev]
        );
      });
    }
    if (wants.cari_teslimat_bildirimleri) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'cari_teslimat_bildirimleri' }, (payload) => {
        bumpUsageCounter('cari_teslimat_bildirimleri', summarizeRealtimePayload('cari_teslimat_bildirimleri', payload));
        if (payload.eventType === 'DELETE') {
          setCariTeslimatBildirimleri((prev) => prev.filter((c) => c.id !== payload.old.id));
          return;
        }
        const row = rowToCariTeslimatBildirim(payload.new);
        setCariTeslimatBildirimleri((prev) =>
          prev.some((c) => c.id === row.id) ? prev.map((c) => (c.id === row.id ? row : c)) : [row, ...prev]
        );
      });
    }
    if (wants.bosvar_bildirimleri) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'bosvar_bildirimleri' }, (payload) => {
        bumpUsageCounter('bosvar_bildirimleri', summarizeRealtimePayload('bosvar_bildirimleri', payload));
        if (payload.eventType === 'DELETE') {
          setBosvarBildirimleri((prev) => prev.filter((b) => b.id !== payload.old.id));
          return;
        }
        const row = rowToBosvar(payload.new);
        setBosvarBildirimleri((prev) =>
          prev.some((b) => b.id === row.id) ? prev.map((b) => (b.id === row.id ? row : b)) : [row, ...prev]
        );
      });
    }
    if (wants.mutfak_hazir_notlar) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'mutfak_hazir_notlar' }, (payload) => {
        bumpUsageCounter('mutfak_hazir_notlar', summarizeRealtimePayload('mutfak_hazir_notlar', payload));
        if (payload.eventType === 'DELETE') {
          setMutfakHazirNotlar((prev) => prev.filter((n) => n.id !== payload.old.id));
          return;
        }
        const row = { id: payload.new.id, metin: payload.new.metin };
        setMutfakHazirNotlar((prev) => (prev.some((n) => n.id === row.id) ? prev : [...prev, row]));
      });
    }

    channel = channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') console.log('✅ Hippos canlı senkron bağlandı');
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error('❌ Hippos canlı senkron bağlanamadı:', status);
    });
    liveChannelRef.current = channel;

    return () => {
      cancelled = true;
      liveChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, []);


  // ---- TEŞHİS: orders state'i her (referans olarak) değiştiğinde, hangi masa(lar)ın
  // gerçekten değiştiğini ve o anki ürün sayısını logla.
  const prevOrdersForLogRef = useRef({});
  useEffect(() => {
    const prev = prevOrdersForLogRef.current;
    Object.keys(orders).forEach((t) => {
      if (orders[t] !== prev[t]) {
        console.log(`🟥 [5-ORDERS STATE DEĞİŞTİ] masa: "${t}" — ürün sayısı: ${(orders[t] || []).length} — local: ${Date.now()}`);
      }
    });
    prevOrdersForLogRef.current = orders;
  }, [orders]);

  // ---- Masa notu / indirim senkronu — SADECE bu iki alan için (items HARİÇ).
  // "items" (sipariş satırları) artık BURADAN asla yazılmıyor — tek yol RPC fonksiyonları.
  // ÖNEMLİ: bu efekt eskiden HER TUŞ VURUŞUNDA Supabase'e yazıyordu (debounce yoktu) —
  // bir not yazarken her harf ayrı bir realtime mesajı tetikliyordu (bağlı her cihaza).
  // 600ms debounce eklenmişti AMA TEK bir ortak zamanlayıcıyla — yani BAŞKA bir masada
  // herhangi bir hareket olduğunda (ürün eklenmesi, ödeme vs.) SENİN bekleyen not yazman da
  // sıfırlanıp yeniden başlıyordu; yoğun bir dükkânda bu notun hiç yazılmamasına ya da eski
  // veriyle üzerine yazılmasına (yani "kendiliğinden silinmesine") yol açıyordu. Artık her
  // masanın KENDİ ayrı zamanlayıcısı var — başka masalardaki hareket seninkini etkilemiyor.
  const noteDiscountLastSentRef = useRef({ tableNotes: {}, tableDiscounts: {} });
  const noteDiscountTimersRef = useRef({}); // "yazma bekliyor" (600ms debounce) kilidi
  const noteDiscountEchoGuardRef = useRef({}); // "yazma az önce gitti, yankısını görmezden gel" kilidi
  // ÖNEMLİ: sayfa ilk açıldığında noteDiscountLastSentRef BOŞ ({}) başlıyordu — veriler
  // Supabase'ten yüklenip tableNotes gerçek değerlerle dolunca, HER masa "boş'tan gerçek
  // değere değişti" gibi algılanıp gereksiz yere yeniden yazılıyordu (kullanıcı hiçbir şeye
  // dokunmasa bile, her açılışta TÜM masalara toplu, gerçek bir Supabase yazması gidiyordu —
  // "18 masa aynı anda değişti" bugının kaynağı buydu). Artık ilk çalıştırmada sadece mevcut
  // durumu "zaten gönderilmiş" olarak işaretliyoruz, hiçbir şey YAZMIYORUZ — sonraki
  // çalıştırmalar (gerçek kullanıcı değişiklikleri) normal şekilde yazmaya devam ediyor.
  const noteDiscountInitializedRef = useRef(false);
  useEffect(() => {
    if (!dataLoaded) {
      // Veri henüz Supabase'ten yüklenmedi (tableNotes hâlâ başlangıç değeri boş obje) —
      // bu durumu "gerçek" kabul edip seed'lemiyoruz, veri gelince tekrar denenecek.
      noteDiscountLastSentRef.current = { tableNotes: { ...tableNotes }, tableDiscounts: { ...tableDiscounts } };
      return;
    }
    if (!noteDiscountInitializedRef.current) {
      noteDiscountInitializedRef.current = true;
      noteDiscountLastSentRef.current = { tableNotes: { ...tableNotes }, tableDiscounts: { ...tableDiscounts } };
      return;
    }
    const tablesToCheck = new Set([...allTables, ...Object.keys(tableNotes), ...Object.keys(tableDiscounts)]);
    tablesToCheck.forEach((t) => {
      if (t === QUICK_SALE) return; // Hızlı Satış hiçbir zaman Supabase'e yazılmaz (items ile aynı kural)
      // KRİTİK (realtime sonsuz döngü düzeltmesi): indirim bir OBJE ({type, value}) ve
      // realtime her mesajda bu objeyi YENİDEN oluşturuyor. Eskiden burada obje referansı
      // karşılaştırılıyordu, bu yüzden değerler birebir aynı olsa bile "değişti" sanılıyor,
      // 600ms sonra Supabase'e yazılıyor, yazma geri realtime olarak geliyor ve döngü hiç
      // durmuyordu. Artık REFERANS değil DEĞER karşılaştırılıyor.
      const d = tableDiscounts[t] || { type: null, value: 0 };
      const dSon = noteDiscountLastSentRef.current.tableDiscounts[t] || { type: null, value: 0 };
      const noteChanged = (tableNotes[t] || '') !== (noteDiscountLastSentRef.current.tableNotes[t] || '');
      const discountChanged = (d.type ?? null) !== (dSon.type ?? null) || (d.value || 0) !== (dSon.value || 0);
      if (!noteChanged && !discountChanged) return;

      if (noteDiscountTimersRef.current[t]) clearTimeout(noteDiscountTimersRef.current[t]);
      noteDiscountTimersRef.current[t] = setTimeout(() => {
        delete noteDiscountTimersRef.current[t]; // 600ms'lik "yazma bekliyor" kilidi bitti
        noteDiscountLastSentRef.current.tableNotes[t] = tableNotes[t];
        noteDiscountLastSentRef.current.tableDiscounts[t] = tableDiscounts[t];

        // KRİTİK: yazma isteği Supabase'e gidip veritabanına ulaşana kadar geçen sürede
        // (ağ gecikmesi), o masaya ait EN AZ BİR gecikmeli/yankı realtime mesajı gelebilir —
        // bu da az önce gönderdiğimiz taze veriyi eski veriyle ezerdi. Bu yüzden "yazma
        // bekliyor" kilidini kaldırır kaldırmaz hemen değil, yazma isteğini attıktan sonra
        // da 1.5 saniye daha ayrı bir "yankı koruması" kilidi tutuyoruz — bu süre zarfında
        // gelen realtime mesajları bu masa için yok sayılıyor.
        if (noteDiscountEchoGuardRef.current[t]) clearTimeout(noteDiscountEchoGuardRef.current[t]);
        noteDiscountEchoGuardRef.current[t] = setTimeout(() => {
          delete noteDiscountEchoGuardRef.current[t];
        }, 1500);

        supabase
          .from('table_state')
          .upsert(
            [{
              table_name: t,
              note: tableNotes[t] || '',
              discount_type: (tableDiscounts[t] || {}).type ?? null,
              discount_value: (tableDiscounts[t] || {}).value ?? 0,
              updated_at: new Date().toISOString(),
            }],
            { onConflict: 'table_name' }
          )
          .then(({ error }) => {
            if (error) console.error('Not/indirim senkronize edilemedi:', error.message);
          });
      }, 600);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableNotes, tableDiscounts, allTables, dataLoaded]);

  // ---- Yeni satış kayıtlarını Supabase'e yaz (DirectSale doğrudan setSalesHistory çağırıyor) ----
  const syncedSaleIdsRef = useRef(new Set()).current;
  useEffect(() => {
    const newOnes = salesHistory.filter((s) => !syncedSaleIdsRef.has(s.id));
    if (newOnes.length === 0) return;
    newOnes.forEach((s) => syncedSaleIdsRef.add(s.id));
    const rows = newOnes.map((s) => ({ id: s.id, ts: s.ts, table_name: s.table, amount: s.amount, method: s.method, items_count: s.itemsCount, date_display: s.date }));
    supabase.from('sales_history').insert(rows).then(({ error }) => {
      if (error) console.error('Satış kaydı senkronize edilemedi:', error.message);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesHistory]);

  // İlk yükleme sırasında Supabase'ten gelen kayıtları "zaten senkron" olarak işaretle
  useEffect(() => {
    salesHistory.forEach((s) => syncedSaleIdsRef.add(s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ================== SİPARİŞ SATIRLARI (items) — TEK YÖNLÜ AKIŞ ==================
  // NOT: Daha önce burada bir polling (5sn'de bir veritabanını tarayan) güvenlik ağı vardı —
  // bir noktada Realtime'ın bazen bildirim göndermeyi atladığı gözlemlenmişti. Ama bu polling
  // aynı zamanda henüz yazılmayı bekleyen taze bir yerel değişikliği (özellikle masa notu)
  // eski veritabanı değeriyle EZEREK "kendiliğinden silinme" hatasına da yol açıyordu. Bu
  // güvenlik ağının bedeli faydasından ağır bastığı için kaldırıldı — artık tamamen Realtime'a
  // güveniliyor. Realtime'ın mesaj kaçırdığı fark edilirse, bu notu tekrar gündeme getirin.
  // Yerel setOrders çağrıları hâlâ hiçbir yere GERİ YAZILMIYOR — sadece ekran için.

  function addOrderItem(table, item) {
    console.log(`🟦 [1-ÇAĞRILDI] addOrderItem — masa: "${table}" — ürün: "${item.ad}" — local: ${Date.now()}`);
    setOrders((prev) => ({ ...prev, [table]: [...(prev[table] || []), item] }));
    registerPackageIfNeeded(table);
    console.log(`🟨 [2-RPC GÖNDERİLİYOR] append_order_item — masa: "${table}" — local: ${Date.now()}`);
    supabase.rpc('append_order_item', { p_table_name: table, p_item: item }).then(({ error }) => {
      console.log(`🟩 [3-RPC DÖNDÜ] append_order_item — masa: "${table}" — hata: ${error ? error.message : 'yok'} — local: ${Date.now()}`);
      if (error) console.error('ürün eklenemedi:', error.message);
    });
  }

  function removeOrderItem(table, itemId) {
    console.log(`🟦 [1-ÇAĞRILDI] removeOrderItem — masa: "${table}" — local: ${Date.now()}`);
    setOrders((prev) => ({ ...prev, [table]: (prev[table] || []).filter((i) => i.id !== itemId) }));
    console.log(`🟨 [2-RPC GÖNDERİLİYOR] remove_order_item — masa: "${table}" — local: ${Date.now()}`);
    supabase.rpc('remove_order_item', { p_table_name: table, p_item_id: itemId }).then(({ error }) => {
      console.log(`🟩 [3-RPC DÖNDÜ] remove_order_item — masa: "${table}" — hata: ${error ? error.message : 'yok'} — local: ${Date.now()}`);
      if (error) console.error('ürün silinemedi:', error.message);
    });
  }

  function updateOrderItem(table, itemId, patch) {
    console.log(`🟦 [1-ÇAĞRILDI] updateOrderItem — masa: "${table}" — local: ${Date.now()}`);
    setOrders((prev) => ({
      ...prev,
      [table]: (prev[table] || []).map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
    }));
    console.log(`🟨 [2-RPC GÖNDERİLİYOR] update_order_item — masa: "${table}" — local: ${Date.now()}`);
    supabase.rpc('update_order_item', { p_table_name: table, p_item_id: itemId, p_patch: patch }).then(({ error }) => {
      console.log(`🟩 [3-RPC DÖNDÜ] update_order_item — masa: "${table}" — hata: ${error ? error.message : 'yok'} — local: ${Date.now()}`);
      if (error) console.error('ürün güncellenemedi:', error.message);
    });
  }

  // Masanın TÜM sipariş listesini tek seferde değiştirir — sadece bilinçli, tek aktörlü toplu
  // işlemler için (ödeme sonrası kalanları yazma, taşıma, birleştirme, masayı boşaltma).
  // Ekleme/silme/güncelleme için KULLANILMAZ — o işlemler yukarıdaki atomik fonksiyonlardan gider.
  function setOrderItemsRemote(table, items, opts = {}) {
    const patch = { table_name: table, items, updated_at: new Date().toISOString() };
    if ('note' in opts) patch.note = opts.note;
    if ('openedAt' in opts) {
      patch.opened_at = opts.openedAt ? new Date(opts.openedAt).toISOString() : null;
    } else if (items.length > 0 && !tableOpenedAt[table]) {
      // Bu masa/paket ilk kez doluyor ama açılış zamanı hiç ayarlanmamış — HATA BUYDU
      // ("Invalid Date / 0 dk" sabit kalıyordu). Şimdi burada, tek merkezden garanti ediyoruz.
      patch.opened_at = new Date().toISOString();
    }
    if ('discount' in opts) {
      patch.discount_type = opts.discount?.type ?? null;
      patch.discount_value = opts.discount?.value ?? 0;
    }
    if ('bosvar' in opts) patch.bosvar = !!opts.bosvar;
    // Paket, ilk kez içerik kazandığı an "gerçek" hale gelsin — bu çağrı eskiden addOrderItem
    // içinden geliyordu, yeni "yerel taslak" mimarisinde o yol devre dışı kaldığı için paketler
    // hiç kayda geçmiyordu (Paketler panelinde görünmüyordu). Artık tek merkezden garanti ediliyor.
    // Aynı şekilde paket BOŞALINCA da kaydı kaldırılmalı — yoksa (ödeme alındıktan sonra bile)
    // "hayalet" olarak hem Masalar/Paketler panelinde hem Paketçi ekranında görünmeye devam eder.
    if (items.length > 0) registerPackageIfNeeded(table);
    else if (table.startsWith('Paket ')) {
      removePackageRecord(table);
      // Paket numaraları artık tekrar kullanılabiliyor (Paket 4 kapanınca bir sonraki
      // "Yeni Paket" yine Paket 4 olabilir) — bu yüzden eski paketçi teslimat bildirimleri
      // (onaylı/reddedilmiş/bekleyen) burada temizlenmezse, yeni siparişe "yapışmış" gibi
      // görünmeye devam ediyordu. Paket kapanınca kendi geçmişini de kapatıyoruz.
      clearPaketTeslimatlariFor(table);
      clearBosvarBildirimleriFor(table);
    }
    return supabase.from('table_state').upsert(patch, { onConflict: 'table_name' }).then(({ error }) => {
      if (error) {
        console.error('masa durumu yazılamadı:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    });
  }


  // NOT: burada eskiden registerPackageIfNeeded çağrısı vardı — yani sadece NOT yazmak
  // (hiç ürün eklemeden) paketi Supabase'e kaydedip paketçiye anında görünür yapıyordu.
  // Bu hem "boş paket sayı tüketmesin" kuralını deliyor hem gereksiz anlık mesaj (realtime)
  // tüketiyordu. Artık kayıt SADECE gerçek bir ürün eklenince oluşuyor (setOrderItemsRemote).
  function updateTableNote(table, value) {
    setTableNotes((prev) => ({ ...prev, [table]: value }));
  }

  async function saveTableNoteNow(table, note) {
    setTableNotes((prev) => ({ ...prev, [table]: note }));

    const zatenBekleyenTimerYok = !noteDiscountTimersRef.current[table];
    const zatenGuncelGonderilmis = noteDiscountLastSentRef.current.tableNotes[table] === note;
    if (zatenBekleyenTimerYok && zatenGuncelGonderilmis) return { success: true };

    if (noteDiscountTimersRef.current[table]) {
      clearTimeout(noteDiscountTimersRef.current[table]);
      delete noteDiscountTimersRef.current[table];
    }

    const discountForTable = tableDiscounts[table] || { type: null, value: 0 };
    noteDiscountLastSentRef.current.tableNotes[table] = note;
    noteDiscountLastSentRef.current.tableDiscounts[table] = discountForTable;

    if (noteDiscountEchoGuardRef.current[table]) clearTimeout(noteDiscountEchoGuardRef.current[table]);
    noteDiscountEchoGuardRef.current[table] = setTimeout(() => {
      delete noteDiscountEchoGuardRef.current[table];
    }, 1500);

    const { error } = await supabase
      .from('table_state')
      .upsert(
        [{
          table_name: table,
          note: note || '',
          discount_type: discountForTable.type ?? null,
          discount_value: discountForTable.value ?? 0,
          updated_at: new Date().toISOString(),
        }],
        { onConflict: 'table_name' }
      );

    if (error) {
      console.error('Not anlık kaydedilemedi:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  async function saveTableNoteNow(table, note) {
    setTableNotes((prev) => ({ ...prev, [table]: note }));

    const zatenBekleyenTimerYok = !noteDiscountTimersRef.current[table];
    const zatenGuncelGonderilmis = noteDiscountLastSentRef.current.tableNotes[table] === note;
    if (zatenBekleyenTimerYok && zatenGuncelGonderilmis) return { success: true };

    if (noteDiscountTimersRef.current[table]) {
      clearTimeout(noteDiscountTimersRef.current[table]);
      delete noteDiscountTimersRef.current[table];
    }

    const discountForTable = tableDiscounts[table] || { type: null, value: 0 };
    noteDiscountLastSentRef.current.tableNotes[table] = note;
    noteDiscountLastSentRef.current.tableDiscounts[table] = discountForTable;

    if (noteDiscountEchoGuardRef.current[table]) clearTimeout(noteDiscountEchoGuardRef.current[table]);
    noteDiscountEchoGuardRef.current[table] = setTimeout(() => {
      delete noteDiscountEchoGuardRef.current[table];
    }, 1500);

    const { error } = await supabase
      .from('table_state')
      .upsert(
        [{
          table_name: table,
          note: note || '',
          discount_type: discountForTable.type ?? null,
          discount_value: discountForTable.value ?? 0,
          updated_at: new Date().toISOString(),
        }],
        { onConflict: 'table_name' }
      );

    if (error) {
      console.error('Not anlık kaydedilemedi:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  function getTableTotal(table) {
    const items = orders[table] || [];
    const subtotal = items.reduce((s, i) => s + (i.note ? 0 : i.fiyat), 0);
    const d = tableDiscounts[table];
    let discount = 0;
    if (d && d.value > 0) {
      discount = d.type === 'percent' ? (subtotal * d.value) / 100 : d.value;
    }
    return Math.max(0, subtotal - discount);
  }

  // ---- Paketler ----
  // "Yeni Paket" butonuna basınca çağrılır — SADECE bir isim üretir (ör. "Paket 1"),
  // sayacı henüz TÜKETMEZ. Sayı, paket GERÇEKTEN içerik kazandığında (registerPackageIfNeeded)
  // kesinleşir. Böylece "Yeni Paket'e bas, hiç ürün ekleme, Gönder" durumunda numara boşa
  // harcanmaz — bir sonraki gerçek paket yine aynı numarayı alır.
  // Sayaç hep ileri gitmek yerine, o an AÇIK OLAN paketler arasında BOŞTA KALAN en küçük
  // numarayı bulur. Böylece Paket 1 kapanınca bir sonraki "Yeni Paket" yine Paket 1 olur —
  // numaralar sürekli büyümez, kullanılabilir olan en küçüğü tekrar devreye girer.
  function openPackage() {
    const acikNumaralar = new Set(packages.map((p) => p.num));
    let num = 1;
    while (acikNumaralar.has(num)) num++;
    const name = `Paket ${num}`;
    setTableNotes((prev) => ({ ...prev, [name]: '' }));
    setTableDiscounts((prev) => ({ ...prev, [name]: { type: null, value: 0 } }));
    noteDiscountLastSentRef.current.tableNotes[name] = '';
    noteDiscountLastSentRef.current.tableDiscounts[name] = { type: null, value: 0 };
    return name;
  }

  function registerPackageIfNeeded(table) {
    if (!table.startsWith('Paket ')) return;
    setPackages((prev) => {
      if (prev.some((p) => p.name === table)) return prev;
      const num = parseInt(table.replace('Paket ', ''), 10) || 0;
      supabase.from('packages').insert({ name: table, num }).then(({ error }) => {
        if (error) console.error('paket eklenemedi:', error.message);
      });
      return [...prev, { name: table, num }];
    });
  }

  function removePackageRecord(name) {
    setPackages((prev) => prev.filter((p) => p.name !== name));
    setTableOpenedAt((p) => {
      if (!(name in p)) return p;
      const n = { ...p };
      delete n[name];
      return n;
    });
    supabase.from('packages').delete().eq('name', name).then(({ error }) => {
      if (error) console.error('paket silinemedi:', error.message);
    });
    supabase.from('table_state').delete().eq('table_name', name).then(({ error }) => {
      if (error) console.error('paket durumu silinemedi:', error.message);
    });
  }

  // Paket kapanınca, o paket adına ait TÜM paketçi teslimat bildirimlerini (onaylı,
  // reddedilmiş, bekleyen — hepsini) temizler. Bu numara ileride tekrar kullanılırsa
  // (Paket 4 kapanıp yeniden açılırsa) yeni sipariş eski geçmişi devralmasın diye.
  // Paket kapanınca, o paket adına ait TÜM paketçi teslimat bildirimlerini (onaylı,
  // reddedilmiş, bekleyen — hepsini) VE onlara ait fotoğrafları Storage'dan da siler.
  // Fotoğrafları saklamak gereksiz yer kapladığı için sadece veritabanı satırını değil,
  // gerçek dosyayı da kaldırıyoruz. Bu numara ileride tekrar kullanılırsa (Paket 4 kapanıp
  // yeniden açılırsa) yeni sipariş eski geçmişi/fotoğrafları devralmasın diye.
  function clearPaketTeslimatlariFor(name) {
    const silinecekler = paketTeslimatlari.filter((p) => p.paketAdi === name);
    const fotoYollari = silinecekler
      .map((p) => {
        if (!p.fotoUrl) return null;
        const parcalar = p.fotoUrl.split('/teslimat-fotograflari/');
        return parcalar.length > 1 ? parcalar[1] : null;
      })
      .filter(Boolean);
    if (fotoYollari.length > 0) {
      supabase.storage.from('teslimat-fotograflari').remove(fotoYollari).then(({ error }) => {
        if (error) console.error('paket fotoğrafları silinemedi:', error.message);
      });
    }
    setPaketTeslimatlari((prev) => prev.filter((p) => p.paketAdi !== name));
    supabase.from('paket_teslimatlari').delete().eq('paket_adi', name).then(({ error }) => {
      if (error) console.error('eski paket bildirimleri temizlenemedi:', error.message);
    });
  }

  // ---- Geri al geçmişi (son 5 işlem, tam durum anlık görüntüsü ile) ----
  function snapshotState() {
    return { orders, tableNotes, tableDiscounts, tableOpenedAt, packages, packageMeta };
  }
  function pushHistory(description) {
    const entry = {
      id: Date.now() + Math.random(),
      description,
      time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      snapshot: snapshotState(),
    };
    setActionHistory((prev) => [entry, ...prev].slice(0, 5));
    supabase
      .from('action_history')
      .insert({ description: entry.description, time_display: entry.time, snapshot: entry.snapshot })
      .then(({ error }) => { if (error) console.error('işlem geçmişi kaydedilemedi:', error.message); });
  }
  function undoLastAction() {
    setActionHistory((prev) => {
      if (prev.length === 0) return prev;
      const [last, ...rest] = prev;
      const s = last.snapshot;
      // Bu, bilinçli "tam duruma geri dön" işlemi olduğu için toptan yazım burada doğrudur —
      // önceki hatada bu fonksiyon SADECE yerelde değişiyordu, Supabase'e hiç yazılmıyordu
      // (yani geri alma diğer cihazlarda görünmüyor, sayfa yenilenince kayboluyordu).
      const allSnapTables = new Set([
        ...Object.keys(s.orders || {}),
        ...Object.keys(s.tableNotes || {}),
        ...Object.keys(s.tableDiscounts || {}),
      ]);
      allSnapTables.delete(QUICK_SALE); // Hızlı Satış geri alma sırasında da Supabase'e yazılmaz
      const rows = [...allSnapTables].map((t) => ({
        table_name: t,
        items: (s.orders && s.orders[t]) || [],
        note: (s.tableNotes && s.tableNotes[t]) || '',
        discount_type: (s.tableDiscounts && s.tableDiscounts[t] && s.tableDiscounts[t].type) ?? null,
        discount_value: (s.tableDiscounts && s.tableDiscounts[t] && s.tableDiscounts[t].value) ?? 0,
        opened_at: s.tableOpenedAt && s.tableOpenedAt[t] ? new Date(s.tableOpenedAt[t]).toISOString() : null,
        updated_at: new Date().toISOString(),
      }));
      if (rows.length > 0) {
        supabase.from('table_state').upsert(rows, { onConflict: 'table_name' }).then(({ error }) => {
          if (error) console.error('geri alma senkronize edilemedi:', error.message);
        });
      }
      if (s.packageMeta) {
        supabase
          .from('package_meta')
          .upsert({ id: 1, meta_date: s.packageMeta.date, next_num: s.packageMeta.next })
          .then(({ error }) => { if (error) console.error(error.message); });
      }
      (s.packages || []).forEach((p) => registerPackageIfNeeded(p.name));
      return rest;
    });
  }

  // ---- Masa taşı / birleştir (Masalar ekranından, herhangi iki masa arasında) ----
  function transferTable(from, to) {
    if (from === to) return;
    pushHistory(`${from} → ${to} taşındı`);
    setOrderItemsRemote(to, orders[from] || [], {
      note: tableNotes[from] || '',
      discount: tableDiscounts[from] || { type: null, value: 0 },
      openedAt: tableOpenedAt[from] || null,
    });
    setOrderItemsRemote(from, [], { note: '', discount: { type: null, value: 0 }, openedAt: null });
    if (from.startsWith('Paket ')) removePackageRecord(from);
  }

  function mergeTable(from, to) {
    if (from === to) return;
    pushHistory(`${from} + ${to} birleştirildi`);
    const mergedItems = [...(orders[to] || []), ...(orders[from] || [])];
    const mergedNote = [tableNotes[to], tableNotes[from]].filter(Boolean).join(' | ');
    const a = tableOpenedAt[to];
    const b = tableOpenedAt[from];
    const mergedOpenedAt = a && b ? Math.min(a, b) : b || a || null;
    setOrderItemsRemote(to, mergedItems, { note: mergedNote, openedAt: mergedOpenedAt });
    setOrderItemsRemote(from, [], { note: '', discount: { type: null, value: 0 }, openedAt: null });
    if (from.startsWith('Paket ')) removePackageRecord(from);
  }

  // Bir satışı Google Sheets'e KALICI kayıt olarak yazar (Fişler + Fiş Detayları sekmeleri,
  // yıl bazlı otomatik arşiv). Kullanıcıyı asla bekletmez — fiş numarası al, arka planda gönder.
  function writeReceiptToSheets({ tur, masa, toplam, odemeTuru, urunler }) {
    supabase
      .from('receipt_seq')
      .insert({})
      .select('id')
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          console.error('fiş numarası alınamadı:', error?.message);
          return;
        }
        const now = new Date();
        fetch('/api/receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fisNo: data.id,
            tarih: now.toLocaleDateString('tr-TR'),
            saat: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            tur,
            masa,
            toplam,
            odemeTuru,
            urunler,
          }),
        }).catch((e) => console.error('fiş Sheets\'e yazılamadı:', e.message));
      });
  }

  // ---- Masayı ödeme ile tamamen kapat (Masalar ekranından, 3 nokta > Masayı Kapat) ----
  function closeTableWithPayment(table, method) {
    const items = orders[table] || [];
    const payable = items.filter((i) => !i.note);
    if (payable.length === 0) return;
    const totalPay = payable.reduce((s, i) => s + i.fiyat, 0);
    logSoldItems(payable, table);
    pushHistory(`${table} kapatıldı (${method})`);
    setSalesHistory((prev) => [
      { id: Date.now() * 1000 + Math.floor(Math.random() * 1000), ts: Date.now(), table, amount: totalPay, method, itemsCount: payable.length, date: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) },
      ...prev,
    ]);
    writeReceiptToSheets({
      tur: table.startsWith('Paket ') ? 'Paket' : table === QUICK_SALE ? 'Hızlı Satış' : 'Masa',
      masa: table,
      toplam: totalPay,
      odemeTuru: method,
      urunler: payable.map((i) => ({ ad: i.ad, fiyat: i.fiyat })),
    });
    setOrderItemsRemote(table, [], { note: '', discount: { type: null, value: 0 }, openedAt: null });
    if (table.startsWith('Paket ')) removePackageRecord(table);
  }

  // Ödemesi alınan ürünleri (Bugün paneli / en çok satanlar için hızlı önbellek — kalıcı
  // kayıt Sheets'tedir) kalıcı günlüğe yazar.
  function logSoldItems(items, table) {
    if (!items || items.length === 0) return;
    const ts = Date.now();
    const rows = items
      .filter((i) => !i.note)
      .map((i) => ({
        id: `${ts}-${i.id}`,
        ad: i.ad,
        fiyat: i.fiyat,
        kategori: i.kategori || '',
        altKategori: i.altKategori || '',
        table,
        ts,
      }));
    if (rows.length === 0) return;
    setSoldItems((prev) => [...rows, ...prev]);
    supabase
      .from('sold_items')
      .insert(rows.map((r) => ({ id: r.id, ts: r.ts, ad: r.ad, fiyat: r.fiyat, kategori: r.kategori, alt_kategori: r.altKategori, table_name: r.table })))
      .then(({ error }) => { if (error) console.error('satılan ürün kaydedilemedi:', error.message); });

    // ---- SATIŞ ANI MALİYET SNAPSHOT'I ----
    // Bilinçli olarak satış kaydından TAMAMEN AYRI, ASENKRON ve fire-and-forget: satış akışı
    // (Normal/Hızlı Satış/Paket/Masa/Cari, ödeme yöntemi fark etmeksizin — hepsi bu fonksiyona
    // uğruyor) reçete/maliyet hesabının sonucunu HİÇ beklemez, bir hata olsa bile satış
    // etkilenmez. Reçete Sheets'te, maliyet hesabı Sheets'ten okunuyor (api/recete.js) —
    // satış anındaki GÜNCEL maliyeti Supabase'e snapshot olarak yazıyoruz ki malzeme fiyatı
    // yarın değişse bile bugünün satışının maliyeti bugünkü değerde kilitli kalsın.
    snapshotSoldItemCosts(rows);
  }

  // rows: logSoldItems'ın az önce Supabase'e insert ettiği satırlar (henüz maliyetsiz).
  // Aynı üründen birden fazla satır varsa (aynı üründen 2+ adet satılmışsa) ürün adına göre
  // GRUPLAYIP reçete/maliyet hesabını bir kez yapıyoruz (gereksiz tekrar Sheets sorgusu değil),
  // sonra o üründen kaç satır varsa hepsine aynı unit_cost_at_sale'i yazıyoruz — her satır zaten
  // TEK BİR adet ürünü temsil ettiği için total_cost_at_sale = unit_cost_at_sale (miktar 1).
  async function snapshotSoldItemCosts(rows) {
    const adGruplari = new Map(); // ad -> [row, row, ...]
    rows.forEach((r) => {
      if (!adGruplari.has(r.ad)) adGruplari.set(r.ad, []);
      adGruplari.get(r.ad).push(r);
    });

    // Her grup için bir DURUM yazılır (cost_snapshot_status) — fire-and-forget olduğu için
    // satışın kendisi asla beklemez/engellenmez, ama maliyetin eksik kaldığı SESSİZ kalmaz:
    // 'ok' = snapshot başarılı, 'no_recipe' = ürünün reçetesi yok, 'missing_cost' = reçetede
    // maliyeti bilinmeyen malzeme var, 'error' = ağ/API hatası. Bu sütun sonradan (ör. Reçeteler
    // ekranında ya da ileride bir raporda) "maliyeti eksik kalan satışlar" diye filtrelenebilir.
    async function durumYaz(idler, patch) {
      const { error } = await supabase.from('sold_items').update(patch).in('id', idler);
      if (error) console.error('[maliyet snapshot] durum yazılamadı:', error.message);
    }

    for (const [ad, grupRows] of adGruplari) {
      const idler = grupRows.map((r) => r.id);
      try {
        // Ürünün Supabase products kaydını isimle bul (sipariş satırları products.id taşımıyor,
        // sadece ad — mevcut sistemin geneli zaten isim bazlı çalışıyor, tutarlı).
        const urun = products.find((p) => p.ad === ad);
        if (!urun) {
          console.warn(`[maliyet snapshot] "${ad}" için Supabase'de ürün kaydı bulunamadı, maliyet snapshot'ı atlandı.`);
          await durumYaz(idler, { cost_snapshot_status: 'error' });
          continue;
        }
        const res = await fetch(`/api/recete?resource=recete&urunId=${urun.id}`);
        const hesap = await res.json();

        if (hesap.receteYok) {
          // Reçetesi hiç yok — satış zaten kaydedildi (üstte), sadece maliyet snapshot'ı boş
          // kalıyor. Bilinçli: reçetesiz ürünler için satış ASLA engellenmez/bozulmaz.
          console.info(`[maliyet snapshot] "${ad}" için reçete tanımlanmamış, maliyet boş bırakıldı.`);
          await durumYaz(idler, { cost_snapshot_status: 'no_recipe' });
          continue;
        }
        if (hesap.maliyet === null || hesap.eksikMalzemeler?.length > 0) {
          // Eksik malzeme maliyeti var — KRİTİK KURAL: 0 TL yazılmaz, sessizce yanlış maliyet
          // üretilmez. Loglanır, snapshot alanları NULL kalır, satış bozulmaz, DURUM işaretlenir.
          console.warn(`[maliyet snapshot] "${ad}" için eksik malzeme maliyeti: ${(hesap.eksikMalzemeler || []).join(', ')} — maliyet snapshot'ı atlandı.`);
          await durumYaz(idler, { cost_snapshot_status: 'missing_cost' });
          continue;
        }

        const birimMaliyet = hesap.maliyet; // reçetenin toplam maliyeti = 1 adet ürünün maliyeti
        const { error } = await supabase
          .from('sold_items')
          .update({ unit_cost_at_sale: birimMaliyet, total_cost_at_sale: birimMaliyet, cost_snapshot_status: 'ok' })
          .in('id', idler);
        if (error) {
          console.error(`[maliyet snapshot] "${ad}" için sold_items güncellenemedi:`, error.message);
          await durumYaz(idler, { cost_snapshot_status: 'error' });
        }
      } catch (err) {
        // Ağ hatası, Sheets API hatası vb. — satış zaten tamamlanmış durumda, burada sessizce
        // loglayıp devam ediyoruz. Maliyet snapshot'ı eksik kalabilir ama satış ASLA geri alınmaz.
        console.error(`[maliyet snapshot] "${ad}" için maliyet hesabı başarısız:`, err.message);
        await durumYaz(idler, { cost_snapshot_status: 'error' }).catch(() => {});
      }
    }
  }

  // ================== CARİ YÖNETİMİ ==================
  function getCariBakiye(cariId) {
    const borc = cariHareketler.filter((h) => h.cariId === cariId).reduce((s, h) => s + h.toplam, 0);
    const odenen = cariOdemeler.filter((o) => o.cariId === cariId).reduce((s, o) => s + o.tutar, 0);
    const faturaKalan = cariFaturalar.filter((f) => f.cariId === cariId).reduce((s, f) => s + (f.tutar - (f.tahsilatTutar || 0)), 0);
    return Math.max(0, borc + faturaKalan - odenen);
  }

  function getCariSonHareket(cariId) {
    const list = cariHareketler.filter((h) => h.cariId === cariId).sort((a, b) => b.ts - a.ts);
    return list[0] || null;
  }

  function getCariSonOdeme(cariId) {
    const list = cariOdemeler.filter((o) => o.cariId === cariId).sort((a, b) => b.ts - a.ts);
    return list[0] || null;
  }

  function addCari({ tip, ad, telefon, adres, not: notu }) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const cari = { id, tip, ad, telefon: telefon || '', adres: adres || '', not: notu || '', aciklama: '', olusturmaTs: Date.now() };
    setCariler((prev) => [...prev, cari]);
    supabase
      .from('cariler')
      .insert({ id, tip, ad, telefon: cari.telefon, adres: cari.adres, kisa_not: cari.not, aciklama: '' })
      .then(({ error }) => { if (error) console.error('cari oluşturulamadı:', error.message); });
    return id;
  }

  function updateCari(id, patch) {
    setCariler((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const dbPatch = {};
    if (patch.telefon !== undefined) dbPatch.telefon = patch.telefon;
    if (patch.adres !== undefined) dbPatch.adres = patch.adres;
    if (patch.aciklama !== undefined) dbPatch.aciklama = patch.aciklama;
    if (patch.not !== undefined) dbPatch.kisa_not = patch.not;
    if (patch.ad !== undefined) dbPatch.ad = patch.ad;
    if (patch.iskonto !== undefined) dbPatch.iskonto = patch.iskonto;
    if (Object.keys(dbPatch).length === 0) return;
    supabase.from('cariler').update(dbPatch).eq('id', id).then(({ error }) => {
      if (error) console.error('cari güncellenemedi:', error.message);
    });
  }

  // Cariyi ve ona ait TÜM geçmişi (hareket/ödeme/fatura/arşiv) kalıcı olarak siler.
  // Güvenlik: borcu olan (bakiyesi > 0) bir cari yanlışlıkla silinmesin diye çağıran taraf
  // (Cariler.jsx) silmeden önce bakiyeyi kontrol edip kullanıcıyı uyarıyor.
  function deleteCari(id) {
    setCariler((prev) => prev.filter((c) => c.id !== id));
    setCariHareketler((prev) => prev.filter((h) => h.cariId !== id));
    setCariOdemeler((prev) => prev.filter((o) => o.cariId !== id));
    setCariFaturalar((prev) => prev.filter((f) => f.cariId !== id));
    supabase.from('cari_hareketler').delete().eq('cari_id', id).then(({ error }) => {
      if (error) console.error('cari hareketleri silinemedi:', error.message);
    });
    supabase.from('cari_odemeler').delete().eq('cari_id', id).then(({ error }) => {
      if (error) console.error('cari ödemeleri silinemedi:', error.message);
    });
    supabase.from('cari_faturalar').delete().eq('cari_id', id).then(({ error }) => {
      if (error) console.error('cari faturaları silinemedi:', error.message);
    });
    supabase.from('cari_gecmis').delete().eq('cari_id', id).then(({ error }) => {
      if (error) console.error('cari geçmişi silinemedi:', error.message);
    });
    supabase.from('cariler').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('cari silinemedi:', error.message);
    });
  }

  // Bir siparişi (Masalar/Hızlı Satış'tan) bir cariye hareket olarak işler.
  async function deleteCariHareketler(hareketIds) {
    const idSet = new Set(hareketIds);
    setCariHareketler((prev) => prev.filter((h) => !idSet.has(h.id)));
    await Promise.all([...idSet].map((hid) =>
      supabase.from('cari_hareketler').delete().eq('id', hid).then(({ error }) => { if (error) console.error(error.message); })
    ));
  }

  function addCariHareket(cariId, { urunler, toplam, mutfakNotu }) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const ts = Date.now();
    setCariHareketler((prev) => [...prev, { id, cariId, ts, urunler, toplam, mutfakNotu: mutfakNotu || '' }]);
    supabase
      .from('cari_hareketler')
      .insert({ id, cari_id: cariId, ts, urunler, toplam, mutfak_notu: mutfakNotu || '' })
      .then(({ error }) => { if (error) console.error('cari hareketi kaydedilemedi:', error.message); });
    return id;
  }

  async function addCariOdeme(cariId, { tutar, tur }) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const ts = Date.now();
    setCariOdemeler((prev) => [...prev, { id, cariId, ts, tutar, tur }]);
    const { error } = await supabase
      .from('cari_odemeler')
      .insert({ id, cari_id: cariId, ts, tutar, tur });
    if (error) console.error('cari ödemesi kaydedilemedi:', error.message);
    return id;
  }

  // Firma carilerinde: o ana kadarki faturalanmamış bakiyeyi bir faturaya bağlar.
  function addCariFatura(cariId, { tarih, faturaNo, tutar, donemBaslangic, donemBitis }) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const eklenmeTs = Date.now();
    const fatura = { id, cariId, tarih, faturaNo, tutar, eklenmeTs, donemBaslangic: donemBaslangic || null, donemBitis: donemBitis || null, tahsilatTutar: 0 };
    setCariFaturalar((prev) => [...prev, fatura]);
    supabase
      .from('cari_faturalar')
      .insert({ id, cari_id: cariId, tarih, fatura_no: faturaNo, tutar, eklenme_ts: eklenmeTs, donem_baslangic: donemBaslangic || null, donem_bitis: donemBitis || null, tahsilat_tutar: 0 })
      .then(({ error }) => { if (error) console.error('fatura kaydedilemedi:', error.message); });
    return id;
  }

  // Futura: tam tahsilat — faturayı siler, bakiye otomatik düşer (getCariBakiye fatura üzerinden hesaplar)
  async function futuraTamOde(faturaId) {
    const fatura = cariFaturalar.find((f) => f.id === faturaId);
    if (!fatura) return;
    setCariFaturalar((prev) => prev.filter((f) => f.id !== faturaId));
    supabase.from('cari_faturalar').delete().eq('id', faturaId).then(({ error }) => { if (error) console.error(error.message); });
  }

  // Futura: kısmi ödeme — sadece fatura üzerindeki tahsilat artar, log'a eklenir
  async function futuraKismiOde(faturaId, tutar) {
    const fatura = cariFaturalar.find((f) => f.id === faturaId);
    if (!fatura) return;
    const yeniTahsilat = (fatura.tahsilatTutar || 0) + tutar;
    const tarihStr = new Date().toLocaleDateString('tr-TR');
    const yeniLog = [...(fatura.odemeLog || []), { tutar, tarih: tarihStr }];
    setCariFaturalar((prev) => prev.map((f) =>
      f.id === faturaId ? { ...f, tahsilatTutar: yeniTahsilat, odemeLog: yeniLog } : f
    ));
    supabase.from('cari_faturalar')
      .update({ tahsilat_tutar: yeniTahsilat, odeme_log: yeniLog })
      .eq('id', faturaId)
      .then(({ error }) => { if (error) console.error(error.message); });
  }

  function getCariFaturalanmamisTutar(cariId) {
    const toplamHareket = cariHareketler.filter((h) => h.cariId === cariId).reduce((s, h) => s + h.toplam, 0);
    const faturalanan = cariFaturalar.filter((f) => f.cariId === cariId).reduce((s, f) => s + f.tutar, 0);
    return Math.max(0, toplamHareket - faturalanan);
  }

  // Bakiye sıfırlanınca geçmişi silmez — tek satırlık özet olarak arşivler, cariyi listeden gizler.
  function archiveCari(cariId) {
    const toplam = cariHareketler.filter((h) => h.cariId === cariId).reduce((s, h) => s + h.toplam, 0);
    const ts = Date.now();
    setCariGecmis((prev) => [...prev, { id: Date.now() + Math.floor(Math.random() * 1000), cariId, ts, toplamTutar: toplam, aciklama: 'Tamamlandı' }]);
    setCariHareketler((prev) => prev.filter((h) => h.cariId !== cariId));
    setCariOdemeler((prev) => prev.filter((o) => o.cariId !== cariId));
    setCariFaturalar((prev) => prev.filter((f) => f.cariId !== cariId));

    supabase.from('cari_gecmis').insert({ cari_id: cariId, ts, toplam_tutar: toplam, aciklama: 'Tamamlandı' }).then(({ error }) => {
      if (error) console.error('cari arşivlenemedi:', error.message);
    });
    supabase.from('cari_hareketler').delete().eq('cari_id', cariId).then(({ error }) => { if (error) console.error(error.message); });
    supabase.from('cari_odemeler').delete().eq('cari_id', cariId).then(({ error }) => { if (error) console.error(error.message); });
    supabase.from('cari_faturalar').delete().eq('cari_id', cariId).then(({ error }) => { if (error) console.error(error.message); });
  }

  // ================== PAKETÇİ MOBİL PANELİ ==================
  // Bu fonksiyonların hiçbiri satış/cari kaydını DEĞİŞTİRMEZ — sadece "bildirim" oluşturur,
  // yönetici onaylayana/reddedene kadar ayrı bir katmanda bekler.

  async function uploadTeslimatFoto(file) {
    if (!file) return null;
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${Date.now()}-${Math.floor(Math.random() * 100000)}.${ext}`;
    const { error } = await supabase.storage.from('teslimat-fotograflari').upload(path, file);
    if (error) {
      console.error('fotoğraf yüklenemedi:', error.message);
      return null;
    }
    const { data } = supabase.storage.from('teslimat-fotograflari').getPublicUrl(path);
    return data?.publicUrl || null;
  }

  // Paketçi "Teslim Ettim" / "Kısmi Ödeme Aldım" gönderince çağrılır. Oluşan kaydı (id ile
  // birlikte) geri döner — paketçi ekranı bunu "son 5 işlem" geri-al listesinde tutar.
  async function submitPaketTeslimat({ paketAdi, tip, tutar, odemeYontemi, notMetni, fotoUrl, paketciAdi }) {
    const ts = Date.now();
    const row = {
      paket_adi: paketAdi, tip, tutar: tutar ?? null, odeme_yontemi: odemeYontemi || null,
      not_metni: notMetni || null, foto_url: fotoUrl || null, paketci_adi: paketciAdi, durum: 'bekliyor', ts,
    };
    const { data, error } = await supabase.from('paket_teslimatlari').insert(row).select().single();
    if (error) {
      console.error('teslimat bildirilemedi:', error.message);
      return null;
    }
    const created = rowToPaketTeslimat(data);
    setPaketTeslimatlari((prev) => [created, ...prev]);
    return created;
  }

  async function submitCariTeslimatBildirim({ cariId, tip, tutar, odemeYontemi, notMetni, fotoUrl, paketciAdi }) {
    const ts = Date.now();
    const row = {
      cari_id: cariId, tip, tutar, odeme_yontemi: odemeYontemi,
      not_metni: notMetni || null, foto_url: fotoUrl || null, paketci_adi: paketciAdi, durum: 'bekliyor', ts,
    };
    const { data, error } = await supabase.from('cari_teslimat_bildirimleri').insert(row).select().single();
    if (error) {
      console.error('cari ödeme bildirilemedi:', error.message);
      return null;
    }
    const created = rowToCariTeslimatBildirim(data);
    setCariTeslimatBildirimleri((prev) => [created, ...prev]);
    return created;
  }

  // Paketçinin KENDİ az önce yaptığı işlemi geri alması için (henüz onaylanmamışsa).
  function deletePaketTeslimat(id) {
    setPaketTeslimatlari((prev) => prev.filter((p) => p.id !== id));
    supabase.from('paket_teslimatlari').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('geri alınamadı:', error.message);
    });
  }
  function deleteCariTeslimatBildirim(id) {
    setCariTeslimatBildirimleri((prev) => prev.filter((c) => c.id !== id));
    supabase.from('cari_teslimat_bildirimleri').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('geri alınamadı:', error.message);
    });
  }

  // ---- Boş Var bildirimleri ----
  async function submitBosvarBildirim({ paketAdi, paketciAdi }) {
    const ts = Date.now();
    const row = { paket_adi: paketAdi, paketci_adi: paketciAdi, durum: 'bekliyor', ts };
    const { data, error } = await supabase.from('bosvar_bildirimleri').insert(row).select().single();
    if (error) { console.error('bosvar bildirilemedi:', error.message); return null; }
    const created = rowToBosvar(data);
    setBosvarBildirimleri((prev) => [created, ...prev]);
    return created;
  }
  function deleteBosvarBildirim(id) {
    setBosvarBildirimleri((prev) => prev.filter((b) => b.id !== id));
    supabase.from('bosvar_bildirimleri').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('bosvar geri alınamadı:', error.message);
    });
  }
  function clearBosvarBildirimleriFor(paketAdi) {
    setBosvarBildirimleri((prev) => prev.filter((b) => b.paketAdi !== paketAdi));
    supabase.from('bosvar_bildirimleri').delete().eq('paket_adi', paketAdi).then(({ error }) => {
      if (error) console.error('bosvar temizlenemedi:', error.message);
    });
  }
  function setBosvarTik(paketAdi, deger) {
    setTableBosvars((prev) => {
      const next = { ...prev };
      if (deger) next[paketAdi] = true; else delete next[paketAdi];
      return next;
    });
    setOrderItemsRemote(paketAdi, orders[paketAdi] || [], { bosvar: deger });
  }

  // Mutfağa Not ekranındaki hazır not butonları — tüm cihazlarda görünür.
  function addMutfakHazirNot(metin) {
    if (!metin.trim()) return;
    const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    const row = { id, metin: metin.trim() };
    setMutfakHazirNotlar((prev) => [...prev, row]);
    supabase.from('mutfak_hazir_notlar').insert({ id, metin: row.metin }).then(({ error }) => {
      if (error) console.error('hazır not eklenemedi:', error.message);
    });
  }
  function deleteMutfakHazirNot(id) {
    setMutfakHazirNotlar((prev) => prev.filter((n) => n.id !== id));
    supabase.from('mutfak_hazir_notlar').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('hazır not silinemedi:', error.message);
    });
  }

  // ---- Yönetici onay/red (ana panelden) ----
  function onaylaPaketTeslimat(id) {
    const onayTs = Date.now();
    setPaketTeslimatlari((prev) => prev.map((p) => (p.id === id ? { ...p, durum: 'onaylandi', onayTs } : p)));
    supabase.from('paket_teslimatlari').update({ durum: 'onaylandi', onay_ts: onayTs }).eq('id', id).then(({ error }) => {
      if (error) console.error(error.message);
    });
  }
  function reddetPaketTeslimat(id, onayNotu) {
    const onayTs = Date.now();
    setPaketTeslimatlari((prev) => prev.map((p) => (p.id === id ? { ...p, durum: 'reddedildi', onayNotu, onayTs } : p)));
    supabase.from('paket_teslimatlari').update({ durum: 'reddedildi', onay_notu: onayNotu, onay_ts: onayTs }).eq('id', id).then(({ error }) => {
      if (error) console.error(error.message);
    });
  }
  // Onaylama: SADECE burada gerçek bir cari ödemesi oluşur ve bakiye düşer. Paketçinin
  // bildirimi kendi başına ASLA cari verisini etkilemez — onay bu ayrımın tek geçidi.
  function onaylaCariTeslimatBildirim(id) {
    const bildirim = cariTeslimatBildirimleri.find((c) => c.id === id);
    if (!bildirim) return;
    const onayTs = Date.now();
    setCariTeslimatBildirimleri((prev) => prev.map((c) => (c.id === id ? { ...c, durum: 'onaylandi', onayTs } : c)));
    supabase.from('cari_teslimat_bildirimleri').update({ durum: 'onaylandi', onay_ts: onayTs }).eq('id', id).then(({ error }) => {
      if (error) console.error(error.message);
    });
    // Gerçek ödeme kaydı — bakiyeyi düşüren tek yer burası.
    addCariOdeme(bildirim.cariId, { tutar: bildirim.tutar, tur: bildirim.odemeYontemi });
  }
  function reddetCariTeslimatBildirim(id, onayNotu) {
    const onayTs = Date.now();
    setCariTeslimatBildirimleri((prev) => prev.map((c) => (c.id === id ? { ...c, durum: 'reddedildi', onayNotu, onayTs } : c)));
    supabase.from('cari_teslimat_bildirimleri').update({ durum: 'reddedildi', onay_notu: onayNotu, onay_ts: onayTs }).eq('id', id).then(({ error }) => {
      if (error) console.error(error.message);
    });
  }

  return {
    products,
    toggleProductStatus,
    bulkSetCategoryStatus,
    applyMutfakMenusu,
    addProduct,
    updateProduct,
    bulkUpdateProducts,
    bulkUpdateCategories,
    bulkUpdateSubcategories,
    deleteProduct,
    setAzPorsiyon,
    categories,
    addCategory,
    updateCategoryMeta,
    subcategories,
    addSubcategory,
    updateSubcategoryMeta,
    storeSettings,
    updateStoreSettings,
    favorites,
    toggleFavorite,
    allTables,
    packages,
    removePackageRecord,
    openPackage,
    orders,
    addOrderItem,
    removeOrderItem,
    updateOrderItem,
    setOrderItemsRemote,
    tableNotes,
    setTableNotes,
    updateTableNote,
    saveTableNoteNow,
    tableDiscounts,
    setTableDiscounts,
    tableOpenedAt,
    salesHistory,
    setSalesHistory,
    soldItems,
    logSoldItems,
    getTableTotal,
    actionHistory,
    undoLastAction,
    transferTable,
    mergeTable,
    closeTableWithPayment,
    writeReceiptToSheets,
    announceViewingTable,
    clearViewingTable,
    isTableOccupiedElsewhere,
    presenceMap,
    dataLoaded,
    cariler,
    cariHareketler,
    cariOdemeler,
    cariFaturalar,
    cariGecmis,
    getCariBakiye,
    getCariSonHareket,
    getCariSonOdeme,
    addCari,
    updateCari,
    deleteCari,
    addCariHareket,
    addCariOdeme,
    addCariFatura,
    futuraTamOde,
    futuraKismiOde,
    deleteCariHareketler,
    getCariFaturalanmamisTutar,
    archiveCari,
    paketTeslimatlari,
    cariTeslimatBildirimleri,
    uploadTeslimatFoto,
    submitPaketTeslimat,
    submitCariTeslimatBildirim,
    deletePaketTeslimat,
    deleteCariTeslimatBildirim,
    mutfakHazirNotlar,
    addMutfakHazirNot,
    deleteMutfakHazirNot,
    ekmekStok,
    ekmekStokEkle,
    ekmekStoktanDus,
    harcamaTaslagi,
    saveHarcamaTaslagi,
    clearHarcamaTaslagi,
    onaylaPaketTeslimat,
    reddetPaketTeslimat,
    onaylaCariTeslimatBildirim,
    reddetCariTeslimatBildirim,
    bosvarBildirimleri,
    submitBosvarBildirim,
    deleteBosvarBildirim,
    tableBosvars,
    setBosvarTik,
  };
}