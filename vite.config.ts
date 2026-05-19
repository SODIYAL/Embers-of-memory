import { defineConfig } from 'vite';

// Split Phaser (the big chunk) into its own file so first-load can cache it
// independently of game code on subsequent visits.
export default defineConfig({
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
