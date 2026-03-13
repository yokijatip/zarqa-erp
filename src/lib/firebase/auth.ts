
// src/lib/firebase/auth.ts
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User,
} from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './config';
import type { UserProfile } from '$lib/types';

// Login dengan email & password
export async function login(email: string, password: string): Promise<UserProfile> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const profile = await getUserProfile(credential.user.uid);
  if (!profile) throw new Error('Profil user tidak ditemukan.');
  return profile;
}

// Logout
export async function logout(): Promise<void> {
  await signOut(auth);
}

// Ambil profil user dari Firestore berdasarkan UID
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() } as UserProfile;
}

// Update nama di Firestore
export async function updateUserProfile(uid: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { name });
}

// Ganti password (reauthenticate dulu sebelum update)
export async function updateUserPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('User tidak ditemukan.');
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}

// Listener perubahan auth state (dipakai di store)
export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}