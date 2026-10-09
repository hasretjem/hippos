import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ModalAksiyon, ModalKabuk, TL, useModalKaydet } from './m2Ortak';

// Günsonları: Muhasebe1'deki "Gün Sonu Kayıtları" tablosunun aynısı (aynı gs_kayitlar verisi) + Düzenleme Modu'nda
// Düzenle / Sil. Düzenleme toplamları (nakit, POS, yemek kartı, ciro) sunucuda otomatik hesaplanır ve ana kasa devrini
// sonraki günlere yayar. CARİ bilgisi yalnızca görülür, buradan değiştirilemez.

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const KUPURLER = ['200', '100', '50', '20', '10', '5'];
const YEMEK_MARKALARI = ['Edenred', 'Pluxee', 'Setcard', 'Multinet', 'Metropol', 'Tokenflex'];

function tarihCoz(t) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(t || '').trim());
  return m ? { y: Number(m[3]), m: Number(m[2]), d: Number(m[1]) } : null;
}
const tarihSayi = (t) => {
  const x = tarihCoz(t);
  return x ? x.y * 10000 + x.m * 100 + x.d : 0;
};
const ciroToplam = (k) => {
  const c = k.ciro || {};
  if (c.toplam != null) return Number(c.toplam) || 0;
  return (Number(c.nakit) || 0) + (Number(c.kart) || 0) + (Number(c.yemek) || 0) + (Number(c.cari) || 0) + (Number(c.cariTahsilat) || 0) + (Number(c.cariDuzeltme) || 0);
};
function cariSatirlari(detay) {
  const d = detay || {};
  return [
    ...Object.entries(d.sabitler || {}).map(([ad, tutar]) => ({ ad, tutar })),
    ...(d.ekstra || []).filter((x) => x.ad).map((x) => ({ ad: x.ad, tutar: x.tutar })),
    ...(d.bireysel || []).filter((x) => x.ad).map((x) => ({ ad: x.ad, tutar: x.tutar })),
  ];
}
const sayiYaz = (n) => TL(Number(n) || 0);
// Cariden tahsilat (havale hariç): ciro.cariTahsilat eksi saklanır; yoksa türlere göre özetten toplanır.
const cariTahsilatToplam = (k) => {
  const c = k.ciro || {};
  if (c.cariTahsilat != null && c.cariTahsilat !== '') return Math.abs(Number(c.cariTahsilat) || 0);
  return Object.values((k.cariDetay || {}).bugunCariOdemeOzeti || {}).reduce((a, v) => a + (Number(v) || 0), 0);
};

export default function GunsonlariSekmesi({ aktif, duzenlemeModu, bildir, yenile, onIslem }) {
  const simdi = new Date();
  const [kayitlar, setKayitlar] = useState(null);
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [yil, setYil] = useState(String(simdi.getFullYear()));
  const [ay, setAy] = useState(String(simdi.getMonth() + 1));
  const [gun, setGun] = useState('tumu');
  const [detay, setDetay] = useState(null); // { tip, kayit }
  const [duzenle, setDuzenle] = useState(null);
  const kilit = useRef(false);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    setHata('');
    try {
      const j = await api('gunsonuListe');
      setKayitlar(j.kayitlar || []);
    } catch (e) {
      setHata(e.message);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    if (aktif) yukle();
  }, [aktif, yenile, yukle]);

  const yillar = useMemo(() => {
    const s = new Set((kayitlar || []).map((k) => tarihCoz(k.tarih)?.y).filter(Boolean));
    s.add(simdi.getFullYear());
    return [...s].sort((a, b) => b - a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kayitlar]);

  const gorunen = useMemo(
    () =>
      (kayitlar || [])
        .filter((k) => {
          const d = tarihCoz(k.tarih);
          if (!d) return false;
          if (yil !== 'tumu' && d.y !== Number(yil)) return false;
          if (ay !== 'tumu' && d.m !== Number(ay)) return false;
          if (gun !== 'tumu' && d.d !== Number(gun)) return false;
          return true;
        })
        .sort((a, b) => tarihSayi(b.tarih) - tarihSayi(a.tarih)),
    [kayitlar, yil, ay, gun],
  );

  const toplam = useMemo(
    () =>
      gorunen.reduce(
        (a, k) => {
          a.nakit += k.toplamNakitPara || 0;
          a.tahsilat += cariTahsilatToplam(k);
          a.pos += k.posToplam || 0;
          a.anaKasaHarc += k.anaKasaToplam || 0;
          a.gunlukHarc += k.gunlukKasaToplam || 0;
          a.cari += k.cariToplam || 0;
          a.yemek += k.genelYemekToplami || 0;
          a.ciro += ciroToplam(k);
          return a;
        },
        { nakit: 0, tahsilat: 0, pos: 0, anaKasaHarc: 0, gunlukHarc: 0, cari: 0, yemek: 0, ciro: 0 },
      ),
    [gorunen],
  );

  async function sil(k) {
    if (kilit.current) return;
    kilit.current = true;
    try {
      const on = await api('gunsonuSil', { method: 'POST', body: { tarih: k.tarih, onizleme: true } });
      const ek = on.etkilenen.length ? `\n\n${on.etkilenen.length} sonraki günün ana kasa devri yeniden hesaplanacak.` : '';
      if (!window.confirm(`${k.tarih} günsonu kaydı silinecek.${ek}\n\nEmin misiniz?`)) return;
      const s = await api('gunsonuSil', { method: 'POST', body: { tarih: k.tarih } });
      onIslem(s, `${k.tarih} günsonu silindi`);
      bildir('Günsonu kaydı silindi (Ctrl+Z ile geri alabilirsiniz)');
      await yukle();
    } catch (e) {
      bildir(e.message, true);
    } finally {
      kilit.current = false;
    }
  }

  async function duzenleBitti(sonuc) {
    setDuzenle(null);
    if (sonuc.degisiklikYok) {
      bildir('Değişiklik yok');
      return;
    }
    onIslem(sonuc, `${sonuc.kayit.tarih} günsonu düzenlendi`);
    bildir(`Günsonu güncellendi${sonuc.etkilenen?.length ? `, ${sonuc.etkilenen.length} sonraki günün devri yeniden hesaplandı` : ''} (Ctrl+Z ile geri alabilirsiniz)`);
    await yukle();
  }

  const sutunSayisi = 13 + (duzenlemeModu ? 1 : 0);

  return (
    <div className="m2-card">
      <div className="m2-row" style={{ justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Günsonları</h2>
        <div className="m2-gs-filtre">
          <select className="m2-input" aria-label="Yıl" value={yil} onChange={(e) => setYil(e.target.value)}>
            {yillar.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
            <option value="tumu">Tüm Yıllar</option>
          </select>
          <select className="m2-input" aria-label="Ay" value={ay} onChange={(e) => setAy(e.target.value)}>
            <option value="tumu">Tüm Aylar</option>
            {AYLAR.map((a, i) => (
              <option key={a} value={i + 1}>
                {a}
              </option>
            ))}
          </select>
          <select className="m2-input" aria-label="Gün" value={gun} onChange={(e) => setGun(e.target.value)}>
            <option value="tumu">Tüm Günler</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <button className="m2-btn sec mini" onClick={yukle} disabled={yukleniyor}>
            {yukleniyor ? 'Yükleniyor…' : 'Yenile'}
          </button>
        </div>
      </div>
      {duzenlemeModu && (
        <p className="m2-hint">
          Düzenleme Modu: her satırda Düzenle ve Sil var. Toplamlar ve ana kasa devri otomatik hesaplanır; cari bilgisi yalnızca görülür.
        </p>
      )}
      {hata && <div className="m2-info r">{hata}</div>}

      <div className="m2-table-wrap">
        <table className="m2-table m2-gs-tablo">
          <thead>
            <tr>
              <th>Yıl</th>
              <th>Ay</th>
              <th>Gün</th>
              <th>Saat</th>
              <th className="sayi">Nakit</th>
              <th className="sayi">POS</th>
              <th className="sayi">Ana Kasa Harc.</th>
              <th className="sayi">Günlük Kasa Harc.</th>
              <th className="sayi">Cari</th>
              <th className="sayi">Cari Tahsilat</th>
              <th className="sayi">Yemek Kartı</th>
              <th className="sayi">Ciro</th>
              <th>Ana Kasa Takibi</th>
              {duzenlemeModu && <th>İşlem</th>}
            </tr>
          </thead>
          <tbody>
            {kayitlar === null ? (
              <tr>
                <td colSpan={sutunSayisi} className="m2-empty">
                  Yükleniyor…
                </td>
              </tr>
            ) : gorunen.length === 0 ? (
              <tr>
                <td colSpan={sutunSayisi} className="m2-empty">
                  Bu filtrede gün sonu kaydı yok.
                </td>
              </tr>
            ) : (
              gorunen.map((k) => {
                const d = tarihCoz(k.tarih);
                const anaH = k.anaKasaToplam || 0;
                const gunH = k.gunlukKasaToplam || 0;
                return (
                  <tr key={k.tarih}>
                    <td>{d ? d.y : '-'}</td>
                    <td>{d ? AYLAR[d.m - 1] : '-'}</td>
                    <td>{d ? d.d : '-'}</td>
                    <td>{k.kaydedenSaat || '-'}</td>
                    <td className="sayi">{sayiYaz(k.toplamNakitPara)}</td>
                    <td className="sayi">{sayiYaz(k.posToplam)}</td>
                    <td className="sayi">
                      {sayiYaz(anaH)}
                      {anaH > 0 && <DetayDugme onClick={() => setDetay({ tip: 'anaKasaHarcamalar', kayit: k })} />}
                    </td>
                    <td className="sayi">
                      {sayiYaz(gunH)}
                      {gunH > 0 && <DetayDugme onClick={() => setDetay({ tip: 'gunlukKasaHarcamalar', kayit: k })} />}
                    </td>
                    <td className="sayi">
                      {sayiYaz(k.cariToplam)}
                      {k.cariToplam > 0 && <DetayDugme onClick={() => setDetay({ tip: 'cariDetay', kayit: k })} />}
                    </td>
                    <td className="sayi">
                      {sayiYaz(cariTahsilatToplam(k))}
                      {cariTahsilatToplam(k) > 0 && <DetayDugme onClick={() => setDetay({ tip: 'cariTahsilat', kayit: k })} />}
                    </td>
                    <td className="sayi">
                      {sayiYaz(k.genelYemekToplami)}
                      {k.genelYemekToplami > 0 && <DetayDugme onClick={() => setDetay({ tip: 'yemekDetay', kayit: k })} />}
                    </td>
                    <td className="sayi">{sayiYaz(ciroToplam(k))}</td>
                    <td>{k.anaKasaTakibi && Object.keys(k.anaKasaTakibi).length ? <DetayDugme onClick={() => setDetay({ tip: 'anaKasaTakibi', kayit: k })} /> : '—'}</td>
                    {duzenlemeModu && (
                      <td>
                        <div className="m2-yk-islem">
                          {!k.eskiBicim && (
                            <button className="m2-btn sec mini" onClick={() => setDuzenle(k)}>
                              Düzenle
                            </button>
                          )}
                          <button className="m2-btn sec mini" onClick={() => sil(k)}>
                            Sil
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
          {gorunen.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4}>Toplam</td>
                <td className="sayi">{sayiYaz(toplam.nakit)}</td>
                <td className="sayi">{sayiYaz(toplam.pos)}</td>
                <td className="sayi">{sayiYaz(toplam.anaKasaHarc)}</td>
                <td className="sayi">{sayiYaz(toplam.gunlukHarc)}</td>
                <td className="sayi">{sayiYaz(toplam.cari)}</td>
                <td className="sayi">{sayiYaz(toplam.tahsilat)}</td>
                <td className="sayi">{sayiYaz(toplam.yemek)}</td>
                <td className="sayi">{sayiYaz(toplam.ciro)}</td>
                <td />
                {duzenlemeModu && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {detay && <GunsonuDetayModal tip={detay.tip} kayit={detay.kayit} onKapat={() => setDetay(null)} />}
      {duzenle && (
        <GunsonuDuzenleModal
          kayit={duzenle}
          onKapat={() => setDuzenle(null)}
          onKaydet={(p) => api('gunsonuDuzenle', { method: 'POST', body: p })}
          onBitti={duzenleBitti}
        />
      )}
    </div>
  );
}

function DetayDugme({ onClick }) {
  return (
    <button type="button" className="m2-btn sec mini m2-gs-detay" onClick={onClick}>
      detay
    </button>
  );
}

// ------------------------------ Detay pencereleri ------------------------------
function GunsonuDetayModal({ tip, kayit, onKapat }) {
  const basliklar = {
    anaKasaHarcamalar: 'Ana Kasa Harcamaları',
    gunlukKasaHarcamalar: 'Günlük Kasa Harcamaları',
    cariDetay: 'Cari Detay',
    cariTahsilat: 'Cariden Tahsilat Detay',
    yemekDetay: 'Yemek Kartı Detay',
    anaKasaTakibi: 'Ana Kasa Takibi',
  };
  const [veri, setVeri] = useState(null);
  useEffect(() => {
    if (tip !== 'anaKasaHarcamalar' && tip !== 'gunlukKasaHarcamalar') return;
    fetch(`/api/muhasebe2?resource=gunsonuHarcama&tarih=${encodeURIComponent(kayit.tarih)}`)
      .then((r) => r.json())
      .then((j) => setVeri(j))
      .catch(() => setVeri({ anaKasa: [], gunlukKasa: [] }));
  }, [tip, kayit.tarih]);

  function icerik() {
    if (tip === 'anaKasaHarcamalar' || tip === 'gunlukKasaHarcamalar') {
      if (!veri) return <p className="m2-empty">Yükleniyor…</p>;
      const liste = tip === 'anaKasaHarcamalar' ? veri.anaKasa : veri.gunlukKasa;
      if (!liste || !liste.length) return <p className="m2-empty">Bu güne ait satır detayı bulunamadı (toplam günsonu kaydındadır).</p>;
      return (
        <table className="m2-table m2-gs-kucuk">
          <thead>
            <tr>
              <th>Ad</th>
              <th>Açıklama</th>
              <th className="sayi">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((x, i) => (
              <tr key={x.id || i}>
                <td>{x.firmaAdi}</td>
                <td>{x.aciklama || '—'}</td>
                <td className="sayi">{sayiYaz(x.tutar)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    if (tip === 'cariDetay') return <CariTablosu kayit={kayit} />;
    if (tip === 'cariTahsilat') return <CariTahsilatTablosu kayit={kayit} />;
    if (tip === 'yemekDetay') {
      const kolonlar = kayit.yemekDetay?.kolonlar || [];
      const tutarlar = kayit.yemekDetay?.tutarlar || {};
      return (
        <table className="m2-table m2-gs-kucuk">
          <thead>
            <tr>
              <th>Marka</th>
              {kolonlar.map((k) => (
                <th key={k} className="sayi">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(tutarlar).map(([marka, satir]) => (
              <tr key={marka}>
                <td>{marka}</td>
                {kolonlar.map((k) => (
                  <td key={k} className="sayi">
                    {satir[k] ? sayiYaz(satir[k]) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    const t = kayit.anaKasaTakibi || {};
    return (
      <table className="m2-table m2-gs-kucuk">
        <tbody>
          <tr>
            <td>Dünden Devir</td>
            <td className="sayi">{sayiYaz(t.dundenDevir)}</td>
          </tr>
          <tr>
            <td>Bugünkü Nakit</td>
            <td className="sayi">{sayiYaz(t.bugunkuNakit)}</td>
          </tr>
          <tr>
            <td>Ana Kasa Harcama</td>
            <td className="sayi">{sayiYaz(t.anaKasaHarcama)}</td>
          </tr>
          <tr>
            <td>Yarına Devir</td>
            <td className="sayi">{sayiYaz(t.yarinaDevir)}</td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <ModalKabuk baslik={`${basliklar[tip]} — ${kayit.tarih}`} onKapat={onKapat} genis>
      <div className="m2-table-wrap">{icerik()}</div>
    </ModalKabuk>
  );
}

function CariTahsilatTablosu({ kayit }) {
  const d = kayit.cariDetay || {};
  const ozet = Object.entries(d.bugunCariOdemeOzeti || {});
  const liste = Array.isArray(d.bugunCariOdemeDetay) ? d.bugunCariOdemeDetay : [];
  return (
    <>
      {liste.length > 0 && (
        <table className="m2-table m2-gs-kucuk">
          <thead>
            <tr>
              <th>Cari</th>
              <th>Ödeme Türü</th>
              <th className="sayi">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((x, i) => (
              <tr key={`${x.ad}-${x.tur}-${i}`}>
                <td>{x.ad || '—'}</td>
                <td>{x.tur}</td>
                <td className="sayi">{sayiYaz(x.tutar)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <table className="m2-table m2-gs-kucuk" style={liste.length ? { marginTop: 12 } : undefined}>
        <thead>
          <tr>
            <th>Ödeme Türüne Göre</th>
            <th className="sayi">Tutar</th>
          </tr>
        </thead>
        <tbody>
          {ozet.length === 0 && (
            <tr>
              <td colSpan={2} className="m2-empty">Tür kırılımı kayıtlı değil.</td>
            </tr>
          )}
          {ozet.map(([tur, tutar]) => (
            <tr key={tur}>
              <td>{tur}</td>
              <td className="sayi">{sayiYaz(tutar)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Toplam Tahsilat (havale hariç)</td>
            <td className="sayi">{sayiYaz(cariTahsilatToplam(kayit))}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function CariTablosu({ kayit }) {
  const satirlar = cariSatirlari(kayit.cariDetay);
  return (
    <table className="m2-table m2-gs-kucuk">
      <thead>
        <tr>
          <th>Ad</th>
          <th className="sayi">Tutar</th>
        </tr>
      </thead>
      <tbody>
        {satirlar.map((x, i) => (
          <tr key={`${x.ad}-${i}`}>
            <td>{x.ad}</td>
            <td className="sayi">{sayiYaz(x.tutar)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Cari Toplamı</td>
          <td className="sayi">{sayiYaz(kayit.cariToplam)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

// ------------------------------ Düzenleme penceresi ------------------------------
function baslangicForm(k) {
  const kupur = {};
  [...new Set([...KUPURLER, ...Object.keys(k.nakitKupurDetayi || {})])]
    .sort((a, b) => Number(b) - Number(a))
    .forEach((d) => {
      kupur[d] = String((k.nakitKupurDetayi || {})[d] ?? '');
    });
  const kolonlar = k.yemekDetay?.kolonlar || [];
  const tut = k.yemekDetay?.tutarlar || {};
  const yemek = {};
  [...new Set([...YEMEK_MARKALARI, ...Object.keys(tut)])].forEach((m) => {
    yemek[m] = Object.fromEntries(kolonlar.map((c) => [c, String(tut[m]?.[c] ?? '')]));
  });
  return {
    kupur,
    avans: String(k.kasaAvansi ?? 0),
    pos: (k.posTutarlari || []).map((p) => ({ label: p.label, tutar: String(p.tutar ?? '') })),
    ana: String(k.anaKasaToplam ?? 0),
    gunluk: String(k.gunlukKasaToplam ?? 0),
    yemek,
    dunden: String(k.anaKasaTakibi?.dundenDevir ?? 0),
    saat: k.kaydedenSaat || '',
  };
}

// Yalnızca kullanıcının DEĞİŞTİRDİĞİ bölümler sunucuya gider; dokunulmayan bölümler olduğu gibi kalır.
function alanlariUret(f, bas) {
  const a = {};
  const fark = (x, y) => JSON.stringify(x) !== JSON.stringify(y);
  if (fark(f.kupur, bas.kupur)) a.nakitKupurDetayi = f.kupur;
  if (f.avans !== bas.avans) a.kasaAvansi = f.avans;
  if (fark(f.pos, bas.pos)) a.posTutarlari = f.pos;
  if (f.ana !== bas.ana) a.anaKasaToplam = f.ana;
  if (f.gunluk !== bas.gunluk) a.gunlukKasaToplam = f.gunluk;
  if (fark(f.yemek, bas.yemek)) a.yemekTutarlari = f.yemek;
  if (f.dunden !== bas.dunden) a.dundenDevir = f.dunden;
  if (f.saat !== bas.saat) a.kaydedenSaat = f.saat;
  return a;
}

function GunsonuDuzenleModal({ kayit, onKapat, onKaydet, onBitti }) {
  const bas = useMemo(() => baslangicForm(kayit), [kayit]);
  const kolonlar = kayit.yemekDetay?.kolonlar || [];
  const [f, setF] = useState(bas);
  const [onizleme, setOnizleme] = useState(null);
  const [onizHata, setOnizHata] = useState('');
  const [hazir, setHazir] = useState(true);
  const [yeniMarka, setYeniMarka] = useState('');
  const sayac = useRef(0);
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onBitti);
  const alanlar = alanlariUret(f, bas);
  const degisti = Object.keys(alanlar).length > 0;

  // Toplamlar, ciro ve devir sunucuda hesaplanır (tek doğru kaynak); form değişince canlı önizleme gelir.
  useEffect(() => {
    const a = alanlariUret(f, bas);
    if (!Object.keys(a).length) {
      setOnizleme(null);
      setOnizHata('');
      setHazir(true);
      return undefined;
    }
    setHazir(false);
    const id = ++sayac.current;
    const t = setTimeout(async () => {
      try {
        const j = await api('gunsonuDuzenle', { method: 'POST', body: { tarih: kayit.tarih, alanlar: a, onizleme: true } });
        if (id !== sayac.current) return;
        setOnizleme(j);
        setOnizHata('');
      } catch (e) {
        if (id !== sayac.current) return;
        setOnizleme(null);
        setOnizHata(e.message);
      } finally {
        if (id === sayac.current) setHazir(true);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [f, bas, kayit.tarih]);

  const goster = onizleme?.kayit || kayit;
  const etkilenen = onizleme?.etkilenen || [];
  const set = (alan, v) => setF((p) => ({ ...p, [alan]: v }));

  function markaEkle() {
    const m = yeniMarka.trim();
    if (!m || m.length > 40 || f.yemek[m]) return;
    setF((p) => ({ ...p, yemek: { ...p.yemek, [m]: Object.fromEntries(kolonlar.map((c) => [c, ''])) } }));
    setYeniMarka('');
  }

  function kaydet() {
    if (etkilenen.length && !window.confirm(`${etkilenen.length} sonraki günün ana kasa devri yeniden hesaplanacak.\n\nDevam edilsin mi?`)) return;
    calistir({ tarih: kayit.tarih, alanlar });
  }

  return (
    <ModalKabuk baslik={`Günsonu Düzenle — ${kayit.tarih}`} onKapat={onKapat} genis ekSinif="m2-gs-modal">
      <div className="m2-gs-form">
        <div className="m2-gs-ozet" aria-label="Hesaplanan toplamlar">
          <Ozet ad="Toplam Nakit" deger={goster.toplamNakitPara} />
          <Ozet ad="POS Toplamı" deger={goster.posToplam} />
          <Ozet ad="Yemek Kartı" deger={goster.genelYemekToplami} />
          <Ozet ad="Cari (değişmez)" deger={goster.cariToplam} />
          <Ozet ad="Ciro" deger={ciroToplam(goster)} vurgu />
          <Ozet ad="Yarına Devir" deger={goster.anaKasaTakibi?.yarinaDevir} vurgu />
        </div>

        <div className="m2-gs-bolum">Nakit (kupür adetleri)</div>
        <div className="m2-gs-izgara">
          {Object.keys(f.kupur).map((d) => (
            <div key={d}>
              <label className="m2-label">{d} ₺ adet</label>
              <input className="m2-input" inputMode="numeric" value={f.kupur[d]} onChange={(e) => setF((p) => ({ ...p, kupur: { ...p.kupur, [d]: e.target.value } }))} />
            </div>
          ))}
          <div>
            <label className="m2-label">Kasa avansı</label>
            <input className="m2-input" inputMode="decimal" value={f.avans} onChange={(e) => set('avans', e.target.value)} />
          </div>
        </div>

        <p className="m2-hint">Kasa avansı eksi girilebilir (örn. -2000).</p>

        {f.pos.length > 0 && (
          <>
            <div className="m2-gs-bolum">POS</div>
            <div className="m2-gs-izgara">
              {f.pos.map((p, i) => (
                <div key={p.label + i}>
                  <label className="m2-label">{p.label}</label>
                  <input
                    className="m2-input"
                    inputMode="decimal"
                    value={p.tutar}
                    onChange={(e) => setF((q) => ({ ...q, pos: q.pos.map((x, j) => (j === i ? { ...x, tutar: e.target.value } : x)) }))}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        <div className="m2-gs-bolum">Yemek kartları (marka marka)</div>
        {kolonlar.length === 0 ? (
          <p className="m2-hint">Bu kayıtta yemek kartı kolonu tanımlı değil.</p>
        ) : (
          <div className="m2-table-wrap m2-gs-yemek-wrap">
            <table className="m2-table m2-gs-yemek">
              <thead>
                <tr>
                  <th>Marka</th>
                  {kolonlar.map((c) => (
                    <th key={c} className="sayi">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(f.yemek).map((m) => (
                  <tr key={m}>
                    <td>{m}</td>
                    {kolonlar.map((c) => (
                      <td key={c} className="sayi">
                        <input
                          className="m2-input"
                          aria-label={`${m} ${c}`}
                          inputMode="decimal"
                          value={f.yemek[m][c]}
                          onChange={(e) => setF((p) => ({ ...p, yemek: { ...p.yemek, [m]: { ...p.yemek[m], [c]: e.target.value } } }))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="m2-row" style={{ marginTop: 6 }}>
              <input className="m2-input" style={{ maxWidth: 320 }} placeholder="Yeni marka adı" aria-label="Yeni marka adı" value={yeniMarka} onChange={(e) => setYeniMarka(e.target.value)} />
              <button type="button" className="m2-btn sec mini" disabled={!yeniMarka.trim()} onClick={markaEkle}>
                + Marka Ekle
              </button>
            </div>
          </div>
        )}

        <div className="m2-gs-bolum">Kasa ve ana kasa devri</div>
        <div className="m2-gs-izgara m2-gs-izgara-genis">
          <div>
            <label className="m2-label">Ana kasa harcaması</label>
            <input className="m2-input" inputMode="decimal" value={f.ana} onChange={(e) => set('ana', e.target.value)} />
          </div>
          <div>
            <label className="m2-label">Günlük kasa harcaması</label>
            <input className="m2-input" inputMode="decimal" value={f.gunluk} onChange={(e) => set('gunluk', e.target.value)} />
          </div>
          <div>
            <label className="m2-label">Dünden devir</label>
            <input className="m2-input" inputMode="decimal" value={f.dunden} onChange={(e) => set('dunden', e.target.value)} />
          </div>
          <div>
            <label className="m2-label">Kaydeden saat</label>
            <input className="m2-input" value={f.saat} onChange={(e) => set('saat', e.target.value)} />
          </div>
        </div>
        <p className="m2-hint">Ana kasa harcaması ciroyu etkilemez, yarına devirden düşer. Günlük kasa harcaması ciroya eklenir.</p>

        <div className="m2-gs-bolum">Cari (değiştirilemez, yalnızca görülür)</div>
        <div className="m2-table-wrap">
          <CariTablosu kayit={kayit} />
        </div>

        {etkilenen.length > 0 && (
          <div className="m2-info" role="status">
            {etkilenen.length} sonraki günün ana kasa devri yeniden hesaplanacak:{' '}
            {etkilenen
              .slice(0, 3)
              .map((x) => `${x.tarih.slice(0, 5)} yarına devir ${sayiYaz(x.eskiYarina)} → ${sayiYaz(x.yeniYarina)}`)
              .join('; ')}
            {etkilenen.length > 3 ? '…' : ''}
          </div>
        )}
        {onizHata && <div className="m2-info r">{onizHata}</div>}
        {hata && <div className="m2-info r">{hata}</div>}
      </div>
      <ModalAksiyon onKapat={onKapat} devreDisi={!degisti || !hazir || !!onizHata} bekliyor={bekliyor} onKaydet={kaydet} />
    </ModalKabuk>
  );
}

function Ozet({ ad, deger, vurgu }) {
  return (
    <div className={`m2-gs-ozet-kutu ${vurgu ? 'vurgu' : ''}`}>
      <span>{ad}</span>
      <strong>{sayiYaz(deger)}</strong>
    </div>
  );
}