import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        track: resolve(process.cwd(), 'track.html'),
        race: resolve(process.cwd(), 'race.html'),
        effects: resolve(process.cwd(), 'effects.html'),
        combat: resolve(process.cwd(), 'combat.html'),
        social: resolve(process.cwd(), 'social.html'),
        drivers: resolve(process.cwd(), 'drivers.html'),
      },
    },
  },
});
