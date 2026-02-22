# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Zarqa ERP Web — a production management system for a Moeslim fashion clothing manufacturer. Built with SvelteKit + Firebase. The system tracks the lifecycle of clothing production: fabric inventory → cutting → sewing → steaming → finished goods → outbound shipments.

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run preview      # Preview production build
npm run check        # Type-check with svelte-check
npm run check:watch  # Type-check in watch mode
```

No test runner is configured.

## Tech Stack

- **SvelteKit 2** with **Svelte 5** (uses runes: `$state`, `$derived`, `$effect`)
- **Tailwind CSS v4** (via `@tailwindcss/vite` plugin — no `tailwind.config.js`)
- **shadcn-svelte** components in `src/lib/components/ui/` (configured via `components.json`)
- **Firebase 12** — Firestore (database) + Auth
- **TypeScript** strict mode
- **bits-ui** for headless UI primitives

## Architecture

### Route Groups

```
src/routes/
├── (auth)/          # Login/register pages, no sidebar
│   ├── login/
│   └── register/
└── (dashboard)/     # All protected pages, uses sidebar layout
    ├── dashboard/
    ├── gudang/
    ├── stok-kain/
    ├── model-baju/[id]/
    ├── order-produksi/[id]/
    ├── monitor-produksi/
    ├── barang-jadi/
    └── barang-keluar/
```

The root `+layout.svelte` handles the auth guard — unauthenticated users are redirected to `/login`, authenticated users on `/login` are redirected to `/dashboard`.

### Firebase Layer (`src/lib/firebase/`)

One module per domain entity. All Firestore operations are isolated here:

| File | Domain |
|------|--------|
| `config.ts` | Firebase app init, exports `db` and `auth` |
| `auth.ts` | Login, logout, auth state listener, user profile |
| `stok-kain.ts` | Fabric inventory CRUD |
| `model-baju.ts` | Clothing model CRUD |
| `batch-produksi.ts` | Production batch lifecycle |
| `barang-jadi.ts` | Finished goods inventory |
| `barang-keluar.ts` | Outbound shipment logging |

### State Management (`src/lib/stores/`)

Svelte stores for global reactive state:
- `auth.store.ts` — current user + role derivation
- `batch.store.ts` — production batch state
- `stok-kain.store.ts` — fabric stock state

### Types (`src/lib/types/`)

All types exported from `src/lib/types/index.ts`. Key types:

- `UserRole`: `'admin_gudang' | 'kepala_cutting' | 'kepala_jahit' | 'kepala_steam' | 'kepala_keluar' | 'developer'`
- `StatusBatch`: production stage enum (`PENDING_CUTTING` → `CUTTING_IN_PROGRESS` → ... → `COMPLETED`)
- `StokKain`, `ModelBaju`, `BatchProduksi`, `BarangJadi`, `BarangKeluar`, `RiwayatProses`

### UI Components

shadcn-svelte components live in `src/lib/components/ui/`. Add new shadcn components via:
```bash
npx shadcn-svelte@latest add <component-name>
```

The `cn()` utility in `src/lib/utils.ts` merges Tailwind classes (wraps `clsx` + `tailwind-merge`).

## Environment Variables

Copy `.env.example` to `.env` and fill in Firebase credentials. All vars are prefixed with `PUBLIC_` so they are exposed to the browser via SvelteKit's public env handling.

```
PUBLIC_FIREBASE_API_KEY
PUBLIC_FIREBASE_AUTH_DOMAIN
PUBLIC_FIREBASE_PROJECT_ID
PUBLIC_FIREBASE_STORAGE_BUCKET
PUBLIC_FIREBASE_MESSAGING_SENDER_ID
PUBLIC_FIREBASE_APP_ID
```

## Naming Conventions

- Routes and Firestore collections use **Bahasa Indonesia** (e.g., `stok-kain`, `model-baju`, `barang-jadi`)
- TypeScript interfaces use English field names but domain terms remain Indonesian
- Component files: kebab-case `.svelte`; store/type files: kebab-case `.ts`
