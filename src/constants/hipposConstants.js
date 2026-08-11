export const QUICK_SALE = '⚡ Hızlı Satış';

export const EKMEK_TURLERI_STOK = [
  {
    key: 'buyukBeyaz',
    label: 'Büyük Beyaz Ekmek',
    esik: 120,
    uyariMesaji: "Stok 120'nin altına düştü, 2 koli sipariş edelim.",
    siparisMetni: '2 Koli 1027053 Don.Baget Fransız YP 1/2 (40*160 Gr) Ulker Marifet',
  },
  {
    key: 'kucukBeyaz',
    label: 'Küçük Beyaz Ekmek',
    esik: 100,
    uyariMesaji: "Stok 100'ün altına düştü, 2 koli sipariş edelim.",
    siparisMetni: '2 Koli 4400064 1/3 Baget Sade 95 Gr. 50/36',
  },
  {
    key: 'domatesli',
    label: 'Domatesli/Fesleğenli Ekmek',
    esik: 50,
    uyariMesaji: "Stok 50'nin altına düştü, 1 koli sipariş edelim.",
    siparisMetni: '1 Koli 4400191 1/2 Artısan Baget Domates&Fesleğen',
  },
  {
    key: 'kucukKepek',
    label: 'Küçük Kepek Ekmeği',
    esik: 75,
    uyariMesaji: "Stok 75'in altına düştü, 1 koli sipariş edelim.",
    siparisMetni: '1 Koli 1033506 1/3 Küçük Tahıl Ekmek (70 Ad)',
  },
];

export const SALON_TABLES = ['Masa 1', 'Masa 2', 'Masa 3', 'Masa 4', 'Masa 5', 'Masa 6', 'Masa 7', 'Masa 8', 'Masa 9', 'Masa 10', 'Masa 11'];
export const ALT_TABLES = ['Alt Masa 1', 'Alt Masa 2', 'Alt Masa 3', 'Alt Masa 4', 'Alt Masa 5', 'Alt Masa 6'];
export const TABLE_PAIRS = [['Masa 3', 'Masa 4'], ['Masa 10', 'Masa 11']];
export const FIXED_TABLES = [QUICK_SALE, ...SALON_TABLES, ...ALT_TABLES];
export const TL = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺';
