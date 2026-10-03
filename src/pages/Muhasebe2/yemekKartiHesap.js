// Yemek kartı kesim hesabı. api/muhasebe2.js içindeki yemekKartiHesapla ile BİREBİR aynı olmalı
// (ikisi de testlerde Excel satırlarıyla ve tam kesinlikli hesapla karşılaştırılır).
//
// Hesap kuruş (tam sayı) üzerinden ve yuvarlama EN SONDA yapılır:
//   Fatura toplamı  = matrah x (1 + fatura KDV)
//   Kesinti toplamı = matrah x oran x (1 + kesinti KDV)
//   Bankaya yatacak = fatura toplamı - kesinti toplamı

const yariYukari = (pay, payda) => (pay + payda / 2n) / payda; // BigInt, negatif olmayan sayılar

export function yemekKartiHesapla(matrah, kart) {
  const orani = (x, varsayilan) => BigInt(Math.round(Number(x ?? varsayilan) * 10000));
  const M = BigInt(Math.round((Number(matrah) || 0) * 100));
  const fk = orani(kart.faturaKdv, 0.1);
  const ko = orani(kart.komisyonOrani, 0);
  const kk = orani(kart.kesintiKdv, 0.2);
  const B = 10000n;
  const faturaKdvK = yariYukari(M * fk, B);
  const faturaToplamiK = yariYukari(M * (B + fk), B);
  const kesintiMatrahK = yariYukari(M * ko, B);
  const kesintiKdvK = yariYukari(M * ko * kk, B * B);
  const kesintiToplamiK = yariYukari(M * ko * (B + kk), B * B);
  const n = (k) => Number(k) / 100;
  return {
    matrah: n(M),
    kdv: n(faturaKdvK),
    faturaToplami: n(faturaToplamiK),
    kesintiMatrah: n(kesintiMatrahK),
    kesintiKdv: n(kesintiKdvK),
    kesintiToplami: n(kesintiToplamiK),
    bankayaYatacak: n(faturaToplamiK - kesintiToplamiK),
  };
}