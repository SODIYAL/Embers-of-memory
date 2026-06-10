import { defineConfig } from 'vite';

// base './' keeps every URL in the bundle relative, so the same build works
// at a domain root or under a subpath (GitHub Pages). Phaser's runtime asset
// loads in BootScene are relative for the same reason.
//
// Split Phaser (the big chunk) into its own file so first-load can cache it
// independently of game code on subsequent visits.
export default defineConfig({
  base: './',
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/phaser')) return 'phaser';
        },
      },
    },
  },
});
