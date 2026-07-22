// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { webcore } from 'webcoreui/integration';
import svelte from '@astrojs/svelte';

export default defineConfig({
  integrations: [webcore(), svelte()],
  vite: {
    plugins: [tailwindcss()]
  }
});
