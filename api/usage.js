import { createClient } from '@supabase/supabase-js';

// Service-role anahtarı burada YOK — sadece okuma yapıyoruz, normal anon anahtar yeterli.
// Bu endpoint SADECE realtime_usage_log tablosunu okur — hiçbir yazma işlemi yok.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    // Supabase'in kendi faturalama döngüsü takvim ayı bazlıdır — biz de öyle hesaplıyoruz.
    const now = new Date();
    const ayBaslangic = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data, error } = await supabase
      .from('realtime_usage_log')
      .select('message_count, events, ts')
      .gte('ts', ayBaslangic)
      .order('ts', { ascending: false });
    if (error) throw error;

    const buAy = (data || []).reduce((s, r) => s + (r.message_count || 0), 0);

    const yirmiDortSaatOnce = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const son24Saat = (data || [])
      .filter((r) => r.ts >= yirmiDortSaatOnce)
      .reduce((s, r) => s + (r.message_count || 0), 0);

    // Son 30 tekil mesajı (hangi tablodan, ne zaman) en yeniden eskiye doğru düzleştiriyoruz.
    const sonMesajlar = [];
    for (const row of data || []) {
      for (const ev of row.events || []) {
        sonMesajlar.push(ev);
        if (sonMesajlar.length >= 30) break;
      }
      if (sonMesajlar.length >= 30) break;
    }
    sonMesajlar.sort((a, b) => b.ts - a.ts);

    // Aynı zamanda tabloya göre kırılım (hangi tablo bugün ne kadar mesaj üretti) —
    // "38 nereden geldi" gibi soruları cevaplamak için.
    const tabloKirilimi = {};
    (data || []).forEach((row) => {
      (row.events || []).forEach((ev) => {
        tabloKirilimi[ev.table] = (tabloKirilimi[ev.table] || 0) + 1;
      });
    });

    res.status(200).json({ buAy, son24Saat, sonMesajlar, tabloKirilimi, ayBaslangic });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}