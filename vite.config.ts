import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: './',  // Relative paths for deployment in subdirectory
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy do oryginalnego konfiguratora API
      '/api': {
        target: 'http://localhost',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/drabiny_kalkulator/api')
      },
      // Proxy do wizualizacji 3D (iframe)
      '/drabiny_3d': {
        target: 'http://localhost',
        changeOrigin: true
      }
    }
  }
})
