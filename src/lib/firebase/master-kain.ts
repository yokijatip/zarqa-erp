import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from './config';
import { getCursorPage, type FirestoreCursor, type CursorPage } from './pagination';
import type { MasterKain, MasterKainInput } from '$lib/types';

const COL = 'master_kain';

function normalizeNamaKain(nama: string): string {
  return nama.trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function getMasterKainList(): Promise<MasterKain[]> {
  const q = query(collection(db, COL), orderBy('nama_kain', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MasterKain));
}

export async function getMasterKainPage(
  cursor: FirestoreCursor,
  pageSize = 25,
): Promise<CursorPage<MasterKain>> {
  return getCursorPage(
    query(collection(db, COL), orderBy('nama_kain', 'asc')),
    cursor,
    (d) => ({ id: d.id, ...d.data() }) as MasterKain,
    pageSize,
  );
}

export async function addMasterKain(data: MasterKainInput): Promise<string> {
  const namaKain = data.nama_kain.trim().replace(/\s+/g, ' ');
  const namaLower = normalizeNamaKain(namaKain);
  const existing = await getDocs(
    query(collection(db, COL), where('nama_lower', '==', namaLower), limit(1)),
  );

  if (!existing.empty) {
    throw new Error(`Jenis kain "${namaKain}" sudah ada di master.`);
  }

  const ref = await addDoc(collection(db, COL), {
    nama_kain: namaKain,
    nama_lower: namaLower,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}
