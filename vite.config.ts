import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_VERSION, getNextAppVersion } from './src/utils/version.ts';

const BUILD_ID = Date.now().toString();
const BUILD_TIME = new Date().toISOString();
const VERSION_TS_PATH = path.resolve(import.meta.dirname, 'src/utils/version.ts');
const PUBLIC_VERSION_JSON_PATH = path.resolve(import.meta.dirname, 'public/version.json');

let cachedBuildVersion: string | null = null;

function readCurrentVersionFromDisk(): string {
  try {
    const content = fs.readFileSync(VERSION_TS_PATH, 'utf8');
    const match = content.match(/export const APP_VERSION\s*=\s*'([^']+)'/);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch {
    // Fallback to imported APP_VERSION
  }
  return APP_VERSION;
}

function advanceVersionOnBuild(): string {
  if (cachedBuildVersion) {
    return cachedBuildVersion;
  }

  const currentVersion = readCurrentVersionFromDisk();
  const nextVersion = getNextAppVersion(currentVersion);

  try {
    const content = fs.readFileSync(VERSION_TS_PATH, 'utf8');
    const updatedContent = content.replace(
      /export const APP_VERSION\s*=\s*'[^']+'/,
      `export const APP_VERSION = '${nextVersion}'`
    );
    fs.writeFileSync(VERSION_TS_PATH, updatedContent, 'utf8');
  } catch (err) {
    console.warn('[nita-version-stamp] Could not update src/utils/version.ts:', err);
  }

  try {
    fs.writeFileSync(
      PUBLIC_VERSION_JSON_PATH,
      `${JSON.stringify({ version: nextVersion, timestamp: BUILD_TIME, app: 'NITA' }, null, 2)}\n`,
      'utf8'
    );
  } catch (err) {
    console.warn('[nita-version-stamp] Could not update public/version.json:', err);
  }

  cachedBuildVersion = nextVersion;
  return nextVersion;
}

function versionManifestPlugin(buildId: string, buildTime: string, appVersion: string): Plugin {
  return {
    name: 'nita-version-stamp',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({
          version: buildId,
          appVersion,
          timestamp: buildTime,
          app: 'NITA',
        }),
      });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/version.json')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.end(JSON.stringify({
            version: buildId,
            appVersion: readCurrentVersionFromDisk(),
            timestamp: buildTime,
            app: 'NITA',
          }));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const activeVersion =
    command === 'build' && process.env.DISABLE_AUTO_VERSION_BUMP !== 'true'
      ? advanceVersionOnBuild()
      : readCurrentVersionFromDisk();

  return {
    define: {
      __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
      __APP_BUILD_TIME__: JSON.stringify(BUILD_TIME),
      __APP_VERSION__: JSON.stringify(activeVersion),
    },
    plugins: [
      react(),
      tailwindcss(),
      versionManifestPlugin(BUILD_ID, BUILD_TIME, activeVersion),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'nita-logo.jpg', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'NITA - TUS FINANZAS, MAS SIMPLES',
          short_name: 'NITA',
          description: 'NITA - TUS FINANZAS, MAS SIMPLES: Presupuestación inteligente basada en calendario real y método de 5 frascos.',
          theme_color: '#2563eb',
          background_color: '#f8fafc',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: '/index.html',
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/version.json'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

