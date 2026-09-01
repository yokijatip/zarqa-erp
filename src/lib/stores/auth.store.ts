// src/lib/stores/auth.store.ts
import { writable, derived } from 'svelte/store';
import { onAuthChange, getUserProfile } from '$lib/firebase/auth';
import type { UserProfile, UserRole } from '$lib/types';

// Store utama user
export const currentUser = writable<UserProfile | null>(null);
export const authLoading = writable<boolean>(true);

function isSuperUser(role?: UserRole | null): boolean {
  return role === 'owner' || role === 'developer';
}

// Derived: apakah sudah login
export const isLoggedIn = derived(currentUser, ($user) => $user !== null);

// Derived: role user saat ini
export const userRole = derived(currentUser, ($user): UserRole | null => $user?.role ?? null);

// Derived: apakah user adalah admin web
export const isAdmin = derived(
  currentUser,
  ($user) =>
    $user?.role === 'admin_gudang' ||
    $user?.role === 'admin_hr' ||
    $user?.role === 'admin_keuangan' ||
    isSuperUser($user?.role)
);

// Derived: akses modul Gudang (admin_gudang / owner / developer)
export const isGudangAccess = derived(
  currentUser,
  ($user) =>
    $user?.role === 'admin_gudang' ||
    isSuperUser($user?.role)
);

// Derived: akses modul produksi per divisi + admin
export const isProduksiAccess = derived(
  currentUser,
  ($user) =>
    $user?.role === 'admin_gudang' ||
    $user?.role === 'kepala_cutting' ||
    $user?.role === 'kepala_jahit' ||
    $user?.role === 'kepala_steam' ||
    isSuperUser($user?.role)
);

// Derived: apakah user bisa kelola karyawan (owner / developer)
export const isKaryawanManager = derived(
  currentUser,
  ($user) => $user?.role === 'admin_hr' || isSuperUser($user?.role)
);

// Derived: owner atau developer (akses penuh)
export const isOwnerOrDev = derived(
  currentUser,
  ($user) => isSuperUser($user?.role)
);

// Inisialisasi listener auth — panggil sekali di root +layout.svelte
export function initAuthListener() {
  onAuthChange(async (firebaseUser) => {
    try {
      if (firebaseUser) {
        const profile = await getUserProfile(firebaseUser.uid);
        currentUser.set(profile);
      } else {
        currentUser.set(null);
      }
    } finally {
      authLoading.set(false);
    }
  });
}
