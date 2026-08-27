import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        listing: resolve(import.meta.dirname, 'complete-listing.html'),
        login: resolve(import.meta.dirname, 'login.html'),
        dashboard: resolve(import.meta.dirname, 'dashboard.html'),
        listingDetail: resolve(import.meta.dirname, 'listing-detail.html'),
        editListing: resolve(import.meta.dirname, 'edit-listing.html'),
      },
    },
  },
});
