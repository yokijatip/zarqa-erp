# Laporan Pengujian End-to-End Zarqa ERP

Tanggal: 6 September 2026  
Environment: `zarqa-erp-development`  
Metode: Playwright Chromium desktop dan mobile, smoke test route, validasi build dan type-check.

## Kesimpulan

Status: **WEB FUNCTIONAL PASS WITH FOLLOW-UP**.

Use case web yang menjadi cakupan pengujian sudah dijalankan. Follow-up yang tersisa adalah baseline visual lama dan pengujian Android; proyek Android tidak tersedia di workspace ini.

## Hasil Otomatis

| Pengujian | Hasil |
|---|---:|
| Acceptance + auth, desktop dan mobile | 20/20 passed |
| Smoke semua route dashboard setelah flush | 1/1 passed |
| Stok potongan setelah perbaikan ID ukuran | 3/3 passed |
| Flush database melalui UI | 1/1 passed |
| Gap test: pending order + ekspor Aktivitas | 1/1 passed |
| Check Svelte/TypeScript | Exit 0 |
| Production build | Exit 0 |
| Git diff check | Exit 0 |
| Visual regression | 2/10 passed |

Visual regression gagal karena test lama masih menunggu selector `Diperbarui:` dan baseline screenshot lama tidak sesuai dimensi UI terbaru. Ini bukan page error runtime.

## Use Case Yang Sudah Diuji

### Auth dan navigasi

- Root dan dashboard mengarahkan pengguna belum login ke `/login`.
- Login valid berhasil.
- Login invalid menampilkan error.
- Route dashboard desktop dan mobile dapat dimuat tanpa page error.
- Tidak ada pesan Firestore index yang tampil di halaman.

### Keuangan

- Saldo awal migrasi.
- Pemasukan.
- Pengeluaran.
- Pembelian aset komputer dengan pengurangan kas.
- Penyusutan aset tersimpan sebagai informasi aset, bukan beban pembelian.
- Budget bulanan.
- Dashboard keuangan dan chart dapat dimuat.
- Payroll reguler dibayar, PDF slip terunduh, dan transaksi gaji mengurangi kas.
- Payroll produksi dibayar, PDF rekap dan slip terunduh, dan transaksi masuk ke keuangan.

### Gudang dan master data

- Model baju.
- Ukuran `XS`, `S/M`, `L/XL`, `XXL`.
- Pilih warna dan pilih semua warna.
- Master kain.
- Stok kain.
- Model hijab tanpa ukuran.
- Warna hijab.
- Stok awal hijab.
- HPP hijab mengikuti master model hijab.
- Restock stok hijab.
- Kurangi stok hijab.
- Set stok manual barang jadi.
- Riwayat masuk dan keluar stok.

### Produksi baju

- Cutting.
- Pemakaian kain.
- Stok potongan.
- Jahit.
- Steam.
- Reject di steam.
- Reject diperbaiki.
- Reject yang diperbaiki masuk stok barang jadi.
- Riwayat proses batch.
- Riwayat masuk barang jadi.
- Ukuran `S/M` dan `L/XL` aman dipakai saat sinkronisasi stok potongan.

### Produksi hijab

- Batch hijab tanpa ukuran.
- Cutting hijab.
- Stok potongan hijab.
- Jahit hijab.
- Steam hijab.
- Stok hijab hasil produksi.
- Batch hijab tanpa warna tidak lagi gagal karena field Firestore `undefined`.

### Karyawan

- Tambah akun karyawan reguler.
- Edit jabatan dan data karyawan.
- Buka detail karyawan.
- Hapus fixture karyawan melalui menu aksi.
- Penggajian reguler dan produksi.

### Add-on dan stok bersama

- Model set hijab dibuat sebagai model baju terpisah.
- Stok model set dikaitkan ke model induk.
- Add-on hijab disimpan.
- Barang keluar varian add-on mengurangi stok model induk.
- Barang keluar varian add-on mengurangi stok hijab.
- Riwayat barang keluar mencatat nama model, add-on, tujuan, dan jumlah.
- Detail model set menampilkan sumber stok induk.

### Barang keluar dan penjualan

- Input barang keluar manual.
- Pilih model.
- Pilih varian reguler/add-on.
- Pilih warna dan ukuran.
- Pilih tujuan pengiriman.
- Barang keluar mengurangi stok berdasarkan ketersediaan.
- Riwayat keluar barang jadi.
- Dashboard penjualan dapat dimuat.
- Chart penjualan dapat dibuat oleh Chart.js.
- Halaman order penjualan dapat dimuat.
- Export PDF order membuka jendela cetak.
- Import PDF dengan baris yang belum cocok menampilkan dialog hasil, bukan toast error panjang.
- Import PDF `List Pengambilan — ZARQA.pdf` berhasil memetakan model baju dan model hijab; `ALL SIZE` diterima untuk hijab, harga sistem tetap menjadi sumber harga.
- Order pending berhasil dibatalkan dan order pending lain berhasil diproses setelah stok tersedia.
- Pagination halaman kedua berhasil dimuat dengan lebih dari 50 pengiriman.
- Export PDF barang keluar, order, laporan keuangan, laporan gaji, dan laporan aktivitas berhasil dibuka atau diunduh.

### Pengaturan

- Preferensi notifikasi tersimpan.
- Preferensi tampilan tersimpan.
- Tema Terang, Gelap, Sistem, Midnight, Ocean, Forest, dan AMOLED tersimpan melalui UI.
- Halaman profil, bahasa, integrasi, dan flushing dapat dimuat.
- Flush seluruh data operasional berhasil dilakukan melalui UI.
- Master data dan akun tetap dipertahankan setelah flush.

## Bug Yang Ditemukan Dan Diperbaiki

1. Halaman stok kain dan stok potongan dapat stuck pada skeleton saat initial mount. Ditangani dengan refresh melalui `onMount` dan `afterNavigate`.
2. Produksi hijab tanpa warna menulis `nama_warna: undefined` ke Firestore dan gagal transaksi. Field opsional sekarang hanya ditulis jika memiliki nilai.
3. Reject steam sebelumnya dapat tidak terbaca sebagai detail reject. Detail reject sekarang dapat diinferensikan dari jumlah reject dan ukuran batch.
4. Riwayat proses batch tidak lagi bergantung pada composite index yang belum tersedia; subcollection diambil lalu diurutkan di client.
5. Alias ukuran lama dinormalisasi ke `S/M` pada data produksi dan riwayat.
6. ID dokumen stok potongan sebelumnya memakai ukuran mentah seperti `L/XL`; slash membuat referensi Firestore invalid dan menggagalkan auto-sync setelah cutting. Ukuran sekarang dinormalisasi menjadi key aman sebelum membentuk ID dokumen.

## Verifikasi Stok Add-on

Skenario nyata yang berhasil:

- Stok sumber sebelum keluar: 2 pcs.
- Stok hijab sebelum keluar: 3 pcs.
- Barang keluar add-on: 1 set.
- Stok sumber sesudah keluar: 1 pcs.
- Stok hijab sesudah keluar: 2 pcs.
- Riwayat barang keluar tercatat pada stok baju dan stok hijab.

## Batasan Dan Follow-up

1. Visual regression masih memakai selector `Diperbarui:` dan baseline berdimensi lama; smoke runtime tidak menemukan page error, tetapi snapshot visual belum diperbarui.
2. Tema Terang, Gelap, Sistem, Midnight, Ocean, Forest, dan AMOLED berhasil disimpan melalui UI. Pemeriksaan visual pixel-per-pixel semua tema desktop/mobile belum dijadikan baseline baru.
3. Tidak ada proyek Android di `C:\Dev\Web`; sinkronisasi dan pengujian Android belum dapat dijalankan dari workspace ini.

## Status Data Setelah Pengujian

Flush database operasional terakhir sudah dijalankan melalui Playwright setelah pengujian. Data test operasional dibersihkan. Master data dan akun tidak dihapus.

## Rekomendasi Tahap Berikutnya

- Tambahkan fixture data khusus test agar order, payroll, pagination, dan import sukses bisa diuji deterministik.
- Perbarui selector visual test dari `Diperbarui:` ke heading/status loading yang berlaku sekarang.
- Regenerasi baseline screenshot setelah desain final disepakati.
- Jalankan suite Android dari repository Android yang sesuai setelah path proyek tersedia.
