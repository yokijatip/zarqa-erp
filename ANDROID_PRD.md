# PRD — Zarqa ERP Worker App (Android)

## 1. Overview

**Zarqa ERP Worker App** adalah aplikasi Android pendamping dari sistem ERP web **Zarqa ERP Web** yang sudah berjalan. Sistem ERP web (SvelteKit + Firebase) digunakan oleh admin gudang untuk membuat order produksi, memantau pipeline, dan mengelola stok. Aplikasi Android ini ditujukan khusus untuk **pekerja lantai produksi** agar bisa memperbarui status batch secara real-time langsung dari smartphone — tanpa perlu mengakses web.

Kedua sistem (web + Android) berbagi **Firebase project yang sama** (Firestore + Auth), sehingga setiap perubahan dari Android langsung terlihat di dashboard web dan sebaliknya.

---

## 2. Tujuan Produk

| Tujuan | Keterangan |
|--------|------------|
| Digitalisasi proses lantai produksi | Pekerja tidak perlu laporan manual ke admin |
| Real-time tracking | Status batch langsung update di web dashboard |
| Role-based access | Tiap pengguna hanya melihat fungsi sesuai jabatannya |
| Minimalis & mudah dipakai | UI sederhana, cocok untuk pekerja non-teknis |

---

## 3. Target Pengguna & Role Mapping

Sistem mengenal beberapa `UserRole` yang tersimpan di Firestore collection `users` (field `role`):

| Role (Firestore) | Jabatan | Akses di Aplikasi Android |
|-----------------|---------|--------------------------|
| `kepala_cutting` | Tukang Cutting | CuttingScreen — lihat & proses batch cutting |
| `kepala_jahit` | Tukang Jahit | JahitScreen — lihat & proses batch jahit |
| `kepala_steam` | Tukang Steam | SteamScreen — lihat & proses batch steam |
| `admin_gudang` | Admin Gudang | AdminScreen — lihat stok barang jadi + catat barang keluar |
| `kepala_keluar` | Kepala Keluar | AdminScreen — sama seperti admin_gudang |

> Role `developer`, `owner`, `hr` tidak perlu menggunakan aplikasi Android.
> Jika user login dengan role di luar 5 di atas, tampilkan halaman "Akses tidak tersedia" dan opsi logout.

---

## 4. Firebase Project (Shared)

Aplikasi Android menggunakan **Firebase project yang sama persis** dengan ERP web.

### Collections yang Diakses Android

```
Firestore:
├── users/                          → baca role & profil user
├── batch_produksi/                 → baca & update status batch
│   └── {batchId}/
│       └── riwayat_proses/         → tulis riwayat saat update status
└── stok_barang_jadi/               → baca stok (admin)
└── barang_keluar/                  → tulis catatan pengiriman (admin)
```

### Auth
- Firebase Authentication (Email/Password)
- Setelah login berhasil, ambil dokumen `users/{uid}` untuk membaca `role`

---

## 5. Tech Stack Android

| Komponen | Pilihan |
|----------|---------|
| Language | **Kotlin** |
| UI Framework | **Jetpack Compose** |
| Template | Android Studio — Navigation UI Activity (dengan Compose Navigation) |
| Navigation | **Navigation Component** (`androidx.navigation.compose`) |
| Architecture | **MVVM** — ViewModel + StateFlow |
| Firebase | `firebase-auth-ktx`, `firebase-firestore-ktx` |
| Async | **Kotlin Coroutines** + `viewModelScope` |
| DI (opsional) | Hilt (direkomendasikan untuk scalability) |
| Splash Screen | `androidx.core:core-splashscreen` API |
| Min SDK | 26 (Android 8.0) |
| Target SDK | Latest stable |

---

## 6. Arsitektur Aplikasi

### Activity Structure

```
AuthActivity  (launcher)
 └── NavHost (Compose)
      ├── SplashScreen         → cek auth state → redirect
      └── LoginScreen          → email + password → Firebase Auth

WorkerActivity  (dibuka setelah login berhasil)
 └── NavHost (Compose)
      ├── CuttingScreen        → hanya untuk kepala_cutting
      ├── JahitScreen          → hanya untuk kepala_jahit
      ├── SteamScreen          → hanya untuk kepala_steam
      └── AdminScreen          → untuk admin_gudang & kepala_keluar
```

> **WorkerActivity** tidak perlu bottom nav atau drawer karena setiap worker hanya memiliki **satu screen utama** sesuai role-nya. Navigasi ke screen dilakukan berdasarkan `role` yang dibaca dari Firestore setelah login.

### Alur Navigasi

```
App Launch
  │
  ▼
SplashScreen (2 detik)
  │
  ├── [user sudah login] ──────────────────────→ WorkerActivity
  │                                                  │
  └── [belum login] ──→ LoginScreen                  └─→ screen sesuai role
                            │
                            └── [login sukses] ──→ WorkerActivity
```

### Package Structure yang Disarankan

```
com.zarqa.erp/
├── ui/
│   ├── auth/
│   │   ├── AuthActivity.kt
│   │   ├── SplashScreen.kt
│   │   └── LoginScreen.kt
│   ├── worker/
│   │   ├── WorkerActivity.kt
│   │   ├── WorkerRouter.kt        ← routing berdasarkan role
│   │   ├── cutting/
│   │   │   ├── CuttingScreen.kt
│   │   │   └── CuttingViewModel.kt
│   │   ├── jahit/
│   │   │   ├── JahitScreen.kt
│   │   │   └── JahitViewModel.kt
│   │   ├── steam/
│   │   │   ├── SteamScreen.kt
│   │   │   └── SteamViewModel.kt
│   │   └── admin/
│   │       ├── AdminScreen.kt
│   │       └── AdminViewModel.kt
│   └── common/
│       ├── BatchCard.kt           ← reusable composable
│       ├── StatusChip.kt
│       └── LoadingScreen.kt
├── data/
│   ├── model/                     ← data classes (cermin tipe Firestore)
│   │   ├── BatchProduksi.kt
│   │   ├── RiwayatProses.kt
│   │   ├── StokBarangJadi.kt
│   │   └── BarangKeluar.kt
│   └── repository/
│       ├── AuthRepository.kt
│       ├── BatchRepository.kt
│       └── BarangJadiRepository.kt
└── util/
    ├── StatusHelper.kt            ← label & warna per status
    └── DateFormatter.kt
```

---

## 7. Data Models (Firestore → Kotlin)

### UserProfile
```kotlin
data class UserProfile(
    val uid: String = "",
    val name: String = "",
    val email: String = "",
    val role: String = "",              // "kepala_cutting" | "kepala_jahit" | dll
    val tipe_akun: String = "permanent" // "permanent" | "temporary"
)
```

### BatchProduksi
```kotlin
data class BatchProduksi(
    val id: String = "",
    val model_id: String = "",
    val nama_model: String = "",
    val nama_warna: String? = null,
    val kode_hex_warna: String? = null,
    val detail_ukuran: List<DetailUkuran> = emptyList(),
    val total_pcs: Int = 0,
    val kain_digunakan: List<KainDigunakan> = emptyList(),
    val status: String = "",            // StatusBatch string
    val dibuat_oleh: String = "",
    val catatan_admin: String? = null,
    val penugasan: Penugasan? = null,
    val createdAt: Timestamp? = null,
    val updatedAt: Timestamp? = null
)

data class DetailUkuran(val ukuran: String = "", val jumlah_pcs: Int = 0)
data class KainDigunakan(val kain_id: String = "", val nama_kain: String = "", val satuan: String = "", val jumlah_dipakai: Double = 0.0)
data class Penugasan(val cutting: PenugasanWorker? = null, val jahit: PenugasanWorker? = null, val steam: PenugasanWorker? = null)
data class PenugasanWorker(val uid: String = "", val nama: String = "")
```

### RiwayatProses (Subcollection)
```kotlin
data class RiwayatProses(
    val status_dari: String = "",
    val status_ke: String = "",
    val updated_by_uid: String = "",
    val updated_by_nama: String = "",
    val pcs_berhasil: Int = 0,
    val pcs_reject: Int = 0,
    val catatan: String? = null,
    val timestamp: Timestamp? = null
)
```

### StokBarangJadi
```kotlin
data class StokBarangJadi(
    val id: String = "",
    val model_id: String = "",
    val nama_model: String = "",
    val nama_warna: String? = null,
    val kode_hex_warna: String? = null,
    val ukuran: String = "",            // "S" | "M" | "L" | "XL" | "XXL"
    val stok_tersedia: Int = 0,
    val total_masuk: Int = 0,
    val total_keluar: Int = 0
)
```

### BarangKeluar
```kotlin
data class BarangKeluar(
    val model_id: String = "",
    val nama_model: String = "",
    val detail_keluar: List<DetailKeluar> = emptyList(),
    val total_pcs: Int = 0,
    val tujuan: String = "",
    val keterangan: String? = null,
    val dicatat_oleh: String = "",
    val tanggal_keluar: Timestamp? = null
)

data class DetailKeluar(val ukuran: String = "", val jumlah_pcs: Int = 0)
```

---

## 8. Status Batch & Transisi

Pipeline produksi berjalan satu arah:

```
PENDING_CUTTING
    │  [cutting mulai]
    ▼
CUTTING_IN_PROGRESS
    │  [cutting selesai + input pcs]
    ▼
CUTTING_DONE
    │  [jahit mulai]
    ▼
JAHIT_IN_PROGRESS
    │  [jahit selesai + input pcs]
    ▼
JAHIT_DONE
    │  [steam mulai]
    ▼
STEAM_IN_PROGRESS
    │  [steam selesai + input pcs]
    ▼
STEAM_DONE
    │  [admin web selesaikan → COMPLETED, masuk stok barang jadi]
    ▼
COMPLETED
```

### Transisi yang Dilakukan Android

| Aktor | Dari Status | Ke Status | Input Wajib | Penugasan Disimpan |
|-------|------------|-----------|-------------|-------------------|
| kepala_cutting | PENDING_CUTTING | CUTTING_IN_PROGRESS | — | `penugasan.cutting` |
| kepala_cutting | CUTTING_IN_PROGRESS | CUTTING_DONE | pcs_berhasil, pcs_reject | — |
| kepala_jahit | CUTTING_DONE | JAHIT_IN_PROGRESS | — | `penugasan.jahit` |
| kepala_jahit | JAHIT_IN_PROGRESS | JAHIT_DONE | pcs_berhasil, pcs_reject | — |
| kepala_steam | JAHIT_DONE | STEAM_IN_PROGRESS | — | `penugasan.steam` |
| kepala_steam | STEAM_IN_PROGRESS | STEAM_DONE | pcs_berhasil, pcs_reject | — |

> **Aturan penting:**
> - Saat "mulai" (→ IN_PROGRESS): simpan `penugasan.{divisi}` = `{uid, nama}` user yang login
> - Saat "selesai" (→ DONE): tulis dokumen baru di subcollection `riwayat_proses` dengan pcs_berhasil + pcs_reject
> - `pcs_berhasil + pcs_reject` tidak harus sama dengan `total_pcs` (ada potongan wajar)
> - `pcs_reject` boleh 0

### Firestore Write saat Update Status

```
// Update dokumen utama
batch_produksi/{batchId}:
  status: "<status_baru>"
  updatedAt: serverTimestamp()
  penugasan.cutting: {uid, nama}   // hanya saat → CUTTING_IN_PROGRESS

// Tambah di subcollection
batch_produksi/{batchId}/riwayat_proses/:
  status_dari: "<status_lama>"
  status_ke: "<status_baru>"
  updated_by_uid: "<uid>"
  updated_by_nama: "<nama>"
  pcs_berhasil: <number>
  pcs_reject: <number>
  catatan: "<opsional>"
  timestamp: serverTimestamp()
```

---

## 9. Screen Requirements

### 9.1 SplashScreen

- Tampilkan logo/nama app selama ~1.5 detik
- Gunakan `SplashScreen API` (`androidx.core:core-splashscreen`)
- Cek `FirebaseAuth.getInstance().currentUser`:
  - Jika ada → navigasi ke `WorkerActivity`
  - Jika tidak ada → navigasi ke `LoginScreen`

---

### 9.2 LoginScreen

**Komponen:**
- Logo / nama aplikasi di tengah atas
- Input email (TextField)
- Input password (TextField, `visualTransformation = PasswordVisualTransformation()`)
- Tombol "Masuk"
- Text error (merah, di bawah form)
- Loading state saat proses login

**Logika:**
1. Validasi: email tidak kosong, password ≥ 6 karakter
2. Call `FirebaseAuth.signInWithEmailAndPassword(email, password)`
3. Jika sukses → ambil `users/{uid}` dari Firestore → simpan `UserProfile` di ViewModel
4. Navigasi ke `WorkerActivity`, passing role via Intent extras
5. Jika gagal → tampilkan pesan error dari Firebase exception

**Error messages:**
- Invalid email → "Format email tidak valid"
- Wrong password / user not found → "Email atau password salah"
- Network error → "Periksa koneksi internet"

---

### 9.3 CuttingScreen (`kepala_cutting`)

**State yang ditampilkan:**
- List batch dengan status `PENDING_CUTTING` (antri) dan `CUTTING_IN_PROGRESS` (sedang dikerjakan oleh user ini)
- Loading state
- Empty state ("Tidak ada batch untuk diproses")

**BatchCard untuk CuttingScreen:**
```
┌──────────────────────────────────────────────┐
│ [●] Nama Model           [● Warna chip]      │
│     S:10 M:20 L:15 XL:5  — Total: 50 pcs    │
│     Dibuat: 25 Feb 2026   Hari ke-2          │
│                                              │
│  [MENUNGGU CUTTING]    [Mulai Cutting →]     │
│  atau                                        │
│  [SEDANG CUTTING]      [Selesai & Input →]   │
└──────────────────────────────────────────────┘
```

**Aksi "Mulai Cutting"** (batch status = PENDING_CUTTING):
- Konfirmasi dialog: "Mulai proses cutting untuk [nama_model]?"
- Pada konfirmasi: update status → `CUTTING_IN_PROGRESS`, simpan `penugasan.cutting`
- Tulis `riwayat_proses` dengan pcs_berhasil=0, pcs_reject=0

**Aksi "Selesai & Input"** (batch status = CUTTING_IN_PROGRESS):
- Buka BottomSheet / Dialog dengan form:
  - Label: "Laporan Hasil Cutting — [nama_model] ([total_pcs] pcs)"
  - Input "PCS Berhasil" (NumberField, wajib > 0)
  - Input "PCS Reject" (NumberField, default 0)
  - Info: "Total dilaporkan: {berhasil + reject} pcs"
  - Catatan (opsional, multiline)
  - Tombol "Simpan & Selesai"
- Pada submit: update status → `CUTTING_DONE`, tulis `riwayat_proses`

**Filter yang disarankan:**
- Hanya tampilkan `PENDING_CUTTING` dan `CUTTING_IN_PROGRESS` yang ditugaskan ke user ini
  - Atau semua PENDING + CUTTING_IN_PROGRESS miliknya (penugasan.cutting.uid == currentUid)

---

### 9.4 JahitScreen (`kepala_jahit`)

Identik dengan CuttingScreen, dengan penyesuaian:

| | Cutting | Jahit |
|-|---------|-------|
| Status antri | PENDING_CUTTING | CUTTING_DONE |
| Status aktif | CUTTING_IN_PROGRESS | JAHIT_IN_PROGRESS |
| Status selesai | CUTTING_DONE | JAHIT_DONE |
| Penugasan key | penugasan.cutting | penugasan.jahit |
| Label mulai | "Mulai Cutting" | "Mulai Jahit" |
| Label selesai | "Selesai Cutting" | "Selesai Jahit" |

---

### 9.5 SteamScreen (`kepala_steam`)

Identik, dengan penyesuaian:

| | Steam |
|-|-------|
| Status antri | JAHIT_DONE |
| Status aktif | STEAM_IN_PROGRESS |
| Status selesai | STEAM_DONE |
| Penugasan key | penugasan.steam |

---

### 9.6 AdminScreen (`admin_gudang` & `kepala_keluar`)

**Tab / Sections (gunakan TabRow di Compose):**

#### Tab 1 — Stok Barang Jadi

- Query `stok_barang_jadi` collection, group by `model_id`
- Tampilkan card per model:
  ```
  ┌─────────────────────────────────┐
  │ Nama Model    [● Warna chip]    │
  │ Total tersedia: 85 pcs          │
  │ S:10  M:20  L:25  XL:20  XXL:10│
  └─────────────────────────────────┘
  ```
- Pull-to-refresh

#### Tab 2 — Catat Barang Keluar

**Form:**
- Pilih model (Dropdown dari stok yang tersedia > 0)
- Setelah pilih model → tampilkan input per ukuran yang tersedia dengan stok maksimum
- Input "Tujuan" (TextField wajib)
- Input "Keterangan" (TextField opsional)
- Tombol "Catat Keluar"

**Validasi:**
- Model harus dipilih
- Total pcs > 0
- Tidak ada ukuran yang melebihi stok tersedia
- Tujuan tidak boleh kosong

**Firestore Write:**
```
barang_keluar/ (addDoc):
  model_id, nama_model
  detail_keluar: [{ukuran, jumlah_pcs}, ...]
  total_pcs: <sum>
  tujuan: <string>
  keterangan: <string | null>
  dicatat_oleh: <uid>
  tanggal_keluar: serverTimestamp()

stok_barang_jadi/{stokId} (updateDoc per ukuran):
  stok_tersedia: increment(-jumlah)
  total_keluar: increment(jumlah)
```

> Tulis `barang_keluar` dan update setiap `stok_barang_jadi` yang terpengaruh secara sequential.

---

## 10. Common UI Components

### AppBar (semua screen)
```
[☰ atau ←]   Nama Divisi          [Logout icon]
              subtitle: nama user
```
- Tidak ada hamburger menu / drawer (karena single screen per role)
- Tombol logout di pojok kanan

### StatusChip
Chip berwarna sesuai status:

| Status | Background | Text |
|--------|-----------|------|
| PENDING_CUTTING | abu-abu | gelap |
| CUTTING_IN_PROGRESS | oranye | putih |
| CUTTING_DONE | kuning | gelap |
| JAHIT_IN_PROGRESS | biru | putih |
| JAHIT_DONE | teal | putih |
| STEAM_IN_PROGRESS | ungu | putih |
| STEAM_DONE | hijau emerald | putih |
| COMPLETED | hijau | putih |

### Warna Chip (warna baju)
- Lingkaran kecil warna `kode_hex_warna` + text `nama_warna`
- Jika tidak ada warna: tidak ditampilkan

---

## 11. UX Guidelines

- **Minimalis**: Tidak ada animasi berlebihan, tidak ada elemen dekoratif yang tidak perlu
- **Feedback jelas**: Setiap aksi ada loading state + success/error feedback (Snackbar atau Toast)
- **Konfirmasi aksi penting**: Dialog konfirmasi sebelum "Mulai" dan BottomSheet untuk "Selesai"
- **Typography**: Gunakan Material 3, font Roboto/Inter
- **Warna primer**: Biru tua (#1E3A5F) atau bisa menyesuaikan brand
- **Warna aksen**: Teal/Hijau untuk status sukses
- **Padding**: 16dp standar, kartu dengan corner radius 12dp
- **Dark mode**: Opsional untuk v1, prioritas rendah

---

## 12. Fitur Out of Scope (untuk Web, bukan Android)

Fitur berikut **tidak perlu** ada di Android:
- Membuat order produksi baru (hanya admin web)
- Manajemen model baju
- Manajemen stok kain
- Melihat semua batch dari semua divisi (kecuali monitoring sudah selesai)
- Manajemen karyawan / akun pengguna
- Dashboard analytics

---

## 13. Error Handling

| Kondisi | Handling |
|---------|---------|
| Tidak ada koneksi internet | Snackbar: "Tidak ada koneksi. Periksa internet Anda." |
| Session expired / token invalid | Redirect ke LoginScreen, hapus auth state |
| Batch tidak ditemukan | Snackbar: "Data tidak ditemukan. Coba refresh." |
| Permission denied (Firestore rules) | Snackbar: "Akses ditolak. Hubungi admin." |
| Unknown error | Snackbar: "Terjadi kesalahan. Coba lagi." |

---

## 14. Firestore Security Rules (Rekomendasi Tambahan)

Android menulis ke Firestore langsung dari client. Pastikan rules di Firebase Console sudah membatasi:
- Worker hanya bisa update `batch_produksi` (bukan create/delete)
- Worker hanya bisa menulis `riwayat_proses` di subcollection batch yang relevan
- Admin bisa write ke `barang_keluar` dan update `stok_barang_jadi`
- Semua akses hanya untuk user yang sudah terautentikasi

---

## 15. Versioning

| Versi | Scope |
|-------|-------|
| v1.0 | Login, CuttingScreen, JahitScreen, SteamScreen, AdminScreen (stok + catat keluar) |
| v1.1 | Push notification saat batch siap diproses |
| v1.2 | Riwayat pekerjaan per worker, summary harian |