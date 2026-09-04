<script lang="ts">
  import { currentUser } from '$lib/stores/auth.store';
  import { updateUserProfile, updateUserPassword, uploadProfilePhoto } from '$lib/firebase/auth';
  import { ROLE_LABEL } from '$lib/firebase/karyawan';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Dialog from '$lib/components/ui/dialog/index.js';
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

  // ── Crop Modal ────────────────────────────────────────────────────
  const CROP_SIZE = 280; // px — displayed canvas size

  let fileInput: HTMLInputElement;
  let cropOpen    = $state(false);
  let cropCanvas: HTMLCanvasElement;
  let cropImg     = $state<HTMLImageElement | null>(null);

  // state for pan + zoom
  let imgX    = $state(0);
  let imgY    = $state(0);
  let scale   = $state(1);
  let isDragging = $state(false);
  let dragStartX = 0;
  let dragStartY = 0;
  let dragImgX   = 0;
  let dragImgY   = 0;

  let uploadingPhoto = $state(false);

  function onFileSelected(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError('File harus berupa gambar (JPG, PNG, WebP).');
      if (fileInput) fileInput.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showError('Ukuran foto maksimal 10 MB.');
      if (fileInput) fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        cropImg = img;
        // Initial scale: fit the short side to CROP_SIZE
        const fit = CROP_SIZE / Math.min(img.naturalWidth, img.naturalHeight);
        scale = fit;
        imgX = (CROP_SIZE - img.naturalWidth * scale) / 2;
        imgY = (CROP_SIZE - img.naturalHeight * scale) / 2;
        cropOpen = true;
        requestAnimationFrame(drawCrop);
      };
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  }

  function drawCrop() {
    if (!cropCanvas || !cropImg) return;
    const ctx = cropCanvas.getContext('2d')!;
    const S = CROP_SIZE;

    ctx.clearRect(0, 0, S, S);

    // Draw image
    ctx.drawImage(cropImg, imgX, imgY, cropImg.naturalWidth * scale, cropImg.naturalHeight * scale);

    // Dark overlay outside circle
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.rect(0, 0, S, S);
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2, true); // cutout
    ctx.fill('evenodd');
    ctx.restore();

    // Circle border
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ── Drag handlers ─────────────────────────────────────────────────
  function onPointerDown(e: PointerEvent) {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragImgX   = imgX;
    dragImgY   = imgY;
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging || !cropImg) return;
    imgX = dragImgX + (e.clientX - dragStartX);
    imgY = dragImgY + (e.clientY - dragStartY);
    requestAnimationFrame(drawCrop);
  }

  function onPointerUp() {
    isDragging = false;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (!cropImg) return;
    const delta = e.deltaY < 0 ? 1.08 : 0.93;
    const newScale = Math.min(Math.max(scale * delta, CROP_SIZE / Math.max(cropImg.naturalWidth, cropImg.naturalHeight)), 10);
    // Scale around canvas center
    const cx = CROP_SIZE / 2;
    const cy = CROP_SIZE / 2;
    imgX = cx - (cx - imgX) * (newScale / scale);
    imgY = cy - (cy - imgY) * (newScale / scale);
    scale = newScale;
    requestAnimationFrame(drawCrop);
  }

  // ── Crop & upload ─────────────────────────────────────────────────
  async function confirmCrop() {
    if (!cropImg || !$currentUser) return;

    // Draw the cropped circle to an output canvas
    const outputSize = 400;
    const out = document.createElement('canvas');
    out.width = outputSize;
    out.height = outputSize;
    const ctx = out.getContext('2d')!;

    // Ratio between output and display canvas
    const ratio = outputSize / CROP_SIZE;

    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(
      cropImg,
      imgX * ratio,
      imgY * ratio,
      cropImg.naturalWidth * scale * ratio,
      cropImg.naturalHeight * scale * ratio,
    );

    uploadingPhoto = true;
    cropOpen = false;

    out.toBlob(
      async (blob) => {
        if (!blob || !$currentUser) { uploadingPhoto = false; return; }
        try {
          const file = new File([blob], 'profile.jpg', { type: 'image/jpeg' });
          const url = await uploadProfilePhoto($currentUser.uid, file);
          $currentUser.photoURL = url;
          showSuccess('Foto profil berhasil diperbarui.');
        } catch (err: unknown) {
          showError(err instanceof Error ? err.message : 'Gagal mengunggah foto.');
        } finally {
          uploadingPhoto = false;
          if (fileInput) fileInput.value = '';
        }
      },
      'image/jpeg',
      0.9,
    );
  }

  function closeCrop() {
    cropOpen = false;
    cropImg = null;
    if (fileInput) fileInput.value = '';
  }

  // Redraw whenever the canvas becomes visible
  $effect(() => {
    if (cropOpen && cropCanvas && cropImg) {
      requestAnimationFrame(drawCrop);
    }
  });

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

<!-- ── Crop Dialog ─────────────────────────────────────────────────── -->
<Dialog.Root bind:open={cropOpen}>
  <Dialog.Content
    class="w-auto max-w-none p-6"
    showCloseButton={false}
    onInteractOutside={(e) => e.preventDefault()}
  >
    <Dialog.Header class="mb-4">
      <Dialog.Title class="text-sm font-semibold text-gray-800">Sesuaikan Foto Profil</Dialog.Title>
      <Dialog.Description class="text-xs text-gray-500">
        Geser untuk memposisikan • Scroll untuk zoom
      </Dialog.Description>
    </Dialog.Header>

    <!-- Canvas crop area -->
    <div class="flex justify-center">
      <canvas
        bind:this={cropCanvas}
        width={CROP_SIZE}
        height={CROP_SIZE}
        class="cursor-grab rounded-full active:cursor-grabbing"
        style="width:{CROP_SIZE}px;height:{CROP_SIZE}px"
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
        onwheel={onWheel}
      ></canvas>
    </div>

    <div class="mt-5 flex justify-end gap-2">
      <Button variant="outline" onclick={closeCrop}>Batal</Button>
      <Button onclick={confirmCrop} disabled={uploadingPhoto}>
        {uploadingPhoto ? 'Mengunggah...' : 'Pakai Foto Ini'}
      </Button>
    </div>
  </Dialog.Content>
</Dialog.Root>

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

<div class="mx-auto w-full max-w-4xl space-y-6">

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
