import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe.configure({ mode: 'serial' });

async function waitForStokPotonganReady(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const bodyText = document.body.innerText.toLowerCase();
    const hasHeaderTable = bodyText.includes('nama model') && bodyText.includes('stok tersedia');
    const hasEmptyState = bodyText.includes('belum ada stok potongan');
    const hasErrorState = bodyText.includes('gagal memuat data stok potongan');
    const hasRows = document.querySelectorAll('tbody tr').length > 0;

    return hasHeaderTable || hasEmptyState || hasErrorState || hasRows;
  }, undefined, { timeout: 15_000 });
}

test.describe('Stok Potongan Kain', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
    await page.goto('/stok-potongan');
    await page.getByRole('heading', { name: /stok potongan kain/i }).waitFor({
      timeout: 15_000,
    });
    await waitForStokPotonganReady(page);
  });

  test('halaman stok potongan berhasil dimuat', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /stok potongan kain/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible();
    await expect(
      page.getByPlaceholder(/cari nama model/i),
    ).toBeVisible();
  });

  test('menampilkan tabel stok potongan atau empty state yang sesuai', async ({
    page,
  }) => {
    await waitForStokPotonganReady(page);

    const emptyState = page.getByText(/belum ada stok potongan/i);
    const errorState = page.getByText(/gagal memuat data stok potongan/i);
    const firstDataRow = page.locator('tbody tr').first();

    if (await errorState.isVisible().catch(() => false)) {
      throw new Error('Halaman stok potongan gagal memuat data dari Firebase.');
    }

    if (await emptyState.isVisible().catch(() => false)) {
      await expect(emptyState).toBeVisible();
      await expect(
        page.getByText(/stok akan muncul saat worker cutting menyimpan sisa potongan/i),
      ).toBeVisible();
      return;
    }

    await expect(page.getByRole('columnheader', { name: /nama model/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /warna/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /ukuran/i })).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: /stok tersedia/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: /total masuk/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: /total terpakai/i }),
    ).toBeVisible();
    await expect(firstDataRow).toBeVisible();
  });

  test('pencarian stok potongan bekerja untuk data hasil cutting', async ({
    page,
  }) => {
    await waitForStokPotonganReady(page);

    const searchInput = page.getByPlaceholder(/cari nama model/i);
    const errorState = page.getByText(/gagal memuat data stok potongan/i);
    const firstModelCell = page.locator('tbody tr td').first();

    if (await errorState.isVisible().catch(() => false)) {
      throw new Error('Halaman stok potongan gagal memuat data dari Firebase.');
    }

    if ((await page.locator('tbody tr').count()) === 0) {
      await expect(page.getByText(/belum ada stok potongan/i)).toBeVisible();
      return;
    }

    const modelName = (await firstModelCell.textContent())?.trim() ?? '';
    expect(modelName.length).toBeGreaterThan(0);

    await searchInput.fill(modelName.slice(0, Math.min(modelName.length, 5)));
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(firstModelCell).toContainText(modelName);

    await searchInput.fill('zzztidakadahasil');
    await expect(page.getByText(/tidak ada hasil untuk/i)).toBeVisible();

    await searchInput.fill('');
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });
});
