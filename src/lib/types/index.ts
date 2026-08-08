// src/lib/types/index.ts
import type { Timestamp } from 'firebase/firestore';

// ─── USER ────────────────────────────────────────────────────────

export type UserRole =
  | 'admin_gudang'
  | 'admin_hr'
  | 'admin_keuangan'
  | 'kepala_cutting'
  | 'kepala_jahit'
  | 'kepala_steam'
  | 'developer'
  | 'owner';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  photoURL?: string;
  tipe_akun?: 'permanent' | 'temporary';
  tanggal_expired?: Timestamp;
  createdAt?: Timestamp;
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

// ─── RIWAYAT STOK KAIN ──────────────────────────────────────────

export type TipeRiwayatKain = 'restock' | 'kurangi_manual' | 'pemakaian_produksi';

export interface RiwayatStokKain {
  id?: string;
  tipe: TipeRiwayatKain;
  jumlah: number;
  stok_sebelum: number;
  stok_sesudah: number;
  catatan?: string;
  timestamp?: Timestamp;
}

// ─── STOK KAIN ───────────────────────────────────────────────────

export interface StokKain {
  id: string;
  nama_kain: string;
  warna_id?: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  satuan: 'yard' | 'kg';
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

export interface KebutuhanKain {
  kain_id: string;
  nama_kain: string;
  satuan: 'yard' | 'kg';
  jumlah_per_ukuran: Partial<Record<UkuranBaju, number>>;
}

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
  kebutuhan_kain: KebutuhanKain[];
  aktif: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ModelBajuInput = Omit<ModelBaju, 'id' | 'aktif' | 'createdAt' | 'updatedAt'>;

// ─── BATCH PRODUKSI ──────────────────────────────────────────────

export type StatusBatch =
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
  | 'batal_keluar'
  | 'reject_diperbaiki';

export interface RiwayatBarangJadi {
  id?: string;
  model_id: string;
  nama_model: string;
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
  nama_model: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  detail_keluar: DetailKeluar[];
  total_pcs: number;
  // Tetap `string` (bukan union) supaya catatan lama dengan teks bebas
  // masih valid secara tipe. Form baru hanya mengisi lewat dropdown
  // TUJUAN_PENGIRIMAN_OPTIONS, jadi data ke depannya konsisten.
  tujuan: string;
  keterangan?: string;
  dicatat_oleh: string;
  tanggal_keluar?: Timestamp;
}

export type BarangKeluarInput = Omit<BarangKeluar, 'id' | 'total_pcs' | 'dicatat_oleh' | 'tanggal_keluar'>;

// ─── HELPER ──────────────────────────────────────────────────────

// Label readable untuk tiap status batch
export const STATUS_LABEL: Record<StatusBatch, string> = {
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
  PENDING_CUTTING: 'secondary',
  CUTTING_IN_PROGRESS: 'warning',
  CUTTING_DONE: 'outline',
  JAHIT_IN_PROGRESS: 'warning',
  JAHIT_DONE: 'outline',
  STEAM_IN_PROGRESS: 'warning',
  STEAM_DONE: 'outline',
  COMPLETED: 'success',
};