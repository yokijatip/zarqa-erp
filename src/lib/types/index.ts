// src/lib/types/index.ts
import type { Timestamp } from 'firebase/firestore';

// ─── USER ────────────────────────────────────────────────────────

export type UserRole =
  | 'admin_gudang'
  | 'kepala_cutting'
  | 'kepala_jahit'
  | 'kepala_steam'
  | 'kepala_keluar'
  | 'developer';

export interface UserProfile {
  uid: string;
  nama: string;
  email: string;
  role: UserRole;
  createdAt?: Timestamp;
}

// ─── STOK KAIN ───────────────────────────────────────────────────

export interface StokKain {
  id: string;
  nama_kain: string;
  satuan: 'yard';
  stok_tersedia: number;
  stok_terpakai: number;
  catatan?: string;
  updatedAt?: Timestamp;
}

export type StokKainInput = Omit<StokKain, 'id' | 'stok_terpakai' | 'updatedAt'>;

// ─── MODEL BAJU ──────────────────────────────────────────────────

export type UkuranBaju = 'S' | 'M' | 'L' | 'XL' | 'XXL';

export interface KebutuhanKain {
  kain_id: string;
  nama_kain: string;
  yard_per_pcs: number;
}

export interface ModelBaju {
  id: string;
  nama_model: string;
  deskripsi?: string;
  ukuran_tersedia: UkuranBaju[];
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
  yard_dipakai: number;
}

export interface BatchProduksi {
  id: string;
  model_id: string;
  nama_model: string;
  detail_ukuran: DetailUkuran[];
  total_pcs: number;
  kain_digunakan: KainDigunakan[];
  status: StatusBatch;
  dibuat_oleh: string;
  catatan_admin?: string;
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
  status_dari: StatusBatch;
  status_ke: StatusBatch;
  updated_by_uid: string;
  updated_by_nama: string;
  pcs_berhasil: number;
  pcs_reject: number;
  catatan?: string;
  timestamp?: Timestamp;
}

// ─── STOK BARANG JADI ────────────────────────────────────────────

export interface StokBarangJadi {
  id: string;
  model_id: string;
  nama_model: string;
  ukuran: UkuranBaju;
  stok_tersedia: number;
  total_masuk: number;
  total_keluar: number;
  updatedAt?: Timestamp;
}

// ─── BARANG KELUAR ───────────────────────────────────────────────

export interface DetailKeluar {
  ukuran: UkuranBaju;
  jumlah_pcs: number;
}

export interface BarangKeluar {
  id: string;
  model_id: string;
  nama_model: string;
  detail_keluar: DetailKeluar[];
  total_pcs: number;
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