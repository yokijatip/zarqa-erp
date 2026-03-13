<script lang="ts">
  import { currentUser } from '$lib/stores/auth.store';
  import { updateUserProfile, updateUserPassword } from '$lib/firebase/auth';
  import { ROLE_LABEL } from '$lib/firebase/karyawan';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';

  // ── Toast ──────────────────────────────────────────────────────────
  let successMsg = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);

  function showSuccess(msg: string) {
    successMsg = msg;
    setTimeout(() => (successMsg = null), 3000);
  }
  function showError(msg: string) {
    errorMsg = msg;
    setTimeout(() => (errorMsg = null), 6000);
  }

  // ── Edit Profil ────────────────────────────────────────────────────
  let namaBaru = $state($currentUser?.name ?? '');
  let savingProfil = $state(false);

  let canSaveProfil = $derived(
    namaBaru.trim() !== '' && namaBaru.trim() !== $currentUser?.name,
  );

  async function simpanProfil() {
    if (!canSaveProfil || !$currentUser) return;
    savingProfil = true;
    try {
      await updateUserProfile($currentUser.uid, namaBaru.trim());
      // Update store lokal agar UI langsung berubah
      $currentUser.name = namaBaru.trim();
      showSuccess('Nama profil berhasil diperbarui.');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Gagal memperbarui profil.');
    } finally {
      savingProfil = false;
    }
  }

  // ── Ganti Password ─────────────────────────────────────────────────
  let passLama = $state('');
  let passBaru = $state('');
  let passKonfirmasi = $state('');
  let savingPass = $state(false);

  let canSavePass = $derived(
    passLama.trim() !== '' &&
      passBaru.trim().length >= 6 &&
      passBaru === passKonfirmasi,
  );

  let errKonfirmasi = $derived(
    passKonfirmasi !== '' && passBaru !== passKonfirmasi
      ? 'Password tidak cocok.'
      : null,
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

<!-- ── Toast ──────────────────────────────────────────────────────── -->
{#if successMsg}
  <div
    class="fixed right-5 top-5 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 shadow-lg"
  >
    <svg class="h-4 w-4 shrink-0 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
    <p class="text-sm text-green-800">{successMsg}</p>
  </div>
{/if}
{#if errorMsg}
  <div
    class="fixed right-5 top-5 z-50 flex max-w-sm items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg"
  >
    <svg class="mt-0.5 h-4 w-4 shrink-0 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
    <p class="text-sm text-red-800">{errorMsg}</p>
  </div>
{/if}

<!-- ── Header ─────────────────────────────────────────────────────── -->
<div class="mb-6">
  <h1 class="text-xl font-semibold text-gray-900">Profil Saya</h1>
  <p class="mt-0.5 text-sm text-gray-500">Perbarui nama tampilan dan password akun Anda</p>
</div>

<div class="mx-auto max-w-lg space-y-6">

  <!-- ── Bagian 1: Edit Profil ────────────────────────────────────── -->
  <div class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
    <h2 class="mb-4 text-sm font-semibold text-gray-800">Informasi Profil</h2>

    <div class="space-y-4">
      <!-- Nama -->
      <div class="space-y-1.5">
        <label class="block text-sm font-medium text-gray-700" for="nama">
          Nama Lengkap
        </label>
        <Input id="nama" bind:value={namaBaru} placeholder="Nama lengkap Anda" />
      </div>

      <!-- Email (read-only) -->
      <div class="space-y-1.5">
        <p class="block text-sm font-medium text-gray-700">Email</p>
        <div class="flex h-10 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">
          {$currentUser?.email ?? '-'}
        </div>
        <p class="text-xs text-gray-400">Email tidak dapat diubah.</p>
      </div>

      <!-- Role (read-only) -->
      <div class="space-y-1.5">
        <p class="block text-sm font-medium text-gray-700">Role</p>
        <div class="flex h-10 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">
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

  <!-- ── Bagian 2: Ganti Password ─────────────────────────────────── -->
  <div class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
    <h2 class="mb-4 text-sm font-semibold text-gray-800">Ganti Password</h2>

    <div class="space-y-4">
      <!-- Password Saat Ini -->
      <div class="space-y-1.5">
        <label class="block text-sm font-medium text-gray-700" for="pass-lama">
          Password Saat Ini
        </label>
        <Input
          id="pass-lama"
          type="password"
          bind:value={passLama}
          placeholder="Masukkan password saat ini"
          autocomplete="current-password"
        />
      </div>

      <!-- Password Baru -->
      <div class="space-y-1.5">
        <label class="block text-sm font-medium text-gray-700" for="pass-baru">
          Password Baru
        </label>
        <Input
          id="pass-baru"
          type="password"
          bind:value={passBaru}
          placeholder="Minimal 6 karakter"
          autocomplete="new-password"
        />
        {#if errPassBaru}
          <p class="text-xs text-red-500">{errPassBaru}</p>
        {/if}
      </div>

      <!-- Konfirmasi Password Baru -->
      <div class="space-y-1.5">
        <label class="block text-sm font-medium text-gray-700" for="pass-konfirmasi">
          Konfirmasi Password Baru
        </label>
        <Input
          id="pass-konfirmasi"
          type="password"
          bind:value={passKonfirmasi}
          placeholder="Ulangi password baru"
          autocomplete="new-password"
        />
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
