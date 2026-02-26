# Zarqa ERP Worker App — Android

Aplikasi Android untuk pekerja lantai produksi pabrik busana **Zarqa**.
Dibuat dengan **Kotlin + Jetpack Compose**, terhubung ke Firebase project
yang sama dengan ERP web.

---

## Konteks Sistem

| Bagian | Tech | Pengguna |
|--------|------|----------|
| **ERP Web** (sudah jalan) | SvelteKit + Firebase | Admin, Owner, HR |
| **Worker App** (repo ini) | Android Kotlin Compose | Tukang Cutting, Jahit, Steam, Admin Gudang |

Keduanya berbagi **satu Firebase project** — perubahan dari Android langsung
terlihat di web dashboard secara real-time.

---

## Tech Stack

```
Language        : Kotlin
UI              : Jetpack Compose (Material 3)
Template        : Android Studio — Navigation UI Activity
Navigation      : Compose Navigation (androidx.navigation.compose)
Architecture    : MVVM — ViewModel + StateFlow + Coroutines
Auth            : Firebase Authentication (Email/Password)
Database        : Cloud Firestore
Async           : Kotlin Coroutines + viewModelScope
Splash          : androidx.core:core-splashscreen
Min SDK         : 26 (Android 8.0)
```

---

## Setup Firebase

1. Buka Firebase Console → pilih project **Zarqa ERP** (project yang sama dengan web)
2. Project Settings → "Add app" → Android
3. Package name: `com.zarqa.erp` (sesuaikan dengan nama package project)
4. Download `google-services.json` → letakkan di folder `app/`
5. `build.gradle` (project level):
   ```groovy
   classpath 'com.google.gms:google-services:4.x.x'
   ```
6. `app/build.gradle`:
   ```groovy
   apply plugin: 'com.google.gms.google-services'

   dependencies {
       implementation platform('com.google.firebase:firebase-bom:33.x.x')
       implementation 'com.google.firebase:firebase-auth-ktx'
       implementation 'com.google.firebase:firebase-firestore-ktx'
   }
   ```

---

## Firestore Collections

```
users/{uid}
  name        : String
  email       : String
  role        : String   -- "kepala_cutting" | "kepala_jahit" | "kepala_steam"
                                | "admin_gudang" | "kepala_keluar"
  tipe_akun   : String   -- "permanent" | "temporary"

batch_produksi/{batchId}
  model_id         : String
  nama_model       : String
  nama_warna       : String?
  kode_hex_warna   : String?     -- contoh "#FF5733"
  detail_ukuran    : [{ukuran: String, jumlah_pcs: Int}]
  total_pcs        : Int
  status           : String      -- lihat StatusBatch
  dibuat_oleh      : String      -- uid admin
  catatan_admin    : String?
  penugasan        : {
    cutting?: {uid: String, nama: String}
    jahit?  : {uid: String, nama: String}
    steam?  : {uid: String, nama: String}
  }
  createdAt        : Timestamp
  updatedAt        : Timestamp

  riwayat_proses/{docId}         -- subcollection
    status_dari      : String
    status_ke        : String
    updated_by_uid   : String
    updated_by_nama  : String
    pcs_berhasil     : Int
    pcs_reject       : Int
    catatan          : String?
    timestamp        : Timestamp

stok_barang_jadi/{docId}
  model_id       : String
  nama_model     : String
  nama_warna     : String?
  kode_hex_warna : String?
  ukuran         : String        -- "S"|"M"|"L"|"XL"|"XXL"
  stok_tersedia  : Int
  total_masuk    : Int
  total_keluar   : Int
  updatedAt      : Timestamp

barang_keluar/{docId}
  model_id       : String
  nama_model     : String
  detail_keluar  : [{ukuran: String, jumlah_pcs: Int}]
  total_pcs      : Int
  tujuan         : String
  keterangan     : String?
  dicatat_oleh   : String        -- uid user
  tanggal_keluar : Timestamp
```

---

## StatusBatch — Enum & Pipeline

```kotlin
enum class StatusBatch(val label: String) {
    PENDING_CUTTING("Menunggu Cutting"),
    CUTTING_IN_PROGRESS("Sedang Cutting"),
    CUTTING_DONE("Cutting Selesai"),
    JAHIT_IN_PROGRESS("Sedang Jahit"),
    JAHIT_DONE("Jahit Selesai"),
    STEAM_IN_PROGRESS("Sedang Steam"),
    STEAM_DONE("Steam Selesai"),
    COMPLETED("Selesai")
}
```

```
PENDING_CUTTING
      ↓  [cutting mulai]
CUTTING_IN_PROGRESS
      ↓  [cutting selesai + input pcs]
CUTTING_DONE
      ↓  [jahit mulai]
JAHIT_IN_PROGRESS
      ↓  [jahit selesai + input pcs]
JAHIT_DONE
      ↓  [steam mulai]
STEAM_IN_PROGRESS
      ↓  [steam selesai + input pcs]
STEAM_DONE
      ↓  [admin web selesaikan → masuk stok barang jadi]
COMPLETED
```

---

## Alur Autentikasi

```kotlin
// SplashScreen — cek session
val user = FirebaseAuth.getInstance().currentUser
if (user != null) {
    val doc = Firebase.firestore.collection("users").document(user.uid).get().await()
    val role = doc.getString("role") ?: ""
    // → navigasi ke WorkerActivity, kirim role via Intent
} else {
    // → navigasi ke LoginScreen
}

// LoginScreen — proses login
FirebaseAuth.getInstance()
    .signInWithEmailAndPassword(email, password)
    .await()
// → ambil profil dari Firestore → navigasi ke WorkerActivity

// Logout
FirebaseAuth.getInstance().signOut()
// → kembali ke AuthActivity
```

---

## Activity Structure & Role Routing

```kotlin
// AndroidManifest.xml
// AuthActivity = launcher
// WorkerActivity = dibuka setelah login

// WorkerActivity.kt
val role = intent.getStringExtra("USER_ROLE") ?: ""

@Composable
fun WorkerRouter(role: String, userProfile: UserProfile) {
    when (role) {
        "kepala_cutting"             -> CuttingScreen(userProfile)
        "kepala_jahit"               -> JahitScreen(userProfile)
        "kepala_steam"               -> SteamScreen(userProfile)
        "admin_gudang", "kepala_keluar" -> AdminScreen(userProfile)
        else -> UnauthorizedScreen()
    }
}
```

---

## Operasi Firestore — Worker (Cutting / Jahit / Steam)

### Query batch yang relevan
```kotlin
// Cutting  → PENDING_CUTTING + CUTTING_IN_PROGRESS
// Jahit    → CUTTING_DONE + JAHIT_IN_PROGRESS
// Steam    → JAHIT_DONE + STEAM_IN_PROGRESS

Firebase.firestore.collection("batch_produksi")
    .whereIn("status", listOf("PENDING_CUTTING", "CUTTING_IN_PROGRESS"))
    .orderBy("createdAt", Query.Direction.DESCENDING)
    .get().await()
```

### Mulai proses (contoh: PENDING_CUTTING → CUTTING_IN_PROGRESS)
```kotlin
val ref = Firebase.firestore.collection("batch_produksi").document(batchId)

// Update status + penugasan
ref.update(mapOf(
    "status" to "CUTTING_IN_PROGRESS",
    "penugasan.cutting" to mapOf("uid" to uid, "nama" to nama),
    "updatedAt" to FieldValue.serverTimestamp()
)).await()

// Catat riwayat
ref.collection("riwayat_proses").add(mapOf(
    "status_dari"     to "PENDING_CUTTING",
    "status_ke"       to "CUTTING_IN_PROGRESS",
    "updated_by_uid"  to uid,
    "updated_by_nama" to nama,
    "pcs_berhasil"    to 0,
    "pcs_reject"      to 0,
    "timestamp"       to FieldValue.serverTimestamp()
)).await()
```

### Selesai proses (contoh: CUTTING_IN_PROGRESS → CUTTING_DONE)
```kotlin
val ref = Firebase.firestore.collection("batch_produksi").document(batchId)

ref.update(mapOf(
    "status"    to "CUTTING_DONE",
    "updatedAt" to FieldValue.serverTimestamp()
)).await()

ref.collection("riwayat_proses").add(mapOf(
    "status_dari"     to "CUTTING_IN_PROGRESS",
    "status_ke"       to "CUTTING_DONE",
    "updated_by_uid"  to uid,
    "updated_by_nama" to nama,
    "pcs_berhasil"    to pcsBerhasil,   // input dari user
    "pcs_reject"      to pcsReject,     // input dari user, boleh 0
    "catatan"         to catatan,       // nullable
    "timestamp"       to FieldValue.serverTimestamp()
)).await()
```

### Jahit & Steam — sama persis, ganti status & penugasan key:
| | Jahit | Steam |
|-|-------|-------|
| Status antri | CUTTING_DONE | JAHIT_DONE |
| Status aktif | JAHIT_IN_PROGRESS | STEAM_IN_PROGRESS |
| Status selesai | JAHIT_DONE | STEAM_DONE |
| Penugasan key | `penugasan.jahit` | `penugasan.steam` |

---

## Operasi Firestore — Admin (Catat Barang Keluar)

```kotlin
// 1. Tulis barang_keluar
Firebase.firestore.collection("barang_keluar").add(mapOf(
    "model_id"      to modelId,
    "nama_model"    to namaModel,
    "detail_keluar" to detailList.map {
        mapOf("ukuran" to it.ukuran, "jumlah_pcs" to it.jumlah)
    },
    "total_pcs"     to totalPcs,
    "tujuan"        to tujuan,
    "keterangan"    to keterangan,   // null jika kosong
    "dicatat_oleh"  to currentUid,
    "tanggal_keluar" to FieldValue.serverTimestamp()
)).await()

// 2. Kurangi stok per ukuran
for (detail in detailList) {
    Firebase.firestore.collection("stok_barang_jadi").document(stokId)
        .update(mapOf(
            "stok_tersedia" to FieldValue.increment(-detail.jumlah.toLong()),
            "total_keluar"  to FieldValue.increment(detail.jumlah.toLong())
        )).await()
}
```

---

## Struktur Project

```
app/src/main/java/com/zarqa/erp/
├── ui/
│   ├── auth/
│   │   ├── AuthActivity.kt          ← launcher, NavHost splash→login
│   │   ├── SplashScreen.kt          ← cek auth → navigate
│   │   └── LoginScreen.kt           ← form email + password
│   ├── worker/
│   │   ├── WorkerActivity.kt        ← menerima role dari intent
│   │   ├── WorkerRouter.kt          ← when(role) → screen
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
│   │       ├── AdminScreen.kt       ← TabRow: Stok | Catat Keluar
│   │       └── AdminViewModel.kt
│   └── common/
│       ├── BatchCard.kt             ← reusable kartu batch
│       ├── StatusChip.kt            ← chip warna per status
│       ├── WarnaChip.kt             ← dot warna baju + nama
│       └── EmptyScreen.kt
├── data/
│   ├── model/
│   │   ├── UserProfile.kt
│   │   ├── BatchProduksi.kt
│   │   ├── RiwayatProses.kt
│   │   ├── StokBarangJadi.kt
│   │   └── BarangKeluar.kt
│   └── repository/
│       ├── AuthRepository.kt
│       ├── BatchRepository.kt
│       └── BarangJadiRepository.kt
└── util/
    ├── StatusHelper.kt              ← warna & label per status
    └── DateFormatter.kt
```

---

## AndroidManifest.xml (penting)

```xml
<!-- AuthActivity sebagai launcher -->
<activity
    android:name=".ui.auth.AuthActivity"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
</activity>

<activity
    android:name=".ui.worker.WorkerActivity"
    android:exported="false" />
```

---

## Data Classes (cermin Firestore)

```kotlin
data class UserProfile(
    val uid: String = "",
    val name: String = "",
    val email: String = "",
    val role: String = ""
)

data class BatchProduksi(
    val id: String = "",
    val model_id: String = "",
    val nama_model: String = "",
    val nama_warna: String? = null,
    val kode_hex_warna: String? = null,
    val detail_ukuran: List<DetailUkuran> = emptyList(),
    val total_pcs: Int = 0,
    val status: String = "",
    val catatan_admin: String? = null,
    val penugasan: Penugasan? = null,
    val createdAt: Timestamp? = null,
    val updatedAt: Timestamp? = null
)

data class DetailUkuran(val ukuran: String = "", val jumlah_pcs: Int = 0)
data class Penugasan(
    val cutting: PenugasanWorker? = null,
    val jahit: PenugasanWorker? = null,
    val steam: PenugasanWorker? = null
)
data class PenugasanWorker(val uid: String = "", val nama: String = "")

data class StokBarangJadi(
    val id: String = "",
    val model_id: String = "",
    val nama_model: String = "",
    val nama_warna: String? = null,
    val kode_hex_warna: String? = null,
    val ukuran: String = "",
    val stok_tersedia: Int = 0,
    val total_masuk: Int = 0,
    val total_keluar: Int = 0
)
```

---

## Design Tokens

```kotlin
// Warna status chip — background & text
fun statusBgColor(status: String): Color = when (status) {
    "PENDING_CUTTING"     -> Color(0xFFE2E8F0)
    "CUTTING_IN_PROGRESS" -> Color(0xFFFED7AA)
    "CUTTING_DONE"        -> Color(0xFFFEF08A)
    "JAHIT_IN_PROGRESS"   -> Color(0xFFBFDBFE)
    "JAHIT_DONE"          -> Color(0xFF99F6E4)
    "STEAM_IN_PROGRESS"   -> Color(0xFFE9D5FF)
    "STEAM_DONE"          -> Color(0xFFA7F3D0)
    "COMPLETED"           -> Color(0xFFBBF7D0)
    else                  -> Color(0xFFF3F4F6)
}

fun statusTextColor(status: String): Color = when (status) {
    "PENDING_CUTTING"     -> Color(0xFF475569)
    "CUTTING_IN_PROGRESS" -> Color(0xFFC2410C)
    "CUTTING_DONE"        -> Color(0xFF854D0E)
    "JAHIT_IN_PROGRESS"   -> Color(0xFF1D4ED8)
    "JAHIT_DONE"          -> Color(0xFF0F766E)
    "STEAM_IN_PROGRESS"   -> Color(0xFF7E22CE)
    "STEAM_DONE"          -> Color(0xFF065F46)
    "COMPLETED"           -> Color(0xFF14532D)
    else                  -> Color(0xFF6B7280)
}

// Warna app
val Primary    = Color(0xFF1E40AF)   // biru tua
val Background = Color(0xFFF8FAFC)  // abu sangat muda
val CardRadius = 12.dp
val Padding    = 16.dp
```

---

## Passing Data Antar Activity

```kotlin
// Setelah login sukses — AuthActivity → WorkerActivity
val intent = Intent(this, WorkerActivity::class.java).apply {
    putExtra("USER_ROLE", role)
    putExtra("USER_NAME", userName)
    putExtra("USER_UID",  userUid)
}
startActivity(intent)
finish()  // tutup AuthActivity agar back button tidak kembali ke login

// WorkerActivity — baca
val role     = intent.getStringExtra("USER_ROLE") ?: ""
val userName = intent.getStringExtra("USER_NAME") ?: ""
val userUid  = intent.getStringExtra("USER_UID")  ?: ""
```

---

## Checklist Sebelum Release

- [ ] `google-services.json` ada di `app/`
- [ ] Firebase Auth Email/Password aktif di Console
- [ ] Firestore Security Rules sudah diperketat
- [ ] Semua role ditest: cutting, jahit, steam, admin_gudang
- [ ] Loading & error state di semua screen
- [ ] Dialog konfirmasi sebelum "Mulai"
- [ ] BottomSheet input pcs sebelum "Selesai"
- [ ] Logout redirect ke LoginScreen dengan benar
- [ ] Back button dari WorkerActivity tidak kembali ke login
- [ ] Tidak crash saat internet putus
