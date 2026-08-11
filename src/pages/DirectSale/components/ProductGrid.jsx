import { ChevronUp, ChevronDown, Star } from 'lucide-react';

export default function ProductGrid({
  activeCategory,
  searchQuery,
  groupedProducts,
  favorites,
  addProductToOrder,
  productsScrollRef,
  bigColScrollRef,
  smallColScrollRef,
  scrollByPage,
  TL,
}) {
  return (
          <div className="ds-products-wrap">
            <div className={`ds-products ${activeCategory === 'SOĞUK SANDVİÇ' && !searchQuery ? 'split-active' : ''}`} ref={productsScrollRef}>
              {Object.keys(groupedProducts).length === 0 && (
                <div className="ds-empty">Aradığınız kriterde ürün bulunamadı.</div>
              )}

              {/* SOĞUK SANDVİÇ: Büyük/Küçük alt kategorileri (ve "Menü Sandviç Büyük/Küçük" gibi
                  isminde büyük/küçük geçen her alt kategori) sol/sağ iki ayrı panelde gösterilir. */}
              {activeCategory === 'SOĞUK SANDVİÇ' && !searchQuery ? (
                <div className="ds-split-cols">
                  {['büyük', 'küçük'].map((yon) => (
                    <div className={`ds-split-col ${yon}`} key={yon} ref={yon === 'büyük' ? bigColScrollRef : smallColScrollRef}>
                      <div className="ds-split-col-head">
                        <h3 className="ds-split-col-title">{yon === 'büyük' ? 'BÜYÜK SANDVİÇ' : 'KÜÇÜK SANDVİÇ'}</h3>
                        <div className="ds-split-col-scrollbtns">
                          <button onClick={() => scrollByPage(yon === 'büyük' ? bigColScrollRef : smallColScrollRef, -1)}><ChevronUp size={14} /></button>
                          <button onClick={() => scrollByPage(yon === 'büyük' ? bigColScrollRef : smallColScrollRef, 1)}><ChevronDown size={14} /></button>
                        </div>
                      </div>
                      {Object.entries(groupedProducts)
                        .filter(([subCat]) => (subCat || '').toLocaleLowerCase('tr-TR').includes(yon))
                        .map(([subCat, items]) => (
                          <div key={subCat} className="ds-product-group">
                            {subCat.toLocaleLowerCase('tr-TR') !== `${yon} sandviç` && (
                              <h3 className="ds-subcat-label">{subCat}</h3>
                            )}
                            <div className="ds-product-grid">
                              {items.map((product) => {
                                const isFav = favorites.includes(product.id);
                                return (
                                  <button
                                    key={product.id}
                                    className={`ds-product-card ${isFav ? 'fav' : ''}`}
                                    onClick={() => addProductToOrder(product)}
                                  >
                                    <div className="ds-product-card-top">
                                      <span className="ds-product-name">
                                        {product.bicakGerekli && <span className="ds-bicak-mark" title="Bıçak gerekli">🔪</span>}
                                        {product.ekmekGerekli && <span className="ds-ekmek-mark" title="Ekmek gerekli">🥖</span>}
                                        {product.ad}
                                      </span>
                                      {isFav && <Star size={11} className="ds-star" fill="currentColor" />}
                                    </div>
                                    <span className="ds-product-price">{TL(product.fiyat)}</span>
                                    {product.isAzVariant && <span className="ds-az-badge">AZ</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              ) : (
                Object.entries(groupedProducts).map(([subCat, items]) => (
                <div key={subCat} className="ds-product-group">
                  {subCat && subCat !== 'Genel' && <h3 className="ds-subcat-label">{subCat}</h3>}
                  <div className="ds-product-grid">
                    {items.map((product) => {
                      const isFav = favorites.includes(product.id);
                      return (
                        <button
                          key={product.id}
                          className={`ds-product-card ${isFav ? 'fav' : ''}`}
                          onClick={() => addProductToOrder(product)}
                        >
                          <div className="ds-product-card-top">
                            <span className="ds-product-name">
                              {product.bicakGerekli && <span className="ds-bicak-mark" title="Bıçak gerekli">🔪</span>}
                              {product.ekmekGerekli && <span className="ds-ekmek-mark" title="Ekmek gerekli">🥖</span>}
                              {product.ad}
                            </span>
                            {isFav && <Star size={11} className="ds-star" fill="currentColor" />}
                          </div>
                          <span className="ds-product-price">{TL(product.fiyat)}</span>
                          {product.isAzVariant && <span className="ds-az-badge">AZ</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                ))
              )}
            </div>
            {!(activeCategory === 'SOĞUK SANDVİÇ' && !searchQuery) && (
              <div className="ds-products-scrollbtns">
                <button onClick={() => scrollByPage(productsScrollRef, -1)}><ChevronUp size={16} /></button>
                <button onClick={() => scrollByPage(productsScrollRef, 1)}><ChevronDown size={16} /></button>
              </div>
            )}
          </div>
  );
}
