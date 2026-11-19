import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { aktarimiTetikle, baglantiAbone } from '../services/baglanti';
import './BaglantiSeridi.css';

// Supabase'e ulaşılamadığında ve gönderilmeyi bekleyen kayıt olduğunda ekranın üstünde çıkan küçük şerit.
export default function BaglantiSeridi() {
  const [d, setD] = useState({ sunucuYok: false, bekleyen: 0, aktariliyor: false });
  useEffect(() => baglantiAbone(setD), []);
  if (!d.sunucuYok && d.bekleyen === 0) return null;
  const yok = d.sunucuYok;
  return (
    <div className={`bs-serit ${yok ? 'yok' : 'aktariliyor'}`} role="status">
      {yok ? <CloudOff size={16} /> : <RefreshCw size={16} className="bs-don" />}
      <span>
        {yok ? 'Sunucuya ulaşılamıyor · kayıtlar bu bilgisayarda tutuluyor' : 'Sunucu geri geldi · kayıtlar aktarılıyor'}
        {d.bekleyen > 0 ? ` · ${d.bekleyen} kayıt bekliyor` : ''}
      </span>
      {yok && d.bekleyen > 0 && (
        <button type="button" onClick={() => aktarimiTetikle(0)}>Şimdi dene</button>
      )}
    </div>
  );
}
