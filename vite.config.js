import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          const packagePath = id.split('node_modules/')[1] || ''
          const packageSegments = packagePath.split('/')
          const packageName = packageSegments[0].startsWith('@')
            ? `${packageSegments[0]}/${packageSegments[1]}`
            : packageSegments[0]
          if (id.includes('node_modules/firebase')) return 'firebase'
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/exceljs')) return 'exceljs'
          if (id.includes('node_modules/lucide-react')) return 'icons'
          if (
            id.includes('node_modules/papaparse') ||
            id.includes('node_modules/jszip')
          ) {
            return 'data-tools'
          }
          if (
            id.includes('node_modules/react-window') ||
            id.includes('node_modules/react-virtualized-auto-sizer')
          ) {
            return 'virtualization'
          }
          return `vendor-${packageName.replace('@', '').replace('/', '-')}`
        },
      },
    },
  },
})
