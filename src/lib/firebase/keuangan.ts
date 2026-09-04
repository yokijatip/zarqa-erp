import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  limit,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './config';
import { getCursorPage, type FirestoreCursor, type CursorPage } from './pagination';
import type {
  AsetPerusahaan,
  AsetPerusahaanInput,
  KategoriPengeluaran,
  KategoriPemasukan,
  TransaksiKeuangan,
  TransaksiKeuanganInput,
  TipeTransaksiKeuangan,
  BudgetBulanan,
  BudgetBulananInput,
  SaldoAwalKeuangan,
  SaldoAwalKeuanganInput,
} from '$lib/types';

const COL = 'transaksi_keuangan';
const COL_ASET = 'aset_perusahaan';
const COL_BUDGET = 'budget_bulanan';
const COL_SALDO_AWAL = 'saldo_awal_keuangan';

export const KATEGORI_PEMASUKAN: Record<KategoriPemasukan, string> = {
  penjualan_manual: 'Penjualan Manual',
  modal: 'Modal',
  piutang_tertagih: 'Piutang Tertagih',
  refund: 'Refund',
  lainnya: 'Lainnya',
};

export const KATEGORI_PENGELUARAN: Record<KategoriPengeluaran, string> = {
  aset: 'Pembelian Aset',
  bahan_baku: 'Bahan Baku',
  gaji: 'Gaji',
  operasional: 'Operasional',
  transport: 'Transport',
  sewa: 'Sewa',
  utilitas: 'Utilitas',
  marketing: 'Marketing',
  maintenance: 'Maintenance',
  lainnya: 'Lainnya',
};

export const METODE_PEMBAYARAN = ['cash', 'transfer', 'e-wallet', 'lainnya'] as const;

export const KATEGORI_ASET = {
  peralatan: 'Peralatan',
  komputer: 'Komputer',
  mesin: 'Mesin',
  kendaraan: 'Kendaraan',
  furnitur: 'Furnitur',
  inventaris: 'Inventaris',
  lainnya: 'Lainnya',
} as const;

export const KONDISI_ASET = {
  baik: 'Baik',
  perlu_perbaikan: 'Perlu Perbaikan',
  rusak: 'Rusak',
  dijual: 'Dijual',
  hilang: 'Hilang',
} as const;

export const DEFAULT_MASA_MANFAAT_BULAN: Record<string, number> = {
  peralatan: 36,
  komputer: 48,
  mesin: 60,
  kendaraan: 60,
  furnitur: 48,
  inventaris: 36,
  lainnya: 36,
};

const KATEGORI_PEMASUKAN_NON_PENDAPATAN = new Set(['modal', 'piutang_tertagih', 'refund']);

export function transaksiBerdampakLabaRugi(tipe: TipeTransaksiKeuangan, kategori: string): boolean {
  if (tipe === 'pengeluaran') return !['aset', 'bahan_baku'].includes(kategori);
  return !KATEGORI_PEMASUKAN_NON_PENDAPATAN.has(kategori);
}

function jenisTransaksi(tipe: TipeTransaksiKeuangan, kategori: string): TransaksiKeuangan['jenis_transaksi'] {
  if (kategori === 'bahan_baku') return 'pembelian_persediaan';
  if (kategori === 'aset') return 'pembelian_aset';
  if (tipe === 'pemasukan' && !transaksiBerdampakLabaRugi(tipe, kategori)) return 'non_pendapatan';
  return 'operasional';
}

function asDate(value: Date | Timestamp | undefined): Date | null {
  if (!value) return null;
  return value instanceof Timestamp ? value.toDate() : value;
}

function monthIndex(value: Date): number {
  return value.getFullYear() * 12 + value.getMonth();
}

export function hitungPenyusutanBulananAset(aset: AsetPerusahaan): number {
  const masaManfaat = Math.max(0, Number(aset.masa_manfaat_bulan) || 0);
  if (aset.metode_penyusutan !== 'garis_lurus' || masaManfaat <= 0) return 0;
  const totalHarga = Math.max(0, Number(aset.total_harga) || 0);
  const nilaiResidu = Math.min(totalHarga, Math.max(0, Number(aset.nilai_residu) || 0));
  return Math.max(0, (totalHarga - nilaiResidu) / masaManfaat);
}

export function hitungPenyusutanPeriode(
  aset: AsetPerusahaan,
  range: { start: Date; end: Date } | null,
): number {
  const mulai = asDate(aset.tanggal_mulai_penyusutan) ?? asDate(aset.tanggal_beli);
  if (!mulai || !range) return 0;
  const masaManfaat = Math.max(0, Number(aset.masa_manfaat_bulan) || 0);
  const penyusutanBulanan = hitungPenyusutanBulananAset(aset);
  if (masaManfaat <= 0 || penyusutanBulanan <= 0 || range.end < mulai) return 0;
  const bulanPertama = Math.max(monthIndex(mulai), monthIndex(range.start));
  const bulanTerakhir = Math.min(monthIndex(range.end), monthIndex(mulai) + masaManfaat - 1);
  const jumlahBulan = Math.max(0, bulanTerakhir - bulanPertama + 1);
  return jumlahBulan * penyusutanBulanan;
}

export function hitungNilaiBukuAset(aset: AsetPerusahaan, asOf = new Date()): number {
  const mulai = asDate(aset.tanggal_mulai_penyusutan) ?? asDate(aset.tanggal_beli);
  const masaManfaat = Math.max(0, Number(aset.masa_manfaat_bulan) || 0);
  const penyusutanBulanan = hitungPenyusutanBulananAset(aset);
  if (!mulai || masaManfaat <= 0 || penyusutanBulanan <= 0) {
    return Math.max(0, Number(aset.nilai_saat_ini ?? aset.total_harga) || 0);
  }
  const nilaiResidu = Math.min(aset.total_harga, Math.max(0, Number(aset.nilai_residu) || 0));
  const jumlahBulan = Math.max(0, Math.min(masaManfaat, monthIndex(asOf) - monthIndex(mulai) + 1));
  return Math.max(nilaiResidu, aset.total_harga - jumlahBulan * penyusutanBulanan);
}

function toTimestamp(value: Date | Timestamp): Timestamp {
  return value instanceof Timestamp ? value : Timestamp.fromDate(value);
}

function cleanText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function kategoriLabel(tipe: TipeTransaksiKeuangan, kategori: string): string {
  if (tipe === 'pemasukan') {
    return KATEGORI_PEMASUKAN[kategori as KategoriPemasukan] ?? kategori;
  }
  return KATEGORI_PENGELUARAN[kategori as KategoriPengeluaran] ?? kategori;
}

export async function addTransaksiKeuangan(data: TransaksiKeuanganInput): Promise<string> {
  const dampakLabaRugi = transaksiBerdampakLabaRugi(data.tipe, data.kategori);
  const ref = await addDoc(collection(db, COL), {
    tipe: data.tipe,
    kategori: data.kategori,
    tanggal: toTimestamp(data.tanggal),
    nominal: Math.max(0, Number(data.nominal) || 0),
    deskripsi: data.deskripsi.trim(),
    dampak_laba_rugi: dampakLabaRugi,
    jenis_transaksi: jenisTransaksi(data.tipe, data.kategori),
    ...(data.metode ? { metode: data.metode } : {}),
    ...(cleanText(data.referensi) ? { referensi: cleanText(data.referensi) } : {}),
    ...(cleanText(data.catatan) ? { catatan: cleanText(data.catatan) } : {}),
    ...(data.dibuat_oleh_uid ? { dibuat_oleh_uid: data.dibuat_oleh_uid } : {}),
    ...(data.dibuat_oleh_nama ? { dibuat_oleh_nama: data.dibuat_oleh_nama } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTransaksiKeuangan(
  id: string,
  data: Partial<TransaksiKeuanganInput>,
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (data.tipe !== undefined) payload.tipe = data.tipe;
  if (data.kategori !== undefined) payload.kategori = data.kategori;
  if (data.tanggal !== undefined) payload.tanggal = toTimestamp(data.tanggal);
  if (data.nominal !== undefined) payload.nominal = Math.max(0, Number(data.nominal) || 0);
  if (data.deskripsi !== undefined) payload.deskripsi = data.deskripsi.trim();
  if (data.metode !== undefined) payload.metode = data.metode;
  if (data.referensi !== undefined) payload.referensi = cleanText(data.referensi) ?? '';
  if (data.catatan !== undefined) payload.catatan = cleanText(data.catatan) ?? '';
  if (data.tipe !== undefined || data.kategori !== undefined) {
    const existingSnap = await getDoc(doc(db, COL, id));
    const existing = existingSnap.data() as TransaksiKeuangan | undefined;
    const tipe = data.tipe ?? existing?.tipe;
    const kategori = data.kategori ?? existing?.kategori;
    if (tipe && kategori) {
      payload.dampak_laba_rugi = transaksiBerdampakLabaRugi(tipe, kategori);
      payload.jenis_transaksi = jenisTransaksi(tipe, kategori);
    }
  }
  await updateDoc(doc(db, COL, id), payload);
}

export async function deleteTransaksiKeuangan(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

export async function getTransaksiKeuangan(
  range: { start: Date; end: Date } | null,
): Promise<TransaksiKeuangan[]> {
  const q = range
    ? query(
        collection(db, COL),
        where('tanggal', '>=', Timestamp.fromDate(range.start)),
        where('tanggal', '<=', Timestamp.fromDate(range.end)),
        orderBy('tanggal', 'desc'),
      )
    : query(collection(db, COL), orderBy('tanggal', 'desc'));

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TransaksiKeuangan);
}

export async function getTransaksiKeuanganPage(
  range: { start: Date; end: Date } | null,
  cursor: FirestoreCursor,
  pageSize = 25,
): Promise<CursorPage<TransaksiKeuangan>> {
  const baseQuery = range
    ? query(
        collection(db, COL),
        where('tanggal', '>=', Timestamp.fromDate(range.start)),
        where('tanggal', '<=', Timestamp.fromDate(range.end)),
        orderBy('tanggal', 'desc'),
      )
    : query(collection(db, COL), orderBy('tanggal', 'desc'));

  return getCursorPage(
    baseQuery,
    cursor,
    (d) => ({ id: d.id, ...d.data() }) as TransaksiKeuangan,
    pageSize,
  );
}

export async function getSaldoAwalKeuangan(): Promise<SaldoAwalKeuangan | null> {
  const snap = await getDocs(query(collection(db, COL_SALDO_AWAL), orderBy('tanggal', 'desc'), limit(1)));
  if (snap.empty) return null;
  const item = snap.docs[0];
  return { id: item.id, ...item.data() } as SaldoAwalKeuangan;
}

export async function saveSaldoAwalKeuangan(data: SaldoAwalKeuanganInput, id?: string): Promise<string> {
  const payload = {
    tanggal: toTimestamp(data.tanggal),
    saldo_kas: Math.max(0, Number(data.saldo_kas) || 0),
    modal_awal: Math.max(0, Number(data.modal_awal) || 0),
    ...(cleanText(data.catatan) ? { catatan: cleanText(data.catatan) } : {}),
    ...(data.dibuat_oleh_uid ? { dibuat_oleh_uid: data.dibuat_oleh_uid } : {}),
    ...(data.dibuat_oleh_nama ? { dibuat_oleh_nama: data.dibuat_oleh_nama } : {}),
    updatedAt: serverTimestamp(),
  };
  if (id) {
    await updateDoc(doc(db, COL_SALDO_AWAL, id), payload);
    return id;
  }
  const existing = await getSaldoAwalKeuangan();
  if (existing) {
    await updateDoc(doc(db, COL_SALDO_AWAL, existing.id), payload);
    return existing.id;
  }
  const ref = await addDoc(collection(db, COL_SALDO_AWAL), { ...payload, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deleteSaldoAwalKeuangan(id: string): Promise<void> {
  await deleteDoc(doc(db, COL_SALDO_AWAL, id));
}

export async function getBudgetBulanan(bulan?: string): Promise<BudgetBulanan[]> {
  const base = collection(db, COL_BUDGET);
  const q = bulan
    ? query(base, where('bulan', '==', bulan))
    : query(base, orderBy('bulan', 'desc'));
  const snap = await getDocs(q);
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }) as BudgetBulanan)
    .sort((a, b) => a.kategori.localeCompare(b.kategori));
}

export async function addBudgetBulanan(data: BudgetBulananInput): Promise<string> {
  const existing = await getDocs(query(
    collection(db, COL_BUDGET),
    where('bulan', '==', data.bulan),
    where('kategori', '==', data.kategori),
    limit(1),
  ));
  if (!existing.empty) throw new Error('Budget untuk kategori dan bulan tersebut sudah ada.');
  const ref = await addDoc(collection(db, COL_BUDGET), {
    bulan: data.bulan,
    kategori: data.kategori,
    nominal: Math.max(0, Number(data.nominal) || 0),
    ...(cleanText(data.catatan) ? { catatan: cleanText(data.catatan) } : {}),
    ...(data.dibuat_oleh_uid ? { dibuat_oleh_uid: data.dibuat_oleh_uid } : {}),
    ...(data.dibuat_oleh_nama ? { dibuat_oleh_nama: data.dibuat_oleh_nama } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateBudgetBulanan(id: string, data: Partial<BudgetBulananInput>): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (data.bulan !== undefined) payload.bulan = data.bulan;
  if (data.kategori !== undefined) payload.kategori = data.kategori;
  if (data.nominal !== undefined) payload.nominal = Math.max(0, Number(data.nominal) || 0);
  if (data.catatan !== undefined) payload.catatan = cleanText(data.catatan) ?? '';
  await updateDoc(doc(db, COL_BUDGET, id), payload);
}

export async function deleteBudgetBulanan(id: string): Promise<void> {
  await deleteDoc(doc(db, COL_BUDGET, id));
}

export async function addAsetPerusahaan(
  data: AsetPerusahaanInput,
  options: { catatPengeluaran?: boolean } = {},
): Promise<string> {
  const jumlah = Math.max(1, Number(data.jumlah) || 1);
  const hargaSatuan = Math.max(0, Number(data.harga_satuan) || 0);
  const totalHarga = jumlah * hargaSatuan;
  let transaksiId: string | undefined;

  if (options.catatPengeluaran !== false && totalHarga > 0) {
    transaksiId = await addTransaksiKeuangan({
      tipe: 'pengeluaran',
      kategori: 'aset',
      tanggal: data.tanggal_beli,
      nominal: totalHarga,
      deskripsi: `Pembelian aset: ${data.nama_aset.trim()}`,
      metode: data.metode_pembayaran,
      referensi: data.nomor_invoice,
      catatan: data.catatan,
      dibuat_oleh_uid: data.dibuat_oleh_uid,
      dibuat_oleh_nama: data.dibuat_oleh_nama,
    });
  }

  const ref = await addDoc(collection(db, COL_ASET), {
    nama_aset: data.nama_aset.trim(),
    kategori: data.kategori,
    tanggal_beli: toTimestamp(data.tanggal_beli),
    jumlah,
    harga_satuan: hargaSatuan,
    total_harga: totalHarga,
    ...(data.nilai_saat_ini !== undefined ? { nilai_saat_ini: Math.max(0, Number(data.nilai_saat_ini) || 0) } : {}),
    ...(data.metode_penyusutan ? { metode_penyusutan: data.metode_penyusutan } : {}),
    ...(data.masa_manfaat_bulan !== undefined ? { masa_manfaat_bulan: Math.max(0, Number(data.masa_manfaat_bulan) || 0) } : {}),
    ...(data.nilai_residu !== undefined ? { nilai_residu: Math.max(0, Number(data.nilai_residu) || 0) } : {}),
    ...(data.tanggal_mulai_penyusutan ? { tanggal_mulai_penyusutan: toTimestamp(data.tanggal_mulai_penyusutan) } : {}),
    ...(cleanText(data.lokasi) ? { lokasi: cleanText(data.lokasi) } : {}),
    ...(cleanText(data.supplier) ? { supplier: cleanText(data.supplier) } : {}),
    ...(data.metode_pembayaran ? { metode_pembayaran: data.metode_pembayaran } : {}),
    ...(cleanText(data.nomor_invoice) ? { nomor_invoice: cleanText(data.nomor_invoice) } : {}),
    kondisi: data.kondisi,
    ...(cleanText(data.catatan) ? { catatan: cleanText(data.catatan) } : {}),
    ...(transaksiId ? { transaksi_id: transaksiId } : {}),
    ...(data.dibuat_oleh_uid ? { dibuat_oleh_uid: data.dibuat_oleh_uid } : {}),
    ...(data.dibuat_oleh_nama ? { dibuat_oleh_nama: data.dibuat_oleh_nama } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateAsetPerusahaan(
  id: string,
  data: Partial<AsetPerusahaanInput>,
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (data.nama_aset !== undefined) payload.nama_aset = data.nama_aset.trim();
  if (data.kategori !== undefined) payload.kategori = data.kategori;
  if (data.tanggal_beli !== undefined) payload.tanggal_beli = toTimestamp(data.tanggal_beli);
  if (data.jumlah !== undefined) payload.jumlah = Math.max(1, Number(data.jumlah) || 1);
  if (data.harga_satuan !== undefined) payload.harga_satuan = Math.max(0, Number(data.harga_satuan) || 0);
  if (data.nilai_saat_ini !== undefined) payload.nilai_saat_ini = Math.max(0, Number(data.nilai_saat_ini) || 0);
  if (data.metode_penyusutan !== undefined) payload.metode_penyusutan = data.metode_penyusutan;
  if (data.masa_manfaat_bulan !== undefined) payload.masa_manfaat_bulan = Math.max(0, Number(data.masa_manfaat_bulan) || 0);
  if (data.nilai_residu !== undefined) payload.nilai_residu = Math.max(0, Number(data.nilai_residu) || 0);
  if (data.tanggal_mulai_penyusutan !== undefined) payload.tanggal_mulai_penyusutan = toTimestamp(data.tanggal_mulai_penyusutan);
  if (data.lokasi !== undefined) payload.lokasi = cleanText(data.lokasi) ?? '';
  if (data.supplier !== undefined) payload.supplier = cleanText(data.supplier) ?? '';
  if (data.metode_pembayaran !== undefined) payload.metode_pembayaran = data.metode_pembayaran;
  if (data.nomor_invoice !== undefined) payload.nomor_invoice = cleanText(data.nomor_invoice) ?? '';
  if (data.kondisi !== undefined) payload.kondisi = data.kondisi;
  if (data.catatan !== undefined) payload.catatan = cleanText(data.catatan) ?? '';

  if (data.jumlah !== undefined || data.harga_satuan !== undefined) {
    const existingSnap = await getDoc(doc(db, COL_ASET, id));
    const existing = existingSnap.data() as AsetPerusahaan | undefined;
    const jumlah = Math.max(1, Number(data.jumlah ?? existing?.jumlah ?? 1) || 1);
    const hargaSatuan = Math.max(0, Number(data.harga_satuan ?? existing?.harga_satuan ?? 0) || 0);
    payload.total_harga = jumlah * hargaSatuan;
  }

  await updateDoc(doc(db, COL_ASET, id), payload);
}

export async function deleteAsetPerusahaan(id: string): Promise<void> {
  await deleteDoc(doc(db, COL_ASET, id));
}

export async function getAsetPerusahaan(): Promise<AsetPerusahaan[]> {
  const snap = await getDocs(query(collection(db, COL_ASET), orderBy('tanggal_beli', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AsetPerusahaan);
}

export async function getAsetPerusahaanPage(
  cursor: FirestoreCursor,
  pageSize = 25,
): Promise<CursorPage<AsetPerusahaan>> {
  return getCursorPage(
    query(collection(db, COL_ASET), orderBy('tanggal_beli', 'desc')),
    cursor,
    (d) => ({ id: d.id, ...d.data() }) as AsetPerusahaan,
    pageSize,
  );
}
