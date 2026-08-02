import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../services/supabase';


export const QUICK_SALE = '⚡ Hızlı Satış';
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
  if (mins < 30) return 0;
  if (mins < 60) return 1;
  if (mins < 90) return 2;
  return 3;
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
  };
}
function rowToCategory(r) {
  return { name: r.name, menuSirasi: r.menu_sirasi, sabit: r.sabit };
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
  return { id: r.id, cariId: r.cari_id, tarih: r.tarih, faturaNo: r.fatura_no, tutar: Number(r.tutar), eklenmeTs: Number(r.eklenme_ts) };
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

// Tüm sayfaların (DirectSale, Tables, Reports...) paylaştığı tek veri kaynağı.
// App.jsx içinde BİR KEZ çağrılır, sonuçlar prop olarak sayfalara aktarılır.
//
// VERİ MİMARİSİ:
//  - Ürün / kategori / alt kategori / favoriler: nadiren değişir, Google Sheets ile
//    senkronize olur, tarayıcıda (localStorage) tutulur — bu kısım değişmedi.
//  - Masalar / paketler / siparişler / satış geçmişi / cari: saniyeler içinde değişir,
//    birden fazla cihaz aynı anda kullanacağı için Supabase'de tutulur ve gerçek
//    zamanlı (realtime) abonelikle her cihaza anında yansır.
export default function useHipposData() {
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
      return [...prev, { name: trimmed, menuSirasi, sabit: false }];
    });
  }

  function updateCategoryMeta(name, patch) {
    setCategories((prev) => prev.map((c) => (c.name === name ? { ...c, ...patch } : c)));
    const dbPatch = {};
    if (patch.menuSirasi !== undefined) dbPatch.menu_sirasi = patch.menuSirasi;
    if (patch.sabit !== undefined) dbPatch.sabit = patch.sabit;
    if (Object.keys(dbPatch).length === 0) return;
    supabase.from('categories').update(dbPatch).eq('name', name).then(({ error }) => {
      if (error) console.error('kategori güncellenemedi:', error.message);
    });
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
    if (Object.keys(dbPatch).length === 0) return;
    supabase.from('products').update(dbPatch).eq('id', id).then(({ error }) => {
      if (error) console.error('ürün güncellenemedi:', error.message);
    });
  }

  function deleteProduct(id) {
    setProducts((prev) => prev.filter((p) => p.id !== id && p.parentId !== id));
    supabase.from('products').delete().or(`id.eq.${id},parent_id.eq.${id}`).then(({ error }) => {
      if (error) console.error('ürün silinemedi:', error.message);
    });
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
  }

  // ================== CANLI VERİ (Supabase + gerçek zamanlı) ==================
  const [orders, setOrders] = useState(() => emptyTableMap(FIXED_TABLES, []));
  const [tableNotes, setTableNotes] = useState(() => emptyTableMap(FIXED_TABLES, ''));
  const [tableDiscounts, setTableDiscounts] = useState(() => emptyTableMap(FIXED_TABLES, () => ({ type: null, value: 0 })));
  const [tableOpenedAt, setTableOpenedAt] = useState({});
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

  const allTables = useMemo(() => [...FIXED_TABLES, ...packages.map((p) => p.name)], [packages]);

  // ================== "Kim nerede" — aynı masaya iki cihazın aynı anda girmesini uyarmak için ==================
  const deviceIdRef = useRef(Math.random().toString(36).slice(2, 10));
  const presenceChannelRef = useRef(null);
  const [presenceMap, setPresenceMap] = useState({}); // { [tableName]: [deviceId, ...] }

  useEffect(() => {
    const channel = supabase.channel('hippos-presence', {
      config: { presence: { key: deviceIdRef.current } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
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
      const [ts, pk, pm, sh, si, ah, cr, ch, co, cf, cg, pr, cat, sub, pt, ctb] = await Promise.all([
        supabase.from('table_state').select('*'),
        supabase.from('packages').select('*'),
        supabase.from('package_meta').select('*').eq('id', 1).maybeSingle(),
        supabase.from('sales_history').select('*'),
        supabase.from('sold_items').select('*'),
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
      ]);
      if (cancelled) return;

      setProducts((pr.data || []).map(rowToProduct));
      setCategories((cat.data || []).map(rowToCategory));
      setSubcategories((sub.data || []).map(rowToSubcategory));
      setPaketTeslimatlari((pt.data || []).map(rowToPaketTeslimat).sort((a, b) => b.ts - a.ts));
      setCariTeslimatBildirimleri((ctb.data || []).map(rowToCariTeslimatBildirim).sort((a, b) => b.ts - a.ts));

      const o = emptyTableMap(FIXED_TABLES, []);
      const n = emptyTableMap(FIXED_TABLES, '');
      const d = emptyTableMap(FIXED_TABLES, () => ({ type: null, value: 0 }));
      const oa = {};
      (ts.data || []).forEach((row) => {
        o[row.table_name] = row.items || [];
        n[row.table_name] = row.note || '';
        d[row.table_name] = { type: row.discount_type, value: row.discount_value || 0 };
        if (row.opened_at) oa[row.table_name] = new Date(row.opened_at).getTime();
      });
      setOrders(o);
      setTableNotes(n);
      setTableDiscounts(d);
      setTableOpenedAt(oa);
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

    const channel = supabase
      .channel('hippos-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setProducts((prev) => prev.filter((p) => p.id !== payload.old.id));
          return;
        }
        const row = rowToProduct(payload.new);
        setProducts((prev) => (prev.some((p) => p.id === row.id) ? prev.map((p) => (p.id === row.id ? row : p)) : [...prev, row]));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setCategories((prev) => prev.filter((c) => c.name !== payload.old.name));
          return;
        }
        const row = rowToCategory(payload.new);
        setCategories((prev) => (prev.some((c) => c.name === row.name) ? prev.map((c) => (c.name === row.name ? row : c)) : [...prev, row]));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subcategories' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setSubcategories((prev) => prev.filter((s) => !(s.kategori === payload.old.kategori && s.name === payload.old.name)));
          return;
        }
        const row = rowToSubcategory(payload.new);
        setSubcategories((prev) =>
          prev.some((s) => s.kategori === row.kategori && s.name === row.name)
            ? prev.map((s) => (s.kategori === row.kategori && s.name === row.name ? row : s))
            : [...prev, row]
        );
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_state' }, (payload) => {
        if (payload.eventType === 'DELETE') return;
        const row = payload.new;
        const t = row.table_name;
        const itemCount = (row.items || []).length;
        const incomingTs = row.updated_at ? new Date(row.updated_at).getTime() : 0;
        const lastTs = lastAppliedUpdatedAtRef.current[t] || 0;
        const wouldBeStale = incomingTs < lastTs;
        console.log(
          `🟪 [4-POSTGRES_CHANGES GELDİ] masa: "${t}" — ürün sayısı: ${itemCount} — updated_at: ${row.updated_at} — local: ${Date.now()}${wouldBeStale ? '  ⚠️ SIRASI KARIŞIK (daha eski bir güncelleme, daha yeniden SONRA geldi)' : ''}`
        );
        // TEŞHİS AMACIYLA GEÇİCİ OLARAK KORUMA UYGULANMIYOR — sıra karışıklığının ekranda
        // gerçekten neye yol açtığını çıplak gözle görebilmek için (uyarı logu yeterli).
        lastAppliedUpdatedAtRef.current[t] = Math.max(incomingTs, lastTs);
        setOrders((prev) => ({ ...prev, [t]: row.items || [] }));
        setTableNotes((prev) => ({ ...prev, [t]: row.note || '' }));
        setTableDiscounts((prev) => ({ ...prev, [t]: { type: row.discount_type, value: row.discount_value || 0 } }));
        setTableOpenedAt((prev) => {
          const next = { ...prev };
          if (row.opened_at) next[t] = new Date(row.opened_at).getTime();
          else delete next[t];
          return next;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packages' }, () => {
        supabase.from('packages').select('*').then(({ data }) => setPackages((data || []).map((r) => ({ name: r.name, num: r.num }))));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_meta' }, (payload) => {
        if (payload.new) setPackageMeta({ date: payload.new.meta_date, next: payload.new.next_num });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales_history' }, (payload) => {
        setSalesHistory((prev) => (prev.some((s) => s.id === payload.new.id) ? prev : [rowToSale(payload.new), ...prev]));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sold_items' }, (payload) => {
        setSoldItems((prev) => (prev.some((s) => s.id === payload.new.id) ? prev : [rowToSoldItem(payload.new), ...prev]));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'action_history' }, (payload) => {
        setActionHistory((prev) => (prev.some((a) => a.id === payload.new.id) ? prev : [rowToAction(payload.new), ...prev].slice(0, 5)));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cariler' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setCariler((prev) => prev.filter((c) => c.id !== payload.old.id));
          return;
        }
        const row = rowToCari(payload.new);
        setCariler((prev) => (prev.some((c) => c.id === row.id) ? prev.map((c) => (c.id === row.id ? row : c)) : [...prev, row]));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cari_hareketler' }, (payload) => {
        setCariHareketler((prev) => (prev.some((h) => h.id === payload.new.id) ? prev : [...prev, rowToHareket(payload.new)]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cari_hareketler' }, (payload) => {
        setCariHareketler((prev) => prev.filter((h) => h.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cari_odemeler' }, (payload) => {
        setCariOdemeler((prev) => (prev.some((o) => o.id === payload.new.id) ? prev : [...prev, rowToOdeme(payload.new)]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cari_odemeler' }, (payload) => {
        setCariOdemeler((prev) => prev.filter((o) => o.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cari_faturalar' }, (payload) => {
        setCariFaturalar((prev) => (prev.some((f) => f.id === payload.new.id) ? prev : [...prev, rowToFatura(payload.new)]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cari_faturalar' }, (payload) => {
        setCariFaturalar((prev) => prev.filter((f) => f.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cari_gecmis' }, (payload) => {
        setCariGecmis((prev) => (prev.some((g) => g.id === payload.new.id) ? prev : [...prev, rowToGecmis(payload.new)]));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paket_teslimatlari' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setPaketTeslimatlari((prev) => prev.filter((p) => p.id !== payload.old.id));
          return;
        }
        const row = rowToPaketTeslimat(payload.new);
        setPaketTeslimatlari((prev) =>
          prev.some((p) => p.id === row.id) ? prev.map((p) => (p.id === row.id ? row : p)) : [row, ...prev]
        );
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cari_teslimat_bildirimleri' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setCariTeslimatBildirimleri((prev) => prev.filter((c) => c.id !== payload.old.id));
          return;
        }
        const row = rowToCariTeslimatBildirim(payload.new);
        setCariTeslimatBildirimleri((prev) =>
          prev.some((c) => c.id === row.id) ? prev.map((c) => (c.id === row.id ? row : c)) : [row, ...prev]
        );
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') console.log('✅ Hippos canlı senkron bağlandı');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error('❌ Hippos canlı senkron bağlanamadı:', status);
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // ---- Yedek mekanizma: kullanıcı loguyla KANITLANDI ki Realtime bazen bildirim göndermeyi
  // tamamen atlıyor (RPC hatasız dönüyor ama postgres_changes hiç gelmiyor). Bu artık teorik
  // bir önlem değil, gözlemlenmiş bir ihtiyaç — bu yüzden tekrar açık ve daha sık.
  const POLLING_ENABLED = true;
  useEffect(() => {
    if (!POLLING_ENABLED) return;
    const id = setInterval(async () => {
      const { data, error } = await supabase.from('table_state').select('*');
      if (error || !data) return;

      setOrders((prev) => {
        let changed = false;
        const next = { ...prev };
        data.forEach((row) => {
          if (JSON.stringify(prev[row.table_name] || []) !== JSON.stringify(row.items || [])) {
            next[row.table_name] = row.items || [];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
      setTableNotes((prev) => {
        let changed = false;
        const next = { ...prev };
        data.forEach((row) => {
          if ((prev[row.table_name] || '') !== (row.note || '')) {
            next[row.table_name] = row.note || '';
            changed = true;
          }
        });
        return changed ? next : prev;
      });
      setTableDiscounts((prev) => {
        let changed = false;
        const next = { ...prev };
        data.forEach((row) => {
          const cur = prev[row.table_name] || { type: null, value: 0 };
          if (cur.type !== row.discount_type || cur.value !== (row.discount_value || 0)) {
            next[row.table_name] = { type: row.discount_type, value: row.discount_value || 0 };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
      setTableOpenedAt((prev) => {
        let changed = false;
        const next = { ...prev };
        data.forEach((row) => {
          const curVal = prev[row.table_name] || null;
          const newVal = row.opened_at ? new Date(row.opened_at).getTime() : null;
          if (curVal !== newVal) {
            if (newVal) next[row.table_name] = newVal;
            else delete next[row.table_name];
            changed = true;
          }
        });
        return changed ? next : prev;
      });

      // Paketçi mobil paneli ile ana panel arasında da AYNI güvenlik ağı gerekiyor —
      // yeni paket açılması / paketçinin teslim bildirmesi Realtime'ı bazen kaçırabiliyor.
      // Cari tarafı da aynı şekilde: yeni cari hareketi (bakiye değişimi) veya paketçinin
      // cari ödeme bildirimi de bu korumaya dahil.
      const [pkRes, ptRes, ctbRes, crRes, chRes, coRes, cfRes] = await Promise.all([
        supabase.from('packages').select('*'),
        supabase.from('paket_teslimatlari').select('*'),
        supabase.from('cari_teslimat_bildirimleri').select('*'),
        supabase.from('cariler').select('*'),
        supabase.from('cari_hareketler').select('*'),
        supabase.from('cari_odemeler').select('*'),
        supabase.from('cari_faturalar').select('*'),
      ]);
      if (pkRes.data) {
        setPackages((prev) => {
          const next = (pkRes.data || []).map((r) => ({ name: r.name, num: r.num }));
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
        });
      }
      if (ptRes.data) {
        setPaketTeslimatlari((prev) => {
          const next = ptRes.data.map(rowToPaketTeslimat).sort((a, b) => b.ts - a.ts);
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
        });
      }
      if (ctbRes.data) {
        setCariTeslimatBildirimleri((prev) => {
          const next = ctbRes.data.map(rowToCariTeslimatBildirim).sort((a, b) => b.ts - a.ts);
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
        });
      }
      // ÖNEMLİ: polling sonucu asla LOCAL'de olup henüz Supabase'e tam yansımamış (optimistic)
      // bir kaydı SİLMEZ — sadece "birleştirir" (poll verisi + hâlâ yerelde olan ekstra kayıtlar).
      // Önceki hâli tam "değiştirme" yapıyordu; bu da yeni eklenen bir cari hareketi tam o anda
      // 5 saniyelik anket çekilirse (Supabase'e yazma henüz görünür olmadan) SİLİNMİŞ gibi
      // görünmesine yol açıyordu — cari ödemesinin "gitmediği" hissi buradan geliyordu.
      function mergeById(prev, pollData) {
        const pollIds = new Set(pollData.map((r) => r.id));
        const localOnly = prev.filter((r) => !pollIds.has(r.id));
        return [...pollData, ...localOnly];
      }

      if (crRes.data) {
        setCariler((prev) => {
          const next = mergeById(prev, crRes.data.map(rowToCari));
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
        });
      }
      if (chRes.data) {
        setCariHareketler((prev) => {
          const next = mergeById(prev, chRes.data.map(rowToHareket));
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
        });
      }
      if (coRes.data) {
        setCariOdemeler((prev) => {
          const next = mergeById(prev, coRes.data.map(rowToOdeme));
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
        });
      }
      if (cfRes.data) {
        setCariFaturalar((prev) => {
          const next = mergeById(prev, cfRes.data.map(rowToFatura));
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
        });
      }
    }, 5000);
    return () => clearInterval(id);
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
  // Not/indirim düşük çakışma riskli olduğu için (genelde tek kişi girer) bu basit yöntem yeterli.
  const prevNoteDiscountRef = useRef({ tableNotes: {}, tableDiscounts: {} });
  useEffect(() => {
    const prev = prevNoteDiscountRef.current;
    const changed = new Set();
    allTables.forEach((t) => {
      if (tableNotes[t] !== prev.tableNotes[t]) changed.add(t);
      if (tableDiscounts[t] !== prev.tableDiscounts[t]) changed.add(t);
    });
    prevNoteDiscountRef.current = { tableNotes, tableDiscounts };
    if (changed.size === 0) return;

    const rows = [...changed].map((t) => ({
      table_name: t,
      note: tableNotes[t] || '',
      discount_type: (tableDiscounts[t] || {}).type ?? null,
      discount_value: (tableDiscounts[t] || {}).value ?? 0,
      updated_at: new Date().toISOString(),
    }));
    supabase.from('table_state').upsert(rows, { onConflict: 'table_name' }).then(({ error }) => {
      if (error) console.error('Not/indirim senkronize edilemedi:', error.message);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableNotes, tableDiscounts, allTables]);

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
  // KANIT (kullanıcı logu): RPC hatasız dönüyor (veritabanına yazma başarılı) ama bazen
  // hiçbir postgres_changes bildirimi gelmiyor — yani sorun yarış durumu değil, Supabase
  // Realtime'ın bazen bildirim göndermeyi atlaması. Bu yüzden hem anında yerel gösterim
  // (aşağıda) hem de bir güvenlik ağı olarak polling (aşağıda POLLING_ENABLED) gerekli —
  // ikisi de artık varsayım değil, gözlemlenmiş kanıta dayanıyor.
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
    }
    supabase.from('table_state').upsert(patch, { onConflict: 'table_name' }).then(({ error }) => {
      if (error) console.error('masa durumu yazılamadı:', error.message);
    });
  }


  function updateTableNote(table, value) {
    if (value.trim()) registerPackageIfNeeded(table);
    setTableNotes((prev) => ({ ...prev, [table]: value }));
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
  function clearPaketTeslimatlariFor(name) {
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
      { id: Date.now(), ts: Date.now(), table, amount: totalPay, method, itemsCount: payable.length, date: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) },
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
  }

  // ================== CARİ YÖNETİMİ ==================
  function getCariBakiye(cariId) {
    const borc = cariHareketler.filter((h) => h.cariId === cariId).reduce((s, h) => s + h.toplam, 0);
    const odenen = cariOdemeler.filter((o) => o.cariId === cariId).reduce((s, o) => s + o.tutar, 0);
    return Math.max(0, borc - odenen);
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
    if (Object.keys(dbPatch).length === 0) return;
    supabase.from('cariler').update(dbPatch).eq('id', id).then(({ error }) => {
      if (error) console.error('cari güncellenemedi:', error.message);
    });
  }

  // Bir siparişi (Masalar/Hızlı Satış'tan) bir cariye hareket olarak işler.
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

  function addCariOdeme(cariId, { tutar, tur }) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const ts = Date.now();
    setCariOdemeler((prev) => [...prev, { id, cariId, ts, tutar, tur }]);
    supabase
      .from('cari_odemeler')
      .insert({ id, cari_id: cariId, ts, tutar, tur })
      .then(({ error }) => { if (error) console.error('cari ödemesi kaydedilemedi:', error.message); });
    return id;
  }

  // Firma carilerinde: o ana kadarki faturalanmamış bakiyeyi bir faturaya bağlar.
  function addCariFatura(cariId, { tarih, faturaNo, tutar }) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const eklenmeTs = Date.now();
    setCariFaturalar((prev) => [...prev, { id, cariId, tarih, faturaNo, tutar, eklenmeTs }]);
    supabase
      .from('cari_faturalar')
      .insert({ id, cari_id: cariId, tarih, fatura_no: faturaNo, tutar, eklenme_ts: eklenmeTs })
      .then(({ error }) => { if (error) console.error('fatura kaydedilemedi:', error.message); });
    return id;
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
    deleteProduct,
    setAzPorsiyon,
    categories,
    addCategory,
    updateCategoryMeta,
    subcategories,
    addSubcategory,
    updateSubcategoryMeta,
    favorites,
    toggleFavorite,
    allTables,
    packages,
    openPackage,
    orders,
    addOrderItem,
    removeOrderItem,
    updateOrderItem,
    setOrderItemsRemote,
    tableNotes,
    setTableNotes,
    updateTableNote,
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
    addCariHareket,
    addCariOdeme,
    addCariFatura,
    getCariFaturalanmamisTutar,
    archiveCari,
    paketTeslimatlari,
    cariTeslimatBildirimleri,
    uploadTeslimatFoto,
    submitPaketTeslimat,
    submitCariTeslimatBildirim,
    deletePaketTeslimat,
    deleteCariTeslimatBildirim,
    onaylaPaketTeslimat,
    reddetPaketTeslimat,
    onaylaCariTeslimatBildirim,
    reddetCariTeslimatBildirim,
  };
}