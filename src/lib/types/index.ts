// src/lib/types/index.ts
import type { Timestamp } from 'firebase/firestore';

// ─── USER ────────────────────────────────────────────────────────

export type UserRole =
  | 'staff'
  | 'admin_gudang'
  | 'admin_hr'
  | 'admin_keuangan'
  | 'kepala_cutting'
  | 'kepala_jahit'
  | 'kepala_steam'
  | 'developer'
  | 'owner';

// Tipe penggajian: harian (borongan/hari), mingguan (per pcs/minggu), bulanan/tahunan (gaji tetap)
export type TipePenggajian = 'harian' | 'mingguan' | 'bulanan' | 'tahunan';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  photoURL?: string;
  kode_karyawan?: string;
  no_hp?: string;
  alamat?: string;
  jabatan?: string;
  divisi?: string;
  tanggal_masuk?: string;
  status_kerja?: 'aktif' | 'cuti' | 'nonaktif';
  kontak_darurat?: string;
  catatan_hr?: string;
  tipe_akun?: 'permanent' | 'temporary';
  tanggal_expired?: Timestamp;
  // Tipe penggajian: harian (borongan/hari), mingguan (per pcs/minggu), bulanan/tahunan (gaji tetap)
  tipe_penggajian?: TipePenggajian;
  // Nominal gaji tetap sesuai tipe_penggajian. Untuk karyawan produksi,
  // tarif_per_pcs tetap dipakai sebagai basis kerja borongan.
  gaji_pokok?: number;
  // Tarif upah per pcs (Rp) untuk karyawan divisi produksi (Cutting/Jahit/Steam).
  // Dipakai untuk menghitung Penggajian mingguan — hanya relevan untuk role
  // kepala_cutting / kepala_jahit / kepala_steam.
  tarif_per_pcs?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// ─── WARNA ───────────────────────────────────────────────────────

export interface Warna {
  id: string;
  nama_warna: string;
  kode_hex: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type WarnaInput = Omit<Warna, 'id' | 'createdAt' | 'updatedAt'>;

export interface MasterKain {
  id: string;
  nama_kain: string;
  nama_lower?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type MasterKainInput = Pick<MasterKain, 'nama_kain'>;

// ─── RIWAYAT STOK KAIN ──────────────────────────────────────────

export type TipeRiwayatKain = 'restock' | 'kurangi_manual' | 'pemakaian_produksi';

export interface RiwayatStokKain {
  id?: string;
  tipe: TipeRiwayatKain;
  jumlah: number;
  stok_sebelum: number;
  stok_sesudah: number;
  catatan?: string;
  // Info untuk pemakaian_produksi
  batch_id?: string;
  model_id?: string;
  nama_model?: string;
  nama_warna?: string;
  detail_ukuran?: Array<{ ukuran: string; pcs: number; yard?: number }>;
  // Info untuk restock (tanggal pembelian)
  tanggal_beli?: string;
  supplier?: string;
  harga_per_unit?: number;
  timestamp?: Timestamp;
}

// ─── STOK KAIN ───────────────────────────────────────────────────

export interface StokKain {
  id: string;
  master_kain_id?: string;
  nama_kain: string;
  warna_id?: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  satuan: 'yard' | 'kg';
  harga_per_unit?: number;
  stok_tersedia: number;
  stok_terpakai: number;
  catatan?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type StokKainInput = Omit<StokKain, 'id' | 'stok_terpakai' | 'updatedAt'>;

// ─── MODEL BAJU ──────────────────────────────────────────────────

export type UkuranBaju = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

export const UKURAN_ORDER: UkuranBaju[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export interface WarnaTersedia {
  warna_id: string;
  nama_warna: string;
  kode_hex: string;
}

export interface ModelBaju {
  id: string;
  nama_model: string;
  deskripsi?: string;
  ukuran_tersedia: UkuranBaju[];
  warna_tersedia?: WarnaTersedia[];
  kebutuhan_yard_per_pcs?: Partial<Record<UkuranBaju, number>>;
  harga_jual?: number;
  harga_produksi?: number;
  tarif_cutting?: number;
  tarif_jahit?: number;
  tarif_steam?: number;
  aktif: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ModelBajuInput = Omit<ModelBaju, 'id' | 'aktif' | 'createdAt' | 'updatedAt'>;

// ─── BATCH PRODUKSI ──────────────────────────────────────────────

export type StatusBatch =
  | 'PENDING_KAIN'
  | 'PENDING_CUTTING'
  | 'CUTTING_IN_PROGRESS'
  | 'CUTTING_DONE'
  | 'JAHIT_IN_PROGRESS'
  | 'JAHIT_DONE'
  | 'STEAM_IN_PROGRESS'
  | 'STEAM_DONE'
  | 'COMPLETED';

export interface DetailUkuran {
  ukuran: UkuranBaju;
  jumlah_pcs: number;
}

export interface KainDigunakan {
  kain_id: string;
  nama_kain: string;
  satuan: 'yard' | 'kg';
  jumlah_dipakai: number;
}

export interface PenugasanWorker {
  uid: string;
  nama: string;
}

export interface SumberCutting {
  batch_id: string;
  nama_model: string;
  nama_warna?: string;
  // Ukuran spesifik yang dikontribusikan lot ini (stok_potongan disimpan per-ukuran,
  // jadi field ini menandai lot tsb ada di "antrian" ukuran mana).
  ukuran?: string;
  // Jumlah pcs dari batch_id ini yang benar-benar terpakai/tersisa untuk lot ini.
  // Dipakai untuk konsumsi FIFO dari pool stok_potongan, supaya batch baru yang
  // ditarik dari pool hanya "mewarisi" sumber cutting sebanyak yang benar-benar
  // diambil — bukan seluruh riwayat kontributor pool tersebut.
  jumlah_pcs?: number;
  penugasan?: {
    cutting?: PenugasanWorker;
  };
}

export interface BatchProduksi {
  id: string;
  model_id: string;
  nama_model: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  kode_hex_list?: string;
  detail_ukuran: DetailUkuran[];
  total_pcs: number;
  kain_digunakan: KainDigunakan[];
  pcs_saat_ini?: number;
  status: StatusBatch;
  dibuat_oleh: string;
  catatan_admin?: string;
  dari_potongan?: boolean;
  stok_kain_dipotong?: boolean;
  stok_potongan_synced?: boolean;
  sumber_cutting?: SumberCutting[];
  penugasan?: {
    cutting?: PenugasanWorker;
    jahit?: PenugasanWorker;
    steam?: PenugasanWorker;
  };
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type BatchProduksiInput = Omit<
  BatchProduksi,
  'id' | 'total_pcs' | 'status' | 'dibuat_oleh' | 'createdAt' | 'updatedAt'
>;

// ─── RIWAYAT PROSES ──────────────────────────────────────────────

// Menandai bahwa pcs reject pada event ini sebenarnya bukan tanggung jawab
// tahap yang mencatatnya, melainkan tahap sebelumnya. Contoh: reject yang
// ditemukan saat Steam (menyetrika) sebenarnya cacat jahitan dari Jahit —
// jadi reject-nya "dikembalikan" ke penjahit & divisi Jahit untuk keperluan
// performa karyawan, bukan ke orang yang sedang menyetrika.
export interface RejectAttribusi {
  divisi: 'Cutting' | 'Jahit' | 'Steam';
  uid: string;
  nama: string;
}

export interface RiwayatProses {
  id?: string;
  tipe?: 'status_update' | 'edit_kuantitas' | 'setor_proses';
  status_dari: StatusBatch;
  status_ke: StatusBatch;
  updated_by_uid: string;
  updated_by_nama: string;
  pcs_berhasil: number;
  pcs_reject: number;
  detail_ukuran?: DetailUkuran[];
  detail_reject?: DetailUkuran[];
  reject_attribusi?: RejectAttribusi;
  catatan?: string;
  timestamp?: Timestamp;
}

// ─── REJECT ITEM ─────────────────────────────────────────────────
// Satu dokumen per (batch, ukuran, event setoran) yang punya pcs reject.
// Statusnya independen dari status batch produksi — reject bisa "menggantung"
// (pending) walau batch induknya sudah COMPLETED, sampai admin memutuskan
// nasibnya per pcs (diperbaiki masuk gudang, atau dibuang/tidak bisa diperbaiki).

export type AksiResolusiReject = 'diperbaiki' | 'tidak_bisa_diperbaiki';

export interface RejectItem {
  id?: string;
  batch_id: string;
  model_id: string;
  nama_model: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  ukuran: UkuranBaju;
  jumlah: number; // total reject dicatat pada event ini
  jumlah_diperbaiki: number; // akumulasi sudah diperbaiki & masuk stok barang jadi
  jumlah_gagal: number; // akumulasi discrap / tidak bisa diperbaiki
  status: 'pending' | 'selesai'; // selesai kalau diperbaiki + gagal >= jumlah
  asal_proses: StatusBatch; // status batch saat reject ini dicatat (mis. JAHIT_IN_PROGRESS)
  attribusi_penyebab?: RejectAttribusi; // lihat RejectAttribusi — siapa yang sebenarnya bertanggung jawab
  dicatat_oleh_uid: string;
  dicatat_oleh_nama: string;
  catatan?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// Log tiap kali reject item diresolusi (subkoleksi reject_items/{id}/riwayat_resolusi)
export interface RiwayatResolusiReject {
  id?: string;
  aksi: AksiResolusiReject;
  jumlah: number;
  catatan?: string;
  dicatat_oleh_uid: string;
  dicatat_oleh_nama: string;
  timestamp?: Timestamp;
}

// Satu lot kontribusi batch produksi ke pool stok_barang_jadi — dipakai FIFO
// (mirip sumber_cutting di stok_potongan) supaya saat barang keluar, kita
// tahu pcs itu berasal dari batch mana & siapa cutting/jahit/steam-nya.
export interface SumberProduksi {
  batch_id: string;
  jumlah_pcs: number;
  penugasan?: {
    cutting?: PenugasanWorker;
    jahit?: PenugasanWorker;
    steam?: PenugasanWorker;
  };
}

// ─── STOK BARANG JADI ────────────────────────────────────────────

export interface StokBarangJadi {
  id: string;
  model_id: string;
  nama_model: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  ukuran: UkuranBaju;
  stok_tersedia: number;
  total_masuk: number;
  total_keluar: number;
  sumber_produksi?: SumberProduksi[];
  updatedAt?: Timestamp;
}

// ─── STOK POTONGAN ───────────────────────────────────────────────

export interface StokPotongan {
  id: string;
  model_id: string;
  nama_model: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  ukuran: UkuranBaju;
  stok_tersedia: number;
  total_masuk: number;
  total_terpakai: number;
  sumber_cutting?: SumberCutting[];
  updatedAt?: Timestamp;
}

// ─── RIWAYAT BARANG JADI ─────────────────────────────────────────

export type TipeRiwayatBarangJadi =
  | 'masuk_produksi'
  | 'masuk_restock'
  | 'masuk_stok_awal'
  | 'kurangi_manual'
  | 'set_manual'
  | 'barang_keluar'
  | 'batal_keluar'
  | 'reject_diperbaiki';

export interface RiwayatBarangJadi {
  id?: string;
  model_id: string;
  nama_model: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  ukuran: string;
  tipe: TipeRiwayatBarangJadi;
  jumlah: number;
  stok_sebelum: number;
  stok_sesudah: number;
  catatan?: string;
  batch_id?: string;
  dicatat_oleh_uid?: string;
  dicatat_oleh_nama?: string;
  timestamp?: Timestamp;
}

// ─── BARANG KELUAR ───────────────────────────────────────────────

export interface DetailKeluar {
  ukuran: UkuranBaju;
  jumlah_pcs: number;
  // Snapshot lot produksi yang terkonsumsi (FIFO) untuk ukuran ini pada
  // pengiriman ini — dipakai untuk menampilkan siapa cutting/jahit/steam-nya
  // di laporan. Kalau kosong/tidak menutupi jumlah_pcs, sisanya adalah stok
  // lama dari sebelum fitur ini ada (tidak ada datanya, dan itu tidak apa-apa).
  sumber?: SumberProduksi[];
}

export type StatusBarangKeluarItem = 'keluar' | 'pending';
export type StatusBarangKeluar = 'selesai' | 'pending';

export interface BarangKeluarItem {
  model_id: string;
  nama_model: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  detail_keluar: DetailKeluar[];
  total_pcs: number;
  status: StatusBarangKeluarItem;
  tujuan?: string;
  nama_reseller?: string;
  keterangan?: string;
  alasan_pending?: string;
}

// Daftar tujuan pengiriman baku — dipakai di dropdown form & rekap,
// supaya nilai `tujuan` selalu konsisten dan bisa direkap per kategori.
export const TUJUAN_PENGIRIMAN_OPTIONS = [
  'Gudang Central',
  'Shopee',
  'Tiktok',
  'Lazada',
  'Tokopedia',
  'Web E-Commerce',
] as const;

export type TujuanPengiriman = (typeof TUJUAN_PENGIRIMAN_OPTIONS)[number];

export interface BarangKeluar {
  id: string;
  model_id: string;
  model_ids?: string[];
  nama_model: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  detail_keluar: DetailKeluar[];
  items?: BarangKeluarItem[];
  status?: StatusBarangKeluar;
  total_pending_pcs?: number;
  total_pcs: number;
  // Tetap `string` (bukan union) supaya catatan lama dengan teks bebas
  // masih valid secara tipe. Form baru hanya mengisi lewat dropdown
  // TUJUAN_PENGIRIMAN_OPTIONS, jadi data ke depannya konsisten.
  tujuan: string;
  nama_reseller?: string;
  keterangan?: string;
  dicatat_oleh: string;
  tanggal_keluar?: Timestamp;
}

export type BarangKeluarInput = Omit<BarangKeluar, 'id' | 'total_pcs' | 'dicatat_oleh' | 'tanggal_keluar'>;

// KEUANGAN

export type TipeTransaksiKeuangan = 'pemasukan' | 'pengeluaran';

export type KategoriPemasukan =
  | 'penjualan_manual'
  | 'modal'
  | 'piutang_tertagih'
  | 'refund'
  | 'lainnya';

export type KategoriPengeluaran =
  | 'aset'
  | 'bahan_baku'
  | 'gaji'
  | 'operasional'
  | 'transport'
  | 'sewa'
  | 'utilitas'
  | 'marketing'
  | 'maintenance'
  | 'lainnya';

export type KategoriTransaksiKeuangan = KategoriPemasukan | KategoriPengeluaran;

export interface TransaksiKeuangan {
  id: string;
  tipe: TipeTransaksiKeuangan;
  kategori: KategoriTransaksiKeuangan;
  tanggal: Timestamp;
  nominal: number;
  deskripsi: string;
  metode?: 'cash' | 'transfer' | 'e-wallet' | 'lainnya';
  referensi?: string;
  catatan?: string;
  dibuat_oleh_uid?: string;
  dibuat_oleh_nama?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type TransaksiKeuanganInput = Omit<
  TransaksiKeuangan,
  'id' | 'tanggal' | 'createdAt' | 'updatedAt'
> & {
  tanggal: Date | Timestamp;
};

export type KategoriAset =
  | 'peralatan'
  | 'komputer'
  | 'mesin'
  | 'kendaraan'
  | 'furnitur'
  | 'inventaris'
  | 'lainnya';

export type KondisiAset = 'baik' | 'perlu_perbaikan' | 'rusak' | 'dijual' | 'hilang';

export interface AsetPerusahaan {
  id: string;
  nama_aset: string;
  kategori: KategoriAset;
  tanggal_beli: Timestamp;
  jumlah: number;
  harga_satuan: number;
  total_harga: number;
  nilai_saat_ini?: number;
  lokasi?: string;
  supplier?: string;
  metode_pembayaran?: 'cash' | 'transfer' | 'e-wallet' | 'lainnya';
  nomor_invoice?: string;
  kondisi: KondisiAset;
  catatan?: string;
  transaksi_id?: string;
  dibuat_oleh_uid?: string;
  dibuat_oleh_nama?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type AsetPerusahaanInput = Omit<
  AsetPerusahaan,
  'id' | 'tanggal_beli' | 'total_harga' | 'createdAt' | 'updatedAt'
> & {
  tanggal_beli: Date | Timestamp;
};

// ─── PENGGAJIAN ──────────────────────────────────────────────────
// Gaji karyawan produksi (Cutting/Jahit/Steam) dihitung per pcs baju yang
// berhasil diselesaikan dalam satu minggu, dari data riwayat_proses batch
// produksi yang sudah ada (bukan koleksi baru). Lihat src/lib/firebase/penggajian.ts

export type DivisiProduksi = 'Cutting' | 'Jahit' | 'Steam';

// Rincian sumber satu lot: dari batch cutting/jahit mana, model+warna+ukuran apa.
export interface PenggajianSumberLot {
  batch_id: string;
  nama_model: string;
  nama_warna?: string;
  ukuran: string;
  jumlah_pcs: number;
  nama_pekerja?: string; // nama karyawan cutting/jahit sumber lot ini
}

// Breakdown per (model, warna, ukuran) untuk satu karyawan pada satu divisi.
export interface PenggajianBreakdownItem {
  nama_model: string;
  nama_warna?: string;
  ukuran: string;
  jumlah_pcs: number;
  // Untuk Jahit: dari cutting mana. Untuk Steam: dari jahit (dan cutting) mana.
  sumber_cutting?: PenggajianSumberLot[];
  sumber_jahit?: PenggajianSumberLot[];
}

export interface PenggajianKaryawan {
  uid: string;
  nama: string;
  divisi: DivisiProduksi;
  total_pcs: number;
  jumlah_batch: number;
  breakdown: PenggajianBreakdownItem[];
}

// ─── HELPER ──────────────────────────────────────────────────────

// Label readable untuk tiap status batch
export const STATUS_LABEL: Record<StatusBatch, string> = {
  PENDING_KAIN: 'Menunggu Kain',
  PENDING_CUTTING: 'Menunggu Cutting',
  CUTTING_IN_PROGRESS: 'Sedang Cutting',
  CUTTING_DONE: 'Cutting Selesai',
  JAHIT_IN_PROGRESS: 'Sedang Jahit',
  JAHIT_DONE: 'Jahit Selesai',
  STEAM_IN_PROGRESS: 'Sedang Steam',
  STEAM_DONE: 'Steam Selesai',
  COMPLETED: 'Selesai',
};

// Warna badge per status (untuk shadcn Badge variant)
export const STATUS_COLOR: Record<StatusBatch, string> = {
  PENDING_KAIN: 'secondary',
  PENDING_CUTTING: 'secondary',
  CUTTING_IN_PROGRESS: 'warning',
  CUTTING_DONE: 'outline',
  JAHIT_IN_PROGRESS: 'warning',
  JAHIT_DONE: 'outline',
  STEAM_IN_PROGRESS: 'warning',
  STEAM_DONE: 'outline',
  COMPLETED: 'success',
};
