import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test('draft import tampil di input barang keluar', async ({ page }) => {
  await loginAs(page);
  await page.goto('/barang-keluar/catat');
  await page.evaluate(() => {
    sessionStorage.setItem('zarqa-erp:barang-keluar-import-draft', JSON.stringify({
      fileName: 'import-parsial.txt',
      tujuan: 'Shopee',
      namaReseller: '',
      keterangan: 'Import test',
      unmatchedLines: ['MODEL TIDAK TERDAFTAR L/XL 3 Pcs'],
      items: [{
        model_id: 'fixture-model',
        nama_model: 'MODEL COCOK',
        nama_warna: 'BURGUNDY',
        detail_keluar: [{ ukuran: 'L/XL', jumlah_pcs: 2 }],
        total_pcs: 2,
        status: 'pending',
        alasan_pending: 'Stok belum tersedia',
        tujuan_import: 'Shopee',
      }],
    }));
  });
  await page.reload();
  await expect(page.getByText('Hasil import: import-parsial.txt')).toBeVisible();
  await expect(page.getByText(/1 baris dilewati karena model belum cocok/i)).toBeVisible();
  await expect(page.getByText('MODEL COCOK - BURGUNDY')).toBeVisible();
  await expect(page.getByText(/L\/XL: 2/)).toBeVisible();
  await expect(page.getByText('Pending', { exact: true }).first()).toBeVisible();
});
