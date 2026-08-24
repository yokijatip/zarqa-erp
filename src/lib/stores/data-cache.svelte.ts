/**
 * data-cache.svelte.ts
 *
 * Cache in-memory per koleksi Firebase.
 * Selama sesi browser (tidak di-refresh), data tidak di-fetch ulang
 * ke Firestore selama masih dalam rentang `staleSec`.
 *
 * Cara pakai:
 *   import { batchCache } from '$lib/stores/data-cache.svelte';
 *   const data = await batchCache.get();       // cache-first
 *   const data = await batchCache.get(true);   // force refetch
 */

import { getBatchList } from '$lib/firebase/batch-produksi';
import { getStokKainList } from '$lib/firebase/stok-kain';
import { getStokBarangJadi, getRiwayatBarangKeluar } from '$lib/firebase/barang-jadi';
import { getModelBajuList } from '$lib/firebase/model-baju';
import { getWarnaList } from '$lib/firebase/warna';
import { getMasterKainList } from '$lib/firebase/master-kain';
import { getKaryawanList } from '$lib/firebase/karyawan';
import { getStokPotonganList } from '$lib/firebase/stok-potongan';
import type { BatchProduksi, StokKain, StokBarangJadi, BarangKeluar, ModelBaju, Warna, MasterKain, UserProfile, StokPotongan } from '$lib/types';

// ── Generic cache factory ─────────────────────────────────────────────────────

function createCache<T>(fetcher: () => Promise<T>, staleSec: number) {
  // Module-level $state — persists selama sesi browser (tidak reset saat navigasi)
  let _data = $state<T | null>(null);
  let _fetchedAt = $state<number | null>(null);
  let _loading = $state(false);
  let _error = $state<string | null>(null);

  function isFresh(): boolean {
    if (_fetchedAt === null || _data === null) return false;
    return Date.now() - _fetchedAt < staleSec * 1000;
  }

  async function get(force = false): Promise<T> {
    // Cache hit — kembalikan data langsung tanpa Firebase call
    if (!force && isFresh()) return _data as T;

    _loading = true;
    _error = null;
    try {
      _data = await fetcher();
      _fetchedAt = Date.now();
      return _data;
    } catch (e) {
      _error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      _loading = false;
    }
  }

  /** Tandai data sebagai stale — fetch berikutnya akan ke Firestore */
  function invalidate(): void {
    _fetchedAt = null;
  }

  /** Update data di cache tanpa fetch ulang (misal setelah mutasi) */
  function set(newData: T): void {
    _data = newData;
    _fetchedAt = Date.now();
  }

  return {
    get data() { return _data; },
    get loading() { return _loading; },
    get error() { return _error; },
    get fetchedAt() { return _fetchedAt; },
    isFresh,
    get,
    invalidate,
    set,
  };
}

// ── Cache instances per koleksi ───────────────────────────────────────────────

/** Semua batch produksi — stale setelah 2 menit (sering berubah) */
export const batchCache = createCache<BatchProduksi[]>(getBatchList, 120);

/** Stok kain — stale setelah 5 menit */
export const stokKainCache = createCache<StokKain[]>(getStokKainList, 300);

/** Stok barang jadi — stale setelah 5 menit */
export const barangJadiCache = createCache<StokBarangJadi[]>(getStokBarangJadi, 300);

/** Riwayat barang keluar — stale setelah 5 menit */
export const barangKeluarCache = createCache<BarangKeluar[]>(getRiwayatBarangKeluar, 300);

/** Semua model baju (aktif + nonaktif) — stale setelah 5 menit */
export const modelBajuCache = createCache<ModelBaju[]>(() => getModelBajuList(false), 300);

/** Master warna — stale setelah 10 menit (jarang berubah) */
export const warnaCache = createCache<Warna[]>(getWarnaList, 600);

/** Master jenis kain */
export const masterKainCache = createCache<MasterKain[]>(getMasterKainList, 600);

/** Daftar karyawan — stale setelah 10 menit (jarang berubah) */
export const karyawanCache = createCache<UserProfile[]>(getKaryawanList, 600);

/** Stok potongan kain — stale setelah 5 menit */
export const stokPotonganCache = createCache<StokPotongan[]>(getStokPotonganList, 300);

// ── Helper: invalidate semua sekaligus (misal setelah mutasi besar) ──────────

export function invalidateAllCaches(): void {
  batchCache.invalidate();
  stokKainCache.invalidate();
  barangJadiCache.invalidate();
  barangKeluarCache.invalidate();
  modelBajuCache.invalidate();
  warnaCache.invalidate();
  masterKainCache.invalidate();
  karyawanCache.invalidate();
  stokPotonganCache.invalidate();
}
