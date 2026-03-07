import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'

// Register service worker for PWA offline support
const updateSW = registerSW({
  immediate: true,
  onRegistered(r) {
    console.log('Service Worker registered:', r)
    // Force check for updates every 60 seconds in dev
    if (import.meta.env.DEV && r) {
      setInterval(() => {
        r.update()
      }, 60000)
    }
  },
  onNeedRefresh() {
    console.log('New content available, updating...')
    updateSW(true)
  },
  onOfflineReady() {
    console.log('✅ App ready to work offline!')
  },
  onRegisterError(error) {
    console.error('Service Worker registration failed:', error)
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
