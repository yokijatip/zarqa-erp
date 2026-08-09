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
  DetailUkuran, StatusBatch, StokBarangJadi, RejectAttribusi,
} from '$lib/types';

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
      ukuran: item.ukuran,
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
  const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RejectItem);
  return results.sort((a, b) => a.ukuran.localeCompare(b.ukuran));
}

// Semua reject yang masih pending, lintas batch — untuk halaman rekap/monitor kalau dibutuhkan nanti
export async function getRejectItemsPending(): Promise<RejectItem[]> {
  const q = query(collection(db, COL_REJECT), where('status', '==', 'pending'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RejectItem);
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
  meta: { uid: string; nama: string; catatan?: string },
): Promise<void> {
  if (jumlah <= 0) throw new Error('Jumlah harus lebih dari 0');

  const rejectRef = doc(db, COL_REJECT, rejectItemId);
  const resolusiRef = doc(collection(db, COL_REJECT, rejectItemId, 'riwayat_resolusi'));

  // Untuk aksi 'diperbaiki' kita perlu tahu ref stok_barang_jadi tujuan sebelum transaksi
  let stokRef: ReturnType<typeof doc> | null = null;
  if (aksi === 'diperbaiki') {
    const rejectSnap = await getDoc(rejectRef);
    if (!rejectSnap.exists()) throw new Error('Reject item tidak ditemukan');
    const reject = rejectSnap.data() as RejectItem;

    const q = reject.nama_warna
      ? query(collection(db, COL_JADI), where('model_id', '==', reject.model_id), where('ukuran', '==', reject.ukuran), where('nama_warna', '==', reject.nama_warna))
      : query(collection(db, COL_JADI), where('model_id', '==', reject.model_id), where('ukuran', '==', reject.ukuran));
    const stokSnap = await getDocs(q);
    stokRef = stokSnap.empty
      ? doc(db, COL_JADI, buildBarangJadiDocId(reject.model_id, reject.ukuran, reject.nama_warna))
      : stokSnap.docs[0].ref;
  }

  await runTransaction(db, async (transaction) => {
    const rejectSnap = await transaction.get(rejectRef);
    if (!rejectSnap.exists()) throw new Error('Reject item tidak ditemukan');
    const reject = { id: rejectSnap.id, ...rejectSnap.data() } as RejectItem;

    const sisa = reject.jumlah - reject.jumlah_diperbaiki - reject.jumlah_gagal;
    if (jumlah > sisa) {
      throw new Error(`Sisa reject yang belum diselesaikan hanya ${sisa} pcs`);
    }

    const jumlahDiperbaikiBaru = reject.jumlah_diperbaiki + (aksi === 'diperbaiki' ? jumlah : 0);
    const jumlahGagalBaru = reject.jumlah_gagal + (aksi === 'tidak_bisa_diperbaiki' ? jumlah : 0);
    const sisaBaru = reject.jumlah - jumlahDiperbaikiBaru - jumlahGagalBaru;

    // PENTING: semua transaction.get() harus dieksekusi sebelum transaction.set/update
    // apa pun di bawah. Baca stokRef di sini dulu, sebelum ada write.
    let stokSnap: Awaited<ReturnType<typeof transaction.get>> | null = null;
    if (aksi === 'diperbaiki' && stokRef) {
      stokSnap = await transaction.get(stokRef);
    }

    transaction.update(rejectRef, {
      jumlah_diperbaiki: jumlahDiperbaikiBaru,
      jumlah_gagal: jumlahGagalBaru,
      status: sisaBaru <= 0 ? 'selesai' : 'pending',
      updatedAt: serverTimestamp(),
    });

    transaction.set(resolusiRef, {
      aksi,
      jumlah,
      ...(meta.catatan ? { catatan: meta.catatan } : {}),
      dicatat_oleh_uid: meta.uid,
      dicatat_oleh_nama: meta.nama,
      timestamp: serverTimestamp(),
    });

    if (aksi === 'diperbaiki' && stokRef && stokSnap) {
      const stokSebelum = stokSnap.exists() ? (stokSnap.data() as StokBarangJadi).stok_tersedia : 0;
      const stokSesudah = stokSebelum + jumlah;

      if (!stokSnap.exists()) {
        transaction.set(stokRef, {
          model_id: reject.model_id,
          nama_model: reject.nama_model,
          ...(reject.nama_warna ? { nama_warna: reject.nama_warna } : {}),
          ...(reject.kode_hex_warna ? { kode_hex_warna: reject.kode_hex_warna } : {}),
          ukuran: reject.ukuran,
          stok_tersedia: stokSesudah,
          total_masuk: jumlah,
          total_keluar: 0,
          updatedAt: serverTimestamp(),
        });
      } else {
        const stok = stokSnap.data() as StokBarangJadi;
        transaction.update(stokRef, {
          stok_tersedia: stokSesudah,
          total_masuk: stok.total_masuk + jumlah,
          updatedAt: serverTimestamp(),
        });
      }

      const riwayatJadiRef = doc(collection(db, COL_RIWAYAT_JADI));
      transaction.set(riwayatJadiRef, {
        model_id: reject.model_id,
        nama_model: reject.nama_model,
        ukuran: reject.ukuran,
        tipe: 'reject_diperbaiki',
        jumlah,
        stok_sebelum: stokSebelum,
        stok_sesudah: stokSesudah,
        catatan: meta.catatan ?? `Reject dari batch ${reject.nama_model} sudah diperbaiki`,
        batch_id: reject.batch_id,
        dicatat_oleh_uid: meta.uid,
        dicatat_oleh_nama: meta.nama,
        timestamp: serverTimestamp(),
      });
    }
  });
}