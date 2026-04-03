import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe.configure({ mode: 'serial' });

type PotonganEntry = {
  modelName: string;
  ukuran: string;
  stokTersedia: number;
};

async function waitForStokPotonganReady(page: Page) {
  await page.getByRole('heading', { name: /stok potongan kain/i }).waitFor({
    timeout: 15_000,
  });

  await page.waitForFunction(() => {
    const bodyText = document.body.innerText.toLowerCase();
    const hasTable = bodyText.includes('nama model') && bodyText.includes('stok tersedia');
    const hasEmpty = bodyText.includes('belum ada stok potongan');
    const hasError = bodyText.includes('gagal memuat data stok potongan');
    return hasTable || hasEmpty || hasError;
  }, undefined, { timeout: 15_000 });
}

async function getFirstPotonganEntry(page: Page): Promise<PotonganEntry | null> {
  await waitForStokPotonganReady(page);

  if (await page.getByText(/belum ada stok potongan/i).isVisible().catch(() => false)) {
    return null;
  }

  const rows = page.locator('tbody tr');
  const count = await rows.count();

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const cells = row.locator('td');
    const stokText = ((await cells.nth(3).textContent()) ?? '').replace(/[^\d]/g, '');
    const stokTersedia = Number(stokText || '0');

    if (stokTersedia > 0) {
      return {
        modelName: ((await cells.nth(0).textContent()) ?? '').trim(),
        ukuran: ((await cells.nth(2).textContent()) ?? '').trim(),
        stokTersedia,
      };
    }
  }

  return null;
}

async function openBuatOrderDariPotongan(page: Page, modelName: string) {
  await page.goto('/order-produksi');
  await page.getByRole('heading', { name: /order produksi/i }).waitFor({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: /buat order/i }).click();
  await page.getByText(/buat order produksi/i).waitFor({ timeout: 10_000 });

  const modelTrigger = page.locator('label[for="model-select"]')
    .locator('..')
    .locator('[data-slot="select-trigger"]');
  await modelTrigger.click();
  await page.getByText(modelName, { exact: false }).last().click();

  const toggle = page.getByRole('switch', { name: /dari potongan kain/i });
  await toggle.click();

  await page.getByText(/stok potongan tersedia/i).waitFor({ timeout: 10_000 });
}

test.describe('Order Produksi Dari Potongan', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('menampilkan stok potongan per ukuran saat mode dari potongan aktif', async ({
    page,
  }) => {
    await page.goto('/stok-potongan');
    const potongan = await getFirstPotonganEntry(page);

    test.skip(!potongan, 'Tidak ada stok potongan tersedia untuk diuji.');

    await openBuatOrderDariPotongan(page, potongan!.modelName);

    await expect(page.getByText(/stok potongan tersedia/i)).toBeVisible();
    await expect(page.getByText(new RegExp(`Ukuran\\s+${potongan!.ukuran}`, 'i'))).toBeVisible();
    await expect(
      page.getByText(new RegExp(`${potongan!.stokTersedia}\\s+pcs tersedia`, 'i')),
    ).toBeVisible();
  });

  test('tombol buat order disabled jika jumlah melebihi stok potongan tersedia', async ({
    page,
  }) => {
    await page.goto('/stok-potongan');
    const potongan = await getFirstPotonganEntry(page);

    test.skip(!potongan, 'Tidak ada stok potongan tersedia untuk diuji.');

    await openBuatOrderDariPotongan(page, potongan!.modelName);

    await page.locator(`#ukuran-${potongan!.ukuran}`).fill(String(potongan!.stokTersedia + 1));

    await expect(
      page.getByText(new RegExp(`diminta:\\s*${potongan!.stokTersedia + 1}`, 'i')),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /buat order/i })).toBeDisabled();
  });

  test('tombol buat order enabled jika jumlah masih dalam batas stok potongan', async ({
    page,
  }) => {
    await page.goto('/stok-potongan');
    const potongan = await getFirstPotonganEntry(page);

    test.skip(!potongan, 'Tidak ada stok potongan tersedia untuk diuji.');

    await openBuatOrderDariPotongan(page, potongan!.modelName);

    await page.locator(`#ukuran-${potongan!.ukuran}`).fill('1');

    await expect(page.getByRole('button', { name: /buat order/i })).toBeEnabled();
  });
});
