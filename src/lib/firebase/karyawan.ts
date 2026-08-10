// src/lib/firebase/karyawan.ts
import {
  collection, doc, getDocs, updateDoc,
  deleteDoc, setDoc, serverTimestamp, query, orderBy,
  Timestamp, deleteField,
} from 'firebase/firestore';
import { PUBLIC_FIREBASE_API_KEY } from '$env/static/public';
import { db } from './config';
import type { UserProfile, UserRole } from '$lib/types';

const COL = 'users';

// Label readable per role (untuk ditampilkan di tabel)
export const ROLE_LABEL: Record<UserRole, string> = {
  admin_gudang: 'Admin Gudang',
  admin_hr: 'Admin HR',
  admin_keuangan: 'Admin Keuangan',
  kepala_cutting: 'Kepala Cutting',
  kepala_jahit: 'Kepala Jahit',
  kepala_steam: 'Kepala Steam',
  developer: 'Developer',
  owner: 'Owner',
};

// Role yang bisa dipilih saat buat akun karyawan
export const ROLE_KARYAWAN: UserRole[] = [
  'kepala_cutting',
  'kepala_jahit',
  'kepala_steam',
  'admin_gudang',
  'admin_hr',
  'admin_keuangan',
  'owner',
];

// Role yang bisa memiliki tarif per pcs (dipakai untuk hitung Penggajian)
export const ROLE_DIVISI_PRODUKSI: UserRole[] = ['kepala_cutting', 'kepala_jahit', 'kepala_steam'];

export interface CreateAkunInput {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  tipe_akun: 'permanent' | 'temporary';
  tanggal_expired?: Date | null;
  tipe_penggajian?: 'harian' | 'mingguan' | 'bulanan';
}

// Buat akun Firebase Auth + profil Firestore
// Pakai REST API agar tidak logout user saat ini
export async function createAkunKaryawan(data: CreateAkunInput): Promise<string> {
  // 1. Buat Firebase Auth account via REST API
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${PUBLIC_FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        displayName: data.name,
        returnSecureToken: false,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    const msg = err?.error?.message ?? 'Gagal membuat akun';
    if (msg === 'EMAIL_EXISTS') throw new Error('Email sudah digunakan oleh akun lain.');
    if (msg === 'WEAK_PASSWORD : Password should be at least 6 characters')
      throw new Error('Password minimal 6 karakter.');
    throw new Error(`Gagal membuat akun: ${msg}`);
  }

  const { localId: uid } = await res.json();

  // 2. Simpan profil ke Firestore users/{uid}
  const profileData: Record<string, unknown> = {
    uid,
    name: data.name,
    email: data.email,
    role: data.role,
    tipe_akun: data.tipe_akun,
    createdAt: serverTimestamp(),
  };

  if (data.tipe_akun === 'temporary' && data.tanggal_expired) {
    profileData.tanggal_expired = Timestamp.fromDate(data.tanggal_expired);
  }

  if (data.tipe_penggajian) {
    profileData.tipe_penggajian = data.tipe_penggajian;
  }

  await setDoc(doc(db, COL, uid), profileData);

  return uid;
}

// Ambil semua karyawan (exclude developer agar tidak tampil di list)
export async function getKaryawanList(): Promise<UserProfile[]> {
  const q = query(collection(db, COL), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() } as UserProfile))
    .filter((u) => u.role !== 'developer');
}

export interface UpdateKaryawanInput {
  name?: string;
  role?: UserRole;
  tipe_akun?: 'permanent' | 'temporary';
  tanggal_expired?: Date | null;
  tipe_penggajian?: 'harian' | 'mingguan' | 'bulanan';
}

export async function updateKaryawan(uid: string, data: UpdateKaryawanInput): Promise<void> {
  const updateData: Record<string, unknown> = {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.role !== undefined ? { role: data.role } : {}),
    ...(data.tipe_akun !== undefined ? { tipe_akun: data.tipe_akun } : {}),
    ...(data.tipe_penggajian !== undefined ? { tipe_penggajian: data.tipe_penggajian } : {}),
    updatedAt: serverTimestamp(),
  };

  // Tangani tanggal_expired: set atau hapus
  if (data.tipe_akun === 'temporary' && data.tanggal_expired) {
    updateData.tanggal_expired = Timestamp.fromDate(data.tanggal_expired);
  } else if (data.tipe_akun === 'permanent') {
    // Hapus field expired jika diganti ke permanent
    updateData.tanggal_expired = deleteField();
  }

  await updateDoc(doc(db, COL, uid), updateData);
}

// Hapus akun: delete Firestore doc + disable Firebase Auth via REST
export async function hapusAkunKaryawan(uid: string): Promise<void> {
  // 1. Hapus profil Firestore dulu
  await deleteDoc(doc(db, COL, uid));

  // Note: Firebase REST API untuk delete user butuh ID token user itu sendiri,
  // bukan admin token. Dari client-side murni tidak bisa delete Auth account orang lain.
  // Solusi: cukup hapus Firestore doc — user tidak bisa login karena profil tidak ada
  // (auth.ts login() akan throw "Profil user tidak ditemukan").
}
