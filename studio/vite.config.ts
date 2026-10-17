import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// Hard-wire react and react-dom to single directory roots so that
// react-router-dom v7, connectkit, and wagmi all share exactly one React
// instance. Aliasing to the package *directory* (not index.js) lets Vite
// resolve all subpath exports (jsx-runtime, jsx-dev-runtime, etc.) correctly.
const reactDir = path.resolve(__dirname, 'node_modules/react')
const reactDomDir = path.resolve(__dirname, 'node_modules/react-dom')

export default defineConfig({
  plugins: [react(), nodePolyfills()],
  resolve: {
    alias: [
      { find: /^react-dom$/, replacement: reactDomDir + '/index.js' },
      { find: /^react-dom\/(.*)/, replacement: reactDomDir + '/$1' },
      { find: /^react$/, replacement: reactDir + '/index.js' },
      { find: /^react\/(.*)/, replacement: reactDir + '/$1' },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      '@tanstack/react-query',
      'wagmi',
      'wagmi/chains',
      'wagmi/connectors',
      'viem',
      'viem/chains',
      'connectkit',
      'framer-motion',
      'lucide-react',
      'sonner',
      'clsx',
      'tailwind-merge',
      'react-router-dom',
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process',
    ],
  },
  server: {
    allowedHosts: true,
    cors: true,
  },
})
