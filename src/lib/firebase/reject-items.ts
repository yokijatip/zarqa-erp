// src/lib/firebase/reject-items.ts
import {
  collection, doc, getDocs, getDoc,
  serverTimestamp, runTransaction,
  query, where, orderBy,
  type Transaction,
} from 'firebase/firestore';
import { db } from './config';
import type {
  RejectItem, RiwayatResolusiReject, AksiResolusiReject,
  DetailUkuran, StatusBatch, RejectAttribusi, BatchProduksi, SumberProduksi,
} from '$lib/types';
import { canonicalUkuran, ukuranAliases } from '$lib/types';

const COL_REJECT = 'reject_items';
const COL_JADI = 'stok_barang_jadi';
const COL_RIWAYAT_JADI = 'riwayat_barang_jadi';

function warnaDocKey(namaWarna: string): string {
  return namaWarna.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function buildBarangJadiDocId(modelId: string, ukuran: string, namaWarna?: string): string {
  if (!namaWarna) return `${modelId}__${ukuran}`;
  return `${modelId}__${ukuran}__${warnaDocKey(namaWarna)}`;
}

function appendSumberProduksiLot(existing: SumberProduksi[], lot: SumberProduksi): SumberProduksi[] {
  const list = [...existing];
  const last = list[list.length - 1];
  if (last?.batch_id === lot.batch_id) {
    list[list.length - 1] = {
      ...last,
      jumlah_pcs: (last.jumlah_pcs ?? 0) + lot.jumlah_pcs,
    };
    return list;
  }
  list.push(lot);
  return list;
}

function normalizeRejectItem(id: string, value: Record<string, unknown>): RejectItem {
  return {
    ...value,
    id,
    ukuran: canonicalUkuran(String(value.ukuran ?? '')),
  } as RejectItem;
}

function sortRejectItems(items: RejectItem[]): RejectItem[] {
  return items.sort((a, b) => a.ukuran.localeCompare(b.ukuran));
}

function timestampToMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return null;
}

function sameOptionalText(a?: string, b?: string): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

// ─── BUAT REJECT ITEM (dipanggil dari dalam transaksi batch-produksi.ts) ──
//
// Dipanggil setiap kali sebuah event setoran (recordBatchProgress,
// splitJahitPartialToSteam, updateStatusBatch, completeBatchProduksi)
// membawa detail_reject > 0. Satu dokumen reject_items dibuat per ukuran,
// supaya bisa diresolusi terpisah nanti.
export function createRejectItemsInTransaction(
  transaction: Transaction,
  params: {
    batchId: string;
    modelId: string;
    namaModel: string;
    namaWarna?: string;
    kodeHexWarna?: string;
    asalProses: StatusBatch;
    detailReject: DetailUkuran[];
    uid: string;
    nama: string;
    catatan?: string;
    attribusi?: RejectAttribusi;
  },
): void {
  const { batchId, modelId, namaModel, namaWarna, kodeHexWarna, asalProses, detailReject, uid, nama, catatan, attribusi } = params;

  for (const item of detailReject) {
    if (item.jumlah_pcs <= 0) continue;
    const ref = doc(collection(db, COL_REJECT));
    transaction.set(ref, {
      batch_id: batchId,
      model_id: modelId,
      nama_model: namaModel,
      ...(namaWarna ? { nama_warna: namaWarna } : {}),
      ...(kodeHexWarna ? { kode_hex_warna: kodeHexWarna } : {}),
      ukuran: canonicalUkuran(item.ukuran),
      jumlah: item.jumlah_pcs,
      jumlah_diperbaiki: 0,
      jumlah_gagal: 0,
      status: 'pending',
      asal_proses: asalProses,
      ...(attribusi ? { attribusi_penyebab: attribusi } : {}),
      dicatat_oleh_uid: uid,
      dicatat_oleh_nama: nama,
      ...(catatan ? { catatan } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

// ─── BACA REJECT ITEMS ────────────────────────────────────────────

export async function getRejectItemsByBatch(batchId: string): Promise<RejectItem[]> {
  const q = query(collection(db, COL_REJECT), where('batch_id', '==', batchId));
  const snap = await getDocs(q);
  const results = snap.docs.map((d) => normalizeRejectItem(d.id, d.data()));
  if (results.length > 0) return sortRejectItems(results);

  // Kompatibilitas untuk reject yang sempat dibuat mobile tanpa document id batch.
  // Android versi baru sudah menulis batch_id yang benar; blok ini hanya menyelamatkan data lama.
  const batchSnap = await getDoc(doc(db, 'batch_produksi', batchId));
  if (!batchSnap.exists()) return [];

  const batch = { id: batchSnap.id, ...batchSnap.data() } as BatchProduksi;
  const brokenQ = query(collection(db, COL_REJECT), where('batch_id', '==', ''));
  const brokenSnap = await getDocs(brokenQ);
  const batchCreatedAt = timestampToMillis(batch.createdAt);
  const batchUpdatedAt = timestampToMillis(batch.updatedAt);
  const windowStart = batchCreatedAt ? batchCreatedAt - 6 * 60 * 60 * 1000 : null;
  const windowEnd = batchUpdatedAt ? batchUpdatedAt + 6 * 60 * 60 * 1000 : null;

  const fallback = brokenSnap.docs
    .map((d) => normalizeRejectItem(d.id, d.data()))
    .filter((item) => {
      if (item.status !== 'pending') return false;
      if (item.model_id !== batch.model_id) return false;
      if (!sameOptionalText(item.nama_warna, batch.nama_warna)) return false;

      const itemTime = timestampToMillis(item.createdAt) ?? timestampToMillis(item.updatedAt);
      if (!itemTime) return true;
      if (windowStart && itemTime < windowStart) return false;
      if (windowEnd && itemTime > windowEnd) return false;
      return true;
    });

  return sortRejectItems(fallback);
}

// Semua reject yang masih pending, lintas batch — untuk halaman rekap/monitor kalau dibutuhkan nanti
export async function getRejectItemsPending(): Promise<RejectItem[]> {
  const q = query(collection(db, COL_REJECT), where('status', '==', 'pending'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeRejectItem(d.id, d.data()));
}

export async function getRiwayatResolusiReject(rejectItemId: string): Promise<RiwayatResolusiReject[]> {
  const q = query(collection(db, COL_REJECT, rejectItemId, 'riwayat_resolusi'), orderBy('timestamp', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RiwayatResolusiReject);
}

// ─── RESOLUSI REJECT ITEM ─────────────────────────────────────────
//
// aksi = 'diperbaiki'          → jumlah pcs itu ditambahkan ke stok_barang_jadi
//                                 + dicatat sebagai riwayat_barang_jadi baru (tipe reject_diperbaiki)
// aksi = 'tidak_bisa_diperbaiki' → jumlah pcs itu ditandai gagal/dibuang, TIDAK masuk stok.
//                                   Tetap dicatat di riwayat_resolusi untuk jejak audit.
//
// Riwayat lama (riwayat_proses / riwayat_barang_jadi sebelumnya) TIDAK PERNAH diedit —
// resolusi selalu menulis entri baru, konsisten dengan pola log-immutable di project ini.
export async function resolveRejectItem(
  rejectItemId: string,
  aksi: AksiResolusiReject,
  jumlah: number,
  meta: { uid: string; nama: string; batchId?: string; catatan?: string },
): Promise<void> {
  if (jumlah <= 0) throw new Error('Jumlah harus lebih dari 0');

  const rejectRef = doc(db, COL_REJECT, rejectItemId);
  const resolusiRef = doc(collection(db, COL_REJECT, rejectItemId, 'riwayat_resolusi'));

  // Query hanya dipakai untuk menemukan pool stok lama (termasuk alias ukuran).
  // Dokumen terpilih tetap dibaca ulang melalui transaction.get di bawah.
  let stokRef: ReturnType<typeof doc> | null = null;
  if (aksi === 'diperbaiki') {
    const initialRejectSnap = await getDoc(rejectRef);
    if (!initialRejectSnap.exists()) throw new Error('Reject item tidak ditemukan');
    const initialReject = normalizeRejectItem(initialRejectSnap.id, initialRejectSnap.data());
    const ukuran = canonicalUkuran(initialReject.ukuran);
    const stokQuery = initialReject.nama_warna
      ? query(
          collection(db, COL_JADI),
          where('model_id', '==', initialReject.model_id),
          where('ukuran', 'in', ukuranAliases(ukuran)),
          where('nama_warna', '==', initialReject.nama_warna),
        )
      : query(
          collection(db, COL_JADI),
          where('model_id', '==', initialReject.model_id),
          where('ukuran', 'in', ukuranAliases(ukuran)),
        );
    const stokQuerySnap = await getDocs(stokQuery);
    stokRef = stokQuerySnap.empty
      ? doc(db, COL_JADI, buildBarangJadiDocId(initialReject.model_id, ukuran, initialReject.nama_warna))
      : stokQuerySnap.docs[0].ref;
  }

  await runTransaction(db, async (transaction) => {
    const rejectSnap = await transaction.get(rejectRef);
    if (!rejectSnap.exists()) throw new Error('Reject item tidak ditemukan');
    const reject = normalizeRejectItem(rejectSnap.id, rejectSnap.data());
    const resolvedBatchId = reject.batch_id || meta.batchId || '';
    const sourceBatchRef = resolvedBatchId ? doc(db, 'batch_produksi', resolvedBatchId) : null;
    const sourceBatchSnap = sourceBatchRef ? await transaction.get(sourceBatchRef) : null;
    const sourceBatch = sourceBatchSnap?.exists()
      ? ({ id: sourceBatchSnap.id, ...sourceBatchSnap.data() } as BatchProduksi)
      : null;

    const sisa = reject.jumlah - reject.jumlah_diperbaiki - reject.jumlah_gagal;
    if (jumlah > sisa) {
      throw new Error(`Sisa reject yang belum diselesaikan hanya ${sisa} pcs`);
    }

    const jumlahDiperbaikiBaru = reject.jumlah_diperbaiki + (aksi === 'diperbaiki' ? jumlah : 0);
    const jumlahGagalBaru = reject.jumlah_gagal + (aksi === 'tidak_bisa_diperbaiki' ? jumlah : 0);
    const sisaBaru = reject.jumlah - jumlahDiperbaikiBaru - jumlahGagalBaru;

    const rejectUpdate: Record<string, unknown> = {
      jumlah_diperbaiki: jumlahDiperbaikiBaru,
      jumlah_gagal: jumlahGagalBaru,
      status: sisaBaru <= 0 ? 'selesai' : 'pending',
      updatedAt: serverTimestamp(),
    };
    if (!reject.batch_id && meta.batchId) {
      rejectUpdate.batch_id = meta.batchId;
    }

    // Reject yang sudah diperbaiki adalah output siap jual. Dokumen stok
    // sudah dipilih sebelum transaksi dan dibaca ulang secara atomik di sini.
    const stokSnap = stokRef ? await transaction.get(stokRef) : null;
    const ukuran = canonicalUkuran(reject.ukuran);

    transaction.update(rejectRef, rejectUpdate);

    transaction.set(resolusiRef, {
      aksi,
      jumlah,
      ...(meta.catatan ? { catatan: meta.catatan } : {}),
      dicatat_oleh_uid: meta.uid,
      dicatat_oleh_nama: meta.nama,
      timestamp: serverTimestamp(),
    });

    if (aksi !== 'diperbaiki' || !stokRef || !stokSnap) return;

    const stokData = stokSnap.exists() ? stokSnap.data() as Record<string, unknown> : null;
    const stokSebelum = Number(stokData?.stok_tersedia ?? 0);
    const stokSesudah = stokSebelum + jumlah;
    const sumberProduksi: SumberProduksi | null = resolvedBatchId
      ? {
          batch_id: resolvedBatchId,
          jumlah_pcs: jumlah,
          ...(sourceBatch?.penugasan ? { penugasan: sourceBatch.penugasan } : {}),
        }
      : null;
    const sumberProduksiLama = Array.isArray(stokData?.sumber_produksi)
      ? stokData.sumber_produksi as SumberProduksi[]
      : [];

    if (!stokSnap.exists()) {
      transaction.set(stokRef, {
        model_id: reject.model_id,
        nama_model: reject.nama_model,
        ...(reject.nama_warna ? { nama_warna: reject.nama_warna } : {}),
        ...(reject.kode_hex_warna ? { kode_hex_warna: reject.kode_hex_warna } : {}),
        ukuran,
        stok_tersedia: jumlah,
        total_masuk: jumlah,
        total_keluar: 0,
        ...(sumberProduksi ? { sumber_produksi: [sumberProduksi] } : {}),
        updatedAt: serverTimestamp(),
      });
    } else {
      transaction.update(stokRef, {
        stok_tersedia: stokSesudah,
        total_masuk: Number(stokData?.total_masuk ?? 0) + jumlah,
        ...(sumberProduksi
          ? { sumber_produksi: appendSumberProduksiLot(sumberProduksiLama, sumberProduksi) }
          : {}),
        ...(reject.nama_warna ? { nama_warna: reject.nama_warna } : {}),
        ...(reject.kode_hex_warna ? { kode_hex_warna: reject.kode_hex_warna } : {}),
        updatedAt: serverTimestamp(),
      });
    }

    transaction.set(doc(collection(db, COL_RIWAYAT_JADI)), {
      model_id: reject.model_id,
      nama_model: reject.nama_model,
      ...(reject.nama_warna ? { nama_warna: reject.nama_warna } : {}),
      ...(reject.kode_hex_warna ? { kode_hex_warna: reject.kode_hex_warna } : {}),
      ukuran,
      tipe: 'reject_diperbaiki',
      jumlah,
      stok_sebelum: stokSebelum,
      stok_sesudah: stokSesudah,
      catatan: meta.catatan ?? `Reject diperbaiki dari proses ${reject.asal_proses}`,
      ...(resolvedBatchId ? { batch_id: resolvedBatchId } : {}),
      dicatat_oleh_uid: meta.uid,
      dicatat_oleh_nama: meta.nama,
      timestamp: serverTimestamp(),
    });
  });
}
