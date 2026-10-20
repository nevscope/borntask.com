import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://borntask.com',
  output: 'static',
  trailingSlash: 'always',
  server: {
    port: 4321,
    host: '127.0.0.1',
  },
});
