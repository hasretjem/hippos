export function rowToProduct(r) {
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
  };
}

export function rowToCategory(r) {
  return { name: r.name, menuSirasi: r.menu_sirasi, sabit: r.sabit };
}

export function rowToSubcategory(r) {
  return { kategori: r.kategori, name: r.name, menuSirasi: r.menu_sirasi };
}

export function rowToSale(r) {
  return { id: r.id, ts: Number(r.ts), table: r.table_name, amount: Number(r.amount), method: r.method, itemsCount: r.items_count, date: r.date_display };
}

export function rowToSoldItem(r) {
  return { id: r.id, ts: Number(r.ts), ad: r.ad, fiyat: Number(r.fiyat), kategori: r.kategori || '', altKategori: r.alt_kategori || '', table: r.table_name };
}

export function rowToAction(r) {
  return { id: r.id, description: r.description, time: r.time_display, snapshot: r.snapshot };
}

export function rowToCari(r) {
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

export function rowToHareket(r) {
  return { id: r.id, cariId: r.cari_id, ts: Number(r.ts), urunler: r.urunler || [], toplam: Number(r.toplam), mutfakNotu: r.mutfak_notu || '' };
}

export function rowToOdeme(r) {
  return { id: r.id, cariId: r.cari_id, ts: Number(r.ts), tutar: Number(r.tutar), tur: r.tur };
}

export function rowToFatura(r) {
  return { id: r.id, cariId: r.cari_id, tarih: r.tarih, faturaNo: r.fatura_no, tutar: Number(r.tutar), eklenmeTs: Number(r.eklenme_ts) };
}

export function rowToGecmis(r) {
  return { id: r.id, cariId: r.cari_id, ts: Number(r.ts), toplamTutar: Number(r.toplam_tutar), aciklama: r.aciklama };
}

export function rowToPaketTeslimat(r) {
  return {
    id: r.id,
    paketAdi: r.paket_adi,
    tip: r.tip,
    tutar: r.tutar === null || r.tutar === undefined ? null : Number(r.tutar),
    odemeYontemi: r.odeme_yontemi,
    notMetni: r.not_metni,
    fotoUrl: r.foto_url,
    paketciAdi: r.paketci_adi,
    durum: r.durum,
    onayNotu: r.onay_notu,
    ts: Number(r.ts),
    onayTs: r.onay_ts ? Number(r.onay_ts) : null,
  };
}

export function rowToCariTeslimatBildirim(r) {
  return {
    id: r.id,
    cariId: r.cari_id,
    tip: r.tip,
    tutar: Number(r.tutar),
    odemeYontemi: r.odeme_yontemi,
    notMetni: r.not_metni,
    fotoUrl: r.foto_url,
    paketciAdi: r.paketci_adi,
    durum: r.durum,
    onayNotu: r.onay_notu,
    ts: Number(r.ts),
    onayTs: r.onay_ts ? Number(r.onay_ts) : null,
  };
}
