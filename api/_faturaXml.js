// e-Fatura (UBL-TR) XML okuyucu — Muhasebe1'deki çalışan okuyucunun aynısı, Reçete/Fatura yükleme için ortak modül.
// Dosya adı "_" ile başladığı için Vercel'de ayrı bir fonksiyon sayılmaz (fonksiyon limiti).
// Satırda "efektifBirimFiyatKdvDahil" ve "satirTutariKdvDahil": iskonto düşülmüş + KDV eklenmiş gerçek ödenen tutar.

export function xmlGetTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

// Şirketin kendi VKN'si — fatura satıcı/alıcı taraflarından hangisinin "biz" olduğunu
// (dolayısıyla alış mı satış mı olduğunu) belirlemek için tek güvenilir yöntem bu.
// XML'deki InvoiceTypeCode alanı hem alış hem satış faturalarında aynı değeri taşıyabildiği
// için (örn. ikisi de "SATIS") ona güvenilemiyor.
export const KENDI_VKN = '0851207665';

function parseInvoiceHeader(xml) {
  const id = xmlGetTag(xml, 'cbc:ID');
  const uuid = xmlGetTag(xml, 'cbc:UUID');
  const issueDate = xmlGetTag(xml, 'cbc:IssueDate');
  const typeCode = xmlGetTag(xml, 'cbc:InvoiceTypeCode');

  const supplierBlock = xml.match(/<cac:AccountingSupplierParty>([\s\S]*?)<\/cac:AccountingSupplierParty>/);
  let supplierName = null;
  let supplierVkn = null;
  if (supplierBlock) {
    const nameMatch = supplierBlock[1].match(/<cbc:Name>([^<]*)<\/cbc:Name>/);
    supplierName = nameMatch ? nameMatch[1].trim() : null;
    const vknMatch = supplierBlock[1].match(/<cbc:ID\s+schemeID="(?:VKN|TCKN)">([^<]*)<\/cbc:ID>/);
    supplierVkn = vknMatch ? vknMatch[1].trim() : null;
  }

  const customerBlock = xml.match(/<cac:AccountingCustomerParty>([\s\S]*?)<\/cac:AccountingCustomerParty>/);
  let customerName = null;
  let customerVkn = null;
  if (customerBlock) {
    const nameMatch = customerBlock[1].match(/<cbc:Name>([^<]*)<\/cbc:Name>/);
    customerName = nameMatch ? nameMatch[1].trim() : null;
    const vknMatch = customerBlock[1].match(/<cbc:ID\s+schemeID="(?:VKN|TCKN)">([^<]*)<\/cbc:ID>/);
    customerVkn = vknMatch ? vknMatch[1].trim() : null;
  }

  // yon: satıcı biz isek "satis", alıcı biz isek "alis". İkisi de değilse (VKN eşleşmezse)
  // güvenli tarafta kalıp "alis" varsayılıyor — mevcut akış zaten alış için tasarlandı.
  const yon = supplierVkn === KENDI_VKN ? 'satis' : 'alis';

  const totalBlock = xml.match(/<cac:LegalMonetaryTotal>([\s\S]*?)<\/cac:LegalMonetaryTotal>/);
  let toplamKdvHaric = null, toplamKdvDahil = null, odenecekTutar = null, toplamIskonto = null;
  if (totalBlock) {
    const m1 = totalBlock[1].match(/<cbc:LineExtensionAmount[^>]*>([^<]*)<\/cbc:LineExtensionAmount>/);
    const m2 = totalBlock[1].match(/<cbc:TaxInclusiveAmount[^>]*>([^<]*)<\/cbc:TaxInclusiveAmount>/);
    const m3 = totalBlock[1].match(/<cbc:PayableAmount[^>]*>([^<]*)<\/cbc:PayableAmount>/);
    const m4 = totalBlock[1].match(/<cbc:AllowanceTotalAmount[^>]*>([^<]*)<\/cbc:AllowanceTotalAmount>/);
    toplamKdvHaric = m1 ? Number(m1[1]) : null;
    toplamKdvDahil = m2 ? Number(m2[1]) : null;
    odenecekTutar = m3 ? Number(m3[1]) : null;
    toplamIskonto = m4 ? Number(m4[1]) : null;
  }

  const taxTotalBlock = xml.match(/<cac:TaxTotal>([\s\S]*?)<\/cac:TaxTotal>/);
  let toplamKdvTutari = null;
  if (taxTotalBlock) {
    const m = taxTotalBlock[1].match(/<cbc:TaxAmount[^>]*>([^<]*)<\/cbc:TaxAmount>/);
    toplamKdvTutari = m ? Number(m[1]) : null;
  }

  return {
    faturaNo: id, uuid, tarih: issueDate, tip: typeCode, yon,
    tedarikciAdi: supplierName, tedarikciVkn: supplierVkn,
    aliciAdi: customerName, aliciVkn: customerVkn,
    toplamKdvHaric, toplamKdvDahil, toplamKdvTutari, toplamIskonto, odenecekTutar,
  };
}

const UNIT_CODE_MAP = {
  C62: 'Adet', KGM: 'kg', GRM: 'gr', MGM: 'mg', LTR: 'lt', MLT: 'ml', MTR: 'm', BX: 'Kutu', PA: 'Paket',
};

function parseInvoiceLines(xml) {
  const lineBlocks = xml.match(/<cac:InvoiceLine>([\s\S]*?)<\/cac:InvoiceLine>/g) || [];
  return lineBlocks.map((block, idx) => {
    const siraNo = xmlGetTag(block, 'cbc:ID') || String(idx + 1);
    const note = xmlGetTag(block, 'cbc:Note');
    const qtyMatch = block.match(/<cbc:InvoicedQuantity\s+unitCode="([^"]*)"[^>]*>([^<]*)<\/cbc:InvoicedQuantity>/);
    const unitCode = qtyMatch ? qtyMatch[1] : null;
    const miktar = qtyMatch ? Number(qtyMatch[2]) : null;

    const lineExtMatch = block.match(/<cbc:LineExtensionAmount[^>]*>([^<]*)<\/cbc:LineExtensionAmount>/);
    const satirTutari = lineExtMatch ? Number(lineExtMatch[1]) : null;

    const priceMatch = block.match(/<cac:Price>[\s\S]*?<cbc:PriceAmount[^>]*>([^<]*)<\/cbc:PriceAmount>/);
    const birimFiyat = priceMatch ? Number(priceMatch[1]) : null;

    const itemBlock = block.match(/<cac:Item>([\s\S]*?)<\/cac:Item>/);
    let urunAdi = null, urunKodu = null;
    if (itemBlock) {
      const nameMatch = itemBlock[1].match(/<cbc:Name>([^<]*)<\/cbc:Name>/);
      const descMatch = itemBlock[1].match(/<cbc:Description>([^<]*)<\/cbc:Description>/);
      // Çoğu tedarikçide cbc:Name gerçek ürün adı. Ama bazıları (örn. Beşler Et) buraya
      // ürün KODUNU yazıp asıl adı cbc:Description'a koyuyor — Description doluysa
      // onu tercih ediyoruz, boşsa Name'e düşüyoruz.
      urunAdi = (descMatch && descMatch[1].trim()) ? descMatch[1].trim() : (nameMatch ? nameMatch[1].trim() : null);
      const kodMatch = itemBlock[1].match(/<cac:SellersItemIdentification>\s*<cbc:ID[^>]*>([^<]*)<\/cbc:ID>/);
      urunKodu = kodMatch ? kodMatch[1].trim() : null;
    }

    const taxBlock = block.match(/<cac:TaxTotal>([\s\S]*?)<\/cac:TaxTotal>/);
    let kdvOrani = null, kdvTutari = null, taxableAmountXml = null;
    if (taxBlock) {
      const percentMatch = taxBlock[1].match(/<cbc:Percent>([^<]*)<\/cbc:Percent>/);
      const amountMatch = taxBlock[1].match(/<cbc:TaxAmount[^>]*>([^<]*)<\/cbc:TaxAmount>/);
      const taxableMatch = taxBlock[1].match(/<cbc:TaxableAmount[^>]*>([^<]*)<\/cbc:TaxableAmount>/);
      kdvOrani = percentMatch ? Number(percentMatch[1]) : null;
      kdvTutari = amountMatch ? Number(amountMatch[1]) : null;
      taxableAmountXml = taxableMatch ? Number(taxableMatch[1]) : null;
    }

    const allowanceBlock = block.match(/<cac:AllowanceCharge>([\s\S]*?)<\/cac:AllowanceCharge>/);
    let iskontoOrani = 0, iskontoTutari = 0;
    if (allowanceBlock) {
      const factorMatch = allowanceBlock[1].match(/<cbc:MultiplierFactorNumeric>([^<]*)<\/cbc:MultiplierFactorNumeric>/);
      const amountMatch = allowanceBlock[1].match(/<cbc:Amount[^>]*>([^<]*)<\/cbc:Amount>/);
      const baseAmountMatch = allowanceBlock[1].match(/<cbc:BaseAmount[^>]*>([^<]*)<\/cbc:BaseAmount>/);
      iskontoTutari = amountMatch ? Number(amountMatch[1]) : 0;
      const baseAmount = baseAmountMatch ? Number(baseAmountMatch[1]) : null;
      // DÜZELTME: cbc:MultiplierFactorNumeric'in yüzde mi (27.00 = %27) yoksa 0-1 arası
      // bir çarpan mı (0.10 = %10) olduğu TEDARİKÇİYE GÖRE DEĞİŞİYOR — sabit bir kural
      // (×100 ya da ×1) her zaman doğru sonuç vermiyor. En güvenilir yöntem: Amount ve
      // BaseAmount ikisi de gerçek TL tutarı olduğu için, oranlarından (Amount/BaseAmount)
      // gerçek yüzdeyi hesaplamak — bu, tedarikçinin MultiplierFactorNumeric'i nasıl
      // yazdığından tamamen bağımsız ve her koşulda doğru.
      if (baseAmount) {
        iskontoOrani = Math.round((iskontoTutari / baseAmount) * 10000) / 100;
      } else if (factorMatch) {
        const factor = Number(factorMatch[1]);
        iskontoOrani = factor <= 1 ? factor * 100 : factor; // BaseAmount yoksa son çare tahmin
      }
    }

    // NET SATIR TUTARI (KDV hariç, iskonto düşülmüş): iki aday var —
    //  (A) XML'deki TaxableAmount (çoğu tedarikçide doğru KDV matrahı)
    //  (B) LineExtensionAmount - iskontoTutarı (brüt tutardan iskontoyu manuel düşmek)
    // Akaryakıt (ÖTV'li) faturalarda TaxableAmount alanı bazen KDV matrahı değil,
    // BİRİM fiyatı taşıyor (örn. "69.04" — 4125 TL'lik satır için anlamsız bir matrah).
    // Bunu yakalamak için her adayı kdvOrani ile çarpıp gerçek TaxAmount'a en yakın
    // olanı seçiyoruz — kör bir "TaxableAmount her zaman doğrudur" varsayımı yerine.
    const grossMinusDiscount = satirTutari != null ? satirTutari - iskontoTutari : null;
    const tutarli = (aday) => aday != null && kdvOrani != null && kdvTutari != null
      && Math.abs(aday * (kdvOrani / 100) - kdvTutari) <= Math.max(0.5, Math.abs(kdvTutari) * 0.05);
    let netSatirTutari;
    if (tutarli(taxableAmountXml)) netSatirTutari = taxableAmountXml;
    else if (tutarli(grossMinusDiscount)) netSatirTutari = grossMinusDiscount;
    else netSatirTutari = taxableAmountXml ?? grossMinusDiscount ?? satirTutari; // hiçbiri tutmuyorsa son çare

    // Tutarlılık kontrolü: miktar × birim fiyat × (1-iskonto), NET satır tutarını
    // (KDV matrahını) tutmuyorsa satır "şüpheli" işaretlenir.
    let supheliMiktar = false;
    let hesaplananSatirTutari = null;
    if (miktar != null && birimFiyat != null) {
      hesaplananSatirTutari = miktar * birimFiyat * (1 - iskontoOrani / 100);
      if (netSatirTutari != null && Math.abs(hesaplananSatirTutari - netSatirTutari) > 0.5) {
        supheliMiktar = true;
      }
    } else {
      supheliMiktar = true;
    }

    // İSKONTO + KDV: "Birim Fiyat" olarak XML'deki ham cbc:PriceAmount değil, iskonto
    // düşülmüş (netSatirTutari) ve KDV eklenmiş EFEKTİF birim fiyat kullanılıyor —
    // kullanıcının fiilen ödediği, malzeme maliyetine yansıması gereken rakam bu.
    const efektifBirimFiyatKdvDahil = (miktar && netSatirTutari != null)
      ? Math.round(((netSatirTutari + (kdvTutari || 0)) / miktar) * 100) / 100
      : null;
    const satirTutariKdvDahil = netSatirTutari != null ? Math.round((netSatirTutari + (kdvTutari || 0)) * 100) / 100 : null;

    return {
      siraNo, urunAdi, urunKodu, not: note, miktar,
      birimKodu: unitCode,
      birimAdi: UNIT_CODE_MAP[unitCode] || unitCode, // tanımadığımız kodda ham haliyle
      birimFiyat, satirTutari, kdvOrani, kdvTutari, iskontoOrani, iskontoTutari,
      efektifBirimFiyatKdvDahil, satirTutariKdvDahil,
      supheliMiktar,
      hesaplananSatirTutari: hesaplananSatirTutari != null ? Math.round(hesaplananSatirTutari * 100) / 100 : null,
    };
  });
}

export function parseFaturaXml(xmlContent) {
  return { ...parseInvoiceHeader(xmlContent), satirlar: parseInvoiceLines(xmlContent) };
}
