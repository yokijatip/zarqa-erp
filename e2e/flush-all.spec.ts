import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe.configure({ mode: 'serial' });

test('flush seluruh data operasional dari UI', async ({ page }) => {
  const flushPassword = process.env.FLUSH_PASSWORD;
  if (!flushPassword) throw new Error('FLUSH_PASSWORD harus di-set.');

  await loginAs(page);
  await page.goto('/pengaturan/flushing');
  await expect(page.getByRole('heading', { name: /flushing database/i })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: /pilih semua data operasional/i }).click();
  await page.getByLabel(/password flush/i).fill(flushPassword);
  await page.getByLabel(/konfirmasi teks/i).fill('HAPUS DATA');

  const reviewButton = page.getByRole('button', { name: /tinjau dan flush/i });
  await expect(reviewButton).toBeEnabled();
  await reviewButton.click();

  await expect(
    page.getByRole('heading', { name: /konfirmasi flush terakhir/i }),
  ).toBeVisible();
  const finalButton = page.getByRole('button', { name: /ya, hapus \d+ submenu/i });
  await expect(finalButton).toBeEnabled();
  await finalButton.click();

  await expect(page.getByRole('heading', { name: /flush berhasil/i })).toBeVisible({
    timeout: 120_000,
  });
});
