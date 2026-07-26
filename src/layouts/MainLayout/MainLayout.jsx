import "./MainLayout.css";
import Header from "../../components/Header/Header";
import Sidebar from "../../components/Sidebar/Sidebar";

export default function MainLayout({ children }) {
  return (
    <div className="layout">
      <Header />

      <div className="layout-body">
        <Sidebar />

        <main className="layout-content">
          {children}
        </main>

        <aside className="layout-cart">
          <h2>Sepet</h2>
          <p>Henüz ürün yok.</p>

          <div className="cart-total">
            <span>Toplam</span>
            <strong>0,00 ₺</strong>
          </div>

          <button className="pay-button">
            Ödeme Al
          </button>
        </aside>
      </div>
    </div>
  );
}