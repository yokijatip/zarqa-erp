import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from './config';
import { getCursorPage, type CursorPage, type FirestoreCursor } from './pagination';
import type { RiwayatStokHijab, StokHijab, StokHijabInput } from '$lib/types';

const COL = 'stok_hijab';
const COL_KEUANGAN = 'transaksi_keuangan';

type PembelianHijabKeuangan = {
  tanggal: Date;
  nominal: number;
  deskripsi: string;
  referensi?: string;
  catatan?: string;
  dibuat_oleh_uid?: string;
  dibuat_oleh_nama?: string;
};

function pembelianKeuanganPayload(data: PembelianHijabKeuangan) {
  return {
    tipe: 'pengeluaran',
    kategori: 'bahan_baku',
    // Hijab adalah persediaan. Beban baru dihitung saat barang terjual.
    dampak_laba_rugi: false,
    jenis_transaksi: 'pembelian_persediaan',
    tanggal: Timestamp.fromDate(data.tanggal),
    nominal: Math.max(0, Number(data.nominal) || 0),
    deskripsi: data.deskripsi.trim(),
    ...(data.referensi?.trim() ? { referensi: data.referensi.trim() } : {}),
    ...(data.catatan?.trim() ? { catatan: data.catatan.trim() } : {}),
    ...(data.dibuat_oleh_uid ? { dibuat_oleh_uid: data.dibuat_oleh_uid } : {}),
    ...(data.dibuat_oleh_nama ? { dibuat_oleh_nama: data.dibuat_oleh_nama } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export async function getStokHijabList(): Promise<StokHijab[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy('nama_hijab')));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }) as StokHijab);
}

export async function getStokHijabPage(
  cursor: FirestoreCursor,
  pageSize = 25,
): Promise<CursorPage<StokHijab>> {
  return getCursorPage(
    query(collection(db, COL), orderBy('nama_hijab')),
    cursor,
    (item) => ({ id: item.id, ...item.data() }) as StokHijab,
    pageSize,
  );
}

export async function addStokHijab(
  data: StokHijabInput,
  options?: { pembelianKeuangan?: PembelianHijabKeuangan },
): Promise<string> {
  const jumlah = Math.max(0, Math.floor(Number(data.stok_tersedia) || 0));
  const ref = doc(collection(db, COL));
  const modelRef = data.model_hijab_id ? doc(db, 'model_hijab', data.model_hijab_id) : null;
  const riwayatRef = jumlah > 0 ? doc(collection(db, COL, ref.id, 'riwayat')) : null;
  const transaksiRef =
    options?.pembelianKeuangan && options.pembelianKeuangan.nominal > 0
      ? doc(collection(db, COL_KEUANGAN))
      : null;

  await runTransaction(db, async (transaction) => {
    const modelSnap = modelRef ? await transaction.get(modelRef) : null;
    if (modelRef && !modelSnap?.exists()) throw new Error('Model hijab tidak ditemukan');
    const modelData = modelSnap?.data() as { nama_hijab?: string; harga_produksi?: number } | undefined;
    const namaHijab = modelData?.nama_hijab?.trim() || data.nama_hijab.trim();
    const harga = modelData
      ? Math.max(0, Number(modelData.harga_produksi) || 0)
      : Math.max(0, Number(data.harga_per_unit) || 0);

    transaction.set(ref, {
      ...(data.model_hijab_id ? { model_hijab_id: data.model_hijab_id } : {}),
      nama_hijab: namaHijab,
      ...(data.warna_id ? { warna_id: data.warna_id } : {}),
      ...(data.nama_warna?.trim() ? { nama_warna: data.nama_warna.trim() } : {}),
      ...(data.kode_hex_warna?.trim() ? { kode_hex_warna: data.kode_hex_warna.trim() } : {}),
      satuan: 'pcs',
      stok_tersedia: jumlah,
      total_masuk: jumlah,
      total_keluar: 0,
      ...(data.stok_minimum != null ? { stok_minimum: Math.max(0, Number(data.stok_minimum) || 0) } : {}),
      ...(harga > 0 ? { harga_per_unit: harga } : {}),
      ...(data.catatan?.trim() ? { catatan: data.catatan.trim() } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (riwayatRef) {
      transaction.set(riwayatRef, {
        tipe: 'stok_awal',
        jumlah,
        stok_sebelum: 0,
        stok_sesudah: jumlah,
        catatan: data.catatan?.trim() || 'Stok awal hijab',
        timestamp: serverTimestamp(),
      });
    }

    if (transaksiRef && options?.pembelianKeuangan) {
      transaction.set(
        transaksiRef,
        pembelianKeuanganPayload({
          ...options.pembelianKeuangan,
          referensi: options.pembelianKeuangan.referensi ?? `stok_hijab:${ref.id}`,
        }),
      );
    }
  });

  return ref.id;
}

export async function restockHijab(
  id: string,
  tambahJumlah: number,
  options?: {
    catatan?: string;
    tanggal_beli?: string;
    supplier?: string;
    harga_per_unit?: number;
    pembelianKeuangan?: PembelianHijabKeuangan;
  },
): Promise<void> {
  const jumlah = Math.floor(Number(tambahJumlah) || 0);
  if (jumlah <= 0) throw new Error('Jumlah restock harus lebih dari 0');

  const ref = doc(db, COL, id);
  const riwayatRef = doc(collection(db, COL, id, 'riwayat'));
  const transaksiRef =
    options?.pembelianKeuangan && options.pembelianKeuangan.nominal > 0
      ? doc(collection(db, COL_KEUANGAN))
      : null;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Stok hijab tidak ditemukan');
    const current = snap.data() as StokHijab;
    const modelSnap = current.model_hijab_id
      ? await transaction.get(doc(db, 'model_hijab', current.model_hijab_id))
      : null;
    if (current.model_hijab_id && !modelSnap?.exists()) throw new Error('Model hijab tidak ditemukan');
    const harga = modelSnap?.exists()
      ? Math.max(0, Number((modelSnap.data() as { harga_produksi?: number }).harga_produksi) || 0)
      : options?.harga_per_unit != null
        ? Math.max(0, Number(options.harga_per_unit) || 0)
        : current.harga_per_unit ?? 0;
    const stokBaru = current.stok_tersedia + jumlah;

    transaction.update(ref, {
      stok_tersedia: stokBaru,
      total_masuk: current.total_masuk + jumlah,
      ...(harga > 0 ? { harga_per_unit: harga } : {}),
      updatedAt: serverTimestamp(),
    });
    transaction.set(riwayatRef, {
      tipe: 'restock',
      jumlah,
      stok_sebelum: current.stok_tersedia,
      stok_sesudah: stokBaru,
      ...(options?.catatan?.trim() ? { catatan: options.catatan.trim() } : {}),
      ...(options?.tanggal_beli ? { tanggal_beli: options.tanggal_beli } : {}),
      ...(options?.supplier?.trim() ? { supplier: options.supplier.trim() } : {}),
      ...(harga > 0 ? { harga_per_unit: harga } : {}),
      timestamp: serverTimestamp(),
    });

    if (transaksiRef && options?.pembelianKeuangan) {
      transaction.set(
        transaksiRef,
        pembelianKeuanganPayload({
          ...options.pembelianKeuangan,
          referensi: options.pembelianKeuangan.referensi ?? `restock_hijab:${id}:${riwayatRef.id}`,
        }),
      );
    }
  });
}

export async function updateStokHijab(
  id: string,
  data: Pick<StokHijabInput, 'model_hijab_id' | 'nama_hijab' | 'warna_id' | 'nama_warna' | 'kode_hex_warna' | 'stok_minimum' | 'catatan'>,
): Promise<void> {
  const ref = doc(db, COL, id);
  const modelSnap = data.model_hijab_id ? await getDoc(doc(db, 'model_hijab', data.model_hijab_id)) : null;
  if (data.model_hijab_id && !modelSnap?.exists()) throw new Error('Model hijab tidak ditemukan');
  const modelData = modelSnap?.data() as { nama_hijab?: string; harga_produksi?: number } | undefined;
  await updateDoc(ref, {
    ...(data.model_hijab_id ? { model_hijab_id: data.model_hijab_id } : { model_hijab_id: null }),
    nama_hijab: modelData?.nama_hijab?.trim() || data.nama_hijab.trim(),
    warna_id: data.warna_id || null,
    nama_warna: data.nama_warna?.trim() || null,
    kode_hex_warna: data.kode_hex_warna?.trim() || null,
    stok_minimum: Math.max(0, Number(data.stok_minimum) || 0),
    ...(modelData ? { harga_per_unit: Math.max(0, Number(modelData.harga_produksi) || 0) } : {}),
    ...(data.catatan?.trim() ? { catatan: data.catatan.trim() } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function kurangiStokHijabManual(
  id: string,
  jumlah: number,
  catatan?: string,
): Promise<void> {
  const amount = Math.floor(Number(jumlah) || 0);
  if (amount <= 0) throw new Error('Jumlah pengurangan harus lebih dari 0');
  const ref = doc(db, COL, id);
  const riwayatRef = doc(collection(db, COL, id, 'riwayat'));

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Stok hijab tidak ditemukan');
    const current = snap.data() as StokHijab;
    if (current.stok_tersedia < amount) {
      throw new Error(`Stok hijab "${current.nama_hijab}" tidak mencukupi (tersedia: ${current.stok_tersedia} pcs)`);
    }
    const stokBaru = current.stok_tersedia - amount;
    transaction.update(ref, {
      stok_tersedia: stokBaru,
      total_keluar: current.total_keluar + amount,
      updatedAt: serverTimestamp(),
    });
    transaction.set(riwayatRef, {
      tipe: 'kurangi_manual',
      jumlah: amount,
      stok_sebelum: current.stok_tersedia,
      stok_sesudah: stokBaru,
      ...(catatan?.trim() ? { catatan: catatan.trim() } : {}),
      timestamp: serverTimestamp(),
    });
  });
}

export async function getRiwayatStokHijabPage(
  id: string,
  cursor: FirestoreCursor,
  pageSize = 10,
): Promise<CursorPage<RiwayatStokHijab>> {
  return getCursorPage(
    query(collection(db, COL, id, 'riwayat'), orderBy('timestamp', 'desc')),
    cursor,
    (item) => ({ id: item.id, ...item.data() }) as RiwayatStokHijab,
    pageSize,
  );
}

export async function deleteStokHijab(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
