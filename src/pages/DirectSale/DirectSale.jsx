import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import './DirectSale.css';
import { TL, QUICK_SALE } from '../../hooks/useHipposData';
import {
  Pencil, ArrowLeftRight, Link2, ClipboardPaste, X, StickyNote, PackageOpen,
  Percent, Banknote, CreditCard, UtensilsCrossed, BookOpen, Printer, Undo2,
  Trash2, Star, Check, AlertTriangle, Wallet, Send, ChevronDown, ChevronUp, ArrowLeft, Package, Calculator, Delete,
  MessageCircle, Building2, User, MapPin, Phone,
} from 'lucide-react';
import ProductButton, { getDisplayName } from '../../components/ProductButton';
import { resolveButtonStyle } from '../../constants/themeDefaults';
import BosVarPanel from '../../components/bosvar/BosVarPanel';
import '../../components/bosvar/bosvar.css';

export default function DirectSale({ data, selectedTable, setSelectedTable, onNavigate }) {
  const {
    products,
    favorites,
    toggleFavorite,
    allTables,
    orders,
    dataLoaded,
    setOrderItemsRemote,
    tableNotes,
    setTableNotes,
    updateTableNote,
    saveTableNoteNow,
    tableDiscounts,
    setTableDiscounts,
    setSalesHistory,
    logSoldItems,
    writeReceiptToSheets,
    getTableTotal,
    categories: rawCategories,
    subcategories,
    announceViewingTable,
    clearViewingTable,
    isTableOccupiedElsewhere,
    paketTeslimatlari,
    onaylaPaketTeslimat,
    reddetPaketTeslimat,
    bosvarBildirimleri,
    tableBosvars,
    setBosvarTik,
    presenceMap,
    cariler,
    addCari,
    updateCari,
    addCariHareket,
  } = data;

  // Ürünün bağlı olduğu kategori objesini bulur — renk/italik/ikon fallback zinciri için.
  const categoryByName = useMemo(() => {
    const map = {};
    (rawCategories || []).forEach((c) => { map[c.name] = c; });
    return map;
  }, [rawCategories]);
  function getCategoryFor(product) {
    return categoryByName[product.kategori] || null;
  }

  // ---- Ekran durumu ----
  const categories = useMemo(() => {
    const sorted = [...rawCategories].sort((a, b) => a.menuSirasi - b.menuSirasi || a.name.localeCompare(b.name, 'tr'));
    return sorted.map((c) => c.name);
  }, [rawCategories]);
  // Açılış kategorisi: bu cihaza (localStorage) özel, PC'ler arası paylaşılmaz.
  // Kullanıcı bir alt kategori başlığındaki yıldıza basınca o ANA kategori kaydedilir.
  const [defaultCategory, setDefaultCategoryState] = useState(() => {
    try { return localStorage.getItem('hippos_default_category') || ''; } catch { return ''; }
  });
  function setDefaultCategory(cat) {
    setDefaultCategoryState(cat);
    try { localStorage.setItem('hippos_default_category', cat); } catch { /* localStorage kapalıysa sessizce geç */ }
  }
  const [activeCategory, setActiveCategory] = useState('');
  useEffect(() => {
    // Kategoriler ilk yüklendiğinde (ya da hepsi silinip yeniden geldiğinde) sıradaki
    // en küçük kategoriyi otomatik seç — kullanıcı bir "açılış kategorisi" kaydettiyse
    // (yıldız ile, bu cihaza özel) onu, yoksa ilk kategoriyi kullan.
    if (!activeCategory && categories.length > 0) {
      const tercih = defaultCategory && categories.includes(defaultCategory) ? defaultCategory : categories[0];
      setActiveCategory(tercih);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, activeCategory]);
  const [searchQuery, setSearchQuery] = useState('');
  const [payMode, setPayMode] = useState(false);
  const [showChangeCalc, setShowChangeCalc] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [occupiedConfirmTable, setOccupiedConfirmTable] = useState(null);
  const tablePickerListRef = useRef(null);
  const productsScrollRef = useRef(null);
  const bigColScrollRef = useRef(null);
  const smallColScrollRef = useRef(null);

  // Aşağı/yukarı bastıkça, o an görünen kadarlık bir "sayfa" ileri/geri kayar — yani şu an
  // ekranda duran satırlar tamamen kaybolup hemen altındaki (ya da üstündeki) satırlar gelir.
  function scrollByPage(ref, direction) {
    if (ref.current) {
      ref.current.scrollBy({ top: direction * ref.current.clientHeight, behavior: 'smooth' });
    }
  }

  const [numpadOpen, setNumpadOpen] = useState(false);
  const numpadInputRef = useRef(null);

  // ================== YEREL TASLAK (draftItems) ==================
  // Masaya girdiğimizde o masanın o anki hâli taslak olarak yüklenir. Ürün ekleme/silme/
  // değiştirme SIRASINDA hiçbir şey Supabase'e yazılmaz — tamamen yerel, anında, beklemesiz.
  // Sadece masadan ÇIKARKEN (başka masa seçilince, Gönder ile Masalar'a geçilince, ya da
  // sayfadan tamamen ayrılınca) taslak TEK SEFERDE Supabase'e yazılır ve diğer cihazlara
  // o zaman yansır. Bu, sık sık anlık senkrona ihtiyaç duymayan gerçek kullanım şekline
  // (bir masada tek kişi çalışır, bitirince gönderir) çok daha uygun ve çok daha hızlı.
  //
  // İSTİSNA — Hızlı Satış (⚡): bu bir "masa" DEĞİL. Her cihazın kendine ait, tamamen
  // bağımsız/yerel bir oturumu var. Supabase'e ASLA yazılmaz, kilitlenmez, diğer cihazlarla
  // paylaşılmaz. Gönder/Ödeme Al ile satış GERÇEK bir kayıt olur (sales_history/Sheets),
  // ama "masa" olarak hiçbir yerde saklanmaz.
  const [draftItems, setDraftItems] = useState(() => (selectedTable === QUICK_SALE ? [] : orders[selectedTable] || []));
  const draftItemsRef = useRef(draftItems);
  useEffect(() => {
    draftItemsRef.current = draftItems;
  }, [draftItems]);

  const tableNotesRef = useRef(tableNotes);
  useEffect(() => {
    tableNotesRef.current = tableNotes;
  }, [tableNotes]);
  const tableDiscountsRef = useRef(tableDiscounts);
  useEffect(() => {
    tableDiscountsRef.current = tableDiscounts;
  }, [tableDiscounts]);

  const prevTableRef = useRef(selectedTable);
  // Taşıma/birleştirme sonrası hedef masanın GÜNCEL (henüz Supabase'ten yankısı gelmemiş)
  // içeriğini elle taslağa yazdığımızda, aşağıdaki "masa değişince yükle" efektinin bunu
  // ESKİ (henüz güncellenmemiş) orders[table] ile EZMESİNİ önlemek için kullanılır.
  const skipNextDraftLoadRef = useRef(false);

  function flushDraftToSupabase(table, items) {
    if (!table || table === QUICK_SALE) return; // Hızlı Satış hiçbir zaman Supabase'e yazılmaz
    const baseline = orders[table] || [];
    const noteBaseline = tableNotesRef.current[table] || '';
    const discountBaseline = tableDiscountsRef.current[table] || { type: null, value: 0 };
    const itemsChanged = JSON.stringify(baseline) !== JSON.stringify(items);
    if (!itemsChanged) return; // ürün değişmediyse yazma (not/indirim ayrı, kendi debounce'unda gider)
    // Not/indirimi de AYNI yazmaya dahil ediyoruz — aksi halde ürün yazması ile ayrı giden
    // (debounce'lu) not yazması arasında yarış durumu oluşup not "kendiliğinden silinmiş" gibi
    // görünebiliyordu (biri diğerinin üstüne, eski veriyle yazabiliyordu).
    setOrderItemsRemote(table, items, {
      note: noteBaseline,
      discount: discountBaseline,
      ...(items.length === 0 ? { openedAt: null } : {}),
    });
  }

  // Masa değişince: ÖNCEKİ masanın taslağını gönder, sonra YENİ masanın güncel halini yükle
  // (taşıma/birleştirme az önce elle doğru taslağı verdiyse bu adım atlanır).
  useEffect(() => {
    const leaving = prevTableRef.current;
    if (leaving && leaving !== selectedTable) {
      flushDraftToSupabase(leaving, draftItemsRef.current);
    }
    if (skipNextDraftLoadRef.current) {
      skipNextDraftLoadRef.current = false;
    } else {
      setDraftItems(selectedTable === QUICK_SALE ? [] : orders[selectedTable] || []);
    }
    if (selectedTable !== QUICK_SALE) announceViewingTable(selectedTable); // Hızlı Satış kilitlenmez
    prevTableRef.current = selectedTable;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable]);

  // Sayfa ilk açıldığında Supabase verisi henüz gelmemiş olabilir — geldiği an (dataLoaded
  // true olunca) taslağı bir kez daha gerçek veriyle eşitliyoruz (henüz kimse bir şey
  // eklemediyse). Böylece "boş görünüp aslında dolu olan masa" riski ortadan kalkar.
  const hasResyncedAfterLoadRef = useRef(false);
  useEffect(() => {
    if (dataLoaded && !hasResyncedAfterLoadRef.current) {
      hasResyncedAfterLoadRef.current = true;
      if (selectedTable !== QUICK_SALE) setDraftItems(orders[selectedTable] || []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLoaded]);

  // Sayfadan tamamen ayrılınca (Masalar/Ayarlar'a geçince): son taslağı gönder, kilidi bırak.
  useEffect(() => {
    return () => {
      flushDraftToSupabase(prevTableRef.current, draftItemsRef.current);
      if (prevTableRef.current !== QUICK_SALE) clearViewingTable();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (numpadOpen) {
      const t = setTimeout(() => numpadInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [numpadOpen]);
  const [numpadValue, setNumpadValue] = useState('');

  const [priceModal, setPriceModal] = useState(null); // { item, value }
  const [genericModal, setGenericModal] = useState(null); // { title, showInput, showSelect, selectOptions, placeholder, onConfirm }
  const [favModalOpen, setFavModalOpen] = useState(false);
  const [favModalCategory, setFavModalCategory] = useState('Tümü');
  const [favModalSearch, setFavModalSearch] = useState('');
  const [toast, setToast] = useState('');
  const [photoModalUrl, setPhotoModalUrl] = useState(null); // paketçi fotoğrafını pop-up'ta göstermek için

  const currentOrder = draftItems;

  function getCurrentDraftTotal() {
    const subtotal = currentOrder.reduce((s, i) => s + (i.note ? 0 : i.fiyat), 0);
    const d = tableDiscounts[selectedTable];
    let discount = 0;
    if (d && d.value > 0) {
      discount = d.type === 'percent' ? (subtotal * d.value) / 100 : d.value;
    }
    return Math.max(0, subtotal - discount);
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 1500);
  }

  const subtotal = currentOrder.reduce((s, i) => s + (i.note ? 0 : i.fiyat), 0);
  const discountObj = tableDiscounts[selectedTable];
  const discountAmount = discountObj && discountObj.value > 0
    ? (discountObj.type === 'percent' ? (subtotal * discountObj.value) / 100 : discountObj.value)
    : 0;
  const finalTotal = Math.max(0, subtotal - discountAmount);
  const selectedItems = currentOrder.filter((i) => i.selected);
  const selectedTotal = selectedItems.reduce((s, i) => s + i.fiyat, 0);
  const isOrderEmpty = currentOrder.length === 0;

  // ---- Ürün işlemleri — TAMAMEN YEREL, Supabase'e masadan çıkınca yazılır ----
  const addProductToOrder = useCallback((product) => {
    const newItem = {
      id: Date.now() + Math.random(),
      ad: product.ad,
      satisAdi: product.satisAdi,
      fiyat: product.fiyat,
      kategori: product.kategori,
      altKategori: product.altKategori,
      selected: false,
      note: product.fiyat === 0,
      bicakGerekli: !!product.bicakGerekli,
      ekmekGerekli: !!product.ekmekGerekli,
    };
    setDraftItems((prev) => [...prev, newItem]);
  }, []);

  function removeItem(id) {
    setDraftItems((prev) => prev.filter((i) => i.id !== id));
  }

  function toggleSelectItem(id) {
    setDraftItems((prev) => prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)));
  }

  function handleUndoLastItem() {
    setDraftItems((prev) => prev.slice(0, -1));
  }

  function handleClearSelection() {
    setDraftItems((prev) => prev.map((i) => ({ ...i, selected: false })));
  }

  // "Art arda aynı ürün" vurgusu artık veride saklanmıyor, ekranda anlık hesaplanıyor
  // (bir alanı sürekli güncellemek yerine — daha az yazma, daha basit senkron).
  function isConsecutiveDuplicate(items, index) {
    if (index === 0) return false;
    const cur = items[index];
    const prev = items[index - 1];
    return !cur.note && !prev.note && cur.ad === prev.ad;
  }

  // ---- Masa notu — artık her harfte YAZMIYOR (realtime kotasını boşuna dolduruyordu).
  // Yerel taslakta tutulup sadece "Gönder" ikonuna ya da Enter'a basınca gönderiliyor.
  const [tableNoteDraft, setTableNoteDraft] = useState('');
  // Bu masa için EN SON bilinen "uzak" (Supabase/realtime) not değeri. Kullanıcının kendi
  // yazdığını uzaktan gelen bir güncellemenin silmemesi için kıyas noktası olarak tutuluyor.
  const sonUzakNotRef = useRef('');
  useEffect(() => {
    sonUzakNotRef.current = tableNotes[selectedTable] || '';
    setTableNoteDraft(sonUzakNotRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable]);
  // KRİTİK: eskiden bu senkron SADECE masa değişince çalışıyordu, bu yüzden diğer kasadan
  // gelen not realtime ile doğru şekilde geldiği hâlde ekrandaki kutuya hiç yansımıyordu
  // (masadan çıkıp girince ya da F5'te görünüyordu). Artık uzak not değişince de çalışıyor.
  // KORUMA: taslak, son bilinen uzak değerden farklıysa kullanıcı o an bir şey yazıyor
  // demektir, bu durumda yazdığının üzerine YAZILMIYOR.
  useEffect(() => {
    const uzak = tableNotes[selectedTable] || '';
    if (uzak === sonUzakNotRef.current) return;
    setTableNoteDraft((mevcut) => (mevcut === sonUzakNotRef.current ? uzak : mevcut));
    sonUzakNotRef.current = uzak;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableNotes[selectedTable], selectedTable]);
  function sendTableNote() {
    updateTableNote(selectedTable, tableNoteDraft);
  }

  async function pasteToTableNote() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      setTableNoteDraft((current) => (current ? `${current} ${text}` : text));
    } catch {
      showToast('Panoya erişilemedi');
    }
  }

  async function pasteKitchenNote() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      setDraftItems((prev) => [...prev, { id: Date.now() + Math.random(), ad: text.trim(), fiyat: 0, selected: false, note: true }]);
    } catch {
      showToast('Panoya erişilemedi');
    }
  }

  // ---- Mutfak notu ekleme (genel modal ile) ----
  function openKitchenNoteModal() {
    setGenericModal({
      title: 'Mutfağa Not Ekle (Fiyatsız Satır)',
      placeholder: 'Örn: Acısız olsun / Paket saat 13:00',
      showInput: true,
      onConfirm: (text) => {
        if (!text.trim()) return;
        setDraftItems((prev) => [...prev, { id: Date.now() + Math.random(), ad: text.trim(), fiyat: 0, selected: false, note: true }]);
      },
    });
  }

  function editNoteItem(item) {
    setGenericModal({
      title: 'Notu Düzenle',
      placeholder: 'Örn: Acısız olsun / Paket saat 13:00',
      showInput: true,
      defaultValue: item.ad,
      onConfirm: (text) => {
        if (!text.trim()) return;
        setDraftItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ad: text.trim() } : i)));
      },
    });
  }

  // ---- İndirim tuşluğu ----
  function pressNumpad(val) {
    setNumpadValue((prev) => (prev === '0' ? val : prev + val));
  }
  function applyDiscount(type) {
    const val = parseFloat(numpadValue);
    if (isNaN(val) || val <= 0) return;
    setTableDiscounts((prev) => ({ ...prev, [selectedTable]: { type, value: val } }));
    setNumpadValue('');
  }

  // ---- Fiyat değiştirme modalı ----
  function openPriceModal(item) {
    setPriceModal({ item, value: item.fiyat ? item.fiyat.toString().replace('.', ',') : '' });
  }
  function pressPriceNum(val) {
    setPriceModal((pm) => {
      if (!pm) return pm;
      if (val === ',' && pm.value.includes(',')) return pm;
      const next = pm.value === '0' && val !== ',' ? val : pm.value + val;
      return { ...pm, value: next };
    });
  }
  function confirmPriceModal() {
    if (!priceModal) return;
    const parsed = parseFloat(priceModal.value.replace(',', '.'));
    if (!isNaN(parsed) && parsed >= 0) {
      setDraftItems((prev) => prev.map((i) => (i.id === priceModal.item.id ? { ...i, fiyat: parsed } : i)));
    }
    setPriceModal(null);
  }

  // ---- Masa taşı / birleştir ----
  function handleTableTransfer() {
    if (currentOrder.length === 0) {
      setGenericModal({ title: 'Transfer edilecek sipariş yok!', showInput: false });
      return;
    }
    if (isTableOccupiedElsewhere(selectedTable)) {
      setGenericModal({ title: 'Bu masa şu an başka bir cihazda açık, taşıma yapılamaz!', showInput: false });
      return;
    }
    const emptyTables = allTables.filter(
      (t) => t !== selectedTable && (!orders[t] || orders[t].length === 0) && !isTableOccupiedElsewhere(t)
    );
    if (emptyTables.length === 0) {
      setGenericModal({ title: 'Transfer edilebilecek boş ve kilitsiz masa bulunamadı!', showInput: false });
      return;
    }
    setGenericModal({
      title: `${selectedTable} Masasını Başka Masaya Taşı`,
      showInput: false,
      showSelect: true,
      selectOptions: emptyTables.map((t) => ({ value: t, label: `${t} [Boş]` })),
      onConfirm: (_, targetTable) => {
        if (isTableOccupiedElsewhere(selectedTable) || isTableOccupiedElsewhere(targetTable)) {
          showToast('Masa(lar) artık kilitli, taşınamadı');
          return;
        }
        const finalItems = currentOrder;
        setOrderItemsRemote(targetTable, finalItems, {
          note: tableNotes[selectedTable] || '',
          discount: tableDiscounts[selectedTable] || { type: null, value: 0 },
        });
        setOrderItemsRemote(selectedTable, [], { note: '', discount: { type: null, value: 0 }, openedAt: null });
        // Otomatik "masadan çıkış" efektinin, biraz önce elle boşalttığımız kaynak masayı
        // TEKRAR (bayat taslakla) yazmaya çalışmasını önlemek için referansı elle ilerletiyoruz.
        prevTableRef.current = targetTable;
        // Hedef masanın Supabase'teki yankısı henüz gelmediği için, "masa değişince yükle"
        // efektinin eski (taşımadan önceki) veriyi göstermesini engelleyip, doğru sonucu
        // (sayfaya geri dönmeden, ANINDA) burada elle veriyoruz.
        skipNextDraftLoadRef.current = true;
        setSelectedTable(targetTable);
        setDraftItems(finalItems);
      },
    });
  }

  function handleTableMerge() {
    if (currentOrder.length === 0) {
      setGenericModal({ title: 'Birleştirilecek sipariş bulunmuyor!', showInput: false });
      return;
    }
    if (isTableOccupiedElsewhere(selectedTable)) {
      setGenericModal({ title: 'Bu masa şu an başka bir cihazda açık, birleştirme yapılamaz!', showInput: false });
      return;
    }
    const occupiedTables = allTables.filter(
      (t) => t !== selectedTable && orders[t] && orders[t].length > 0 && !isTableOccupiedElsewhere(t)
    );
    if (occupiedTables.length === 0) {
      setGenericModal({ title: 'Birleştirilebilecek dolu ve kilitsiz masa bulunamadı!', showInput: false });
      return;
    }
    setGenericModal({
      title: `${selectedTable} Masasını Dolu Masa İle Birleştir`,
      showInput: false,
      showSelect: true,
      selectOptions: occupiedTables.map((t) => ({ value: t, label: `${t} (${TL(getTableTotal(t))})` })),
      onConfirm: (_, targetTable) => {
        if (isTableOccupiedElsewhere(selectedTable) || isTableOccupiedElsewhere(targetTable)) {
          showToast('Masa(lar) artık kilitli, birleştirilemedi');
          return;
        }
        const finalItems = [...(orders[targetTable] || []), ...currentOrder];
        setOrderItemsRemote(targetTable, finalItems, {
          note: tableNotes[selectedTable]
            ? `${tableNotes[targetTable] ? tableNotes[targetTable] + ' | ' : ''}${tableNotes[selectedTable]}`
            : tableNotes[targetTable] || '',
        });
        setOrderItemsRemote(selectedTable, [], { note: '', discount: { type: null, value: 0 }, openedAt: null });
        prevTableRef.current = targetTable;
        // Birleştirmenin GÜNCEL sonucunu (Supabase'in yankısını beklemeden) anında göster.
        skipNextDraftLoadRef.current = true;
        setSelectedTable(targetTable);
        setDraftItems(finalItems);
      },
    });
  }

  // ---- Ödeme / yazdırma / boşaltma ----
  function handlePay(method) {
    const payable = currentOrder.filter((i) => !i.note);
    if (payable.length === 0) return;
    const selected = payable.filter((i) => i.selected);
    const toClose = selected.length > 0 ? selected : payable;
    const closedIds = new Set(toClose.map((i) => i.id));
    const totalPay = toClose.reduce((s, i) => s + i.fiyat, 0);

    setSalesHistory((prev) => [
      { id: Date.now() * 1000 + Math.floor(Math.random() * 1000), ts: Date.now(), table: selectedTable, amount: totalPay, method, itemsCount: toClose.length, date: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) },
      ...prev,
    ]);
    logSoldItems(toClose, selectedTable);
    writeReceiptToSheets({
      tur: selectedTable.startsWith('Paket ') ? 'Paket' : selectedTable === QUICK_SALE ? 'Hızlı Satış' : 'Masa',
      masa: selectedTable,
      toplam: totalPay,
      odemeTuru: method,
      urunler: toClose.map((i) => ({ ad: i.ad, fiyat: i.fiyat })),
    });

    const remaining = currentOrder.filter((i) => !closedIds.has(i.id) && !i.note);
    setDraftItems(remaining);
    if (remaining.length === 0) {
      setTableDiscounts((prev) => ({ ...prev, [selectedTable]: { type: null, value: 0 } }));
      updateTableNote(selectedTable, '');
      setTableNoteDraft('');
      if (selectedTable.startsWith('Paket ')) data.removePackageRecord(selectedTable);
    }
    showToast(`${method} ile ödeme alındı`);
    setPayMode(false);
  }

  async function handleSend() {
    if (selectedTable !== QUICK_SALE) {
      const result = await saveTableNoteNow(selectedTable, tableNoteDraft);
      if (!result.success) {
        showToast('Not kaydedilemedi, tekrar deneyin');
        return;
      }
    }
    onNavigate('tables');
  }

  // ---- Cariye gönder ----
  const [cariPickerOpen, setCariPickerOpen] = useState(false);
  const [cariSearch, setCariSearch] = useState('');
  const [cariYeniForm, setCariYeniForm] = useState(null); // { ad, telefon, adres }
  const [cariConfirm, setCariConfirm] = useState(null); // { cari }
  const [cariEditRowId, setCariEditRowId] = useState(null); // bireysel listede "Düzenle" açık olan satır
  const [cariEditDraft, setCariEditDraft] = useState({ telefon: '', adres: '' });
  const [cariWaPhoneEntry, setCariWaPhoneEntry] = useState(false);
  const [cariWaPhoneDraft, setCariWaPhoneDraft] = useState('');

  function normalizeTrPhone(phone) {
    let digits = (phone || '').replace(/[^0-9]/g, '');
    if (digits.startsWith('0')) digits = digits.slice(1);
    if (!digits.startsWith('90')) digits = '90' + digits;
    return digits;
  }
  function waShare(text, phone) {
    const digits = normalizeTrPhone(phone);
    if (!digits || digits === '90') {
      showToast('Kayıtlı numara yok');
      return;
    }
    const win = window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank');
    if (!win) showToast('Tarayıcı pencereyi engelledi — popup iznini kontrol et');
  }

  function openCariPicker() {
    setCariSearch('');
    setCariYeniForm(null);
    setCariConfirm(null);
    setCariEditRowId(null);
    setCariWaPhoneEntry(false);
    setCariWaPhoneDraft('');
    setCariPickerOpen(true);
  }

  function handlePayToCari(cariId) {
    const payable = currentOrder.filter((i) => !i.note);
    if (payable.length === 0) return;
    const selected = payable.filter((i) => i.selected);
    const toClose = selected.length > 0 ? selected : payable;
    const closedIds = new Set(toClose.map((i) => i.id));
    const totalPay = toClose.reduce((s, i) => s + i.fiyat, 0);
    const mutfakNotu = currentOrder.filter((i) => i.note).map((i) => i.ad).join(' · ');

    setSalesHistory((prev) => [
      { id: Date.now() * 1000 + Math.floor(Math.random() * 1000), ts: Date.now(), table: selectedTable, amount: totalPay, method: 'CARİ', itemsCount: toClose.length, date: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) },
      ...prev,
    ]);
    logSoldItems(toClose, selectedTable);
    addCariHareket(cariId, {
      urunler: toClose.map((i) => ({ ad: i.ad, fiyat: i.fiyat })),
      toplam: totalPay,
      mutfakNotu,
    });
    const cariAdi = (cariler || []).find((c) => c.id === cariId)?.ad || 'Cari';
    writeReceiptToSheets({
      tur: 'Cari',
      masa: cariAdi,
      toplam: totalPay,
      odemeTuru: 'CARİ',
      urunler: toClose.map((i) => ({ ad: i.ad, fiyat: i.fiyat })),
    });

    const remaining = currentOrder.filter((i) => !closedIds.has(i.id) && !i.note);
    setDraftItems(remaining);
    if (remaining.length === 0) {
      setTableDiscounts((prev) => ({ ...prev, [selectedTable]: { type: null, value: 0 } }));
      updateTableNote(selectedTable, '');
      setTableNoteDraft('');
      if (selectedTable.startsWith('Paket ')) data.removePackageRecord(selectedTable);
    }
    setCariPickerOpen(false);
    setPayMode(false);
    setCariConfirm(null);
    showToast('Cariye gönderildi');
    return { toClose, totalPay };
  }

  // Onayla — sadece cariye işler, WhatsApp'a hiç dokunmaz
  function confirmSendPlain() {
    if (!cariConfirm) return;
    handlePayToCari(cariConfirm.cari.id);
  }

  // WhatsApp'tan İlet — cariye işler VE müşteriye WhatsApp'tan (hazır mesajla) iletir.
  // Numara yoksa önce numara girme ekranını açar, kaydedince otomatik gönderir.
  function confirmSendWithWhatsapp() {
    if (!cariConfirm) return;
    const cari = cariConfirm.cari;
    if (!cari.telefon) {
      setCariWaPhoneEntry(true);
      setCariWaPhoneDraft('');
      return;
    }
    const payable = currentOrder.filter((i) => !i.note);
    const selected = payable.filter((i) => i.selected);
    const toClose = selected.length > 0 ? selected : payable;
    const totalPay = toClose.reduce((s, i) => s + i.fiyat, 0);
    const mesaj = `${cari.ad}\n\n${toClose.map((i) => `${i.ad} .. ${TL(i.fiyat)}`).join('\n')}\n\nToplam: ${TL(totalPay)}`;
    handlePayToCari(cari.id);
    waShare(mesaj, cari.telefon);
  }

  function saveWaPhoneAndSend() {
    if (!cariConfirm || !cariWaPhoneDraft.trim()) return;
    const cari = cariConfirm.cari;
    updateCari(cari.id, { telefon: cariWaPhoneDraft.trim() });
    const payable = currentOrder.filter((i) => !i.note);
    const selected = payable.filter((i) => i.selected);
    const toClose = selected.length > 0 ? selected : payable;
    const totalPay = toClose.reduce((s, i) => s + i.fiyat, 0);
    const mesaj = `${cari.ad}\n\n${toClose.map((i) => `${i.ad} .. ${TL(i.fiyat)}`).join('\n')}\n\nToplam: ${TL(totalPay)}`;
    handlePayToCari(cari.id);
    waShare(mesaj, cariWaPhoneDraft.trim());
  }

  async function pasteIntoWaPhoneDraft() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setCariWaPhoneDraft(text.trim());
    } catch {
      /* pano izni yoksa sessizce geç */
    }
  }

  function openCariEditRow(c) {
    setCariEditRowId(c.id);
    setCariEditDraft({ telefon: c.telefon || '', adres: c.adres || '' });
  }
  function saveCariEditRow(cariId) {
    updateCari(cariId, { telefon: cariEditDraft.telefon, adres: cariEditDraft.adres });
    setCariEditRowId(null);
    showToast('Cari bilgileri güncellendi');
  }

  function submitYeniCariFromPos() {
    if (!cariYeniForm || !cariYeniForm.ad.trim()) return;
    const ad = cariYeniForm.ad.trim();
    const telefon = cariYeniForm.telefon || '';
    const adres = cariYeniForm.adres || '';
    const id = addCari({ tip: 'bireysel', ad, telefon, adres, not: '' });
    // Yeni oluşturulan cari henüz `cariler` listesine (Supabase senkronu asenkron)
    // yansımamış olabilir — onay ekranına kendi nesnesini doğrudan veriyoruz.
    setCariYeniForm(null);
    setCariConfirm({ cari: { id, ad, telefon, adres, tip: 'bireysel' } });
  }

  const firmaCariler = (cariler || []).filter((c) => c.tip === 'firma').sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  const bireyselCariler = (cariler || []).filter((c) => c.tip === 'bireysel');
  const filteredCariler = bireyselCariler.filter(

    (c) => !cariSearch.trim() || c.ad.toLowerCase().includes(cariSearch.trim().toLowerCase())
  );

  function handleClearTable() {
    if (currentOrder.length === 0) return;
    setGenericModal({
      title: `${selectedTable} masasındaki tüm siparişleri silmek istiyor musunuz?`,
      showInput: false,
      onConfirm: async () => {
        const result = await setOrderItemsRemote(selectedTable, [], { discount: { type: null, value: 0 } });
        if (!result.success) {
          showToast('Boşaltma kaydedilemedi, tekrar deneyin');
          return;
        }
        if (selectedTable !== QUICK_SALE) clearViewingTable();
        setDraftItems([]);
        setTableDiscounts((prev) => ({ ...prev, [selectedTable]: { type: null, value: 0 } }));
      },
    });
  }

  useEffect(() => {
    setPayMode(false);
  }, [selectedTable]);

  const printRef = useRef(null);
  const orderListRef = useRef(null);

  useEffect(() => {
    if (orderListRef.current) {
      orderListRef.current.scrollTop = orderListRef.current.scrollHeight;
    }
  }, [currentOrder.length, selectedTable]);

  async function handlePrint() {
    if (currentOrder.length === 0) return;
    if (selectedTable !== QUICK_SALE) {
      const result = await saveTableNoteNow(selectedTable, tableNoteDraft);
      if (!result.success) {
        showToast('Not kaydedilemedi, tekrar deneyin');
        return;
      }
      window.print();
      onNavigate('tables');
    } else {
      setTimeout(() => window.print(), 0);
    }
  }

  // ---- Ürün listesi filtreleme ----
  const { filteredProducts, groupedProducts, headerTitle, productCount } = useMemo(() => {
    const activeProducts = products.filter((p) => p.durum !== 'PASIF');
    const q = searchQuery.toLowerCase();
    let filtered;
    let title;
    if (q) {
      title = `Arama: "${searchQuery}"`;
      filtered = activeProducts.filter((p) => p.ad.toLowerCase().includes(q));
    } else {
      title = activeCategory;
      filtered = activeProducts.filter((p) => p.kategori === activeCategory);
    }
    const subOrderMap = new Map(subcategories.map((s) => [`${s.kategori}|${s.name}`, s.menuSirasi]));
    const subOrder = (p) => subOrderMap.get(`${p.kategori}|${p.altKategori}`) ?? 50;
    // "Az X" varyantı, kendi menuSirasi'si ne olursa olsun (Sheet'ten toplu içe aktarımda
    // parent'la eşleşmemiş olabilir), her zaman PARENT'ının sırasını VE adını kullanır —
    // böylece normal ürün ve Az'ı her durumda yan yana durur (aynı menuSirasi'yi paylaşan
    // başka ürün aileleri araya girip karıştırmasın diye isim de sıralamaya katılıyor).
    const byId = new Map(products.map((p) => [p.id, p]));
    function effectiveOrder(p) {
      if (p.isAzVariant && p.parentId != null) {
        const parent = byId.get(p.parentId);
        if (parent) return { sirasi: parent.menuSirasi ?? 50, baseAd: parent.ad, isAz: 1 };
      }
      return { sirasi: p.menuSirasi ?? 50, baseAd: p.ad, isAz: 0 };
    }
    filtered = [...filtered].sort((a, b) => {
      const oa = effectiveOrder(a);
      const ob = effectiveOrder(b);
      return subOrder(a) - subOrder(b)
        || oa.sirasi - ob.sirasi
        || oa.baseAd.localeCompare(ob.baseAd, 'tr')
        || oa.isAz - ob.isAz
        || a.ad.localeCompare(b.ad, 'tr');
    });
    const groups = {};
    filtered.forEach((p) => {
      const sub = p.altKategori || p.kategori || 'Genel';
      (groups[sub] = groups[sub] || []).push(p);
    });
    return { filteredProducts: filtered, groupedProducts: groups, headerTitle: title, productCount: filtered.length };
  }, [products, searchQuery, activeCategory, subcategories]);

  const favoriteProducts = products.filter((p) => favorites.includes(p.id) && p.durum !== 'PASIF');

  // Sadece paket ekranında: paketçiden gelen bildirimler (en yeni önce).
  const isPaketEkrani = selectedTable.startsWith('Paket ');
  const paketciHareketleri = isPaketEkrani
    ? paketTeslimatlari.filter((h) => h.paketAdi === selectedTable).sort((a, b) => b.ts - a.ts)
    : [];
  const bekleyenHareket = paketciHareketleri.find((h) => h.durum === 'bekliyor');

  function openRejectPrompt(hareketId) {
    setGenericModal({
      title: 'Teslimatı reddet — sebep yaz',
      placeholder: 'Örn: Adres yanlış, tekrar gönder',
      showInput: true,
      onConfirm: (text) => {
        if (!text.trim()) return;
        reddetPaketTeslimat(hareketId, text.trim());
      },
    });
  }

  return (
    <div className="ds-shell">
      <div className="ds-body">
        {/* ANA GÖVDE */}
        <main className="ds-main">
          <header className="ds-header">
            <div className="ds-header-actions">
              {isPaketEkrani ? (
                <button className="ds-header-send-btn" onClick={handleSend}>
                  <Send size={16} /> Gönder
                </button>
              ) : (
                <button className="ds-header-send-btn" onClick={handleSend}>
                  <ArrowLeft size={16} /> {selectedTable === QUICK_SALE ? 'Geri Dön' : 'Masa'}
                </button>
              )}
              <button disabled={isOrderEmpty} className="ds-header-print-btn" onClick={handlePrint}>
                <Printer size={16} /> Yazdır
              </button>
              <button
                disabled={isOrderEmpty || (isPaketEkrani && !!tableBosvars[selectedTable])}
                className="ds-header-pay-btn"
                onClick={() => { setShowChangeCalc(false); setReceivedAmount(''); setPayMode(true); }}
                title={isPaketEkrani && !!tableBosvars[selectedTable] ? 'Boş Var tiki kaldırılmadan ödeme alınamaz' : undefined}
              >
                <span className="pay-icon-block"><Wallet size={17} /></span>
                <span className="pay-text-block">Ödeme Al</span>
              </button>
            </div>
            <div className="ds-header-table">
              <button
                className="ds-table-select-mini"
                onClick={() => { setOccupiedConfirmTable(null); setTablePickerOpen((v) => !v); }}
              >
                <span>
                  {selectedTable} {currentOrder.length > 0 ? `(${TL(getCurrentDraftTotal())})` : '[Boş]'}
                </span>
                <ChevronDown size={14} />
              </button>
              {tablePickerOpen && (
                <div className="ds-modal-overlay" onClick={() => setTablePickerOpen(false)}>
                  <div className="ds-modal ds-table-picker-modal" onClick={(e) => e.stopPropagation()}>
                    {occupiedConfirmTable ? (
                      <>
                        <div className="ds-modal-head">
                          <h3><AlertTriangle size={15} /> Dikkat</h3>
                          <button className="ds-modal-x" onClick={() => setOccupiedConfirmTable(null)}><X size={16} /></button>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--ink-muted)', lineHeight: 1.5, margin: '0 0 16px' }}>
                          <strong>{occupiedConfirmTable}</strong> şu an başka bir cihazda açık görünüyor. Aynı anda iki cihazdan
                          düzenlemek çakışmaya yol açabilir. Yine de girmek istiyor musun?
                        </p>
                        <div className="ds-modal-footer two">
                          <button className="ds-secondary-btn" onClick={() => setOccupiedConfirmTable(null)}>Vazgeç</button>
                          <button
                            className="ds-primary-btn"
                            onClick={() => {
                              setSelectedTable(occupiedConfirmTable);
                              setOccupiedConfirmTable(null);
                              setTablePickerOpen(false);
                            }}
                          >
                            Yine de Gir
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="ds-modal-head">
                          <h3>Masa Seç</h3>
                          <button className="ds-modal-x" onClick={() => setTablePickerOpen(false)}><X size={16} /></button>
                        </div>
                        <div className="ds-table-picker-list" ref={tablePickerListRef}>
                          {allTables.map((t) => {
                            const isCurrent = t === selectedTable;
                            const tot = isCurrent ? getCurrentDraftTotal() : getTableTotal(t);
                            const hasOrder = isCurrent ? currentOrder.length > 0 : orders[t] && orders[t].length > 0;
                            const note = tableNotes[t];
                            const occupied = isTableOccupiedElsewhere(t);
                            return (
                              <button
                                key={t}
                                className={t === selectedTable ? 'active' : ''}
                                onClick={() => {
                                  if (occupied) setOccupiedConfirmTable(t);
                                  else { setSelectedTable(t); setTablePickerOpen(false); }
                                }}
                              >
                                <span className="name">
                                  {t}
                                  {occupied && <span className="ds-occupied-dot" title="Başka cihazda açık" />}
                                </span>
                                <span className="meta">
                                  {hasOrder ? TL(tot) : 'Boş'}
                                  {note ? ` — ${note}` : ''}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="ds-table-picker-scrollbtns">
                          <button onClick={() => scrollByPage(tablePickerListRef, -1)}><ChevronUp size={16} /></button>
                          <button onClick={() => scrollByPage(tablePickerListRef, 1)}><ChevronDown size={16} /></button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
              <button className="ds-mini-btn" onClick={handleTableTransfer} title="Masayı taşı"><ArrowLeftRight size={15} /></button>
              <button className="ds-mini-btn purple" onClick={handleTableMerge} title="Masaları birleştir"><Link2 size={15} /></button>
            </div>
            <div className="ds-header-note">
              <button className="ds-paste-btn" onClick={pasteToTableNote} title="Panodan yapıştır"><ClipboardPaste size={14} /></button>
              <input
                type="text"
                placeholder="Masa notu..."
                value={tableNoteDraft}
                onChange={(e) => setTableNoteDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendTableNote()}
              />
              {isPaketEkrani && (
                <BosVarPanel
                  paketAdi={selectedTable}
                  bosvarTik={!!tableBosvars[selectedTable]}
                  onTikDegis={(val) => setBosvarTik(selectedTable, val)}
                />
              )}
            </div>
          </header>

          {/* KATEGORİ ŞERİDİ */}
          <div className="ds-category-strip">
            {categories.map((cat) => {
              const isActive = cat === activeCategory && !searchQuery;
              return (
                <button
                  key={cat}
                  className={`ds-cat-card ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setActiveCategory(cat);
                    setSearchQuery('');
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* FAVORİLER */}
          <section className="ds-favorites">
            <button className="ds-edit-fav-btn" onClick={() => setFavModalOpen(true)} title="Favorileri Düzenle">
              <Star size={16} />
            </button>
            <div className="ds-favorites-row">
              {favoriteProducts.length === 0 && (
                <span className="ds-favorites-empty">Favori yok — düzenlemek için yıldıza dokun</span>
              )}
              {favoriteProducts.map((product) => (
                <button key={product.id} className="ds-fav-chip" onClick={() => addProductToOrder(product)}>
                  <span className="ds-fav-chip-name">{product.ad}</span>
                  <span className="ds-fav-chip-price">{TL(product.fiyat)}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ÜRÜN GRID */}
          <div className="ds-products-wrap">
            <div className={`ds-products ${activeCategory === 'SOĞUK SANDVİÇ' && !searchQuery ? 'split-active' : ''}`} ref={productsScrollRef}>
              {Object.keys(groupedProducts).length === 0 && (
                <div className="ds-empty">Aradığınız kriterde ürün bulunamadı.</div>
              )}

              {/* SOĞUK SANDVİÇ: Büyük/Küçük alt kategorileri (ve "Menü Sandviç Büyük/Küçük" gibi
                  isminde büyük/küçük geçen her alt kategori) sol/sağ iki ayrı panelde gösterilir. */}
              {activeCategory === 'SOĞUK SANDVİÇ' && !searchQuery ? (
                <div className="ds-split-cols">
                  {['büyük', 'küçük'].map((yon) => (
                    <div className={`ds-split-col ${yon}`} key={yon} ref={yon === 'büyük' ? bigColScrollRef : smallColScrollRef}>
                      <div className="ds-split-col-head">
                        <h3 className="ds-split-col-title">
                          <button
                            className={`ds-default-cat-star ${defaultCategory === activeCategory ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); setDefaultCategory(activeCategory); }}
                            title="Bu kategoriyi açılış kategorisi yap"
                          >
                            <Star size={14} fill={defaultCategory === activeCategory ? 'currentColor' : 'none'} />
                          </button>
                          {yon === 'büyük' ? 'BÜYÜK SANDVİÇ' : 'KÜÇÜK SANDVİÇ'}
                        </h3>
                        <div className="ds-split-col-scrollbtns">
                          <button onClick={() => scrollByPage(yon === 'büyük' ? bigColScrollRef : smallColScrollRef, -1)}><ChevronUp size={22} /></button>
                          <button onClick={() => scrollByPage(yon === 'büyük' ? bigColScrollRef : smallColScrollRef, 1)}><ChevronDown size={22} /></button>
                        </div>
                      </div>
                      {Object.entries(groupedProducts)
                        .filter(([subCat]) => (subCat || '').toLocaleLowerCase('tr-TR').includes(yon))
                        .map(([subCat, items]) => (
                          <div key={subCat} className="ds-product-group">
                            {subCat.toLocaleLowerCase('tr-TR') !== `${yon} sandviç` && (
                              <h3 className="ds-subcat-label">{subCat}</h3>
                            )}
                            <div className="ds-product-grid">
                              {items.map((product) => (
                                <ProductButton
                                  key={product.id}
                                  product={product}
                                  category={getCategoryFor(product)}
                                  isFav={favorites.includes(product.id)}
                                  onAdd={addProductToOrder}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              ) : (
                Object.entries(groupedProducts).map(([subCat, items]) => (
                <div key={subCat} className="ds-product-group">
                  {subCat && subCat !== 'Genel' && (
                    <h3 className="ds-subcat-label">
                      <button
                        className={`ds-default-cat-star ${defaultCategory === activeCategory ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setDefaultCategory(activeCategory); }}
                        title="Bu kategoriyi açılış kategorisi yap"
                      >
                        <Star size={14} fill={defaultCategory === activeCategory ? 'currentColor' : 'none'} />
                      </button>
                      {subCat}
                    </h3>
                  )}
                  <div className={`ds-product-grid ${activeCategory === 'KAHVALTI' ? 'kahvalti-grid' : ''} ${activeCategory === 'YEMEKLER' ? 'yemekler-grid' : ''}`}>
                    {items.map((product, idx) => {
                      // "Az X" varyantı her zaman kendi ana ürününün hemen ardından geliyor
                      // (yukarıdaki sıralama zaten garanti ediyor). Az varyantını AYRI bir grid
                      // hücresi olarak render ETMİYORUZ (aşağıda gizleniyor) — bunun yerine ana
                      // ürünle birlikte TEK bir wrapper'a sarıp, o wrapper tek grid hücresi kaplıyor,
                      // içinde flex ile %75 (ana) / %25 (az) bölünüyor.
                      const isAz = product.isAzVariant;
                      const nextIsAzPair = !isAz && items[idx + 1]?.isAzVariant && items[idx + 1]?.parentId === product.id;
                      const prevIsAzPair = isAz && items[idx - 1] && product.parentId === items[idx - 1].id;

                      // Az varyantı, ana ürünün render'ı sırasında wrapper içine zaten çizildi — tekrar çizme.
                      if (prevIsAzPair) return null;

                      if (nextIsAzPair) {
                        const azProduct = items[idx + 1];
                        const pairColor = resolveButtonStyle(product, getCategoryFor(product)).backgroundColor;
                        return (
                          <div key={product.id} className="pb-pair-wrapper">
                            <ProductButton
                              product={product}
                              category={getCategoryFor(product)}
                              isFav={favorites.includes(product.id)}
                              onAdd={addProductToOrder}
                              pairPosition="main"
                            />
                            <ProductButton
                              product={azProduct}
                              category={getCategoryFor(azProduct)}
                              isFav={favorites.includes(azProduct.id)}
                              onAdd={addProductToOrder}
                              pairPosition="az"
                              pairColor={pairColor}
                            />
                          </div>
                        );
                      }

                      return (
                        <ProductButton
                          key={product.id}
                          product={product}
                          category={getCategoryFor(product)}
                          isFav={favorites.includes(product.id)}
                          onAdd={addProductToOrder}
                          pairPosition={null}
                          pairColor={null}
                        />
                      );
                    })}
                  </div>
                </div>
                ))
              )}
            </div>
            {!(activeCategory === 'SOĞUK SANDVİÇ' && !searchQuery) && (
              <div className="ds-products-scrollbtns">
                <button onClick={() => scrollByPage(productsScrollRef, -1)}><ChevronUp size={26} /></button>
                <button onClick={() => scrollByPage(productsScrollRef, 1)}><ChevronDown size={26} /></button>
              </div>
            )}
          </div>
        </main>

        {/* SİPARİŞ / SEPET PANELİ */}
        <aside className="ds-order-panel">
          <div
            ref={orderListRef}
            className={`ds-order-list ${currentOrder.length > 14 ? 'ultra-compact' : currentOrder.length > 7 ? 'compact' : ''}`}
          >
            {currentOrder.length === 0 && <div className="ds-empty">Sipariş boş — ürüne dokunarak ekleyin</div>}
            {currentOrder.map((item, index) => {
              if (item.note) {
                return (
                  <div key={item.id} className="ds-order-line note">
                    <button className="ds-remove-btn" onClick={() => removeItem(item.id)}><X size={16} /></button>
                    <span className="note-mid">"{item.ad}"</span>
                    <button className="ds-note-edit-btn" onClick={() => editNoteItem(item)} title="Notu Düzenle"><Pencil size={14} /></button>
                  </div>
                );
              }
              const isDup = isConsecutiveDuplicate(currentOrder, index);
              const styleClass = item.selected ? 'selected' : isDup ? 'duplicate' : '';
              return (
                <div key={item.id} className={`ds-order-line ${styleClass}`}>
                  <button className="ds-remove-btn" onClick={() => removeItem(item.id)}><X size={16} /></button>
                  <div className="ds-order-line-mid" onClick={() => toggleSelectItem(item.id)}>
                    <span className="ds-order-line-name">
                      {item.bicakGerekli && <span className="ds-bicak-mark" title="Bıçak gerekli">🔪</span>}
                      {item.ekmekGerekli && <span className="ds-ekmek-mark" title="Ekmek gerekli">🥖</span>}
                      {getDisplayName(item)}
                    </span>
                    {item.selected && <span className="ds-tag selected"><Check size={10} /> SEÇİLİ</span>}                    {!item.selected && isDup && <span className="ds-tag duplicate"><AlertTriangle size={10} /> İKAZ</span>}
                  </div>
                    <span className="ds-order-line-price" onClick={() => openPriceModal(item)}>
                    {Math.round(item.fiyat || 0).toLocaleString('tr-TR')} ₺
                  </span>
                </div>
              );
            })}
          </div>

          <div className="ds-order-tools">
            <div className="ds-order-tools-row">
              <button className="ds-paste-btn ds-paste-btn-lg" onClick={pasteKitchenNote} title="Panodan not olarak yapıştır"><ClipboardPaste size={22} /></button>
              <button className="ds-note-btn" onClick={openKitchenNoteModal}><StickyNote size={13} /> + Mutfağa Not Ekle</button>
              <button className="ds-numpad-toggle" onClick={() => setNumpadOpen(true)}><Percent size={13} /> İndirim Tuşluğu</button>
            </div>
          </div>

          {selectedItems.length > 0 && (
            <div className="ds-selection-bar">
              <span>{selectedItems.length} ürün seçili — {TL(selectedTotal)}</span>
              <button onClick={handleClearSelection}>Seçimi kaldır</button>
            </div>
          )}

          <div className="ds-total-box">
            {discountAmount > 0 && (
              <div className="ds-discount-row">
                <span>Uygulanan İndirim:</span>
                <span>-{TL(discountAmount)}</span>
              </div>
            )}
            <div className="ds-total-row">
              <span>TOPLAM</span>
              <span>{TL(finalTotal)}</span>
            </div>
            {(selectedItems.length > 0 || currentOrder.length > 0) && (
              <div className="ds-payment-hint">
                {selectedItems.length > 0
                  ? `Ödeme yalnızca seçili ${selectedItems.length} ürüne uygulanacak`
                  : 'Ödeme tüm siparişe uygulanacak'}
              </div>
            )}
            {isPaketEkrani && bosvarBildirimleri.some((b) => b.paketAdi === selectedTable) && (
              <div className="bv-bildirim" style={{ marginTop: 6 }}>
                {(() => {
                  const b = bosvarBildirimleri.filter((x) => x.paketAdi === selectedTable).sort((a, c) => c.ts - a.ts)[0];
                  return <><PackageOpen size={11} /> {b.paketciAdi} — Boşu Aldım dedi <span className="bv-bildirim-saat">{new Date(b.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span></>;
                })()}
              </div>
            )}
          </div>
          {isPaketEkrani && paketciHareketleri.length > 0 && (
            <div className="ds-courier-panel">
              <h4><Package size={13} /> Paketçi Bildirimi</h4>
              {bekleyenHareket && (
                <div className="ds-courier-pending">
                  <div className="ds-courier-row">
                    <span className="ds-courier-tag wait">Onay bekliyor</span>
                    <span>{bekleyenHareket.tip === 'teslim_edildi' ? 'Teslim Edildi' : `Kısmi Ödeme: ${TL(bekleyenHareket.tutar)} (${bekleyenHareket.odemeYontemi})`}</span>
                  </div>
                  <div className="ds-courier-meta">
                    <Package size={11} /> {bekleyenHareket.paketciAdi} — {new Date(bekleyenHareket.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {bekleyenHareket.notMetni && <div className="ds-courier-note">"{bekleyenHareket.notMetni}"</div>}
                  {bekleyenHareket.fotoUrl && (
                    <button onClick={() => setPhotoModalUrl(bekleyenHareket.fotoUrl)} className="ds-courier-foto-link">
                      Fotoğrafı Gör
                    </button>
                  )}
                  <div className="ds-courier-actions">
                    <button className="ds-courier-approve" onClick={() => onaylaPaketTeslimat(bekleyenHareket.id)}>
                      <Check size={14} /> Onayla
                    </button>
                    <button className="ds-courier-reject" onClick={() => openRejectPrompt(bekleyenHareket.id)}>
                      <X size={14} /> Reddet
                    </button>
                  </div>
                </div>
              )}
              <div className="ds-courier-history">
                {paketciHareketleri.map((h) => (
                  <div key={h.id} className="ds-courier-history-row">
                    <span className={`ds-courier-tag ${h.durum}`}>
                      {h.durum === 'bekliyor' ? 'Bekliyor' : h.durum === 'onaylandi' ? 'Onaylandı' : 'Reddedildi'}
                    </span>
                    <span>{h.tip === 'teslim_edildi' ? 'Teslim Edildi' : `Kısmi: ${TL(h.tutar)}`} — {h.paketciAdi}</span>
                    {h.fotoUrl && (
                      <button className="ds-courier-history-foto" onClick={() => setPhotoModalUrl(h.fotoUrl)}>Foto</button>
                    )}
                    {h.onayNotu && <span className="ds-courier-reject-note">({h.onayNotu})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {toast && <div className="ds-toast">{toast}</div>}

      {/* FAVORİLERİ DÜZENLE MODALI */}
      {favModalOpen && (
        <div className="ds-modal-overlay" onClick={() => setFavModalOpen(false)}>
          <div className="ds-modal ds-fav-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ds-modal-head">
              <h3><Star size={14} /> Hızlı Favorileri Düzenle</h3>
              <button className="ds-modal-x" onClick={() => setFavModalOpen(false)}><X size={16} /></button>
            </div>
            <input
              type="text"
              className="ds-modal-search"
              placeholder="Modalda ürün ara..."
              value={favModalSearch}
              onChange={(e) => setFavModalSearch(e.target.value.toLowerCase())}
            />
            <div className="ds-modal-cat-pills">
              {['Tümü', ...categories.filter((c) => c !== 'TÜMÜ')].map((cat) => (
                <button
                  key={cat}
                  className={favModalCategory === cat ? 'active' : ''}
                  onClick={() => setFavModalCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            <p className="ds-modal-hint">Favori paneline eklemek veya çıkarmak istediğiniz ürünlerin butonuna dokunun:</p>
            <div className="ds-fav-modal-list">
              {products
                .filter((p) => favModalCategory === 'Tümü' || p.kategori === favModalCategory)
                .filter((p) => !favModalSearch || p.ad.toLowerCase().includes(favModalSearch))
                .map((prod) => {
                  const isFav = favorites.includes(prod.id);
                  return (
                    <div key={prod.id} className={`ds-fav-modal-item ${isFav ? 'active' : ''}`} onClick={() => toggleFavorite(prod.id)}>
                      <div className="ds-fav-modal-item-left">
                        <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
                        <div>
                          <p className="name">{prod.ad}</p>
                          <p className="cat">{prod.kategori}{prod.altKategori ? ` • ${prod.altKategori}` : ''}</p>
                        </div>
                      </div>
                      <button className={isFav ? 'remove' : 'add'}>{isFav ? 'Çıkar' : '+ Favori Yap'}</button>
                    </div>
                  );
                })}
            </div>
            <div className="ds-modal-footer">
              <button className="ds-primary-btn" onClick={() => setFavModalOpen(false)}>Tamam ve Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* FİYAT DEĞİŞTİRME MODALI */}
      {priceModal && (
        <div className="ds-modal-overlay" onClick={() => setPriceModal(null)}>
          <div className="ds-modal ds-price-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ds-modal-head">
              <h3>{priceModal.item.ad} - Fiyat Değiştir</h3>
              <button className="ds-modal-x" onClick={() => setPriceModal(null)}><X size={16} /></button>
            </div>
            <div className="ds-price-display">
              <span className="label">YENİ FİYAT (₺):</span>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                className="value-input"
                value={priceModal.value}
                onChange={(e) => setPriceModal((pm) => ({ ...pm, value: e.target.value.replace(/[^0-9,]/g, '') }))}
                placeholder="0"
              />
            </div>
            <div className="ds-price-numgrid">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0'].map((n) => (
                <button key={n} onClick={() => pressPriceNum(n)}>{n}</button>
              ))}
              <button className="clear" onClick={() => setPriceModal((pm) => ({ ...pm, value: '' }))}>C</button>
            </div>
            <div className="ds-modal-footer two">
              <button className="ds-secondary-btn" onClick={() => setPriceModal(null)}>Vazgeç</button>
              <button className="ds-primary-btn" onClick={confirmPriceModal}>Onayla</button>
            </div>
          </div>
        </div>
      )}

      {/* İNDİRİM TUŞLUĞU MODALI */}
      {numpadOpen && (
        <div className="ds-modal-overlay" onClick={() => setNumpadOpen(false)}>
          <div className="ds-modal ds-numpad-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ds-modal-head">
              <h3><Percent size={16} /> İndirim Tuşluğu</h3>
              <button className="ds-modal-x" onClick={() => setNumpadOpen(false)}><X size={16} /></button>
            </div>
            <div className="ds-numpad-box">
              <div className="ds-numpad-display-row">
                <span>GİRİLEN DEĞER:</span>
                <input
                  ref={numpadInputRef}
                  type="text"
                  inputMode="decimal"
                  value={numpadValue}
                  onChange={(e) => setNumpadValue(e.target.value.replace(/[^0-9.,]/g, ''))}
                  placeholder="0"
                />
              </div>
              <div className="ds-numpad-grid">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((n) => (
                  <button key={n} onClick={() => pressNumpad(n)}>{n}</button>
                ))}
              </div>
              <div className="ds-numpad-actions">
                <button className="blue" onClick={() => applyDiscount('percent')}>% İndirim Yap</button>
                <button className="green" onClick={() => applyDiscount('amount')}>₺ İndirim Yap</button>
                <button className="red" onClick={() => setNumpadValue('')}>C</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ÖDEME YÖNTEMİ MODALI */}
      {payMode && (
        <div className="ds-modal-overlay" onClick={() => setPayMode(false)}>
          <div className="ds-pay-modal-wrap" onClick={(e) => e.stopPropagation()}>
            <div className="ds-modal ds-pay-modal">
              <div className="ds-modal-head">
                <h3>Ödeme Yöntemi Seç</h3>
                <button className="ds-modal-x" onClick={() => setPayMode(false)}><X size={16} /></button>
              </div>
              <div className="ds-pay-modal-total">
                <span>Ödenecek Tutar</span>
                <strong>{TL(selectedItems.length > 0 ? selectedTotal : finalTotal)}</strong>
              </div>

              <button className="ds-change-calc-toggle" onClick={() => setShowChangeCalc((v) => !v)}>
                <Calculator size={15} /> Para Üstü Hesapla {showChangeCalc ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              <div className="ds-pay-grid">
                <button className="cash" onClick={() => handlePay('NAKİT')}>
                  <Banknote size={36} /><span className="lbl">Nakit</span>
                </button>
                <button className="card" onClick={() => handlePay('KREDİ KARTI')}>
                  <CreditCard size={36} /><span className="lbl">Kredi Kartı</span>
                </button>
                <button className="meal" onClick={() => handlePay('YEMEK KARTI')}>
                  <UtensilsCrossed size={36} /><span className="lbl">Yemek Kartı</span>
                </button>
                <button className="credit" onClick={openCariPicker}>
                  <BookOpen size={36} /><span className="lbl">Cari</span>
                </button>
              </div>
              <button className="ds-pay-back-btn" onClick={() => setPayMode(false)}>
                <Undo2 size={28} /> Geri
              </button>
            </div>

            {showChangeCalc && (() => {
              const odenecek = selectedItems.length > 0 ? selectedTotal : finalTotal;
              const alinan = Number(receivedAmount) || 0;
              const paraUstu = Math.max(0, alinan - odenecek);
              return (
                <div className="ds-modal ds-change-calc-panel">
                  <div className="ds-modal-head">
                    <h3>Para Üstü Hesapla</h3>
                    <button className="ds-modal-x" onClick={() => setShowChangeCalc(false)}><X size={16} /></button>
                  </div>
                  <div className="ds-change-calc">
                    <div className="ds-change-quick-grid">
                      {[50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800].map((amt) => (
                        <button key={amt} onClick={() => setReceivedAmount(String(amt))}>{amt}</button>
                      ))}
                    </div>
                    <div className="ds-change-manual">
                      <span>Alınan Tutar</span>
                      <div className="ds-change-manual-input">{receivedAmount || '0'} ₺</div>
                    </div>
                    <div className="ds-change-result">
                      <span>Para Üstü</span>
                      <strong>{TL(paraUstu)}</strong>
                    </div>
                    <div className="ds-change-numpad">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
                        <button key={k} onClick={() => setReceivedAmount((prev) => (prev === '0' ? k : prev + k))}>{k}</button>
                      ))}
                      <button className="clear" onClick={() => setReceivedAmount('')}><Delete size={16} /></button>
                      <button onClick={() => setReceivedAmount((prev) => (prev === '0' ? '0' : prev + '0'))}>0</button>
                      <button className="clear" onClick={() => setReceivedAmount((prev) => prev.slice(0, -1))}>⌫</button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* CARİ SEÇ MODALI */}
      {cariPickerOpen && (
        <div className="ds-modal-overlay" onClick={() => setCariPickerOpen(false)}>
          <div className="ds-modal ds-table-picker-modal ds-cari-modal" onClick={(e) => e.stopPropagation()}>

            {cariConfirm ? (
              <>
                <div className="ds-modal-head">
                  <h3>{cariWaPhoneEntry ? 'Numara Kaydet' : 'Cariye Gönder'}</h3>
                  <button className="ds-modal-x" onClick={() => { setCariConfirm(null); setCariWaPhoneEntry(false); }}><X size={16} /></button>
                </div>

                {!cariWaPhoneEntry ? (
                  <>
                    <div className="ds-cari-confirm-name">{cariConfirm.cari.ad.toLocaleUpperCase('tr-TR')}</div>
                    <div className="ds-cari-confirm-actions">
                      <button className="ds-secondary-btn" onClick={() => setCariConfirm(null)}>İptal</button>
                      <button className="ds-primary-btn" onClick={confirmSendPlain}>Onayla</button>
                    </div>
                    {cariConfirm.cari.tip === 'bireysel' && (
                      <button className="ds-cari-wa-btn" onClick={confirmSendWithWhatsapp}>
                        <MessageCircle size={15} />
                        {cariConfirm.cari.telefon ? 'WhatsApp\'tan İlet' : 'Kayıtlı Numarası Yok'}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="ds-cari-confirm-name small">{cariConfirm.cari.ad.toLocaleUpperCase('tr-TR')}</div>
                    <div className="ds-cari-phone-entry">
                      <input
                        autoFocus
                        type="tel"
                        placeholder="0532 123 45 67"
                        value={cariWaPhoneDraft}
                        onChange={(e) => setCariWaPhoneDraft(e.target.value)}
                      />
                      <button onClick={pasteIntoWaPhoneDraft} title="Panodan yapıştır"><ClipboardPaste size={15} /></button>
                    </div>
                    <div className="ds-cari-confirm-actions">
                      <button className="ds-secondary-btn" onClick={() => setCariWaPhoneEntry(false)}>Geri</button>
                      <button className="ds-primary-btn" disabled={!cariWaPhoneDraft.trim()} onClick={saveWaPhoneAndSend}>Kaydet ve Gönder</button>
                    </div>
                  </>
                )}
              </>
            ) : cariYeniForm ? (
              <>
                <div className="ds-modal-head">
                  <h3>Yeni Cari</h3>
                  <button className="ds-modal-x" onClick={() => setCariPickerOpen(false)}><X size={16} /></button>
                </div>
                <input
                  autoFocus
                  className="ds-modal-search"
                  placeholder="Ad Soyad"
                  value={cariYeniForm.ad}
                  onChange={(e) => setCariYeniForm((f) => ({ ...f, ad: e.target.value }))}
                />
                <input
                  className="ds-modal-search"
                  placeholder="Telefon (opsiyonel)"
                  value={cariYeniForm.telefon}
                  onChange={(e) => setCariYeniForm((f) => ({ ...f, telefon: e.target.value }))}
                />
                <input
                  className="ds-modal-search"
                  placeholder="Adres (opsiyonel)"
                  value={cariYeniForm.adres}
                  onChange={(e) => setCariYeniForm((f) => ({ ...f, adres: e.target.value }))}
                />
                <div className="ds-modal-footer two">
                  <button className="ds-secondary-btn" onClick={() => setCariYeniForm(null)}>Geri</button>
                  <button className="ds-primary-btn" onClick={submitYeniCariFromPos}>Oluştur</button>
                </div>
              </>
            ) : (
              <>
                <div className="ds-modal-head">
                  <h3>Cariye Gönder</h3>
                  <button className="ds-modal-x" onClick={() => setCariPickerOpen(false)}><X size={16} /></button>
                </div>

                {firmaCariler.length > 0 && (
                  <div className="ds-cari-firma-section">
                    <span className="ds-cari-section-label"><Building2 size={11} /> Firmalar</span>
                    <div className="ds-cari-firma-grid">
                      {firmaCariler.map((c) => (
                        <button key={c.id} className="ds-cari-firma-btn" onClick={() => setCariConfirm({ cari: c })}>
                          {c.ad}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <span className="ds-cari-section-label"><User size={11} /> Bireysel</span>
                <input
                  className="ds-modal-search"
                  placeholder="Cari ara..."
                  value={cariSearch}
                  onChange={(e) => setCariSearch(e.target.value)}
                />
                <div className="ds-table-picker-list ds-cari-bireysel-list">
                  {filteredCariler.map((c) => (
                    <div key={c.id} className="ds-cari-bireysel-row">
                      {cariEditRowId === c.id ? (
                        <div className="ds-cari-edit-row">
                          <input
                            placeholder="Telefon"
                            value={cariEditDraft.telefon}
                            onChange={(e) => setCariEditDraft((d) => ({ ...d, telefon: e.target.value }))}
                          />
                          <input
                            placeholder="Adres"
                            value={cariEditDraft.adres}
                            onChange={(e) => setCariEditDraft((d) => ({ ...d, adres: e.target.value }))}
                          />
                          <div className="ds-cari-edit-row-actions">
                            <button onClick={() => setCariEditRowId(null)}>Vazgeç</button>
                            <button className="save" onClick={() => saveCariEditRow(c.id)}>Kaydet</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button className="ds-cari-bireysel-main" onClick={() => setCariConfirm({ cari: c })}>
                            <span className="name">{c.ad}</span>
                            <span className="meta">{c.telefon || 'Numara yok'}</span>
                          </button>
                          <button className="ds-cari-edit-btn" onClick={() => openCariEditRow(c)} title="Düzenle"><Pencil size={13} /></button>
                        </>
                      )}
                    </div>
                  ))}
                  {filteredCariler.length === 0 && (
                    <p style={{ fontSize: '12px', color: 'var(--ink-soft)', fontStyle: 'italic', padding: '8px 4px' }}>
                      Sonuç yok
                    </p>
                  )}
                </div>
                <button className="ds-primary-btn" style={{ width: '100%', marginTop: '10px' }} onClick={() => setCariYeniForm({ ad: '', telefon: '', adres: '' })}>
                  + Yeni Cari
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* GENEL DİYALOG MODALI */}
      {genericModal && (
        <GenericModal modal={genericModal} onClose={() => setGenericModal(null)} />
      )}

      {photoModalUrl && (
        <div className="ds-modal-overlay" onClick={() => setPhotoModalUrl(null)}>
          <div className="ds-photo-modal" onClick={(e) => e.stopPropagation()}>
            <button className="ds-modal-x" onClick={() => setPhotoModalUrl(null)}><X size={18} /></button>
            <img src={photoModalUrl} alt="Paketçi fotoğrafı" />
          </div>
        </div>
      )}

      {/* YAZDIRMA ŞABLONU */}
      <div id="print-receipt" ref={printRef}>
        <h2>{selectedTable}</h2>
        {tableNoteDraft && <div className="print-note">{tableNoteDraft}</div>}
        <div className="print-meta">
          <span>{new Date().toLocaleDateString('tr-TR')}</span>
          <span>{new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="print-items">
          {currentOrder.map((item) => (
            <div key={item.id} className="print-row">
              <span>
                {item.bicakGerekli && <span className="print-bicak-mark">🔪</span>}
                {item.ekmekGerekli && <span className="print-ekmek-mark">🥖</span>}
                {item.note ? `• ${item.ad}` : item.ad}
              </span>
              <span>{item.note ? '' : TL(item.fiyat)}</span>
            </div>
          ))}
        </div>
        <div className="print-total-box">
          {discountAmount > 0 && (
            <div className="print-row">
              <span>İNDİRİM</span>
              <span>-{TL(discountAmount)}</span>
            </div>
          )}
          <div className="print-row big">
            <span>TOPLAM</span>
            <span>{TL(finalTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GenericModal({ modal, onClose }) {
  const [inputVal, setInputVal] = useState(modal.defaultValue || '');
  const [selectVal, setSelectVal] = useState(modal.selectOptions?.[0]?.value || '');

  function confirm() {
    if (modal.onConfirm) modal.onConfirm(inputVal, selectVal);
    onClose();
  }

  return (
    <div className="ds-modal-overlay" onClick={onClose}>
      <div className="ds-modal ds-generic-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{modal.title}</h3>
        {modal.showInput && (
          <textarea
            autoFocus
            rows={2}
            placeholder={modal.placeholder || 'Metin yazın...'}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                confirm();
              }
            }}
          />
        )}
        {modal.showSelect && (
          <div className="ds-modal-select-wrap">
            <label>Hedef Masa Seçin:</label>
            <select value={selectVal} onChange={(e) => setSelectVal(e.target.value)}>
              {modal.selectOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
        <div className="ds-modal-footer two">
          <button className="ds-secondary-btn" onClick={onClose}>Vazgeç</button>
          <button className="ds-primary-btn" onClick={confirm}>Onayla</button>
        </div>
      </div>
    </div>
  );
}