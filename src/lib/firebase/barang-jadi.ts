// src/lib/firebase/barang-jadi.ts
import {
  collection, doc, getDocs, getDoc,
  serverTimestamp, runTransaction, deleteDoc,
  query, orderBy, where, limit, Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import { canonicalUkuran, ukuranAliases, type StokBarangJadi, type BarangKeluar, type BarangKeluarInput, type RiwayatBarangJadi, type TipeRiwayatBarangJadi, type SumberProduksi, type BatchProduksi, type BarangKeluarItem } from '$lib/types';

const COL_RIWAYAT = 'riwayat_barang_jadi';

type RiwayatMeta = {
  uid: string;
  nama: string;
  tipe: TipeRiwayatBarangJadi;
  catatan?: string;
  batch_id?: string;
};

const COL_JADI = 'stok_barang_jadi';
const COL_KELUAR = 'barang_keluar';

function warnaDocKey(namaWarna: string): string {
  return namaWarna.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function buildBarangJadiDocId(modelId: string, ukuran: string, namaWarna?: string): string {
  if (!namaWarna) return `${modelId}__${ukuran}`;
  return `${modelId}__${ukuran}__${warnaDocKey(namaWarna)}`;
}

// Tambahkan satu lot produksi ke akhir antrian sumber_produksi sebuah pool
// stok_barang_jadi. Kalau lot terakhir berasal dari batch_id yang sama,
// jumlah pcs-nya digabung (mis. batch yang disetor bertahap dari steam).
export function appendSumberProduksiLot(
  existing: SumberProduksi[] | undefined,
  lot: SumberProduksi,
): SumberProduksi[] {
  const list = existing ? [...existing] : [];
  const last = list[list.length - 1];
  if (last && last.batch_id === lot.batch_id) {
    list[list.length - 1] = { ...last, jumlah_pcs: (last.jumlah_pcs ?? 0) + (lot.jumlah_pcs ?? 0) };
    return list;
  }
  list.push(lot);
  return list;
}

// Ambil `qty` pcs dari antrian sumber_produksi secara FIFO (lot paling lama
// duluan). Kalau antrian tidak cukup menutupi qty (stok lama dari sebelum
// fitur ini ada, tanpa data lot), sisanya dianggap "data lama" — tidak
// diwariskan sumber produksi apa pun, dan itu memang perilaku yang diinginkan.
export function consumeSumberProduksiLots(
  queue: SumberProduksi[] | undefined,
  qty: number,
): { consumed: SumberProduksi[]; remaining: SumberProduksi[] } {
  const consumed: SumberProduksi[] = [];
  const remaining: SumberProduksi[] = [];
  let sisa = qty;
  for (const lot of queue ?? []) {
    const tersedia = lot.jumlah_pcs ?? 0;
    if (sisa <= 0 || tersedia <= 0) {
      remaining.push(lot);
      continue;
    }
    const diambil = Math.min(sisa, tersedia);
    consumed.push({ ...lot, jumlah_pcs: diambil });
    sisa -= diambil;
    if (tersedia > diambil) {
      remaining.push({ ...lot, jumlah_pcs: tersedia - diambil });
    }
  }
  return { consumed, remaining };
}

// ─── STOK BARANG JADI ───────────────────────────────────────────

// Ambil semua stok barang jadi
export async function getStokBarangJadi(): Promise<StokBarangJadi[]> {
  const q = query(collection(db, COL_JADI), orderBy('nama_model'));
  const snap = await getDocs(q);
  return mergeLegacySizes(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StokBarangJadi));
}

function mergeLegacySizes(rows: StokBarangJadi[]): StokBarangJadi[] {
  const merged = new Map<string, StokBarangJadi>();
  for (const row of rows) {
    const ukuran = canonicalUkuran(row.ukuran);
    const key = `${row.model_id}|${row.nama_warna ?? ''}|${ukuran}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...row, ukuran });
      continue;
    }
    current.stok_tersedia += row.stok_tersedia;
    current.total_masuk += row.total_masuk;
    current.total_keluar += row.total_keluar;
    current.sumber_produksi = [...(current.sumber_produksi ?? []), ...(row.sumber_produksi ?? [])];
  }
  return [...merged.values()];
}

// Tambah stok barang jadi setelah batch COMPLETED atau restock manual
export async function tambahStokBarangJadi(
  modelId: string,
  namaModel: string,
  detailUkuran: { ukuran: string; jumlah_pcs: number }[],
  warna?: { nama_warna?: string; kode_hex_warna?: string },
  riwayatMeta?: RiwayatMeta,
): Promise<void> {
  for (const item of detailUkuran) {
    const q = warna?.nama_warna
      ? query(collection(db, COL_JADI), where('model_id', '==', modelId), where('ukuran', 'in', ukuranAliases(item.ukuran)), where('nama_warna', '==', warna.nama_warna))
      : query(collection(db, COL_JADI), where('model_id', '==', modelId), where('ukuran', 'in', ukuranAliases(item.ukuran)));
    const snap = await getDocs(q);
    const ref = snap.empty
      ? doc(db, COL_JADI, buildBarangJadiDocId(modelId, item.ukuran, warna?.nama_warna))
      : snap.docs[0].ref;

    await runTransaction(db, async (transaction) => {
      const existingSnap = await transaction.get(ref);
      let stokSebelum = 0;
      let stokSesudah = item.jumlah_pcs;

      if (!existingSnap.exists()) {
        transaction.set(ref, {
          model_id: modelId,
          nama_model: namaModel,
          ...(warna?.nama_warna ? { nama_warna: warna.nama_warna } : {}),
          ...(warna?.kode_hex_warna ? { kode_hex_warna: warna.kode_hex_warna } : {}),
          ukuran: item.ukuran,
          stok_tersedia: item.jumlah_pcs,
          total_masuk: item.jumlah_pcs,
          total_keluar: 0,
          updatedAt: serverTimestamp(),
        });
      } else {
        const data = existingSnap.data() as StokBarangJadi;
        stokSebelum = data.stok_tersedia;
        stokSesudah = stokSebelum + item.jumlah_pcs;
        transaction.update(ref, {
          stok_tersedia: stokSesudah,
          total_masuk: data.total_masuk + item.jumlah_pcs,
          ...(warna?.nama_warna ? { nama_warna: warna.nama_warna } : {}),
          ...(warna?.kode_hex_warna ? { kode_hex_warna: warna.kode_hex_warna } : {}),
          updatedAt: serverTimestamp(),
        });
      }

      if (riwayatMeta) {
        const riwayatRef = doc(collection(db, COL_RIWAYAT));
        transaction.set(riwayatRef, {
          model_id: modelId,
          nama_model: namaModel,
          ...(warna?.nama_warna ? { nama_warna: warna.nama_warna } : {}),
          ...(warna?.kode_hex_warna ? { kode_hex_warna: warna.kode_hex_warna } : {}),
          ukuran: item.ukuran,
          tipe: riwayatMeta.tipe,
          jumlah: item.jumlah_pcs,
          stok_sebelum: stokSebelum,
          stok_sesudah: stokSesudah,
          ...(riwayatMeta.catatan ? { catatan: riwayatMeta.catatan } : {}),
          ...(riwayatMeta.batch_id ? { batch_id: riwayatMeta.batch_id } : {}),
          dicatat_oleh_uid: riwayatMeta.uid,
          dicatat_oleh_nama: riwayatMeta.nama,
          timestamp: serverTimestamp(),
        });
      }
    });
  }
}

// ─── BARANG KELUAR ───────────────────────────────────────────────

// Catat barang keluar dan kurangi stok
export async function catatBarangKeluar(
  data: BarangKeluarInput,
  dicatatOlehUid: string
): Promise<string> {
  const items: BarangKeluarItem[] =
    data.items && data.items.length > 0
      ? data.items.map((item) => ({
          ...item,
          total_pcs: item.detail_keluar.reduce((sum, i) => sum + i.jumlah_pcs, 0),
        }))
      : [
          {
            model_id: data.model_id,
            nama_model: data.nama_model,
            ...(data.nama_warna ? { nama_warna: data.nama_warna } : {}),
            ...(data.kode_hex_warna ? { kode_hex_warna: data.kode_hex_warna } : {}),
            detail_keluar: data.detail_keluar,
            total_pcs: data.detail_keluar.reduce((sum, i) => sum + i.jumlah_pcs, 0),
            status: 'keluar',
          },
        ];
  const keluarItems = items.filter((item) => item.status !== 'pending');
  const stokRefs = new Map<string, ReturnType<typeof doc>>();

  for (const item of keluarItems) {
    for (const detail of item.detail_keluar) {
      const q = item.nama_warna
        ? query(collection(db, COL_JADI), where('model_id', '==', item.model_id), where('ukuran', 'in', ukuranAliases(detail.ukuran)), where('nama_warna', '==', item.nama_warna))
        : query(collection(db, COL_JADI), where('model_id', '==', item.model_id), where('ukuran', 'in', ukuranAliases(detail.ukuran)));
      const snap = await getDocs(q);
      if (snap.empty) throw new Error(`Stok ${item.nama_model} ukuran ${detail.ukuran} tidak ditemukan`);
      stokRefs.set(`${item.model_id}|${item.nama_warna ?? ''}|${detail.ukuran}`, snap.docs[0].ref);
    }
  }

  const totalPcs = keluarItems.reduce((sum, item) => sum + item.total_pcs, 0);
  const totalPendingPcs = items
    .filter((item) => item.status === 'pending')
    .reduce((sum, item) => sum + item.total_pcs, 0);
  const status = totalPendingPcs > 0 ? 'pending' : 'selesai';
  const modelIds = [...new Set(items.map((item) => item.model_id))];
  const ref = doc(collection(db, COL_KELUAR));

  await runTransaction(db, async (transaction) => {
    const stokSnapshots = new Map<string, { ref: ReturnType<typeof doc>; data: StokBarangJadi }>();

    for (const item of keluarItems) {
      for (const detail of item.detail_keluar) {
        const key = `${item.model_id}|${item.nama_warna ?? ''}|${detail.ukuran}`;
        const stokRef = stokRefs.get(key);
        if (!stokRef) {
          throw new Error(`Stok ${item.nama_model} ukuran ${detail.ukuran} tidak ditemukan`);
        }

        const existingSnap = await transaction.get(stokRef);
        if (!existingSnap.exists()) {
          throw new Error(`Stok ${item.nama_model} ukuran ${detail.ukuran} tidak ditemukan`);
        }

        const stok = existingSnap.data() as StokBarangJadi;
        if (stok.stok_tersedia < detail.jumlah_pcs) {
          throw new Error(`Stok ${item.nama_model} ukuran ${detail.ukuran} tidak mencukupi`);
        }

        stokSnapshots.set(key, { ref: stokRef, data: stok });
      }
    }

    for (const item of keluarItems) {
      for (const detail of item.detail_keluar) {
        const key = `${item.model_id}|${item.nama_warna ?? ''}|${detail.ukuran}`;
        const stokSnapshot = stokSnapshots.get(key);
        if (!stokSnapshot) {
          throw new Error(`Stok ${item.nama_model} ukuran ${detail.ukuran} tidak ditemukan`);
        }

        const { ref: stokRef, data: stok } = stokSnapshot;
        const { consumed, remaining } = consumeSumberProduksiLots(stok.sumber_produksi, detail.jumlah_pcs);
      // Simpan snapshot lot yang terkonsumsi ke detail_keluar item ini, supaya
      // laporan barang keluar bisa menampilkan siapa cutting/jahit/steam-nya.
        detail.sumber = consumed;

        transaction.update(stokRef, {
          stok_tersedia: stok.stok_tersedia - detail.jumlah_pcs,
          total_keluar: stok.total_keluar + detail.jumlah_pcs,
          sumber_produksi: remaining,
          updatedAt: serverTimestamp(),
        });
      }
    }

    transaction.set(ref, {
      ...data,
      items,
      model_ids: modelIds,
      status,
      total_pcs: totalPcs,
      total_pending_pcs: totalPendingPcs,
      dicatat_oleh: dicatatOlehUid,
      tanggal_keluar: serverTimestamp(),
    });
  });

  return ref.id;
}

// Ambil semua ukuran stok untuk satu model
export async function getStokByModel(modelId: string): Promise<StokBarangJadi[]> {
  const q = query(
    collection(db, COL_JADI),
    where('model_id', '==', modelId)
  );
  const snap = await getDocs(q);
  return mergeLegacySizes(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StokBarangJadi));
}

// Kurangi stok manual (koreksi, loss, dll — dicatat ke total_keluar)
export async function kurangiStokManual(
  stokId: string,
  jumlah: number,
  riwayatMeta?: RiwayatMeta,
): Promise<void> {
  const ref = doc(db, COL_JADI, stokId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Stok tidak ditemukan');

    const data = snap.data() as StokBarangJadi;
    if (data.stok_tersedia < jumlah) {
      throw new Error(`Stok hanya ${data.stok_tersedia} pcs, tidak bisa dikurangi ${jumlah} pcs`);
    }
    const stokSesudah = data.stok_tersedia - jumlah;

    transaction.update(ref, {
      stok_tersedia: stokSesudah,
      total_keluar: data.total_keluar + jumlah,
      updatedAt: serverTimestamp(),
    });

    if (riwayatMeta) {
      const riwayatRef = doc(collection(db, COL_RIWAYAT));
        transaction.set(riwayatRef, {
          model_id: data.model_id,
          nama_model: data.nama_model,
          ...(data.nama_warna ? { nama_warna: data.nama_warna } : {}),
          ...(data.kode_hex_warna ? { kode_hex_warna: data.kode_hex_warna } : {}),
          ukuran: data.ukuran,
          tipe: 'kurangi_manual' as TipeRiwayatBarangJadi,
        jumlah,
        stok_sebelum: data.stok_tersedia,
        stok_sesudah: stokSesudah,
        ...(riwayatMeta.catatan ? { catatan: riwayatMeta.catatan } : {}),
        dicatat_oleh_uid: riwayatMeta.uid,
        dicatat_oleh_nama: riwayatMeta.nama,
        timestamp: serverTimestamp(),
      });
    }
  });
}

// Set stok ke nilai absolut (koreksi stok fisik)
export async function setStokManual(
  stokId: string,
  jumlahBaru: number,
  riwayatMeta?: RiwayatMeta,
): Promise<void> {
  const ref = doc(db, COL_JADI, stokId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Stok tidak ditemukan');

    const data = snap.data() as StokBarangJadi;
    const selisih = jumlahBaru - data.stok_tersedia;

    transaction.update(ref, {
      stok_tersedia: jumlahBaru,
      // total_masuk/keluar ikut selisih
      ...(selisih > 0 ? { total_masuk: data.total_masuk + selisih } : {}),
      ...(selisih < 0 ? { total_keluar: data.total_keluar + Math.abs(selisih) } : {}),
      updatedAt: serverTimestamp(),
    });

    if (riwayatMeta) {
      const riwayatRef = doc(collection(db, COL_RIWAYAT));
        transaction.set(riwayatRef, {
          model_id: data.model_id,
          nama_model: data.nama_model,
          ...(data.nama_warna ? { nama_warna: data.nama_warna } : {}),
          ...(data.kode_hex_warna ? { kode_hex_warna: data.kode_hex_warna } : {}),
          ukuran: data.ukuran,
          tipe: 'set_manual' as TipeRiwayatBarangJadi,
        jumlah: Math.abs(selisih),
        stok_sebelum: data.stok_tersedia,
        stok_sesudah: jumlahBaru,
        catatan: `Set manual dari ${data.stok_tersedia} → ${jumlahBaru} pcs`,
        ...(riwayatMeta.catatan ? { catatan: riwayatMeta.catatan } : {}),
        dicatat_oleh_uid: riwayatMeta.uid,
        dicatat_oleh_nama: riwayatMeta.nama,
        timestamp: serverTimestamp(),
      });
    }
  });
}

// ─── RIWAYAT BARANG JADI ─────────────────────────────────────────

export async function getRiwayatBarangJadiByModel(modelId: string): Promise<RiwayatBarangJadi[]> {
  const q = query(
    collection(db, COL_RIWAYAT),
    where('model_id', '==', modelId),
    orderBy('timestamp', 'desc'),
    limit(100),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RiwayatBarangJadi);
}

// ─── BARANG KELUAR ───────────────────────────────────────────────

// Ambil riwayat keluar untuk satu model spesifik (halaman detail)
// Tanpa orderBy agar tidak perlu composite index — sort dilakukan di JS
export async function getRiwayatKeluarByModel(modelId: string): Promise<BarangKeluar[]> {
  const qLegacy = query(
    collection(db, COL_KELUAR),
    where('model_id', '==', modelId),
    limit(100),
  );
  const qList = query(
    collection(db, COL_KELUAR),
    where('model_ids', 'array-contains', modelId),
    limit(100),
  );
  const [legacySnap, listSnap] = await Promise.all([getDocs(qLegacy), getDocs(qList)]);
  const map = new Map<string, BarangKeluar>();
  for (const d of [...legacySnap.docs, ...listSnap.docs]) {
    map.set(d.id, { id: d.id, ...d.data() } as BarangKeluar);
  }
  const results = [...map.values()];
  return results.sort((a, b) => {
    const ta = a.tanggal_keluar?.toMillis?.() ?? 0;
    const tb = b.tanggal_keluar?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

// Ambil riwayat barang keluar — hanya 30 hari terakhir, max 200 dokumen (untuk dashboard/cache)
export async function getRiwayatBarangKeluar(): Promise<BarangKeluar[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const q = query(
    collection(db, COL_KELUAR),
    where('tanggal_keluar', '>=', Timestamp.fromDate(since)),
    orderBy('tanggal_keluar', 'desc'),
    limit(200),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BarangKeluar);
}

// Ambil riwayat barang keluar berdasarkan rentang tanggal — untuk halaman Barang Keluar.
// Jika range null (periode "Semua"), ambil 500 dokumen terbaru saja.
export async function getRiwayatBarangKeluarByPeriod(
  range: { start: Date; end: Date } | null,
): Promise<BarangKeluar[]> {
  const q = range
    ? query(
        collection(db, COL_KELUAR),
        where('tanggal_keluar', '>=', Timestamp.fromDate(range.start)),
        where('tanggal_keluar', '<=', Timestamp.fromDate(range.end)),
        orderBy('tanggal_keluar', 'desc'),
        limit(500),
      )
    : query(
        collection(db, COL_KELUAR),
        orderBy('tanggal_keluar', 'desc'),
        limit(500),
      );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BarangKeluar);
}

// ─── BATALKAN BARANG KELUAR ──────────────────────────────────────

export async function prosesPendingBarangKeluar(
  id: string,
  itemIndex: number,
  riwayatMeta?: { uid: string; nama: string },
): Promise<{ processedPcs: number; remainingPendingPcs: number }> {
  const keluarRef = doc(db, COL_KELUAR, id);
  const keluarSnap = await getDoc(keluarRef);
  if (!keluarSnap.exists()) throw new Error('Catatan barang keluar tidak ditemukan');

  const keluar = { id: keluarSnap.id, ...keluarSnap.data() } as BarangKeluar;
  const initialItems: BarangKeluarItem[] =
    keluar.items && keluar.items.length > 0
      ? keluar.items
      : [
          {
            model_id: keluar.model_id,
            nama_model: keluar.nama_model,
            ...(keluar.nama_warna ? { nama_warna: keluar.nama_warna } : {}),
            ...(keluar.kode_hex_warna ? { kode_hex_warna: keluar.kode_hex_warna } : {}),
            detail_keluar: keluar.detail_keluar,
            total_pcs: keluar.total_pcs,
            status: 'keluar',
          },
        ];
  const target = initialItems[itemIndex];
  if (!target || target.status !== 'pending') {
    throw new Error('Item pending tidak ditemukan atau sudah diproses');
  }

  const stokRefs = new Map<string, ReturnType<typeof doc>>();
  for (const detail of target.detail_keluar) {
    const q = target.nama_warna
      ? query(collection(db, COL_JADI), where('model_id', '==', target.model_id), where('ukuran', 'in', ukuranAliases(detail.ukuran)), where('nama_warna', '==', target.nama_warna))
      : query(collection(db, COL_JADI), where('model_id', '==', target.model_id), where('ukuran', 'in', ukuranAliases(detail.ukuran)));
    const snap = await getDocs(q);
    if (!snap.empty) {
      stokRefs.set(`${target.model_id}|${target.nama_warna ?? ''}|${detail.ukuran}`, snap.docs[0].ref);
    }
  }

  return runTransaction(db, async (transaction) => {
    const currentSnap = await transaction.get(keluarRef);
    if (!currentSnap.exists()) throw new Error('Catatan barang keluar tidak ditemukan');

    const current = { id: currentSnap.id, ...currentSnap.data() } as BarangKeluar;
    const items: BarangKeluarItem[] =
      current.items && current.items.length > 0
        ? current.items
        : [
            {
              model_id: current.model_id,
              nama_model: current.nama_model,
              ...(current.nama_warna ? { nama_warna: current.nama_warna } : {}),
              ...(current.kode_hex_warna ? { kode_hex_warna: current.kode_hex_warna } : {}),
              detail_keluar: current.detail_keluar,
              total_pcs: current.total_pcs,
              status: 'keluar',
            },
          ];
    const pendingItem = items[itemIndex];
    if (!pendingItem || pendingItem.status !== 'pending') {
      throw new Error('Item pending tidak ditemukan atau sudah diproses');
    }

    const stokSnapshots = new Map<string, { ref: ReturnType<typeof doc>; data: StokBarangJadi }>();
    for (const detail of pendingItem.detail_keluar) {
      const key = `${pendingItem.model_id}|${pendingItem.nama_warna ?? ''}|${detail.ukuran}`;
      const stokRef = stokRefs.get(key);
      if (!stokRef) continue;
      const stokSnap = await transaction.get(stokRef);
      if (stokSnap.exists()) {
        stokSnapshots.set(key, { ref: stokRef, data: { id: stokSnap.id, ...stokSnap.data() } as StokBarangJadi });
      }
    }

    const fulfilledDetails: BarangKeluarItem['detail_keluar'] = [];
    const remainingDetails: BarangKeluarItem['detail_keluar'] = [];

    for (const detail of pendingItem.detail_keluar) {
      const key = `${pendingItem.model_id}|${pendingItem.nama_warna ?? ''}|${detail.ukuran}`;
      const stokSnapshot = stokSnapshots.get(key);
      const tersedia = stokSnapshot?.data.stok_tersedia ?? 0;
      const fulfilled = Math.min(detail.jumlah_pcs, tersedia);
      const remaining = detail.jumlah_pcs - fulfilled;

      if (fulfilled > 0 && stokSnapshot) {
        const { consumed, remaining: remainingLots } = consumeSumberProduksiLots(stokSnapshot.data.sumber_produksi, fulfilled);
        fulfilledDetails.push({ ...detail, jumlah_pcs: fulfilled, sumber: consumed });
        transaction.update(stokSnapshot.ref, {
          stok_tersedia: stokSnapshot.data.stok_tersedia - fulfilled,
          total_keluar: stokSnapshot.data.total_keluar + fulfilled,
          sumber_produksi: remainingLots,
          updatedAt: serverTimestamp(),
        });

        if (riwayatMeta) {
          const riwayatRef = doc(collection(db, COL_RIWAYAT));
          transaction.set(riwayatRef, {
            model_id: pendingItem.model_id,
            nama_model: pendingItem.nama_model,
            ...(pendingItem.nama_warna ? { nama_warna: pendingItem.nama_warna } : {}),
            ...(pendingItem.kode_hex_warna ? { kode_hex_warna: pendingItem.kode_hex_warna } : {}),
            ukuran: detail.ukuran,
            tipe: 'barang_keluar' as TipeRiwayatBarangJadi,
            jumlah: fulfilled,
            stok_sebelum: stokSnapshot.data.stok_tersedia,
            stok_sesudah: stokSnapshot.data.stok_tersedia - fulfilled,
            catatan: `Pemenuhan pending barang keluar ke ${current.tujuan}`,
            dicatat_oleh_uid: riwayatMeta.uid,
            dicatat_oleh_nama: riwayatMeta.nama,
            timestamp: serverTimestamp(),
          });
        }
      }

      if (remaining > 0) remainingDetails.push({ ...detail, jumlah_pcs: remaining });
    }

    const processedPcs = fulfilledDetails.reduce((sum, detail) => sum + detail.jumlah_pcs, 0);
    if (processedPcs <= 0) throw new Error('Stok untuk item pending ini belum tersedia');

    const replacementItems: BarangKeluarItem[] = [
      {
        ...pendingItem,
        detail_keluar: fulfilledDetails,
        total_pcs: processedPcs,
        status: 'keluar',
      },
    ];
    if (remainingDetails.length > 0) {
      replacementItems.push({
        ...pendingItem,
        detail_keluar: remainingDetails,
        total_pcs: remainingDetails.reduce((sum, detail) => sum + detail.jumlah_pcs, 0),
        status: 'pending',
        alasan_pending: pendingItem.alasan_pending ?? 'Stok belum tersedia',
      });
    }

    const nextItems = [...items.slice(0, itemIndex), ...replacementItems, ...items.slice(itemIndex + 1)];
    const nextPendingPcs = nextItems
      .filter((item) => item.status === 'pending')
      .reduce((sum, item) => sum + item.total_pcs, 0);
    const nextTotalPcs = nextItems
      .filter((item) => item.status !== 'pending')
      .reduce((sum, item) => sum + item.total_pcs, 0);
    const nextDetailKeluar = nextItems
      .filter((item) => item.status !== 'pending')
      .flatMap((item) => item.detail_keluar);

    transaction.update(keluarRef, {
      items: nextItems,
      detail_keluar: nextDetailKeluar,
      total_pcs: nextTotalPcs,
      total_pending_pcs: nextPendingPcs,
      status: nextPendingPcs > 0 ? 'pending' : 'selesai',
    });

    return { processedPcs, remainingPendingPcs: nextPendingPcs };
  });
}

// Batalkan catatan barang keluar: kembalikan stok ke stok_barang_jadi, hapus dokumen
export async function batalBarangKeluar(
  id: string,
  riwayatMeta?: { uid: string; nama: string; catatan?: string },
): Promise<void> {
  const keluarRef = doc(db, COL_KELUAR, id);
  const keluarSnap = await getDoc(keluarRef);
  if (!keluarSnap.exists()) throw new Error('Catatan barang keluar tidak ditemukan');

  const keluar = { id: keluarSnap.id, ...keluarSnap.data() } as BarangKeluar;
  const items: BarangKeluarItem[] =
    keluar.items && keluar.items.length > 0
      ? keluar.items
      : [
          {
            model_id: keluar.model_id,
            nama_model: keluar.nama_model,
            ...(keluar.nama_warna ? { nama_warna: keluar.nama_warna } : {}),
            ...(keluar.kode_hex_warna ? { kode_hex_warna: keluar.kode_hex_warna } : {}),
            detail_keluar: keluar.detail_keluar,
            total_pcs: keluar.detail_keluar.reduce((sum, item) => sum + item.jumlah_pcs, 0),
            status: 'keluar',
          },
        ];
  const keluarItems = items.filter((item) => item.status !== 'pending');

  // Ambil semua stok refs sebelum transaksi (reads di luar transaction)
  const stokRefs = new Map<string, ReturnType<typeof doc>>();
  for (const item of keluarItems) {
    for (const detail of item.detail_keluar) {
      const q = item.nama_warna
        ? query(collection(db, COL_JADI), where('model_id', '==', item.model_id), where('ukuran', 'in', ukuranAliases(detail.ukuran)), where('nama_warna', '==', item.nama_warna))
        : query(collection(db, COL_JADI), where('model_id', '==', item.model_id), where('ukuran', 'in', ukuranAliases(detail.ukuran)));
      const snap = await getDocs(q);
      if (!snap.empty) stokRefs.set(`${item.model_id}|${item.nama_warna ?? ''}|${detail.ukuran}`, snap.docs[0].ref);
    }
  }

  await runTransaction(db, async (transaction) => {
    // Baca semua stok dulu, baru tulis
    const stokSnapshots = new Map<string, { ref: ReturnType<typeof doc>; data: StokBarangJadi }>();
    for (const [key, ref] of stokRefs) {
      const snap = await transaction.get(ref);
      if (snap.exists()) stokSnapshots.set(key, { ref, data: { id: snap.id, ...snap.data() } as StokBarangJadi });
    }

    for (const item of keluarItems) {
      for (const detail of item.detail_keluar) {
        const entry = stokSnapshots.get(`${item.model_id}|${item.nama_warna ?? ''}|${detail.ukuran}`);
        if (!entry) continue;
        const { ref, data } = entry;
        const stokSesudah = data.stok_tersedia + detail.jumlah_pcs;

        transaction.update(ref, {
          stok_tersedia: stokSesudah,
          total_keluar: Math.max(0, data.total_keluar - detail.jumlah_pcs),
          updatedAt: serverTimestamp(),
        });

        if (riwayatMeta) {
          const riwayatRef = doc(collection(db, COL_RIWAYAT));
          transaction.set(riwayatRef, {
            model_id: item.model_id,
            nama_model: item.nama_model,
            ukuran: detail.ukuran,
            tipe: 'batal_keluar' as TipeRiwayatBarangJadi,
            jumlah: detail.jumlah_pcs,
            stok_sebelum: data.stok_tersedia,
            stok_sesudah: stokSesudah,
            catatan: riwayatMeta.catatan ?? `Pembatalan pengiriman ke ${keluar.tujuan}`,
            dicatat_oleh_uid: riwayatMeta.uid,
            dicatat_oleh_nama: riwayatMeta.nama,
            timestamp: serverTimestamp(),
          });
        }
      }
    }

    transaction.delete(keluarRef);
  });
}

export async function batalItemBarangKeluar(
  id: string,
  itemIndex: number,
  riwayatMeta?: { uid: string; nama: string; catatan?: string },
): Promise<{ deleted: boolean }> {
  const keluarRef = doc(db, COL_KELUAR, id);
  const keluarSnap = await getDoc(keluarRef);
  if (!keluarSnap.exists()) throw new Error('Catatan barang keluar tidak ditemukan');

  const keluar = { id: keluarSnap.id, ...keluarSnap.data() } as BarangKeluar;
  const initialItems: BarangKeluarItem[] =
    keluar.items && keluar.items.length > 0
      ? keluar.items
      : [
          {
            model_id: keluar.model_id,
            nama_model: keluar.nama_model,
            ...(keluar.nama_warna ? { nama_warna: keluar.nama_warna } : {}),
            ...(keluar.kode_hex_warna ? { kode_hex_warna: keluar.kode_hex_warna } : {}),
            detail_keluar: keluar.detail_keluar,
            total_pcs: keluar.detail_keluar.reduce((sum, item) => sum + item.jumlah_pcs, 0),
            status: 'keluar',
          },
        ];

  const target = initialItems[itemIndex];
  if (!target) throw new Error('Item barang keluar tidak ditemukan');

  const stokRefs = new Map<string, ReturnType<typeof doc>>();
  if (target.status !== 'pending') {
    for (const detail of target.detail_keluar) {
      const q = target.nama_warna
        ? query(collection(db, COL_JADI), where('model_id', '==', target.model_id), where('ukuran', 'in', ukuranAliases(detail.ukuran)), where('nama_warna', '==', target.nama_warna))
        : query(collection(db, COL_JADI), where('model_id', '==', target.model_id), where('ukuran', 'in', ukuranAliases(detail.ukuran)));
      const snap = await getDocs(q);
      if (!snap.empty) stokRefs.set(`${target.model_id}|${target.nama_warna ?? ''}|${detail.ukuran}`, snap.docs[0].ref);
    }
  }

  return runTransaction(db, async (transaction) => {
    const freshKeluarSnap = await transaction.get(keluarRef);
    if (!freshKeluarSnap.exists()) throw new Error('Catatan barang keluar tidak ditemukan');
    const freshKeluar = { id: freshKeluarSnap.id, ...freshKeluarSnap.data() } as BarangKeluar;
    const items: BarangKeluarItem[] =
      freshKeluar.items && freshKeluar.items.length > 0
        ? freshKeluar.items
        : initialItems;
    const currentTarget = items[itemIndex];
    if (!currentTarget) throw new Error('Item barang keluar tidak ditemukan');

    const stokSnapshots = new Map<string, { ref: ReturnType<typeof doc>; data: StokBarangJadi }>();
    for (const [key, ref] of stokRefs) {
      const snap = await transaction.get(ref);
      if (snap.exists()) stokSnapshots.set(key, { ref, data: { id: snap.id, ...snap.data() } as StokBarangJadi });
    }

    if (currentTarget.status !== 'pending') {
      for (const detail of currentTarget.detail_keluar) {
        const entry = stokSnapshots.get(`${currentTarget.model_id}|${currentTarget.nama_warna ?? ''}|${detail.ukuran}`);
        if (!entry) continue;
        const { ref, data } = entry;
        const stokSesudah = data.stok_tersedia + detail.jumlah_pcs;
        const sumber_produksi = (detail.sumber ?? []).reduce(
          (queue, lot) => appendSumberProduksiLot(queue, lot),
          data.sumber_produksi ?? [],
        );

        transaction.update(ref, {
          stok_tersedia: stokSesudah,
          total_keluar: Math.max(0, data.total_keluar - detail.jumlah_pcs),
          sumber_produksi,
          updatedAt: serverTimestamp(),
        });

        if (riwayatMeta) {
          const riwayatRef = doc(collection(db, COL_RIWAYAT));
          transaction.set(riwayatRef, {
            model_id: currentTarget.model_id,
            nama_model: currentTarget.nama_model,
            ...(currentTarget.nama_warna ? { nama_warna: currentTarget.nama_warna } : {}),
            ...(currentTarget.kode_hex_warna ? { kode_hex_warna: currentTarget.kode_hex_warna } : {}),
            ukuran: detail.ukuran,
            tipe: 'batal_keluar' as TipeRiwayatBarangJadi,
            jumlah: detail.jumlah_pcs,
            stok_sebelum: data.stok_tersedia,
            stok_sesudah: stokSesudah,
            catatan: riwayatMeta.catatan ?? `Pembatalan item pengiriman ke ${freshKeluar.tujuan}`,
            dicatat_oleh_uid: riwayatMeta.uid,
            dicatat_oleh_nama: riwayatMeta.nama,
            timestamp: serverTimestamp(),
          });
        }
      }
    }

    const nextItems = items.filter((_, index) => index !== itemIndex);
    if (nextItems.length === 0) {
      transaction.delete(keluarRef);
      return { deleted: true };
    }

    const nextDetailKeluar = nextItems
      .filter((item) => item.status !== 'pending')
      .flatMap((item) => item.detail_keluar);
    const nextTotalPcs = nextItems
      .filter((item) => item.status !== 'pending')
      .reduce((sum, item) => sum + item.total_pcs, 0);
    const nextPendingPcs = nextItems
      .filter((item) => item.status === 'pending')
      .reduce((sum, item) => sum + item.total_pcs, 0);
    const firstItem = nextItems[0];

    transaction.update(keluarRef, {
      model_id: firstItem.model_id,
      model_ids: [...new Set(nextItems.map((item) => item.model_id))],
      nama_model: nextItems.length > 1 ? `${nextItems.length} barang` : firstItem.nama_model,
      ...(nextItems.length === 1 && firstItem.nama_warna ? { nama_warna: firstItem.nama_warna } : { nama_warna: null }),
      ...(nextItems.length === 1 && firstItem.kode_hex_warna ? { kode_hex_warna: firstItem.kode_hex_warna } : { kode_hex_warna: null }),
      detail_keluar: nextDetailKeluar,
      items: nextItems,
      status: nextPendingPcs > 0 ? 'pending' : 'selesai',
      total_pcs: nextTotalPcs,
      total_pending_pcs: nextPendingPcs,
    });

    return { deleted: false };
  });
}

export async function returBarangKeluarItem(
  id: string,
  itemIndex: number,
  detailRetur: { ukuran: string; jumlah_pcs: number }[],
  riwayatMeta?: { uid: string; nama: string; catatan?: string },
): Promise<{ deleted: boolean }> {
  const normalized = detailRetur
    .map((item) => ({ ukuran: item.ukuran, jumlah_pcs: Math.floor(Number(item.jumlah_pcs) || 0) }))
    .filter((item) => item.jumlah_pcs > 0);
  if (normalized.length === 0) throw new Error('Jumlah retur belum diisi');

  const keluarRef = doc(db, COL_KELUAR, id);
  const keluarSnap = await getDoc(keluarRef);
  if (!keluarSnap.exists()) throw new Error('Catatan barang keluar tidak ditemukan');

  const keluar = { id: keluarSnap.id, ...keluarSnap.data() } as BarangKeluar;
  const initialItems: BarangKeluarItem[] =
    keluar.items && keluar.items.length > 0
      ? keluar.items
      : [
          {
            model_id: keluar.model_id,
            nama_model: keluar.nama_model,
            ...(keluar.nama_warna ? { nama_warna: keluar.nama_warna } : {}),
            ...(keluar.kode_hex_warna ? { kode_hex_warna: keluar.kode_hex_warna } : {}),
            detail_keluar: keluar.detail_keluar,
            total_pcs: keluar.detail_keluar.reduce((sum, item) => sum + item.jumlah_pcs, 0),
            status: 'keluar',
          },
        ];

  const target = initialItems[itemIndex];
  if (!target) throw new Error('Item barang keluar tidak ditemukan');
  if (target.status === 'pending') throw new Error('Item pending tidak bisa diretur. Batalkan pending dari detail order.');

  const stokRefs = new Map<string, ReturnType<typeof doc>>();
  for (const detail of normalized) {
    const q = target.nama_warna
      ? query(collection(db, COL_JADI), where('model_id', '==', target.model_id), where('ukuran', 'in', ukuranAliases(detail.ukuran)), where('nama_warna', '==', target.nama_warna))
      : query(collection(db, COL_JADI), where('model_id', '==', target.model_id), where('ukuran', 'in', ukuranAliases(detail.ukuran)));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error(`Stok ${target.nama_model} ukuran ${detail.ukuran} tidak ditemukan`);
    stokRefs.set(`${target.model_id}|${target.nama_warna ?? ''}|${detail.ukuran}`, snap.docs[0].ref);
  }

  return runTransaction(db, async (transaction) => {
    const freshKeluarSnap = await transaction.get(keluarRef);
    if (!freshKeluarSnap.exists()) throw new Error('Catatan barang keluar tidak ditemukan');
    const freshKeluar = { id: freshKeluarSnap.id, ...freshKeluarSnap.data() } as BarangKeluar;
    const items: BarangKeluarItem[] =
      freshKeluar.items && freshKeluar.items.length > 0 ? freshKeluar.items : initialItems;
    const currentTarget = items[itemIndex];
    if (!currentTarget) throw new Error('Item barang keluar tidak ditemukan');
    if (currentTarget.status === 'pending') throw new Error('Item pending tidak bisa diretur');

    const returByUkuran = new Map(normalized.map((item) => [item.ukuran, item.jumlah_pcs]));
    const stokSnapshots = new Map<string, { ref: ReturnType<typeof doc>; data: StokBarangJadi }>();
    for (const [key, ref] of stokRefs) {
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error('Stok barang jadi tidak ditemukan');
      stokSnapshots.set(key, { ref, data: { id: snap.id, ...snap.data() } as StokBarangJadi });
    }

    const nextDetail = currentTarget.detail_keluar
      .map((detail) => {
        const returQty = returByUkuran.get(detail.ukuran) ?? 0;
        if (returQty <= 0) return detail;
        if (returQty > detail.jumlah_pcs) {
          throw new Error(`Retur ${detail.ukuran} melebihi jumlah keluar`);
        }

        const stokKey = `${currentTarget.model_id}|${currentTarget.nama_warna ?? ''}|${detail.ukuran}`;
        const stokEntry = stokSnapshots.get(stokKey);
        if (!stokEntry) throw new Error(`Stok ${currentTarget.nama_model} ukuran ${detail.ukuran} tidak ditemukan`);

        const { consumed: restoredLots, remaining: remainingSumber } = consumeSumberProduksiLots(detail.sumber, returQty);
        const stokSesudah = stokEntry.data.stok_tersedia + returQty;
        const sumberProduksi = restoredLots.reduce(
          (queue, lot) => appendSumberProduksiLot(queue, lot),
          stokEntry.data.sumber_produksi ?? [],
        );

        transaction.update(stokEntry.ref, {
          stok_tersedia: stokSesudah,
          total_keluar: Math.max(0, stokEntry.data.total_keluar - returQty),
          sumber_produksi: sumberProduksi,
          updatedAt: serverTimestamp(),
        });

        if (riwayatMeta) {
          const riwayatRef = doc(collection(db, COL_RIWAYAT));
          transaction.set(riwayatRef, {
            model_id: currentTarget.model_id,
            nama_model: currentTarget.nama_model,
            ...(currentTarget.nama_warna ? { nama_warna: currentTarget.nama_warna } : {}),
            ...(currentTarget.kode_hex_warna ? { kode_hex_warna: currentTarget.kode_hex_warna } : {}),
            ukuran: detail.ukuran,
            tipe: 'batal_keluar' as TipeRiwayatBarangJadi,
            jumlah: returQty,
            stok_sebelum: stokEntry.data.stok_tersedia,
            stok_sesudah: stokSesudah,
            catatan: riwayatMeta.catatan ?? `Retur penjualan ${freshKeluar.tujuan}`,
            dicatat_oleh_uid: riwayatMeta.uid,
            dicatat_oleh_nama: riwayatMeta.nama,
            timestamp: serverTimestamp(),
          });
        }

        return {
          ...detail,
          jumlah_pcs: detail.jumlah_pcs - returQty,
          sumber: remainingSumber,
        };
      })
      .filter((detail) => detail.jumlah_pcs > 0);

    for (const item of normalized) {
      if (!currentTarget.detail_keluar.some((detail) => detail.ukuran === item.ukuran)) {
        throw new Error(`Ukuran ${item.ukuran} tidak ada di item keluar`);
      }
    }

    const nextTargetTotal = nextDetail.reduce((sum, detail) => sum + detail.jumlah_pcs, 0);
    const nextItems = items
      .map((item, index) =>
        index === itemIndex
          ? {
              ...item,
              detail_keluar: nextDetail,
              total_pcs: nextTargetTotal,
            }
          : item,
      )
      .filter((item) => item.total_pcs > 0);

    if (nextItems.length === 0) {
      transaction.delete(keluarRef);
      return { deleted: true };
    }

    const nextDetailKeluar = nextItems
      .filter((item) => item.status !== 'pending')
      .flatMap((item) => item.detail_keluar);
    const nextTotalPcs = nextItems
      .filter((item) => item.status !== 'pending')
      .reduce((sum, item) => sum + item.total_pcs, 0);
    const nextPendingPcs = nextItems
      .filter((item) => item.status === 'pending')
      .reduce((sum, item) => sum + item.total_pcs, 0);
    const firstItem = nextItems[0];

    transaction.update(keluarRef, {
      model_id: firstItem.model_id,
      model_ids: [...new Set(nextItems.map((item) => item.model_id))],
      nama_model: nextItems.length > 1 ? `${nextItems.length} barang` : firstItem.nama_model,
      ...(nextItems.length === 1 && firstItem.nama_warna ? { nama_warna: firstItem.nama_warna } : { nama_warna: null }),
      ...(nextItems.length === 1 && firstItem.kode_hex_warna ? { kode_hex_warna: firstItem.kode_hex_warna } : { kode_hex_warna: null }),
      detail_keluar: nextDetailKeluar,
      items: nextItems,
      status: nextPendingPcs > 0 ? 'pending' : 'selesai',
      total_pcs: nextTotalPcs,
      total_pending_pcs: nextPendingPcs,
    });

    return { deleted: false };
  });
}
