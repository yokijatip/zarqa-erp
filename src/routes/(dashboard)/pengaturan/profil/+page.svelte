<script lang="ts">
  import { currentUser } from '$lib/stores/auth.store';
  import { updateUserProfile, updateUserPassword, uploadProfilePhoto } from '$lib/firebase/auth';
  import { ROLE_LABEL } from '$lib/firebase/karyawan';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import CameraIcon from '@lucide/svelte/icons/camera';
  import LoaderIcon from '@lucide/svelte/icons/loader';

  // ── Toast ─────────────────────────────────────────────────────────
  let successMsg = $state<string | null>(null);
  let errorMsg   = $state<string | null>(null);

  function showSuccess(msg: string) {
    successMsg = msg;
    setTimeout(() => (successMsg = null), 3500);
  }
  function showError(msg: string) {
    errorMsg = msg;
    setTimeout(() => (errorMsg = null), 6000);
  }

  // ── Ganti Foto ────────────────────────────────────────────────────
  let fileInput: HTMLInputElement;
  let uploadingPhoto = $state(false);

  async function onFileSelected(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !$currentUser) return;

    if (!file.type.startsWith('image/')) {
      showError('File harus berupa gambar (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showError('Ukuran foto maksimal 2 MB.');
      return;
    }

    uploadingPhoto = true;
    try {
      const url = await uploadProfilePhoto($currentUser.uid, file);
      $currentUser.photoURL = url;
      showSuccess('Foto profil berhasil diperbarui.');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Gagal mengunggah foto.');
    } finally {
      uploadingPhoto = false;
      // Reset input agar file yang sama bisa dipilih ulang
      if (fileInput) fileInput.value = '';
    }
  }

  // ── Edit Nama ─────────────────────────────────────────────────────
  let namaBaru     = $state($currentUser?.name ?? '');
  let savingProfil = $state(false);

  let canSaveProfil = $derived(
    namaBaru.trim() !== '' && namaBaru.trim() !== $currentUser?.name,
  );

  async function simpanProfil() {
    if (!canSaveProfil || !$currentUser) return;
    savingProfil = true;
    try {
      await updateUserProfile($currentUser.uid, namaBaru.trim());
      $currentUser.name = namaBaru.trim();
      showSuccess('Nama profil berhasil diperbarui.');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Gagal memperbarui profil.');
    } finally {
      savingProfil = false;
    }
  }

  // ── Ganti Password ────────────────────────────────────────────────
  let passLama       = $state('');
  let passBaru       = $state('');
  let passKonfirmasi = $state('');
  let savingPass     = $state(false);

  let canSavePass = $derived(
    passLama.trim() !== '' &&
    passBaru.trim().length >= 6 &&
    passBaru === passKonfirmasi,
  );

  let errKonfirmasi = $derived(
    passKonfirmasi !== '' && passBaru !== passKonfirmasi ? 'Password tidak cocok.' : null,
  );

  let errPassBaru = $derived(
    passBaru !== '' && passBaru.length < 6 ? 'Minimal 6 karakter.' : null,
  );

  async function simpanPassword() {
    if (!canSavePass) return;
    savingPass = true;
    try {
      await updateUserPassword(passLama, passBaru);
      passLama = '';
      passBaru = '';
      passKonfirmasi = '';
      showSuccess('Password berhasil diubah.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal mengubah password.';
      const isWrong =
        msg.includes('auth/wrong-password') || msg.includes('auth/invalid-credential');
      showError(isWrong ? 'Password saat ini salah.' : msg);
    } finally {
      savingPass = false;
    }
  }
</script>

<!-- ── Hidden file input ───────────────────────────────────────────── -->
<input
  bind:this={fileInput}
  type="file"
  accept="image/*"
  class="hidden"
  onchange={onFileSelected}
/>

<!-- ── Toast ──────────────────────────────────────────────────────── -->
{#if successMsg}
  <div class="fixed right-5 top-5 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 shadow-lg">
    <svg class="h-4 w-4 shrink-0 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
    <p class="text-sm text-green-800">{successMsg}</p>
  </div>
{/if}
{#if errorMsg}
  <div class="fixed right-5 top-5 z-50 flex max-w-sm items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg">
    <svg class="mt-0.5 h-4 w-4 shrink-0 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
    <p class="text-sm text-red-800">{errorMsg}</p>
  </div>
{/if}

<div class="mx-auto max-w-xl space-y-6">

  <!-- ── Informasi Profil ──────────────────────────────────────────── -->
  <div class="rounded-xl border border-gray-100 bg-gray-50/50 p-5">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-gray-800">Informasi Profil</h2>
      <!-- Tombol ganti foto -->
      <button
        type="button"
        onclick={() => fileInput?.click()}
        disabled={uploadingPhoto}
        class="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
      >
        {#if uploadingPhoto}
          <LoaderIcon class="h-3.5 w-3.5 animate-spin" />
          Mengunggah...
        {:else}
          <CameraIcon class="h-3.5 w-3.5" />
          Ganti Foto
        {/if}
      </button>
    </div>
    <div class="space-y-4">

      <div class="space-y-1.5">
        <label class="block text-sm font-medium text-gray-700" for="nama">Nama Lengkap</label>
        <Input id="nama" bind:value={namaBaru} placeholder="Nama lengkap Anda" />
      </div>

      <div class="space-y-1.5">
        <p class="block text-sm font-medium text-gray-700">Email</p>
        <div class="flex h-10 items-center rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-500">
          {$currentUser?.email ?? '-'}
        </div>
        <p class="text-[11px] text-gray-400">
          Untuk mengubah email, hubungi administrator sistem.
        </p>
      </div>

      <div class="space-y-1.5">
        <p class="block text-sm font-medium text-gray-700">Role</p>
        <div class="flex h-10 items-center rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-500">
          {$currentUser ? (ROLE_LABEL[$currentUser.role] ?? $currentUser.role) : '-'}
        </div>
      </div>
    </div>

    <div class="mt-5 flex justify-end">
      <Button onclick={simpanProfil} disabled={savingProfil || !canSaveProfil}>
        {savingProfil ? 'Menyimpan...' : 'Simpan Perubahan'}
      </Button>
    </div>
  </div>

  <!-- ── Ganti Password ────────────────────────────────────────────── -->
  <div class="rounded-xl border border-gray-100 bg-gray-50/50 p-5">
    <h2 class="mb-4 text-sm font-semibold text-gray-800">Ganti Password</h2>
    <div class="space-y-4">

      <div class="space-y-1.5">
        <label class="block text-sm font-medium text-gray-700" for="pass-lama">Password Saat Ini</label>
        <Input id="pass-lama" type="password" bind:value={passLama} placeholder="Masukkan password saat ini" autocomplete="current-password" />
      </div>

      <div class="space-y-1.5">
        <label class="block text-sm font-medium text-gray-700" for="pass-baru">Password Baru</label>
        <Input id="pass-baru" type="password" bind:value={passBaru} placeholder="Minimal 6 karakter" autocomplete="new-password" />
        {#if errPassBaru}
          <p class="text-xs text-red-500">{errPassBaru}</p>
        {/if}
      </div>

      <div class="space-y-1.5">
        <label class="block text-sm font-medium text-gray-700" for="pass-konfirmasi">Konfirmasi Password Baru</label>
        <Input id="pass-konfirmasi" type="password" bind:value={passKonfirmasi} placeholder="Ulangi password baru" autocomplete="new-password" />
        {#if errKonfirmasi}
          <p class="text-xs text-red-500">{errKonfirmasi}</p>
        {/if}
      </div>
    </div>

    <div class="mt-5 flex justify-end">
      <Button onclick={simpanPassword} disabled={savingPass || !canSavePass}>
        {savingPass ? 'Menyimpan...' : 'Ganti Password'}
      </Button>
    </div>
  </div>

</div>
