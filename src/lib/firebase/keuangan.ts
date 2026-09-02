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
} from '$lib/types';

const COL = 'transaksi_keuangan';
const COL_ASET = 'aset_perusahaan';
const COL_BUDGET = 'budget_bulanan';

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
  const ref = await addDoc(collection(db, COL), {
    tipe: data.tipe,
    kategori: data.kategori,
    tanggal: toTimestamp(data.tanggal),
    nominal: Math.max(0, Number(data.nominal) || 0),
    deskripsi: data.deskripsi.trim(),
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
    nilai_saat_ini: Math.max(0, Number(data.nilai_saat_ini ?? totalHarga) || 0),
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
