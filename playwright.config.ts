import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Folder tempat file test berada
  testDir: './e2e',

  // Timeout per test (30 detik)
  timeout: 30_000,

  // Retry gagal 1x saat CI, tidak retry saat lokal
  retries: process.env.CI ? 1 : 0,

  // Jalankan test secara paralel
  fullyParallel: true,

  // Laporan: HTML (buka otomatis setelah test), plus ringkasan di terminal
  reporter: [['html', { open: 'on-failure' }], ['list']],

  use: {
    // Base URL aplikasi — ganti ke http://localhost:4173 jika pakai `preview`
    baseURL: 'http://localhost:5173',

    // Screenshot hanya saat test gagal
    screenshot: 'only-on-failure',

    // Video hanya saat test gagal
    video: 'on-first-retry',

    // Simpan trace (untuk debugging) saat retry pertama
    trace: 'on-first-retry',
  },

  projects: [
    // ── E2E & Visual Tests ────────────────────────────────────────
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],

  // Otomatis start dev server sebelum test berjalan
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
