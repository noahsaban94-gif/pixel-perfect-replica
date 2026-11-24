// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  vite: { plugins: [VitePWA({ strategies: 'generateSW', filename: 'sw.js', registerType: 'autoUpdate', injectRegister: null, manifest: false, devOptions: { enabled: false }, workbox: { globPatterns: ['**/*.{js,css,png,woff2}'], navigateFallback: null, runtimeCaching: [{ urlPattern: ({ request, url }) => request.mode === 'navigate' && !url.pathname.startsWith('/~oauth') && !url.pathname.startsWith('/api') && !url.pathname.startsWith('/_serverFn'), handler: 'NetworkFirst', options: { cacheName: 'saban-pages', networkTimeoutSeconds: 5 } }, { urlPattern: ({url}) => url.origin === self.location.origin && /\/assets\/.*-[\w-]+\.(js|css|woff2)$/.test(url.pathname), handler: 'CacheFirst', options: { cacheName: 'saban-assets' } }, { urlPattern: ({url}) => url.origin === self.location.origin && url.pathname.startsWith('/api/public/product-image/'), handler:'StaleWhileRevalidate', options:{cacheName:'saban-product-images',expiration:{maxEntries:300,maxAgeSeconds:604800}} }] } })] },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
