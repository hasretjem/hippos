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
  const isPaketciRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/paketci');
  const isMutfakRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/mutfak');

  const dataScope = isPaketciRoute ? 'paketci' : isMutfakRoute ? 'mutfak' : 'full';
  const data = useHipposData(dataScope);

  // Some page-level UI reads optional bread-stock data before its first async load.
  // Keep the page contract safe during the initial render so one missing object cannot
  // crash the whole React tree into a blank screen.
  const safeData = {
    ...data,
    ekmekStok: data.ekmekStok || {},
  };

  const [activePage, setActivePage] = useState('tables');
  const [selectedTable, setSelectedTable] = useState(QUICK_SALE);

  useEffect(() => {
    async function testConnection() {
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
      if (page === 'pos' && opts?.resetTable) setSelectedTable(QUICK_SALE);
      setActivePage(page);
    } else {
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
