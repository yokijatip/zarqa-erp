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

export type UkuranBaju = 'XS' | 'M/S' | 'L/XL' | 'XXL';

export const UKURAN_ORDER: UkuranBaju[] = ['XS', 'M/S', 'L/XL', 'XXL'];

// Alias ukuran lama dipertahankan untuk membaca histori Firestore.
export function canonicalUkuran(value: string): UkuranBaju {
  if (value === 'S' || value === 'M' || value === 'M/S') return 'M/S';
  if (value === 'L' || value === 'XL' || value === 'L/XL') return 'L/XL';
  if (value === 'XS' || value === 'XXL') return value;
  return value as UkuranBaju;
}

export function ukuranAliases(value: string): string[] {
  const ukuran = canonicalUkuran(value);
  if (ukuran === 'M/S') return ['M/S', 'M', 'S'];
  if (ukuran === 'L/XL') return ['L/XL', 'L', 'XL'];
  return [ukuran];
}

export interface WarnaTersedia {
  warna_id: string;
  nama_warna: string;
  kode_hex: string;
}

export type TipeKomponenVarianPenjualan = 'model_baju' | 'aksesori';

export interface KomponenVarianPenjualan {
  tipe: TipeKomponenVarianPenjualan;
  ref_id?: string;
  // Master hijab dan stok hijab disimpan terpisah. ref_id tetap dipertahankan
  // sebagai alias stok untuk membaca transaksi lama.
  model_hijab_id?: string;
  stok_hijab_id?: string;
  nama: string;
  jumlah: number;
  // Komponen aksesori dengan kelola_stok=true akan dikurangi saat barang keluar.
  kelola_stok: boolean;
}

export interface VarianPenjualan {
  id: string;
  nama_varian: string;
  sku?: string;
  harga_jual?: number;
  harga_produksi?: number;
  komponen: KomponenVarianPenjualan[];
  aktif: boolean;
}

export interface ModelBaju {
  id: string;
  nama_model: string;
  // Model penjualan dapat memakai stok barang jadi dari model lain.
  // Jika kosong, stok memakai model ini sendiri.
  stok_model_id?: string | null;
  foto_url?: string;
  deskripsi?: string;
  ukuran_tersedia: UkuranBaju[];
  warna_tersedia?: WarnaTersedia[];
  kebutuhan_yard_per_pcs?: Partial<Record<UkuranBaju, number>>;
  harga_jual?: number;
  // Harga jual dapat berbeda untuk setiap ukuran. harga_jual tetap dipakai
  // sebagai fallback untuk data lama atau ukuran yang belum diberi harga.
  harga_jual_per_ukuran?: Partial<Record<UkuranBaju, number>>;
  harga_produksi?: number;
  harga_produksi_per_ukuran?: Partial<Record<UkuranBaju, number>>;
  // Satu model produksi dapat memiliki beberapa bentuk penjualan, misalnya
  // Luna Zarqa biasa dan Luna Zarqa Set Hijab. Keduanya berbagi stok model ini.
  varian_penjualan?: VarianPenjualan[];
  tarif_cutting?: number;
  tarif_jahit?: number;
  tarif_steam?: number;
  aktif: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ModelBajuInput = Omit<ModelBaju, 'id' | 'aktif' | 'createdAt' | 'updatedAt'>;

// Master hijab berdiri sendiri dari model baju. Hijab tidak memiliki ukuran
// dan harga jual/produksinya berlaku untuk satu pcs hijab.
export interface ModelHijab {
  id: string;
  nama_hijab: string;
  foto_url?: string;
  deskripsi?: string;
  warna_tersedia?: WarnaTersedia[];
  harga_jual?: number;
  harga_produksi?: number;
  aktif: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ModelHijabInput = Omit<ModelHijab, 'id' | 'aktif' | 'createdAt' | 'updatedAt'>;

export function defaultVarianPenjualan(
  modelId: string,
  namaModel: string,
  stokModelId = modelId,
  stokNamaModel = namaModel,
): VarianPenjualan {
  return {
    id: `reguler_${modelId}`,
    nama_varian: namaModel,
    komponen: [
      {
        tipe: 'model_baju',
        ref_id: stokModelId,
        nama: stokNamaModel,
        jumlah: 1,
        kelola_stok: true,
      },
    ],
    aktif: true,
  };
}

export function getVarianPenjualan(
  model: Pick<ModelBaju, 'id' | 'nama_model' | 'varian_penjualan' | 'stok_model_id'>,
): VarianPenjualan[] {
  const addOns = (model.varian_penjualan ?? []).filter(
    (variant) =>
      variant.aktif !== false &&
      variant.komponen.some((component) => component.tipe === 'aksesori'),
  );
  const stokModelId = model.stok_model_id ?? model.id;
  return [
    defaultVarianPenjualan(model.id, model.nama_model, stokModelId),
    ...addOns,
  ];
}

export function getAddOnPenjualan(
  model: Pick<ModelBaju, 'varian_penjualan'>,
): VarianPenjualan[] {
  return (model.varian_penjualan ?? []).filter(
    (variant) =>
      variant.aktif !== false &&
      variant.komponen.some((component) => component.tipe === 'aksesori'),
  );
}

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
  /** Produk yang diproses. Batch lama tanpa field ini dianggap baju. */
  jenis_produk?: 'baju' | 'hijab';
  model_id: string;
  model_hijab_id?: string;
  stok_hijab_id?: string;
  nama_model: string;
  warna_id?: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  kode_hex_list?: string;
  detail_ukuran: DetailUkuran[];
  /** Target pcs untuk produk tanpa ukuran seperti hijab. */
  jumlah_target?: number;
  /** Snapshot HPP per pcs dari master produk saat batch dibuat. */
  harga_produksi_per_pcs?: number;
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
  /** Jenis produk; data lama tanpa field ini dianggap stok potongan baju. */
  jenis_produk?: 'baju' | 'hijab';
  model_id: string;
  model_hijab_id?: string;
  nama_model: string;
  warna_id?: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  /** Hijab tidak memiliki ukuran. */
  ukuran?: UkuranBaju;
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
  | 'masuk_retur'
  | 'masuk_lainnya'
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
  // Snapshot harga saat barang keluar, supaya histori tidak berubah ketika
  // harga master model diperbarui.
  harga_jual?: number;
  harga_produksi?: number;
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
  // Model yang stok fisiknya dikurangi. Biasanya sama dengan model_id,
  // tetapi model paket dapat memakai stok model dasar.
  stok_model_id?: string;
  nama_model: string;
  varian_id?: string;
  nama_varian?: string;
  // Snapshot komponen varian supaya retur/pembatalan tetap memakai aturan saat transaksi dibuat.
  komponen_varian?: KomponenVarianPenjualan[];
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

// ── STOK HIJAB / AKSESORI ────────────────────────────────────────────────────

export interface StokHijab {
  id: string;
  model_hijab_id?: string;
  nama_hijab: string;
  warna_id?: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  satuan: 'pcs';
  stok_tersedia: number;
  total_masuk: number;
  total_keluar: number;
  stok_minimum?: number;
  /** HPP untuk hasil produksi atau biaya perolehan untuk stok yang dibeli. */
  harga_per_unit?: number;
  catatan?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type StokHijabInput = Omit<
  StokHijab,
  'id' | 'satuan' | 'total_masuk' | 'total_keluar' | 'createdAt' | 'updatedAt'
>;

export type TipeRiwayatStokHijab = 'stok_awal' | 'restock' | 'hasil_produksi' | 'barang_keluar' | 'batal_keluar' | 'kurangi_manual';

export interface RiwayatStokHijab {
  id?: string;
  batch_id?: string;
  tipe: TipeRiwayatStokHijab;
  jumlah: number;
  stok_sebelum: number;
  stok_sesudah: number;
  catatan?: string;
  tanggal_beli?: string;
  supplier?: string;
  harga_per_unit?: number;
  timestamp?: Timestamp;
}

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
  /** Pembelian persediaan mengurangi kas, bukan laba rugi saat dibeli. */
  dampak_laba_rugi?: boolean;
  jenis_transaksi?: 'pembelian_persediaan' | 'pembelian_aset' | 'operasional' | 'non_pendapatan';
  dibuat_oleh_uid?: string;
  dibuat_oleh_nama?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface BudgetBulanan {
  id: string;
  bulan: string;
  kategori: KategoriPengeluaran;
  nominal: number;
  catatan?: string;
  dibuat_oleh_uid?: string;
  dibuat_oleh_nama?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type BudgetBulananInput = Omit<BudgetBulanan, 'id' | 'createdAt' | 'updatedAt'>;

export interface SaldoAwalKeuangan {
  id: string;
  tanggal: Timestamp;
  saldo_kas: number;
  modal_awal: number;
  catatan?: string;
  dibuat_oleh_uid?: string;
  dibuat_oleh_nama?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type SaldoAwalKeuanganInput = Omit<
  SaldoAwalKeuangan,
  'id' | 'tanggal' | 'createdAt' | 'updatedAt'
> & {
  tanggal: Date | Timestamp;
};

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
  metode_penyusutan?: 'garis_lurus';
  masa_manfaat_bulan?: number;
  nilai_residu?: number;
  tanggal_mulai_penyusutan?: Timestamp;
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
  'id' | 'tanggal_beli' | 'total_harga' | 'tanggal_mulai_penyusutan' | 'createdAt' | 'updatedAt'
> & {
  tanggal_beli: Date | Timestamp;
  tanggal_mulai_penyusutan?: Date | Timestamp;
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
