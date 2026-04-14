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

// Derived: apakah user adalah admin gudang
export const isAdmin = derived(
  currentUser,
  ($user) => $user?.role === 'admin_gudang' || isSuperUser($user?.role)
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

// Derived: apakah user bisa kelola karyawan (owner / hr / developer)
export const isKaryawanManager = derived(
  currentUser,
  ($user) =>
    isSuperUser($user?.role) || $user?.role === 'hr'
);

// Derived: owner atau developer (akses penuh)
export const isOwnerOrDev = derived(
  currentUser,
  ($user) => isSuperUser($user?.role)
);

// Inisialisasi listener auth — panggil sekali di root +layout.svelte
export function initAuthListener() {
  onAuthChange(async (firebaseUser) => {
    if (firebaseUser) {
      const profile = await getUserProfile(firebaseUser.uid);
      currentUser.set(profile);
    } else {
      currentUser.set(null);
    }
    authLoading.set(false);
  });
}
