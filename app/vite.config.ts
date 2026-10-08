import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { APP } from './src/config';

function brand(): Plugin {
  return {
    name: 'brand',
    transformIndexHtml(html) {
      return html.replace(/%TITLE%/g, APP.title).replace(/%DESC%/g, APP.description).replace(/%THEME%/g, APP.themeColor).replace(/%NAME%/g, APP.name);
    },
    generateBundle() {
      const manifest = {
        id: '/', name: APP.title, short_name: APP.name, description: APP.description, prefer_related_applications: false,
        start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
        background_color: '#ffffff', dir: 'ltr',
        shortcuts: [
          { name: 'Quick 20-question test', short_name: 'Quick test', url: '/#/mock/quick', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Practise by topic', short_name: 'Practice', url: '/#/practice', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'My wrong answers', short_name: 'Wrong answers', url: '/#/wrong', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ], theme_color: APP.themeColor, lang: 'en-NG', categories: ['education'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      };
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(manifest, null, 1) });
    },
  };
}

export default defineConfig({
  plugins: [preact(), brand()],
  build: { target: 'es2019', cssCodeSplit: false, assetsInlineLimit: 0, reportCompressedSize: false },
});
