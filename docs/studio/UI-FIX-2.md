# RetentionVault UI — fix request 2 (blank preview)

The UI-FIX-1 code changes are fine. The preview is still blank because the app never mounts. Preview console, captured 17 Oct 21:40:

```
Uncaught SyntaxError: The requested module '/node_modules/cookie/dist/index.js?v=930b6512'
does not provide an export named 'parse'
  at node_modules/react-router/dist/development/chunk-H4DAEOV7.mjs:248
```

Cause: your interrupted turn on 16 Oct rewrote `vite.config.ts` to exclude `react-router-dom` from `optimizeDeps`. Without pre-bundling, react-router imports the CommonJS `cookie` package as raw ESM, and the named import fails. The same turn also deleted `postcss.config.js`.

The 16 Oct 22:52 export (before that turn) runs locally with styles applied and a clean console. Restore it exactly. **Do not change anything else**, and do not change the contract.

## 1. `vite.config.ts` — replace the whole file with this

```ts
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
```

## 2. `postcss.config.js` — recreate with this

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

## 3. Restart

Stop Vite, `rm -rf node_modules/.vite`, start once with `cd /home/user/app && bun run dev`. Port 5174 is fine (5173 is your sandbox proxy).

## 4. Acceptance (paste the results)

- Read the preview console log after the restart and paste any error lines. Expected: none, and in particular no `cookie` / `parse` error and no "Invalid hook call".
- `bun run typecheck` errors only in `scripts/compass-deploy.ts`; `bun run lint` 0 errors.
- HTTP 200 is not enough. Confirm from the console log that the app mounted (for example the wagmi/connectkit init messages or the absence of uncaught errors).
