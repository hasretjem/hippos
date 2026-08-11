import { useEffect, useState } from 'react';
import DirectSale from './pages/DirectSale/DirectSale';
import Tables from './pages/Tables/Tables';
import Settings from './pages/Settings/Settings';
import Products from './pages/Products/Products';
import Cariler from './pages/Cariler/Cariler';
import GunSonu from './pages/GunSonu/GunSonu';
import Paketci from './pages/Paketci/Paketci';
import MutfakPaneli from './pages/MutfakPaneli/MutfakPaneli';
import Muhasebe from './pages/Muhasebe/Muhasebe';
import BottomNav from './components/BottomNav/BottomNav';
import useHipposData, { QUICK_SALE } from './hooks/useHipposData';
import { supabase } from './services/supabase';

export default function App() {
  // Paketçi kendi telefonundan /paketci adresine girer — ana panelden tamamen ayrı,
  // bağımsız bir mobil sayfa. Aynı Supabase verisini kullanır ama farklı arayüz.
  const isPaketciRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/paketci');
  // Mutfak personeli de kendi telefonundan /mutfak adresine girer — aynı mantık.
  const isMutfakRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/mutfak');

  // Realtime kotasını gereksiz yere doldurmamak için: paketçinin telefonu ya da mutfak
  // tableti, ana paneldeki HER tabloyu (cari hareketleri, satış geçmişi, ürün düzenleme
  // geçmişi vs.) dinlemeye hiç ihtiyaç duymuyor — sadece kendi ekranına lazım olanı dinlesin.
  const dataScope = isPaketciRoute ? 'paketci' : isMutfakRoute ? 'mutfak' : 'full';
  const data = useHipposData(dataScope);
  // Bazı eski/değişken veri kapsamlarında ekmek stoğu henüz dönmeyebilir.
  // Sayfaların `ekmekStok[key]` erişimi uygulamanın tamamını düşürmesin.
  const safeData = {
    ...data,
    ekmekStok: data.ekmekStok || {},
  };
  const [activePage, setActivePage] = useState('tables');
  const [selectedTable, setSelectedTable] = useState(QUICK_SALE);

  useEffect(() => {
    async function testConnection() {
      // Supabase 'tables' tablosu test çağrısı
      const { data, error } = await supabase.from('tables').select('*');

      if (error) {
        console.error('❌ Supabase Bağlantı Hatası:', error.message);
      } else {
        console.log('✅ Supabase Bağlantısı Başarılı! Masalar:', data);
      }
    }

    testConnection();
  }, []);

  if (isPaketciRoute) {
    return <Paketci data={safeData} />;
  }
  if (isMutfakRoute) {
    return <MutfakPaneli data={safeData} />;
  }

  function handleNavigate(page, opts) {
    if (page === 'tables' || page === 'pos' || page === 'settings' || page === 'products' || page === 'cariler' || page === 'endofday' || page === 'muhasebe') {
      // Sadece alt menüden "Hızlı Satış"a bilerek tıklanınca seçili masa sıfırlanır.
      // Masalar sayfasından bir masaya girerken (opts.resetTable verilmez) buna dokunulmaz.
      if (page === 'pos' && opts?.resetTable) setSelectedTable(QUICK_SALE);
      setActivePage(page);
    } else {
      // Kasa & Rapor sayfası henüz hazır değil
      alert('Bu sayfa henüz hazırlanıyor.');
    }
  }

  return (
    <>
      {activePage === 'pos' && (
        <DirectSale
          data={safeData}
          selectedTable={selectedTable}
          setSelectedTable={setSelectedTable}
          onNavigate={handleNavigate}
        />
      )}
      {activePage === 'tables' && (
        <Tables data={safeData} setSelectedTable={setSelectedTable} onNavigate={handleNavigate} />
      )}
      {activePage === 'settings' && (
        <Settings data={safeData} onNavigate={handleNavigate} />
      )}
      {activePage === 'products' && (
        <Products data={safeData} onNavigate={handleNavigate} />
      )}
      {activePage === 'cariler' && (
        <Cariler data={safeData} onNavigate={handleNavigate} />
      )}
      {activePage === 'endofday' && (
        <GunSonu data={safeData} onNavigate={handleNavigate} />
      )}
      {activePage === 'muhasebe' && (
        <Muhasebe onNavigate={handleNavigate} />
      )}
      {activePage !== 'products' && activePage !== 'pos' && activePage !== 'endofday' && activePage !== 'muhasebe' && <BottomNav activePage={activePage} onNavigate={handleNavigate} />}
    </>
  );
}