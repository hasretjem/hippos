import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
// Telefon görünümü — sayfa stillerinden SONRA yüklenmeli ki onları ezebilsin (sadece ≤640px)
import './styles/mobil.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Servis çalışanı: Chrome'da "Uygulamayı yükle" seçeneğinin çıkması için (önbellek tutmaz)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
