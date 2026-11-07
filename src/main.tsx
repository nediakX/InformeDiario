import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './app/App'
import AuthGate from './auth/AuthGate'
import './index.css' 
import { iniciarModoSinConexion } from './lib/pwa'
import { aplicarAccesibilidad, leerAccesibilidad } from './lib/accesibilidad'
import { iniciarTema } from './lib/tema'

iniciarModoSinConexion()
aplicarAccesibilidad(leerAccesibilidad())
iniciarTema()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthGate>
        <App />
      </AuthGate>
    </BrowserRouter>
  </React.StrictMode>,
)