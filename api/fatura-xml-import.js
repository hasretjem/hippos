import AdmZip from 'adm-zip';

// ============================================================
// ADIM 1: Sadece zip'i aç, XML'leri parse et, JSON döndür.
// HİÇBİR YERE (Sheets/Supabase) YAZMA — bu adımda amaç sadece
// "veriyi doğru okuyor muyuz" sorusunu doğrulamak.
// ============================================================

function getTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function parseInvoiceHeader(xml) {
  const id = getTag(xml, 'cbc:ID');
  const uuid = getTag(xml, 'cbc:UUID');
  const issueDate = getTag(xml, 'cbc:IssueDate');
  const typeCode = getTag(xml, 'cbc:InvoiceTypeCode');

  const supplierBlock = xml.match(/<cac:AccountingSupplierParty>([\s\S]*?)<\/cac:AccountingSupplierParty>/);
  let supplierName = null;
  let supplierVkn = null;
  if (supplierBlock) {
    const nameMatch = supplierBlock[1].match(/<cbc:Name>([^<]*)<\/cbc:Name>/);
    supplierName = nameMatch ? nameMatch[1].trim() : null;
    const vknMatch = supplierBlock[1].match(/<cbc:ID\s+schemeID="(?:VKN|TCKN)">([^<]*)<\/cbc:ID>/);
    supplierVkn = vknMatch ? vknMatch[1].trim() : null;
  }

  const totalBlock = xml.match(/<cac:LegalMonetaryTotal>([\s\S]*?)<\/cac:LegalMonetaryTotal>/);
  let toplamKdvHaric = null, toplamKdvDahil = null, odenecekTutar = null;
  if (totalBlock) {
    const m1 = totalBlock[1].match(/<cbc:LineExtensionAmount[^>]*>([^<]*)<\/cbc:LineExtensionAmount>/);
    const m2 = totalBlock[1].match(/<cbc:TaxInclusiveAmount[^>]*>([^<]*)<\/cbc:TaxInclusiveAmount>/);
    const m3 = totalBlock[1].match(/<cbc:PayableAmount[^>]*>([^<]*)<\/cbc:PayableAmount>/);
    toplamKdvHaric = m1 ? Number(m1[1]) : null;
    toplamKdvDahil = m2 ? Number(m2[1]) : null;
    odenecekTutar = m3 ? Number(m3[1]) : null;
  }

  const taxTotalBlock = xml.match(/<cac:TaxTotal>([\s\S]*?)<\/cac:TaxTotal>/);
  let toplamKdvTutari = null;
  if (taxTotalBlock) {
    const m = taxTotalBlock[1].match(/<cbc:TaxAmount[^>]*>([^<]*)<\/cbc:TaxAmount>/);
    toplamKdvTutari = m ? Number(m[1]) : null;
  }

  return {
    faturaNo: id,
    uuid,
    tarih: issueDate,
    tip: typeCode,
    tedarikciAdi: supplierName,
    tedarikciVkn: supplierVkn,
    toplamKdvHaric,
    toplamKdvDahil,
    toplamKdvTutari,
    odenecekTutar,
  };
}

const UNIT_CODE_MAP = {
  C62: 'Adet', KGM: 'kg', GRM: 'gr', MGM: 'mg', LTR: 'lt', MLT: 'ml', MTR: 'm', BX: 'Kutu', PA: 'Paket',
};

function parseInvoiceLines(xml) {
  const lineBlocks = xml.match(/<cac:InvoiceLine>([\s\S]*?)<\/cac:InvoiceLine>/g) || [];
  return lineBlocks.map((block, idx) => {
    const siraNo = getTag(block, 'cbc:ID') || String(idx + 1);
    const note = getTag(block, 'cbc:Note');
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
      urunAdi = nameMatch ? nameMatch[1].trim() : null;
      const kodMatch = itemBlock[1].match(/<cac:SellersItemIdentification>\s*<cbc:ID[^>]*>([^<]*)<\/cbc:ID>/);
      urunKodu = kodMatch ? kodMatch[1].trim() : null;
    }

    const taxBlock = block.match(/<cac:TaxTotal>([\s\S]*?)<\/cac:TaxTotal>/);
    let kdvOrani = null, kdvTutari = null;
    if (taxBlock) {
      const percentMatch = taxBlock[1].match(/<cbc:Percent>([^<]*)<\/cbc:Percent>/);
      const amountMatch = taxBlock[1].match(/<cbc:TaxAmount[^>]*>([^<]*)<\/cbc:TaxAmount>/);
      kdvOrani = percentMatch ? Number(percentMatch[1]) : null;
      kdvTutari = amountMatch ? Number(amountMatch[1]) : null;
    }

    const allowanceBlock = block.match(/<cac:AllowanceCharge>([\s\S]*?)<\/cac:AllowanceCharge>/);
    let iskontoOrani = 0, iskontoTutari = 0;
    if (allowanceBlock) {
      const factorMatch = allowanceBlock[1].match(/<cbc:MultiplierFactorNumeric>([^<]*)<\/cbc:MultiplierFactorNumeric>/);
      const amountMatch = allowanceBlock[1].match(/<cbc:Amount[^>]*>([^<]*)<\/cbc:Amount>/);
      iskontoOrani = factorMatch ? Number(factorMatch[1]) * 100 : 0;
      iskontoTutari = amountMatch ? Number(amountMatch[1]) : 0;
    }

    let supheliMiktar = false;
    let hesaplananSatirTutari = null;
    if (miktar != null && birimFiyat != null) {
      hesaplananSatirTutari = miktar * birimFiyat * (1 - iskontoOrani / 100);
      if (satirTutari != null && Math.abs(hesaplananSatirTutari - satirTutari) > 0.5) {
        supheliMiktar = true;
      }
    } else {
      supheliMiktar = true;
    }

    return {
      siraNo,
      urunAdi,
      urunKodu, // null olabilir
      not: note,
      miktar,
      birimKodu: unitCode,
      birimAdi: UNIT_CODE_MAP[unitCode] || unitCode,
      birimFiyat,
      satirTutari,
      kdvOrani,
      kdvTutari,
      iskontoOrani,
      iskontoTutari,
      supheliMiktar,
      hesaplananSatirTutari: hesaplananSatirTutari != null ? Math.round(hesaplananSatirTutari * 100) / 100 : null,
    };
  });
}

function parseFaturaXml(xmlContent) {
  const header = parseInvoiceHeader(xmlContent);
  const lines = parseInvoiceLines(xmlContent);
  return { ...header, satirlar: lines };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { zipBase64 } = req.body || {};
    if (!zipBase64) {
      return res.status(400).json({ error: 'zipBase64 gerekli' });
    }

    const buffer = Buffer.from(zipBase64, 'base64');
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.xml'));

    if (entries.length === 0) {
      return res.status(400).json({ error: 'Zip içinde .xml dosyası bulunamadı' });
    }

    const faturalar = [];
    const hatalar = [];

    for (const entry of entries) {
      try {
        const xmlContent = entry.getData().toString('utf8');
        const parsed = parseFaturaXml(xmlContent);
        if (!parsed.faturaNo || !parsed.uuid) {
          hatalar.push({ dosya: entry.entryName, hata: 'Fatura no veya UUID okunamadı — beklenmeyen XML yapısı' });
          continue;
        }
        faturalar.push({ dosya: entry.entryName, ...parsed });
      } catch (err) {
        hatalar.push({ dosya: entry.entryName, hata: err.message });
      }
    }

    return res.status(200).json({
      ok: true,
      toplamDosya: entries.length,
      basariliFatura: faturalar.length,
      hataliDosya: hatalar.length,
      faturalar,
      hatalar,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}