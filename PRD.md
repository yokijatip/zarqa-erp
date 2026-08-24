# PRD - Zarqa ERP Web

## 1. Ringkasan Produk

Zarqa ERP Web adalah aplikasi ERP berbasis SvelteKit dan Firebase untuk mengelola operasional produksi busana muslim Zarqa. Web ini menjadi pusat kerja admin, owner, HR, gudang, dan monitoring produksi, sedangkan aplikasi Android Kotlin di `C:\Dev\Android\zarqa-erp-app` menjadi alat bantu pekerja lantai produksi untuk update proses cutting, jahit, steam, hasil kerja, dan notifikasi.

Kedua aplikasi menggunakan Firebase project yang sama. Data yang ditulis dari Android langsung masuk ke Firestore dan harus langsung terbaca di web ERP, terutama pada modul monitor produksi, stok potongan, barang jadi, barang keluar, performa, dan penggajian.

## 2. Tujuan Produk

| Tujuan | Penjelasan |
| --- | --- |
| Kontrol stok end-to-end | Memantau stok kain, stok potongan, stok barang jadi, dan barang keluar dalam satu alur. |
| Monitoring produksi real-time | Admin dapat melihat status batch dari cutting sampai completed berdasarkan update web dan Android. |
| Jejak produksi per karyawan | Setiap setoran hasil produksi tercatat di `riwayat_proses` untuk performa dan penggajian. |
| Konsistensi data operasional | Web dan Android memakai kontrak Firestore yang sama untuk batch, stok, reject, dan user. |
| UI operasional yang konsisten | Komponen interaktif wajib mengikuti pattern komponen UI lokal berbasis Bits UI/shadcn-svelte. |

## 3. Pengguna dan Role

| Role | Pengguna | Akses Utama Web | Akses Android |
| --- | --- | --- | --- |
| `owner` | Pemilik | Dashboard, monitoring, laporan, semua modul admin | Tidak prioritas |
| `developer` | Developer/admin teknis | Semua modul termasuk pengaturan teknis | Tidak prioritas |
| `admin_gudang` | Admin gudang | Stok, model, produksi, barang jadi/keluar | Admin screen gudang |
| `admin_hr` | HR | Data karyawan, penggajian | Tidak prioritas |
| `admin_keuangan` | Keuangan | Keuangan, laporan finansial | Tidak prioritas |
| `kepala_cutting` | Operator cutting | Produksi cutting sesuai role | Cutting screen |
| `kepala_jahit` | Operator jahit | Produksi jahit sesuai role | Jahit screen |
| `kepala_steam` | Operator steam | Produksi steam sesuai role | Steam screen |

## 4. Scope Produk Web Saat Ini

### Sudah Berjalan

| Modul | Status | Catatan |
| --- | --- | --- |
| Auth | Implemented | Login/register, guard route, profil user, ganti password, upload foto. |
| Dashboard | Implemented sebagian | KPI produksi, stok, barang keluar; modul keuangan masih placeholder. |
| Stok Kain | Implemented | CRUD, restock, kurangi manual, riwayat stok, analitik pemakaian. |
| Warna | Implemented | Master warna dengan validasi pemakaian sebelum hapus. |
| Model Baju | Implemented | CRUD model, ukuran, warna tersedia, tarif cutting/jahit/steam. |
| Produksi Cutting | Implemented | Buat order cutting, mulai/selesai, input hasil, sync stok potongan. |
| Stok Potongan | Implemented | List stok hasil cutting, koreksi, hapus, sumber cutting. |
| Produksi Jahit | Implemented | Buat order dari stok potongan, consume stok potongan FIFO, proses jahit. |
| Produksi Steam | Implemented | Quick action proses steam, setoran hasil, reject. |
| Monitor Produksi | Implemented | List dan detail batch, riwayat proses, edit kuantitas, penugasan, delete. |
| Barang Jadi | Implemented | Stok per model/warna/ukuran, tambah/kurangi/set manual, riwayat. |
| Barang Keluar | Implemented | Catat keluar, batalkan keluar, PDF, tujuan pengiriman baku. |
| Reject Items | Implemented | Pending reject, resolusi diperbaiki/tidak bisa diperbaiki, masuk stok jadi bila diperbaiki. |
| Data Karyawan | Implemented | CRUD akun user Firestore/Auth, role, tipe akun, tarif per pcs. |
| Penggajian | Implemented | Rekap mingguan dari `riwayat_proses`, cetak/simpan pembayaran. |
| Flushing Database | Implemented teknis | Hapus koleksi operasional terpilih, tetapi perlu pembatasan akses ketat. |
| Tampilan/Bahasa/Profil | Implemented lokal/sebagian | Preferensi tampilan berbasis localStorage; profil terhubung auth. |

### Belum Running / Gap

| Area | Kondisi Saat Ini | Kebutuhan PRD |
| --- | --- | --- |
| Absensi | Coming soon di sidebar | Modul absensi karyawan, jadwal, kehadiran, izin, rekap periode. |
| Penjualan | Coming soon di sidebar | Order penjualan, buyer/customer, status order, retur. |
| Pengiriman | Coming soon di sidebar | Jadwal kirim, tracking, link ke barang keluar dan marketplace. |
| Keuangan | Coming soon + dashboard menunjukkan "Modul keuangan belum tersedia" | Pemasukan, pengeluaran, biaya produksi, laba rugi, arus kas. |
| Laporan | Coming soon di sidebar | Laporan produksi, stok, penjualan, keuangan, export PDF/Excel. |
| Integrasi Marketplace | Halaman dummy untuk TikTok Shop/Shopee | OAuth/koneksi akun, sync order, sync stok, mapping SKU ke model/warna/ukuran. |
| Notifikasi Web | Halaman setting simulasi, belum persist dan belum kirim notifikasi | Preferensi notifikasi tersimpan, integrasi FCM/email/WhatsApp, event produksi/stok. |
| Security Rules | Tidak terlihat di repo | Rules harus membatasi create/update/delete per role, terutama Android direct write. |
| Audit Log Global | Tersebar di riwayat domain | Audit lintas modul untuk aksi kritis: flush, delete batch, stok manual, barang keluar. |
| Backup/Restore | Belum ada modul | Export backup Firestore operasional dan restore terkontrol. |
| Konsistensi UI | Masih ada form/search/toggle custom di beberapa halaman | Standarkan button, dropdown, select, dialog, popover, toggle, table, toast. |

## 5. Integrasi Dengan Android Worker App

Android app berada di `C:\Dev\Android\zarqa-erp-app` dengan package `com.yoki.zarqaproduction`. Aplikasi memakai Kotlin, Jetpack Compose, MVVM, Firebase Auth, Firestore, dan FCM.

Fungsi Android yang perlu dianggap sebagai bagian sistem:

| Area Android | Dampak ke Web |
| --- | --- |
| Cutting/Jahit/Steam screen | Update `batch_produksi`, `riwayat_proses`, `penugasan`, `pcs_saat_ini`, reject. |
| Setor parsial jahit | Membuat child batch untuk alur steam dan menyisakan batch induk. Web harus menampilkan lineage dengan benar. |
| Stok potongan | Hasil cutting masuk `stok_potongan`, dipakai web untuk buat order jahit. |
| Hasil kerja | Mengambil `collectionGroup("riwayat_proses")`; web penggajian harus memakai logika yang kompatibel. |
| Reject attribusi | Reject yang ditemukan di steam bisa diatribusikan ke jahit; web performa/penggajian harus menghitung sesuai atribusi. |
| FCM token | Android menyimpan token user; web/admin perlu modul pengiriman notifikasi produksi. |
| Admin gudang Android | Bisa melihat stok dan mencatat barang keluar; transaksi harus konsisten dengan web. |

Kontrak data utama:

- `users`
- `batch_produksi`
- `batch_produksi/{batchId}/riwayat_proses`
- `stok_kain`
- `stok_potongan`
- `stok_barang_jadi`
- `barang_keluar`
- `reject_items`
- `riwayat_barang_jadi`
- `pembayaran_gaji`

## 6. Alur Produksi Target

1. Admin gudang membuat order cutting dari web.
2. Kepala cutting memproses dari web atau Android.
3. Hasil cutting masuk ke stok potongan per model, warna, ukuran, dan sumber batch.
4. Admin/kepala jahit membuat order jahit dari stok potongan.
5. Kepala jahit bisa setor parsial atau selesai penuh.
6. Batch siap steam diproses kepala steam.
7. Admin menyelesaikan batch menjadi `COMPLETED`; stok barang jadi bertambah.
8. Barang keluar mengurangi stok barang jadi dengan FIFO sumber produksi.
9. Reject diselesaikan melalui modul reject; item diperbaiki dapat kembali masuk stok barang jadi.
10. Penggajian dan performa membaca `riwayat_proses`, sumber lot, dan reject attribusi.

## 7. Prinsip UI/UX Web

Semua pengembangan web harus mengikuti sistem UI yang sudah ada:

- Gunakan komponen di `src/lib/components/ui` sebagai default.
- Dropdown menu wajib memakai wrapper `dropdown-menu` berbasis Bits UI.
- Pilihan tunggal wajib memakai `select` berbasis Bits UI, bukan dropdown HTML custom.
- Dialog konfirmasi/form wajib memakai `dialog`; panel samping memakai `sheet`; overlay kecil memakai `popover`.
- Button wajib memakai komponen `Button` dari `$lib/components/ui/button`, bukan class button manual.
- Toggle/switch setting harus distandarkan ke komponen UI berbasis Bits UI sebelum fitur notifikasi diproduksikan.
- Ikon aksi memakai `@lucide/svelte` atau `lucide-svelte`, konsisten dengan repo.
- Tabel operasional memakai komponen `table` lokal bila memungkinkan.
- Hindari membuat pattern baru untuk toast, badge, search input, dan action menu jika sudah ada komponen lokal.

## 8. Requirement Fitur Lanjutan

### P0 - Stabilitas Sistem Inti

- Samakan kontrak field web dan Android untuk `detail_reject`, `reject_per_ukuran`, `pcs_saat_ini`, `sumber_cutting`, dan `sumber_produksi`.
- Tambah security rules berbasis role untuk operasi Firestore.
- Audit log global untuk operasi destruktif dan koreksi stok.
- Validasi konsistensi transaksi barang keluar antara web dan Android.
- Batasi halaman Flushing Database hanya untuk `developer` atau role khusus.

### P1 - Modul Yang Belum Running

- Absensi karyawan: check-in/out, izin, sakit, rekap periode.
- Keuangan: input biaya, pemasukan, pengeluaran, HPP produksi, laba rugi.
- Laporan: produksi, stok kain, stok potongan, barang jadi, barang keluar, gaji, reject.
- Notifikasi: preferensi tersimpan, trigger batch siap proses, stok menipis, batch selesai.
- Integrasi marketplace tahap 1: mapping SKU dan import order manual/CSV sebelum OAuth penuh.

### P2 - Ekspansi Operasional

- Penjualan: buyer, order penjualan, status pesanan, retur.
- Pengiriman: jadwal kirim, tracking, kanal marketplace, bukti kirim.
- Integrasi TikTok Shop/Shopee: OAuth, pull order, push stock, rekonsiliasi.
- Backup/restore dan export Excel.
- Dashboard owner dengan margin, performa divisi, dan tren penjualan.

## 9. Acceptance Criteria Umum

- Perubahan status dari Android tampil di web tanpa refresh manual bila halaman memakai subscription; minimal tampil benar setelah reload.
- Setiap perubahan stok memiliki riwayat dengan stok sebelum/sesudah.
- Setiap transaksi yang mengubah lebih dari satu dokumen memakai transaction/batch Firestore.
- Semua action destruktif memakai dialog konfirmasi dan role guard.
- Semua form menampilkan loading, disabled state, validasi, dan error message.
- Komponen dropdown/action/select konsisten dengan Bits UI wrapper lokal.
- Fitur baru memiliki e2e test minimal untuk happy path dan validasi kritis.

## 10. Non-Goals

- Android bukan pengganti ERP web untuk manajemen master data.
- Web bukan aplikasi POS penuh sampai modul Penjualan diprioritaskan.
- Marketplace sync penuh tidak dikerjakan sebelum mapping SKU internal stabil.
- Keuangan tidak menghitung pajak kompleks pada fase awal.

## 11. Risiko dan Catatan Teknis

- Android menulis langsung ke Firestore, sehingga security rules adalah kebutuhan wajib sebelum produksi luas.
- Beberapa halaman web masih memakai state lokal/dummy; jangan dianggap fitur produksi.
- Ada potensi drift field antara Android dan web, terutama reject per ukuran dan setoran parsial.
- Flushing Database memakai password hardcoded di client; ini harus dipindah ke mekanisme admin/server sebelum dipakai di produksi.
- Git di environment ini terdeteksi dubious ownership, jadi status git perlu dijalankan dengan konfigurasi safe.directory bila diperlukan.
