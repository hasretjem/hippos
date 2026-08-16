// Satış sayfası ürün/kategori butonları için TEK merkezi varsayılan değer kaynağı.
// Supabase'de renk/yazı rengi/ikon NULL olduğunda buradan okunur.
// Değiştirmek istersen sadece burayı düzenle — başka hiçbir dosyada hardcoded renk olmamalı.

export const DEFAULT_BTN_BG = '#F8F9FA';
export const DEFAULT_BTN_TEXT = '#1A1A1A';
export const DEFAULT_ITALIC = false;
export const DEFAULT_ICON = null; // null = ikon gösterilmez

export const DEFAULT_ICON_SIZE = 22; // px — category.icon_size / global_settings.icon_size da yoksa

export const DEFAULT_GLOBAL_FONT_SIZE = 13; // px — store_settings boşsa
export const DEFAULT_GLOBAL_ICON_SIZE = 22; // px — store_settings boşsa

export const MIN_FONT_SIZE = 11; // fit-text taban sınırı — bunun altına asla inmez
export const MAX_FONT_SIZE_CAP = 28; // global_font_size için mantıklı bir tavan (UI slider sınırı)

// Alan bazlı fallback zinciri — her özellik BAĞIMSIZ çözümlenir.
// product -> category -> default
export function resolveButtonStyle(product, category) {
  return {
    backgroundColor: product?.butonRengi || category?.butonRengi || DEFAULT_BTN_BG,
    textColor: product?.butonYaziRengi || category?.butonYaziRengi || DEFAULT_BTN_TEXT,
    italic: product?.italik ?? category?.italik ?? DEFAULT_ITALIC,
    icon: product?.ikon || category?.ikon || DEFAULT_ICON,
  };
}

// İkon boyutu: category.ikonBoyutu -> store_settings.globalIconSize -> DEFAULT_ICON_SIZE
export function resolveIconSize(category, storeSettings) {
  return category?.ikonBoyutu || storeSettings?.globalIconSize || DEFAULT_ICON_SIZE;
}