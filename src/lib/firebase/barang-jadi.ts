// src/lib/firebase/barang-jadi.ts
import {
  collection, doc, getDocs, getDoc,
  serverTimestamp, runTransaction, deleteDoc,
  query, orderBy, where, limit, Timestamp, type Transaction,
} from 'firebase/firestore';
import { db } from './config';
import { getCursorPage, type FirestoreCursor, type CursorPage } from './pagination';
import { canonicalUkuran, ukuranAliases, getStokHijabIdUntukWarna, resolveStokHijabIdUntukWarna, type StokBarangJadi, type BarangKeluar, type BarangKeluarInput, type RiwayatBarangJadi, type TipeRiwayatBarangJadi, type SumberProduksi, type BatchProduksi, type BarangKeluarItem, type DetailKeluar, type StokHijab, type KomponenVarianPenjualan } from '$lib/types';

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
const COL_HIJAB = 'stok_hijab';
const COL_MODEL_BAJU = 'model_baju';

type HijabUsage = {
  id: string;
  nama: string;
  jumlah: number;
  sumber: string[];
};

function hijabStockId(component: KomponenVarianPenjualan, item?: Pick<BarangKeluarItem, 'warna_id' | 'nama_warna'>): string | undefined {
  return getStokHijabIdUntukWarna(component, item);
}

function hasHijabColorMapping(component: KomponenVarianPenjualan): boolean {
  return Boolean(component.stok_hijab_per_warna && Object.keys(component.stok_hijab_per_warna).length > 0);
}

function managesHijabStock(component: KomponenVarianPenjualan): boolean {
  // Missing flag means legacy add-on data; linked hijab components still use stock.
  return component.tipe === 'aksesori' && component.kelola_stok !== false && component.jumlah > 0;
}

async function hydrateAutoHijabComponents(items: BarangKeluarItem[]): Promise<BarangKeluarItem[]> {
  const stockCache = new Map<string, StokHijab[]>();
  const variantCache = new Map<string, KomponenVarianPenjualan[] | undefined>();
  const getVariantComponents = async (item: BarangKeluarItem): Promise<KomponenVarianPenjualan[] | undefined> => {
    if (item.jenis_produk === 'hijab' || !item.varian_id) return undefined;
    const cached = variantCache.get(item.model_id);
    if (cached !== undefined || variantCache.has(item.model_id)) return cached;

    const modelSnap = await getDoc(doc(db, COL_MODEL_BAJU, item.model_id));
    if (!modelSnap.exists()) {
      variantCache.set(item.model_id, undefined);
      return undefined;
    }
    const variants = modelSnap.data().varian_penjualan;
    const variant = Array.isArray(variants)
      ? variants.find((entry) => entry?.id === item.varian_id)
      : undefined;
    const components = Array.isArray(variant?.komponen)
      ? variant.komponen as KomponenVarianPenjualan[]
      : undefined;
    variantCache.set(item.model_id, components);
    return components;
  };
  const getCandidates = async (component: KomponenVarianPenjualan): Promise<StokHijab[]> => {
    const cacheKey = component.model_hijab_id
      ? `model:${component.model_hijab_id}`
      : `name:${component.nama}`;
    const cached = stockCache.get(cacheKey);
    if (cached) return cached;

    const constraint = component.model_hijab_id
      ? where('model_hijab_id', '==', component.model_hijab_id)
      : where('nama_hijab', '==', component.nama);
    const snap = await getDocs(query(collection(db, COL_HIJAB), constraint));
    const candidates = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as StokHijab);
    stockCache.set(cacheKey, candidates);
    return candidates;
  };

  return Promise.all(items.map(async (item) => {
    const sourceComponents = item.komponen_varian?.length
      ? item.komponen_varian
      : await getVariantComponents(item);
    if (!sourceComponents?.length) return item;
    const components = await Promise.all(sourceComponents.map(async (component) => {
      if (!managesHijabStock(component) || hasHijabColorMapping(component)) {
        return component;
      }
      if (hijabStockId(component, item)) return component;
      const candidates = await getCandidates(component);
      const stockId = resolveStokHijabIdUntukWarna(component, item, candidates);
      return stockId
        ? { ...component, ref_id: stockId, stok_hijab_id: stockId }
        : component;
    }));
    return { ...item, komponen_varian: components };
  }));
}

function validateManagedHijabComponents(items: BarangKeluarItem[]): void {
  for (const item of items) {
    for (const component of item.komponen_varian ?? []) {
      if (!managesHijabStock(component)) continue;
      if (!hijabStockId(component, item)) {
        const warna = item.nama_warna ? ` warna ${item.nama_warna}` : '';
        throw new Error(`Stok hijab add-on "${component.nama}"${warna} tidak ditemukan`);
      }
    }
  }
}

function managedHijabComponents(item: BarangKeluarItem): KomponenVarianPenjualan[] {
  return (item.komponen_varian ?? []).filter(
    (component) => managesHijabStock(component) && hijabStockId(component, item),
  );
}

function aggregateHijabUsage(items: BarangKeluarItem[]): HijabUsage[] {
  const usage = new Map<string, HijabUsage>();
  const addUsage = (stockId: string, nama: string, jumlah: number, sumber: string) => {
    if (jumlah <= 0) return;
    const current = usage.get(stockId);
    usage.set(stockId, {
      id: stockId,
      nama,
      jumlah: (current?.jumlah ?? 0) + jumlah,
      sumber: [...new Set([...(current?.sumber ?? []), sumber])],
    });
  };
  for (const item of items) {
    if (item.jenis_produk === 'hijab' && item.stok_hijab_id) {
      addUsage(
        item.stok_hijab_id,
        item.nama_hijab ?? item.nama_model,
        item.total_pcs,
        [item.nama_model, item.nama_warna].filter(Boolean).join(' - '),
      );
    }
    for (const component of managedHijabComponents(item)) {
      const stockId = hijabStockId(component, item);
      if (!stockId) continue;
      addUsage(
        stockId,
        component.nama,
        item.total_pcs * component.jumlah,
        [item.nama_model, item.nama_varian].filter(Boolean).join(' - '),
      );
    }
  }
  return [...usage.values()];
}

function addHijabHistory(
  transaction: Transaction,
  hijabId: string,
  data: { tipe: string; jumlah: number; stok_sebelum: number; stok_sesudah: number; catatan?: string; [key: string]: unknown },
) {
  const historyRef = doc(collection(db, COL_HIJAB, hijabId, 'riwayat'));
  transaction.set(historyRef, {
    ...data,
    timestamp: serverTimestamp(),
  });
}

function warnaDocKey(namaWarna: string): string {
  return namaWarna.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function ukuranDocKey(ukuran: string): string {
  // Firestore document IDs cannot contain '/'; display/storage field stays canonical.
  return ukuran.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function buildBarangJadiDocId(modelId: string, ukuran: string, namaWarna?: string): string {
  const ukuranKey = ukuranDocKey(ukuran);
  if (!namaWarna) return `${modelId}__${ukuranKey}`;
  return `${modelId}__${ukuranKey}__${warnaDocKey(namaWarna)}`;
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

function stokModelId(item: BarangKeluarItem): string {
  return item.stok_model_id ?? item.model_id;
}

function normalizeDetailKeluar(value: unknown): DetailKeluar[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const detail = (entry ?? {}) as Record<string, unknown>;
    return {
      ...detail,
      ukuran: canonicalUkuran(String(detail.ukuran ?? '')),
    } as DetailKeluar;
  });
}

function normalizeBarangKeluarSnapshot(id: string, value: Record<string, unknown>): BarangKeluar {
  const items = Array.isArray(value.items)
    ? value.items.map((entry) => {
        const item = (entry ?? {}) as Record<string, unknown>;
        return {
          ...item,
          detail_keluar: normalizeDetailKeluar(item.detail_keluar),
        } as BarangKeluarItem;
      })
    : undefined;
  return {
    ...value,
    id,
    detail_keluar: normalizeDetailKeluar(value.detail_keluar),
    ...(items ? { items } : {}),
  } as BarangKeluar;
}

function normalizeStokBarangJadiSnapshot(id: string, value: Record<string, unknown>): StokBarangJadi {
  return {
    ...value,
    id,
    ukuran: canonicalUkuran(String(value.ukuran ?? '')),
  } as StokBarangJadi;
}

export async function getStokBarangJadiPage(
  cursor: FirestoreCursor,
  pageSize = 25,
): Promise<CursorPage<StokBarangJadi>> {
  return getCursorPage(
    query(collection(db, COL_JADI), orderBy('nama_model')),
    cursor,
    (d) => normalizeStokBarangJadiSnapshot(d.id, d.data()),
    pageSize,
  );
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
    const ukuran = canonicalUkuran(item.ukuran);
    const q = warna?.nama_warna
      ? query(collection(db, COL_JADI), where('model_id', '==', modelId), where('ukuran', 'in', ukuranAliases(ukuran)), where('nama_warna', '==', warna.nama_warna))
      : query(collection(db, COL_JADI), where('model_id', '==', modelId), where('ukuran', 'in', ukuranAliases(ukuran)));
    const snap = await getDocs(q);
    const ref = snap.empty
      ? doc(db, COL_JADI, buildBarangJadiDocId(modelId, ukuran, warna?.nama_warna))
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
          ukuran,
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
          ukuran,
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
  const normalizedItems: BarangKeluarItem[] =
    data.items && data.items.length > 0
      ? data.items.map((item) => ({
          ...item,
          detail_keluar: normalizeDetailKeluar(item.detail_keluar),
          total_pcs: item.jenis_produk === 'hijab'
            ? Math.max(0, Number(item.total_pcs) || 0)
            : normalizeDetailKeluar(item.detail_keluar).reduce((sum, i) => sum + i.jumlah_pcs, 0),
        }))
      : [
          {
            model_id: data.model_id,
            nama_model: data.nama_model,
            ...(data.nama_warna ? { nama_warna: data.nama_warna } : {}),
            ...(data.kode_hex_warna ? { kode_hex_warna: data.kode_hex_warna } : {}),
            detail_keluar: normalizeDetailKeluar(data.detail_keluar),
            total_pcs: data.detail_keluar.reduce((sum, i) => sum + i.jumlah_pcs, 0),
            status: 'keluar',
          },
        ];
  const items = await hydrateAutoHijabComponents(normalizedItems);
  const keluarItems = items.filter((item) => item.status !== 'pending');
  validateManagedHijabComponents(keluarItems);
  for (const item of keluarItems) {
    if (item.jenis_produk === 'hijab' && !item.stok_hijab_id) {
      throw new Error(`Stok hijab "${item.nama_hijab ?? item.nama_model}" tidak ditemukan`);
    }
  }
  const stokRefs = new Map<string, ReturnType<typeof doc>>();

  for (const item of keluarItems) {
    const stockModelId = stokModelId(item);
    for (const detail of item.detail_keluar) {
      const q = item.nama_warna
        ? query(collection(db, COL_JADI), where('model_id', '==', stockModelId), where('ukuran', 'in', ukuranAliases(detail.ukuran)), where('nama_warna', '==', item.nama_warna))
        : query(collection(db, COL_JADI), where('model_id', '==', stockModelId), where('ukuran', 'in', ukuranAliases(detail.ukuran)));
      const snap = await getDocs(q);
      if (snap.empty) throw new Error(`Stok ${item.nama_model} ukuran ${detail.ukuran} tidak ditemukan`);
      stokRefs.set(`${stockModelId}|${item.nama_warna ?? ''}|${detail.ukuran}`, snap.docs[0].ref);
    }
  }

  const hijabUsage = aggregateHijabUsage(keluarItems);
  const hijabRefs = new Map<string, ReturnType<typeof doc>>();
  for (const usage of hijabUsage) hijabRefs.set(usage.id, doc(db, COL_HIJAB, usage.id));

  const totalPcs = keluarItems.reduce((sum, item) => sum + item.total_pcs, 0);
  const totalPendingPcs = items
    .filter((item) => item.status === 'pending')
    .reduce((sum, item) => sum + item.total_pcs, 0);
  const status = totalPendingPcs > 0 ? 'pending' : 'selesai';
  const modelIds = [...new Set(items.map((item) => item.model_id))];
  const ref = doc(collection(db, COL_KELUAR));

  await runTransaction(db, async (transaction) => {
    const stokSnapshots = new Map<string, { ref: ReturnType<typeof doc>; data: StokBarangJadi; jumlahDipakai: number }>();
    const hijabSnapshots = new Map<string, { ref: ReturnType<typeof doc>; data: StokHijab }>();

    for (const item of keluarItems) {
      const stockModelId = stokModelId(item);
      for (const detail of item.detail_keluar) {
        const key = `${stockModelId}|${item.nama_warna ?? ''}|${detail.ukuran}`;
        const stokRef = stokRefs.get(key);
        if (!stokRef) {
          throw new Error(`Stok ${item.nama_model} ukuran ${detail.ukuran} tidak ditemukan`);
        }

        const existing = stokSnapshots.get(key);
        if (existing) {
          existing.jumlahDipakai += detail.jumlah_pcs;
          if (existing.data.stok_tersedia < existing.jumlahDipakai) {
            throw new Error(`Stok ${item.nama_model} ukuran ${detail.ukuran} tidak mencukupi`);
          }
          continue;
        }

        const existingSnap = await transaction.get(stokRef);
        if (!existingSnap.exists()) {
          throw new Error(`Stok ${item.nama_model} ukuran ${detail.ukuran} tidak ditemukan`);
        }

        const stok = existingSnap.data() as StokBarangJadi;
        if (stok.stok_tersedia < detail.jumlah_pcs) {
          throw new Error(`Stok ${item.nama_model} ukuran ${detail.ukuran} tidak mencukupi`);
        }

        stokSnapshots.set(key, { ref: stokRef, data: stok, jumlahDipakai: detail.jumlah_pcs });
      }
    }

    for (const usage of hijabUsage) {
      const hijabRef = hijabRefs.get(usage.id);
      if (!hijabRef) throw new Error(`Stok hijab ${usage.nama} tidak ditemukan`);
      const hijabSnap = await transaction.get(hijabRef);
      if (!hijabSnap.exists()) throw new Error(`Stok hijab "${usage.nama}" tidak ditemukan`);
      const hijab = { id: hijabSnap.id, ...hijabSnap.data() } as StokHijab;
      if (hijab.stok_tersedia < usage.jumlah) {
        throw new Error(`Stok hijab "${hijab.nama_hijab}" tidak mencukupi (tersedia: ${hijab.stok_tersedia} pcs, dibutuhkan: ${usage.jumlah} pcs)`);
      }
      hijabSnapshots.set(usage.id, { ref: hijabRef, data: hijab });
    }

    for (const item of keluarItems) {
      const stockModelId = stokModelId(item);
      for (const detail of item.detail_keluar) {
        const key = `${stockModelId}|${item.nama_warna ?? ''}|${detail.ukuran}`;
        const stokSnapshot = stokSnapshots.get(key);
        if (!stokSnapshot) {
          throw new Error(`Stok ${item.nama_model} ukuran ${detail.ukuran} tidak ditemukan`);
        }

        const { data: stok } = stokSnapshot;
        const { consumed, remaining } = consumeSumberProduksiLots(stok.sumber_produksi, detail.jumlah_pcs);
      // Simpan snapshot lot yang terkonsumsi ke detail_keluar item ini, supaya
      // laporan barang keluar bisa menampilkan siapa cutting/jahit/steam-nya.
        detail.sumber = consumed;
        stok.stok_tersedia -= detail.jumlah_pcs;
        stok.total_keluar += detail.jumlah_pcs;
        stok.sumber_produksi = remaining;
      }
    }

    for (const snapshot of stokSnapshots.values()) {
      transaction.update(snapshot.ref, {
        stok_tersedia: snapshot.data.stok_tersedia,
        total_keluar: snapshot.data.total_keluar,
        sumber_produksi: snapshot.data.sumber_produksi,
        updatedAt: serverTimestamp(),
      });
      }

    for (const usage of hijabUsage) {
      const snapshot = hijabSnapshots.get(usage.id);
      if (!snapshot) continue;
      const stokSesudah = snapshot.data.stok_tersedia - usage.jumlah;
      transaction.update(snapshot.ref, {
        stok_tersedia: stokSesudah,
        total_keluar: snapshot.data.total_keluar + usage.jumlah,
        updatedAt: serverTimestamp(),
      });
      addHijabHistory(transaction, usage.id, {
        tipe: 'barang_keluar',
        jumlah: usage.jumlah,
        stok_sebelum: snapshot.data.stok_tersedia,
        stok_sesudah: stokSesudah,
        catatan: `Keluar ${usage.sumber.join(', ')} · ${data.tujuan}`,
      });
    }

    transaction.set(ref, {
      ...data,
      detail_keluar: normalizeDetailKeluar(data.detail_keluar),
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
  if (!Number.isFinite(jumlah) || jumlah <= 0) {
    throw new Error('Jumlah pengurangan harus lebih dari 0');
  }
  const ref = doc(db, COL_JADI, stokId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Stok tidak ditemukan');

    const data = snap.data() as StokBarangJadi;
    const ukuran = canonicalUkuran(data.ukuran);
    if (data.stok_tersedia < jumlah) {
      throw new Error(`Stok hanya ${data.stok_tersedia} pcs, tidak bisa dikurangi ${jumlah} pcs`);
    }
    const stokSesudah = data.stok_tersedia - jumlah;
    const { remaining: remainingLots } = consumeSumberProduksiLots(
      data.sumber_produksi,
      jumlah,
    );

    transaction.update(ref, {
      stok_tersedia: stokSesudah,
      total_keluar: data.total_keluar + jumlah,
      sumber_produksi: remainingLots,
      updatedAt: serverTimestamp(),
    });

    if (riwayatMeta) {
      const riwayatRef = doc(collection(db, COL_RIWAYAT));
        transaction.set(riwayatRef, {
          model_id: data.model_id,
          nama_model: data.nama_model,
          ...(data.nama_warna ? { nama_warna: data.nama_warna } : {}),
          ...(data.kode_hex_warna ? { kode_hex_warna: data.kode_hex_warna } : {}),
          ukuran,
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
  if (!Number.isFinite(jumlahBaru) || jumlahBaru < 0) {
    throw new Error('Stok baru tidak boleh negatif');
  }
  const ref = doc(db, COL_JADI, stokId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Stok tidak ditemukan');

    const data = snap.data() as StokBarangJadi;
    const ukuran = canonicalUkuran(data.ukuran);
    const selisih = jumlahBaru - data.stok_tersedia;

    if (selisih === 0) return;

    const remainingLots =
      selisih < 0
        ? consumeSumberProduksiLots(data.sumber_produksi, Math.abs(selisih)).remaining
        : data.sumber_produksi;

    transaction.update(ref, {
      stok_tersedia: jumlahBaru,
      // total_masuk/keluar ikut selisih
      ...(selisih > 0 ? { total_masuk: data.total_masuk + selisih } : {}),
      ...(selisih < 0 ? { total_keluar: data.total_keluar + Math.abs(selisih) } : {}),
      ...(selisih < 0 ? { sumber_produksi: remainingLots } : {}),
      updatedAt: serverTimestamp(),
    });

    if (riwayatMeta) {
      const riwayatRef = doc(collection(db, COL_RIWAYAT));
        transaction.set(riwayatRef, {
          model_id: data.model_id,
          nama_model: data.nama_model,
          ...(data.nama_warna ? { nama_warna: data.nama_warna } : {}),
          ...(data.kode_hex_warna ? { kode_hex_warna: data.kode_hex_warna } : {}),
          ukuran,
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
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    ukuran: canonicalUkuran(String(d.data().ukuran ?? '')),
  }) as RiwayatBarangJadi);
}

export async function getRiwayatBarangJadiByModelPage(
  modelId: string,
  cursor: FirestoreCursor,
  pageSize = 25,
): Promise<CursorPage<RiwayatBarangJadi>> {
  return getCursorPage(
    query(
      collection(db, COL_RIWAYAT),
      where('model_id', '==', modelId),
      orderBy('timestamp', 'desc'),
    ),
    cursor,
    (d) => ({
      id: d.id,
      ...d.data(),
      ukuran: canonicalUkuran(String(d.data().ukuran ?? '')),
    }) as RiwayatBarangJadi,
    pageSize,
  );
}

// Ambil pergerakan stok satu model pada rentang tanggal untuk statistik detail.
// Query ini tetap memakai indeks model + timestamp yang sama dengan pagination.
export async function getRiwayatBarangJadiByModelPeriod(
  modelId: string,
  range: { start: Date; end: Date },
): Promise<RiwayatBarangJadi[]> {
  const q = query(
    collection(db, COL_RIWAYAT),
    where('model_id', '==', modelId),
    where('timestamp', '>=', Timestamp.fromDate(range.start)),
    where('timestamp', '<=', Timestamp.fromDate(range.end)),
    orderBy('timestamp', 'desc'),
    limit(500),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    ukuran: canonicalUkuran(String(d.data().ukuran ?? '')),
  }) as RiwayatBarangJadi);
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
    map.set(d.id, normalizeBarangKeluarSnapshot(d.id, d.data()));
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
  return snap.docs.map((d) => normalizeBarangKeluarSnapshot(d.id, d.data()));
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
  return snap.docs.map((d) => normalizeBarangKeluarSnapshot(d.id, d.data()));
}

export async function getRiwayatKeluarByModelPage(
  modelId: string,
  cursor: FirestoreCursor,
  pageSize = 25,
): Promise<CursorPage<BarangKeluar>> {
  const canonical = await getCursorPage(
    query(collection(db, COL_KELUAR), where('model_ids', 'array-contains', modelId)),
    cursor,
    (d) => normalizeBarangKeluarSnapshot(d.id, d.data()),
    pageSize,
  );
  // Data lama menyimpan satu model pada model_id, sedangkan data baru memakai model_ids.
  // Fallback hanya dilakukan di halaman pertama agar tetap satu query halaman.
  if (cursor || canonical.items.length > 0) return canonical;
  return getCursorPage(
    query(collection(db, COL_KELUAR), where('model_id', '==', modelId)),
    null,
    (d) => normalizeBarangKeluarSnapshot(d.id, d.data()),
    pageSize,
  );
}

export async function getRiwayatBarangKeluarPage(
  range: { start: Date; end: Date } | null,
  cursor: FirestoreCursor,
  pageSize = 25,
): Promise<CursorPage<BarangKeluar>> {
  const baseQuery = range
    ? query(
        collection(db, COL_KELUAR),
        where('tanggal_keluar', '>=', Timestamp.fromDate(range.start)),
        where('tanggal_keluar', '<=', Timestamp.fromDate(range.end)),
        orderBy('tanggal_keluar', 'desc'),
      )
    : query(collection(db, COL_KELUAR), orderBy('tanggal_keluar', 'desc'));

  return getCursorPage(
    baseQuery,
    cursor,
    (d) => normalizeBarangKeluarSnapshot(d.id, d.data()),
    pageSize,
  );
}

// ─── BATALKAN BARANG KELUAR ──────────────────────────────────────

async function findHijabStockRef(item: BarangKeluarItem): Promise<ReturnType<typeof doc> | null> {
  if (item.stok_hijab_id) return doc(db, COL_HIJAB, item.stok_hijab_id);

  const snap = item.model_hijab_id
    ? await getDocs(query(collection(db, COL_HIJAB), where('model_hijab_id', '==', item.model_hijab_id)))
    : await getDocs(query(collection(db, COL_HIJAB), where('nama_hijab', '==', item.nama_hijab ?? item.nama_model), limit(20)));
  const candidates = item.nama_warna
    ? snap.docs.filter((entry) => String(entry.data().nama_warna ?? '').trim().toLowerCase() === item.nama_warna!.trim().toLowerCase())
    : snap.docs;
  return candidates[0]?.ref ?? null;
}

async function prosesPendingHijabBarangKeluar(
  keluarRef: ReturnType<typeof doc>,
  itemIndex: number,
  target: BarangKeluarItem,
  riwayatMeta?: { uid: string; nama: string },
): Promise<{ processedPcs: number; remainingPendingPcs: number }> {
  const stokRef = await findHijabStockRef(target);
  if (!stokRef) throw new Error(`Stok hijab "${target.nama_hijab ?? target.nama_model}" tidak ditemukan`);

  return runTransaction(db, async (transaction) => {
    const keluarSnap = await transaction.get(keluarRef);
    if (!keluarSnap.exists()) throw new Error('Catatan barang keluar tidak ditemukan');
    const current = normalizeBarangKeluarSnapshot(keluarSnap.id, keluarSnap.data());
    const items: BarangKeluarItem[] = current.items && current.items.length > 0
      ? current.items
      : [{
          model_id: current.model_id,
          nama_model: current.nama_model,
          ...(current.nama_warna ? { nama_warna: current.nama_warna } : {}),
          detail_keluar: current.detail_keluar,
          total_pcs: current.total_pcs,
          status: 'keluar',
        }];
    const pendingItem = items[itemIndex];
    if (!pendingItem || pendingItem.status !== 'pending' || pendingItem.jenis_produk !== 'hijab') {
      throw new Error('Item pending hijab tidak ditemukan atau sudah diproses');
    }

    const stokSnap = await transaction.get(stokRef);
    if (!stokSnap.exists()) throw new Error(`Stok hijab "${pendingItem.nama_hijab ?? pendingItem.nama_model}" tidak ditemukan`);
    const stok = { id: stokSnap.id, ...stokSnap.data() } as StokHijab;
    const processedPcs = Math.min(Math.max(0, stok.stok_tersedia), Math.max(0, pendingItem.total_pcs));
    if (processedPcs <= 0) throw new Error('Stok hijab untuk item pending ini belum tersedia');

    const stokSesudah = stok.stok_tersedia - processedPcs;
    transaction.update(stokRef, {
      stok_tersedia: stokSesudah,
      total_keluar: stok.total_keluar + processedPcs,
      updatedAt: serverTimestamp(),
    });
    addHijabHistory(transaction, stok.id, {
      tipe: 'barang_keluar',
      jumlah: processedPcs,
      stok_sebelum: stok.stok_tersedia,
      stok_sesudah: stokSesudah,
      nama_model: pendingItem.nama_model,
      ...(pendingItem.nama_warna ? { nama_warna: pendingItem.nama_warna } : {}),
      catatan: `Pemenuhan pending barang keluar ke ${current.tujuan}`,
      ...(riwayatMeta ? {
        dicatat_oleh_uid: riwayatMeta.uid,
        dicatat_oleh_nama: riwayatMeta.nama,
      } : {}),
    });

    const remainingPcs = Math.max(0, pendingItem.total_pcs - processedPcs);
    const replacementItems: BarangKeluarItem[] = [{
      ...pendingItem,
      stok_hijab_id: stok.id,
      detail_keluar: [],
      total_pcs: processedPcs,
      status: 'keluar',
    }];
    if (remainingPcs > 0) {
      replacementItems.push({
        ...pendingItem,
        stok_hijab_id: stok.id,
        detail_keluar: [],
        total_pcs: remainingPcs,
        status: 'pending',
        alasan_pending: pendingItem.alasan_pending ?? 'Stok belum tersedia',
      });
    }
    const nextItems = [...items.slice(0, itemIndex), ...replacementItems, ...items.slice(itemIndex + 1)];
    const nextPendingPcs = nextItems.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.total_pcs, 0);
    const nextTotalPcs = nextItems.filter((item) => item.status !== 'pending').reduce((sum, item) => sum + item.total_pcs, 0);
    transaction.update(keluarRef, {
      items: nextItems,
      detail_keluar: nextItems.filter((item) => item.status !== 'pending').flatMap((item) => item.detail_keluar),
      total_pcs: nextTotalPcs,
      total_pending_pcs: nextPendingPcs,
      status: nextPendingPcs > 0 ? 'pending' : 'selesai',
    });
    return { processedPcs, remainingPendingPcs: nextPendingPcs };
  });
}

export async function prosesPendingBarangKeluar(
  id: string,
  itemIndex: number,
  riwayatMeta?: { uid: string; nama: string },
): Promise<{ processedPcs: number; remainingPendingPcs: number }> {
  const keluarRef = doc(db, COL_KELUAR, id);
  const keluarSnap = await getDoc(keluarRef);
  if (!keluarSnap.exists()) throw new Error('Catatan barang keluar tidak ditemukan');

  const keluar = normalizeBarangKeluarSnapshot(keluarSnap.id, keluarSnap.data());
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
  const hydratedItems = await hydrateAutoHijabComponents(initialItems);
  const target = hydratedItems[itemIndex];
  if (!target || target.status !== 'pending') {
    throw new Error('Item pending tidak ditemukan atau sudah diproses');
  }
  validateManagedHijabComponents([target]);
  if (target.jenis_produk === 'hijab') {
    return prosesPendingHijabBarangKeluar(keluarRef, itemIndex, target, riwayatMeta);
  }

  const stokRefs = new Map<string, ReturnType<typeof doc>>();
  const pendingStockModelId = stokModelId(target);
  for (const detail of target.detail_keluar) {
    const q = target.nama_warna
      ? query(collection(db, COL_JADI), where('model_id', '==', pendingStockModelId), where('ukuran', 'in', ukuranAliases(detail.ukuran)), where('nama_warna', '==', target.nama_warna))
      : query(collection(db, COL_JADI), where('model_id', '==', pendingStockModelId), where('ukuran', 'in', ukuranAliases(detail.ukuran)));
    const snap = await getDocs(q);
    if (!snap.empty) {
      stokRefs.set(`${pendingStockModelId}|${target.nama_warna ?? ''}|${detail.ukuran}`, snap.docs[0].ref);
    }
  }
  const hijabComponents = managedHijabComponents(target);
  const hijabRefs = new Map<string, ReturnType<typeof doc>>();
  for (const component of hijabComponents) {
    const stockId = hijabStockId(component, target);
    if (stockId) hijabRefs.set(stockId, doc(db, COL_HIJAB, stockId));
  }

  return runTransaction(db, async (transaction) => {
    const currentSnap = await transaction.get(keluarRef);
    if (!currentSnap.exists()) throw new Error('Catatan barang keluar tidak ditemukan');

    const current = normalizeBarangKeluarSnapshot(currentSnap.id, currentSnap.data());
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
    const storedPendingItem = items[itemIndex];
    if (!storedPendingItem || storedPendingItem.status !== 'pending') {
      throw new Error('Item pending tidak ditemukan atau sudah diproses');
    }
    const pendingItem: BarangKeluarItem = {
      ...storedPendingItem,
      ...(target.komponen_varian ? { komponen_varian: target.komponen_varian } : {}),
    };

    const stokSnapshots = new Map<string, { ref: ReturnType<typeof doc>; data: StokBarangJadi }>();
    const currentStockModelId = stokModelId(pendingItem);
    for (const detail of pendingItem.detail_keluar) {
      const key = `${currentStockModelId}|${pendingItem.nama_warna ?? ''}|${detail.ukuran}`;
      const stokRef = stokRefs.get(key);
      if (!stokRef) continue;
      const stokSnap = await transaction.get(stokRef);
      if (stokSnap.exists()) {
        stokSnapshots.set(key, { ref: stokRef, data: { id: stokSnap.id, ...stokSnap.data() } as StokBarangJadi });
      }
    }
    const hijabSnapshots = new Map<string, { ref: ReturnType<typeof doc>; data: StokHijab }>();
    for (const [id, ref] of hijabRefs) {
      const snap = await transaction.get(ref);
      if (snap.exists()) {
        hijabSnapshots.set(id, { ref, data: { id: snap.id, ...snap.data() } as StokHijab });
      }
    }

    const workingStok = new Map(
      [...stokSnapshots.entries()].map(([key, value]) => [key, { ...value, data: { ...value.data } }]),
    );
    const workingHijab = new Map(
      [...hijabSnapshots.entries()].map(([id, value]) => [id, { ...value, data: { ...value.data } }]),
    );
    const hijabUsed = new Map<string, number>();

    const fulfilledDetails: BarangKeluarItem['detail_keluar'] = [];
    const remainingDetails: BarangKeluarItem['detail_keluar'] = [];

    for (const detail of pendingItem.detail_keluar) {
      const key = `${currentStockModelId}|${pendingItem.nama_warna ?? ''}|${detail.ukuran}`;
      const stokSnapshot = workingStok.get(key);
      const tersedia = stokSnapshot?.data.stok_tersedia ?? 0;
      let fulfilled = Math.min(detail.jumlah_pcs, tersedia);
      for (const component of hijabComponents) {
        const stockId = hijabStockId(component, pendingItem);
        if (!stockId) continue;
        const hijabSnapshot = workingHijab.get(stockId);
        const kapasitas = hijabSnapshot
          ? Math.floor(hijabSnapshot.data.stok_tersedia / component.jumlah)
          : 0;
        fulfilled = Math.min(fulfilled, kapasitas);
      }
      const remaining = detail.jumlah_pcs - fulfilled;

      if (fulfilled > 0 && stokSnapshot) {
        const { consumed, remaining: remainingLots } = consumeSumberProduksiLots(stokSnapshot.data.sumber_produksi, fulfilled);
        fulfilledDetails.push({ ...detail, jumlah_pcs: fulfilled, sumber: consumed });
        workingStok.set(key, {
          ...stokSnapshot,
          data: {
            ...stokSnapshot.data,
            stok_tersedia: stokSnapshot.data.stok_tersedia - fulfilled,
            total_keluar: stokSnapshot.data.total_keluar + fulfilled,
            sumber_produksi: remainingLots,
          },
        });

        for (const component of hijabComponents) {
          const stockId = hijabStockId(component, pendingItem);
          if (!stockId) continue;
          const hijabSnapshot = workingHijab.get(stockId);
          if (!hijabSnapshot) continue;
          const jumlah = fulfilled * component.jumlah;
          workingHijab.set(stockId, {
            ...hijabSnapshot,
            data: {
              ...hijabSnapshot.data,
              stok_tersedia: hijabSnapshot.data.stok_tersedia - jumlah,
              total_keluar: hijabSnapshot.data.total_keluar + jumlah,
            },
          });
          hijabUsed.set(stockId, (hijabUsed.get(stockId) ?? 0) + jumlah);
        }

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

    for (const snapshot of workingStok.values()) {
      transaction.update(snapshot.ref, {
        stok_tersedia: snapshot.data.stok_tersedia,
        total_keluar: snapshot.data.total_keluar,
        sumber_produksi: snapshot.data.sumber_produksi,
        updatedAt: serverTimestamp(),
      });
    }
    for (const [id, snapshot] of workingHijab) {
      const jumlah = hijabUsed.get(id) ?? 0;
      if (jumlah <= 0) continue;
      transaction.update(snapshot.ref, {
        stok_tersedia: snapshot.data.stok_tersedia,
        total_keluar: snapshot.data.total_keluar,
        updatedAt: serverTimestamp(),
      });
      addHijabHistory(transaction, id, {
        tipe: 'barang_keluar',
        jumlah,
        stok_sebelum: snapshot.data.stok_tersedia + jumlah,
        stok_sesudah: snapshot.data.stok_tersedia,
        catatan: `Pemenuhan pending ke ${current.tujuan}`,
      });
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

  const keluar = normalizeBarangKeluarSnapshot(keluarSnap.id, keluarSnap.data());
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
  const hydratedItems = await hydrateAutoHijabComponents(items);
  const keluarItems = hydratedItems.filter((item) => item.status !== 'pending');
  validateManagedHijabComponents(keluarItems);

  // Ambil semua stok refs sebelum transaksi (reads di luar transaction)
  const stokRefs = new Map<string, ReturnType<typeof doc>>();
  for (const item of keluarItems) {
    const stockModelId = stokModelId(item);
    for (const detail of item.detail_keluar) {
      const q = item.nama_warna
        ? query(collection(db, COL_JADI), where('model_id', '==', stockModelId), where('ukuran', 'in', ukuranAliases(detail.ukuran)), where('nama_warna', '==', item.nama_warna))
        : query(collection(db, COL_JADI), where('model_id', '==', stockModelId), where('ukuran', 'in', ukuranAliases(detail.ukuran)));
      const snap = await getDocs(q);
      if (!snap.empty) stokRefs.set(`${stockModelId}|${item.nama_warna ?? ''}|${detail.ukuran}`, snap.docs[0].ref);
    }
  }
  const hijabUsage = aggregateHijabUsage(keluarItems);
  const hijabRefs = new Map<string, ReturnType<typeof doc>>();
  for (const usage of hijabUsage) hijabRefs.set(usage.id, doc(db, COL_HIJAB, usage.id));

  await runTransaction(db, async (transaction) => {
    // Baca semua stok dulu, baru tulis
    const stokSnapshots = new Map<string, { ref: ReturnType<typeof doc>; data: StokBarangJadi }>();
    for (const [key, ref] of stokRefs) {
      const snap = await transaction.get(ref);
      if (snap.exists()) stokSnapshots.set(key, { ref, data: { id: snap.id, ...snap.data() } as StokBarangJadi });
    }
    const hijabSnapshots = new Map<string, { ref: ReturnType<typeof doc>; data: StokHijab }>();
    for (const [key, ref] of hijabRefs) {
      const snap = await transaction.get(ref);
      if (snap.exists()) hijabSnapshots.set(key, { ref, data: { id: snap.id, ...snap.data() } as StokHijab });
    }

    for (const item of keluarItems) {
      const stockModelId = stokModelId(item);
      for (const detail of item.detail_keluar) {
        const entry = stokSnapshots.get(`${stockModelId}|${item.nama_warna ?? ''}|${detail.ukuran}`);
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

    for (const usage of hijabUsage) {
      const snapshot = hijabSnapshots.get(usage.id);
      if (!snapshot) continue;
      const stokSesudah = snapshot.data.stok_tersedia + usage.jumlah;
      transaction.update(snapshot.ref, {
        stok_tersedia: stokSesudah,
        total_keluar: Math.max(0, snapshot.data.total_keluar - usage.jumlah),
        updatedAt: serverTimestamp(),
      });
      addHijabHistory(transaction, usage.id, {
        tipe: 'batal_keluar',
        jumlah: usage.jumlah,
        stok_sebelum: snapshot.data.stok_tersedia,
        stok_sesudah: stokSesudah,
        catatan: riwayatMeta?.catatan ?? `Pembatalan pengiriman ke ${keluar.tujuan}`,
      });
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

  const keluar = normalizeBarangKeluarSnapshot(keluarSnap.id, keluarSnap.data());
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

  const hydratedInitialItems = await hydrateAutoHijabComponents(initialItems);
  const target = hydratedInitialItems[itemIndex];
  if (!target) throw new Error('Item barang keluar tidak ditemukan');
  if (target.status !== 'pending') validateManagedHijabComponents([target]);

  const stokRefs = new Map<string, ReturnType<typeof doc>>();
  if (target.status !== 'pending') {
    const stockModelId = stokModelId(target);
    for (const detail of target.detail_keluar) {
      const q = target.nama_warna
        ? query(collection(db, COL_JADI), where('model_id', '==', stockModelId), where('ukuran', 'in', ukuranAliases(detail.ukuran)), where('nama_warna', '==', target.nama_warna))
        : query(collection(db, COL_JADI), where('model_id', '==', stockModelId), where('ukuran', 'in', ukuranAliases(detail.ukuran)));
      const snap = await getDocs(q);
      if (!snap.empty) stokRefs.set(`${stockModelId}|${target.nama_warna ?? ''}|${detail.ukuran}`, snap.docs[0].ref);
    }
  }
  const hijabUsage = target.status === 'pending' ? [] : aggregateHijabUsage([target]);
  const hijabRefs = new Map<string, ReturnType<typeof doc>>();
  for (const usage of hijabUsage) hijabRefs.set(usage.id, doc(db, COL_HIJAB, usage.id));

  return runTransaction(db, async (transaction) => {
    const freshKeluarSnap = await transaction.get(keluarRef);
    if (!freshKeluarSnap.exists()) throw new Error('Catatan barang keluar tidak ditemukan');
    const freshKeluar = normalizeBarangKeluarSnapshot(freshKeluarSnap.id, freshKeluarSnap.data());
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
    const hijabSnapshots = new Map<string, { ref: ReturnType<typeof doc>; data: StokHijab }>();
    for (const [key, ref] of hijabRefs) {
      const snap = await transaction.get(ref);
      if (snap.exists()) hijabSnapshots.set(key, { ref, data: { id: snap.id, ...snap.data() } as StokHijab });
    }

    if (currentTarget.status !== 'pending') {
      const stockModelId = stokModelId(currentTarget);
      for (const detail of currentTarget.detail_keluar) {
        const entry = stokSnapshots.get(`${stockModelId}|${currentTarget.nama_warna ?? ''}|${detail.ukuran}`);
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

    for (const usage of hijabUsage) {
      const snapshot = hijabSnapshots.get(usage.id);
      if (!snapshot) continue;
      const stokSesudah = snapshot.data.stok_tersedia + usage.jumlah;
      transaction.update(snapshot.ref, {
        stok_tersedia: stokSesudah,
        total_keluar: Math.max(0, snapshot.data.total_keluar - usage.jumlah),
        updatedAt: serverTimestamp(),
      });
      addHijabHistory(transaction, usage.id, {
        tipe: 'batal_keluar',
        jumlah: usage.jumlah,
        stok_sebelum: snapshot.data.stok_tersedia,
        stok_sesudah: stokSesudah,
        catatan: riwayatMeta?.catatan ?? `Pembatalan item pengiriman ke ${freshKeluar.tujuan}`,
      });
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
    .map((item) => ({ ukuran: canonicalUkuran(item.ukuran), jumlah_pcs: Math.floor(Number(item.jumlah_pcs) || 0) }))
    .filter((item) => item.jumlah_pcs > 0);
  if (normalized.length === 0) throw new Error('Jumlah retur belum diisi');

  const keluarRef = doc(db, COL_KELUAR, id);
  const keluarSnap = await getDoc(keluarRef);
  if (!keluarSnap.exists()) throw new Error('Catatan barang keluar tidak ditemukan');

  const keluar = normalizeBarangKeluarSnapshot(keluarSnap.id, keluarSnap.data());
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

  const hydratedItems = await hydrateAutoHijabComponents(initialItems);
  const target = hydratedItems[itemIndex];
  if (!target) throw new Error('Item barang keluar tidak ditemukan');
  if (target.status === 'pending') throw new Error('Item pending tidak bisa diretur. Batalkan pending dari detail order.');
  validateManagedHijabComponents([target]);
  const returnStockModelId = stokModelId(target);

  const stokRefs = new Map<string, ReturnType<typeof doc>>();
  for (const detail of normalized) {
    const q = target.nama_warna
      ? query(collection(db, COL_JADI), where('model_id', '==', returnStockModelId), where('ukuran', 'in', ukuranAliases(detail.ukuran)), where('nama_warna', '==', target.nama_warna))
      : query(collection(db, COL_JADI), where('model_id', '==', returnStockModelId), where('ukuran', 'in', ukuranAliases(detail.ukuran)));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error(`Stok ${target.nama_model} ukuran ${detail.ukuran} tidak ditemukan`);
    stokRefs.set(`${returnStockModelId}|${target.nama_warna ?? ''}|${detail.ukuran}`, snap.docs[0].ref);
  }
  const totalReturPcs = normalized.reduce((sum, item) => sum + item.jumlah_pcs, 0);
  const hijabUsage = aggregateHijabUsage([{ ...target, total_pcs: totalReturPcs }]);
  const hijabRefs = new Map<string, ReturnType<typeof doc>>();
  for (const usage of hijabUsage) hijabRefs.set(usage.id, doc(db, COL_HIJAB, usage.id));

  return runTransaction(db, async (transaction) => {
    const freshKeluarSnap = await transaction.get(keluarRef);
    if (!freshKeluarSnap.exists()) throw new Error('Catatan barang keluar tidak ditemukan');
    const freshKeluar = normalizeBarangKeluarSnapshot(freshKeluarSnap.id, freshKeluarSnap.data());
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
    const hijabSnapshots = new Map<string, { ref: ReturnType<typeof doc>; data: StokHijab }>();
    for (const [key, ref] of hijabRefs) {
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error('Stok hijab tidak ditemukan');
      hijabSnapshots.set(key, { ref, data: { id: snap.id, ...snap.data() } as StokHijab });
    }

    const nextDetail = currentTarget.detail_keluar
      .map((detail) => {
        const returQty = returByUkuran.get(detail.ukuran) ?? 0;
        if (returQty <= 0) return detail;
        if (returQty > detail.jumlah_pcs) {
          throw new Error(`Retur ${detail.ukuran} melebihi jumlah keluar`);
        }

        const stokKey = `${stokModelId(currentTarget)}|${currentTarget.nama_warna ?? ''}|${detail.ukuran}`;
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

    for (const usage of hijabUsage) {
      const snapshot = hijabSnapshots.get(usage.id);
      if (!snapshot) throw new Error(`Stok hijab ${usage.nama} tidak ditemukan`);
      const stokSesudah = snapshot.data.stok_tersedia + usage.jumlah;
      transaction.update(snapshot.ref, {
        stok_tersedia: stokSesudah,
        total_keluar: Math.max(0, snapshot.data.total_keluar - usage.jumlah),
        updatedAt: serverTimestamp(),
      });
      addHijabHistory(transaction, usage.id, {
        tipe: 'batal_keluar',
        jumlah: usage.jumlah,
        stok_sebelum: snapshot.data.stok_tersedia,
        stok_sesudah: stokSesudah,
        catatan: riwayatMeta?.catatan ?? `Retur penjualan ${freshKeluar.tujuan}`,
      });
    }

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
