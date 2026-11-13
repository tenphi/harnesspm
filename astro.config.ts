import { defineConfig } from 'astro/config';
import cookbook from '@tenphi/cookbook';

export default defineConfig({
  site: 'https://harnesspm.tenphi.me',
  output: 'static',
  // `npm run build` writes the published CLI to dist/, so the site builds
  // into its own folder.
  outDir: './site-dist',
  integrations: [cookbook()],
});
