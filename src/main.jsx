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
