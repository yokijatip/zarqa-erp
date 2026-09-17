import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe.configure({ mode: 'serial' });

const suffix = Date.now();
const modelName = `E2E Baju ${suffix}`;
const hijabName = `E2E Hijab ${suffix}`;
const kainName = `E2E Kain ${suffix}`;
const financeNote = `E2E ${suffix}`;
const today = new Date().toISOString().slice(0, 10);

const routes = [
  '/dashboard',
  '/gudang',
  '/stok-kain',
  '/model-hijab',
  '/stok-hijab',
  '/model-baju',
  '/stok-potongan',
  '/barang-jadi',
  '/barang-keluar',
  '/barang-keluar/catat',
  '/monitor-produksi',
  '/produksi/cutting',
  '/produksi/cutting/rekap',
  '/produksi/jahit',
  '/produksi/steam',
  '/penjualan',
  '/penjualan/order',
  '/keuangan',
  '/keuangan/budget',
  '/laporan',
  '/laporan/aktivitas',
  '/laporan/gaji',
  '/karyawan',
  '/karyawan/data',
  '/karyawan/penggajian',
  '/pengaturan',
  '/pengaturan/profil',
  '/pengaturan/notifikasi',
  '/pengaturan/bahasa',
  '/pengaturan/tampilan',
  '/pengaturan/integrasi',
  '/pengaturan/flushing',
];

async function chooseOption(page: Page, trigger: Locator, label: string | RegExp) {
  const isNativeSelect = await trigger.evaluate((element) => element instanceof HTMLSelectElement).catch(() => false);
  if (isNativeSelect) {
    if (typeof label !== 'string') throw new Error('Native select membutuhkan label string.');
    await trigger.selectOption({ label });
    return;
  }
  await trigger.click();
  const exact = typeof label === 'string';
  const option = page.getByText(label, { exact }).last();
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
}

async function chooseFirstOption(page: Page, trigger: Locator) {
  await trigger.click();
  const options = page.locator('[data-slot="select-item"], [role="option"]');
  await expect(options.first()).toBeVisible({ timeout: 10_000 });
  await options.first().click();
}

function dialog(page: Page) {
  return page.getByRole('dialog').last();
}

async function waitForToast(page: Page, text: string | RegExp) {
  await expect(page.getByText(text, { exact: typeof text === 'string' })).toBeVisible({
    timeout: 15_000,
  });
}

test('semua route dashboard dapat dimuat tanpa page error', async ({ page }) => {
  test.setTimeout(120_000);
  await loginAs(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(`${page.url()} :: ${error.message}`));

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('main').last()).toBeVisible({ timeout: 15_000 });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/The query requires an index/i);
    expect(bodyText).not.toMatch(/UnhandledPromiseRejection|Cannot read properties/i);
  }

  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

test('pengaturan notifikasi dan tema tersimpan dari UI', async ({ page }) => {
  await loginAs(page);

  await page.goto('/pengaturan/notifikasi');
  await expect(page.getByRole('heading', { name: 'Notifikasi', exact: true })).toBeVisible();
  const allNotifications = page.getByRole('checkbox', { name: /Aktifkan semua notifikasi/i });
  await expect(allNotifications).toBeVisible();
  if (!(await allNotifications.isChecked())) await allNotifications.check();
  await page.getByRole('button', { name: /Simpan perubahan/i }).click();
  await waitForToast(page, 'Preferensi notifikasi tersimpan.');

  await page.goto('/pengaturan/tampilan');
  await page.getByRole('button', { name: /Midnight/i }).click();
  await page.getByRole('button', { name: /^Simpan$/ }).click();
  await waitForToast(page, /Tersimpan/);
  await page.getByRole('button', { name: /^Terang/i }).click();
  await page.getByRole('button', { name: /^Simpan$/ }).click();
});

test('keuangan: saldo awal, transaksi, aset, dan budget berfungsi', async ({ page }) => {
  test.setTimeout(120_000);
  await loginAs(page);
  await page.goto('/keuangan');
  await expect(page.getByRole('heading', { name: 'Keuangan', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Saldo Awal', exact: true }).click();
  await page.locator('#saldo-awal-tanggal').fill(today);
  await page.locator('#saldo-awal-kas').fill('1000000');
  await page.locator('#saldo-awal-modal').fill('500000');
  await page.locator('#saldo-awal-catatan').fill(`Saldo migrasi ${financeNote}`);
  await page.getByRole('button', { name: /Simpan|Perbarui Saldo Awal/i }).click();
  await waitForToast(page, 'Saldo awal migrasi disimpan.');

  await page.getByRole('button', { name: 'Transaksi', exact: true }).first().click();
  await expect(dialog(page).getByRole('heading', { name: 'Catat Transaksi' })).toBeVisible();
  await page.locator('#tanggal-transaksi').fill(today);
  await page.locator('#nominal-transaksi').fill('250000');
  await page.locator('#deskripsi-transaksi').fill(`Pemasukan ${financeNote}`);
  await page.getByRole('button', { name: 'Simpan Transaksi', exact: true }).click();
  await waitForToast(page, 'Transaksi keuangan dicatat.');

  await page.getByRole('button', { name: 'Transaksi', exact: true }).first().click();
  await expect(dialog(page).getByRole('heading', { name: 'Catat Transaksi' })).toBeVisible();
  await page.locator('#tanggal-transaksi').fill(today);
  await page.locator('#nominal-transaksi').fill('75000');
  await page.locator('#deskripsi-transaksi').fill(`Pengeluaran ${financeNote}`);
  await page.getByRole('button', { name: 'Simpan Transaksi', exact: true }).click();
  await waitForToast(page, 'Transaksi keuangan dicatat.');

  await page.getByRole('button', { name: 'Aset', exact: true }).click();
  await page.getByRole('button', { name: 'Tambah Aset', exact: true }).click();
  await expect(dialog(page).getByRole('heading', { name: 'Tambah Aset Perusahaan' })).toBeVisible();
  await page.locator('#nama-aset').fill(`Komputer ${financeNote}`);
  await page.locator('#tanggal-aset').fill(today);
  await page.locator('#jumlah-aset').fill('1');
  await page.locator('#harga-aset').fill('3000000');
  await page.locator('#masa-manfaat-aset').fill('48');
  await page.locator('#residu-aset').fill('0');
  await page.locator('#mulai-penyusutan-aset').fill(today);
  await page.locator('#lokasi-aset').fill('E2E');
  await page.getByLabel(/Catat pembelian ini juga sebagai pengeluaran kas/i).check();
  await page.getByRole('button', { name: 'Simpan Aset', exact: true }).click();
  await waitForToast(page, 'Aset dan pengeluaran pembelian dicatat.');

  await page.goto('/keuangan/budget');
  await expect(page.getByRole('heading', { name: 'Budget Bulanan', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tambah Budget', exact: true }).click();
  const budgetDialog = page.getByRole('dialog');
  await budgetDialog.locator('input[type="month"]').last().fill(today.slice(0, 7));
  await budgetDialog.locator('select').selectOption('operasional');
  await budgetDialog.locator('input[type="number"]').fill('500000');
  await budgetDialog.getByRole('button', { name: 'Simpan Budget', exact: true }).click();
  await expect(page.getByText(/Budget berhasil disimpan\.|Budget untuk kategori .* sudah ada\./i)).toBeVisible({ timeout: 15_000 });
});

test('gudang: model baju, master kain, stok kain, model hijab, dan stok hijab', async ({ page }) => {
  await loginAs(page);

  await page.goto('/model-baju');
  await page.getByRole('button', { name: 'Tambah Model', exact: true }).first().click();
  const modelDialog = dialog(page);
  await modelDialog.getByLabel('Nama Model').fill(modelName);
  await modelDialog.getByRole('button', { name: 'XS', exact: true }).click();
  await modelDialog.getByText(/Pilih warna/).click();
  await page.getByRole('button', { name: /Pilih semua/i }).click();
  if (await page.locator('#harga-jual-XS').isVisible().catch(() => false)) {
    await page.locator('#harga-jual-XS').fill('100000');
    await page.locator('#harga-produksi-XS').fill('70000');
  }
  await page.locator('#kebutuhan-yard-XS').fill('2.4');
  await modelDialog.getByRole('button', { name: 'Tambah Model', exact: true }).click();
  await expect(modelDialog).not.toBeVisible({ timeout: 15_000 });
  await waitForToast(page, /berhasil/i);

  await page.goto('/stok-kain');
  await page.getByRole('button', { name: 'Tambah Kain', exact: true }).first().click();
  const kainDialog = dialog(page);
  await page.getByRole('button', { name: 'Tambah jenis', exact: true }).click();
  await page.locator('#master-nama-kain').fill(kainName);
  await page.getByRole('button', { name: 'Simpan Jenis', exact: true }).click();
  await chooseOption(page, page.locator('#jenis-kain'), kainName);
  await page.locator('#stok-awal').fill('10');
  await page.locator('#harga-awal').fill('5000');
  const purchaseCheckbox = page.getByLabel(/Catat sebagai pembelian baru/i);
  if (await purchaseCheckbox.isChecked()) await purchaseCheckbox.uncheck();
  await page.getByRole('button', { name: 'Simpan Kain', exact: true }).click();
  await expect(kainDialog).not.toBeVisible({ timeout: 15_000 });
  await waitForToast(page, /berhasil ditambahkan/i);

  await page.goto('/model-hijab');
  await page.getByRole('button', { name: 'Tambah Model Hijab', exact: true }).first().click();
  const hijabDialog = dialog(page);
  await hijabDialog.getByLabel('Nama Hijab').fill(hijabName);
  if (await page.locator('#model-hijab-sale-price').isVisible().catch(() => false)) {
    await page.locator('#model-hijab-sale-price').fill('25000');
    await page.locator('#model-hijab-production-price').fill('10000');
  }
  await hijabDialog.getByRole('button', { name: 'Tambah Model', exact: true }).click();
  await expect(hijabDialog).not.toBeVisible({ timeout: 15_000 });

  await page.goto('/stok-hijab');
  await page.getByRole('button', { name: 'Tambah Stok Hijab', exact: true }).click();
  const stockHijabDialog = dialog(page);
  await chooseOption(page, page.locator('#hijab-model'), hijabName);
  await page.locator('#hijab-initial').fill('2');
  await page.locator('#hijab-min').fill('1');
  await stockHijabDialog.getByRole('button', { name: 'Simpan Stok', exact: true }).click();
  await expect(stockHijabDialog).not.toBeVisible({ timeout: 15_000 });
});

test('produksi baju: cutting, stok potongan, jahit, steam, reject diperbaiki, stok jadi', async ({ page }) => {
  test.setTimeout(180_000);
  await loginAs(page);

  await page.goto('/produksi/cutting');
  await page.getByRole('button', { name: 'Buat Order Cutting', exact: true }).click();
  const cuttingDialog = dialog(page);
  const modelTrigger = cuttingDialog.locator('label[for="model-select-stage"]').locator('..').locator('button').first();
  await chooseOption(page, modelTrigger, modelName);
  const colorTrigger = cuttingDialog.locator('p').filter({ hasText: 'Warna Produksi' }).locator('..').locator('button').first();
  await chooseFirstOption(page, colorTrigger);
  const sizeTrigger = cuttingDialog.locator('label').filter({ hasText: /^Ukuran/ }).locator('..').locator('button').first();
  await chooseOption(page, sizeTrigger, 'XS');
  await cuttingDialog.getByRole('button', { name: /Tambah Kain/ }).click();
  await chooseOption(page, cuttingDialog.getByRole('button', { name: 'Pilih jenis', exact: true }).last(), new RegExp(kainName));
  await chooseFirstOption(page, cuttingDialog.getByRole('button', { name: 'Pilih warna', exact: true }).last());
  const kainNumbers = cuttingDialog.locator('input[type="number"]');
  await kainNumbers.nth(0).fill('4.8');
  await kainNumbers.nth(1).fill('2.4');
  const workerTrigger = cuttingDialog.getByRole('button', { name: /Pilih petugas/i }).last();
  await chooseFirstOption(page, workerTrigger);
  const createCuttingButton = cuttingDialog.getByRole('button', { name: 'Buat Order Cutting', exact: true });
  await expect(createCuttingButton).toBeEnabled({ timeout: 10_000 });
  await createCuttingButton.click();
  await expect(cuttingDialog).not.toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(modelName, { exact: true }).first()).toBeVisible({ timeout: 20_000 });

  const cuttingRow = page.getByRole('row').filter({ hasText: modelName }).last();
  await cuttingRow.locator('td').first().click();
  await expect(page).toHaveURL(/\/monitor-produksi\/[^/]+$/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Mulai Cutting', exact: true }).first().click();
  await dialog(page).getByRole('button', { name: 'Mulai Cutting', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Selesaikan Cutting', exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Selesaikan Cutting', exact: true }).first().click();
  await dialog(page).getByRole('button', { name: 'Selesaikan Cutting', exact: true }).click();
  await expect(page.getByText(/Cutting Selesai/i).first()).toBeVisible({ timeout: 20_000 });

  await page.goto('/produksi/jahit');
  await page.getByRole('button', { name: 'Buat Order Jahit', exact: true }).click();
  const jahitDialog = dialog(page);
  const potonganTrigger = jahitDialog.locator('label[for="model-select-stage"]').locator('..').locator('button').first();
  await chooseOption(page, potonganTrigger, new RegExp(modelName));
  await jahitDialog.locator('#ukuran-jahit-XS').fill('2');
  await chooseFirstOption(page, jahitDialog.getByRole('button', { name: /Pilih petugas/i }).last());
  await jahitDialog.getByRole('button', { name: 'Buat Order Jahit', exact: true }).click();
  await expect(page.getByText(modelName, { exact: true }).first()).toBeVisible({ timeout: 20_000 });

  const jahitRow = page.getByRole('row').filter({ hasText: modelName }).last();
  await jahitRow.locator('td').first().click();
  await expect(page).toHaveURL(/\/monitor-produksi\/[^/]+$/, { timeout: 15_000 });
  const jahitBatchUrl = page.url();
  await page.getByRole('button', { name: 'Mulai Jahit', exact: true }).first().click();
  await dialog(page).getByRole('button', { name: 'Mulai Jahit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Selesaikan Jahit', exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Selesaikan Jahit', exact: true }).first().click();
  await dialog(page).getByRole('button', { name: 'Selesaikan Jahit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mulai Steam', exact: true }).first()).toBeVisible({ timeout: 20_000 });

  await page.goto('/produksi/steam');
  const steamRow = page.getByRole('row').filter({ hasText: modelName }).last();
  await expect(steamRow).toBeVisible({ timeout: 20_000 });
  await steamRow.getByRole('button', { name: 'Mulai Steam', exact: true }).click();
  const steamDialog = dialog(page);
  await chooseFirstOption(page, steamDialog.getByRole('button', { name: /Pilih petugas/i }).last());
  await steamDialog.getByRole('button', { name: 'Mulai Steam', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: modelName }).last().getByRole('button', { name: 'Selesaikan', exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('row').filter({ hasText: modelName }).last().getByRole('button', { name: 'Selesaikan', exact: true }).click();
  const finalSteamDialog = dialog(page);
  await finalSteamDialog.locator('input[type="number"]').last().fill('1');
  await finalSteamDialog.getByRole('button', { name: /Selesaikan & Kirim ke Barang Jadi/i }).click();
  await expect(page.getByRole('row').filter({ hasText: modelName })).toHaveCount(0, { timeout: 20_000 });

  await page.goto(jahitBatchUrl);
  await expect(page.getByRole('button', { name: /1 reject/i })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /1 reject/i }).click();
  const rejectDialog = dialog(page);
  await expect(rejectDialog.getByText(/Sisa 1 \/ 1 pcs/i)).toBeVisible({ timeout: 15_000 });
  await rejectDialog.getByRole('button', { name: 'Selesai Diperbaiki', exact: true }).click();
  await expect(rejectDialog.getByText(/Sudah selesai/i)).toBeVisible({ timeout: 20_000 });

  await page.goto('/barang-jadi');
  await page.locator('input[placeholder="Cari nama model..."]').fill(modelName);
  await expect(page.getByText(modelName, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await page.getByText(modelName, { exact: true }).first().click();
  await expect(page.getByText(modelName, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/pcs tersedia/i).first()).toBeVisible({ timeout: 20_000 });
});

test('barang keluar: import PDF membuka dialog hasil, bukan toast error panjang', async ({ page }) => {
  await loginAs(page);
  await page.goto('/barang-keluar');
  const importInput = page.locator('input[type="file"][accept*="pdf"]');
  await importInput.setInputFiles('C:\\Games\\List Pengambilan — ZARQA.pdf');
  await expect(page.getByRole('heading', { name: 'Import belum dapat diproses' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Tutup', exact: true }).click();
});
