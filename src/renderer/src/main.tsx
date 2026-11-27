import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/manrope'
import '@fontsource-variable/noto-sans-sc'
import '@fontsource-variable/jetbrains-mono'
import './styles.css'
import App from './App'

const container = document.getElementById('root')
if (!container) throw new Error('Root container missing')

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
