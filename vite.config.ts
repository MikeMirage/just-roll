import { defineConfig } from 'vite';

// Keep assets relative so the same build works under a GitHub Pages repo path.
export default defineConfig({ base: './' });
