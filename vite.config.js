import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', '**/*.onnx'], 
      manifest: {
        name: 'iKape Farm Management',
        short_name: 'iKape',
        description: 'Offline Coffee Quality Grading & Predictions',
        theme_color: '#ffffff',
        icons: [
          { src: 'logo.png', sizes: '192x192', type: 'image/png' },
          { src: 'logo.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 50000000, // 50MB for large ONNX models
        globPatterns: ['**/*.{js,css,html,ico,png,svg,onnx}'],
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/[^.]*$/], // Match all routes except files with extensions
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[^/]+\.(?:png|gif|jpg|svg|ico)$/i,
            handler: 'CacheFirst',
            options: { cacheName: 'images' }
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'classic',
        navigateFallback: 'index.html'
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  }
})
