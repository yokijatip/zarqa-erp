<script lang="ts" module>
  import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
  import PackageIcon from "@lucide/svelte/icons/package";
  import ShirtIcon from "@lucide/svelte/icons/shirt";
  import WalletIcon from "@lucide/svelte/icons/wallet";
  import UsersIcon from "@lucide/svelte/icons/users";
  import BarChartIcon from "@lucide/svelte/icons/bar-chart-2";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import HandbagIcon from "@lucide/svelte/icons/handbag";
  import FactoryIcon from "@lucide/svelte/icons/factory";
</script>

<script lang="ts">
  import NavMain from "./nav-main.svelte";
  import NavSecondary from "./nav-secondary.svelte";
  import NavUser from "./nav-user.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import {
    currentUser,
    isKaryawanManager,
    userRole,
  } from "$lib/stores/auth.store";
  import type { ComponentProps } from "svelte";

  let {
    ref = $bindable(null),
    ...restProps
  }: ComponentProps<typeof Sidebar.Root> = $props();

  const user = $derived({
    name: $currentUser?.name ?? "Admin",
    email: $currentUser?.email ?? "",
    avatar: $currentUser?.photoURL ?? "",
  });

  const allNavMain = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboardIcon,
      items: [],
    },
    {
      title: "Gudang",
      url: "/gudang",
      icon: PackageIcon,
      isActive: true,
      items: [
        { title: "Stok Kain", url: "/stok-kain" },
        { title: "Model Baju", url: "/model-baju" },
        { title: "Stok Potongan", url: "/stok-potongan" },
        { title: "Barang Jadi", url: "/barang-jadi" },
        { title: "Barang Keluar", url: "/barang-keluar" },
        { title: "Warna", url: "/warna" },
      ],
    },
    {
      title: "Produksi",
      url: "/monitor-produksi",
      icon: FactoryIcon,
      items: [
        { title: "Monitor Produksi", url: "/monitor-produksi" },
        { title: "Produksi Cutting", url: "/produksi/cutting" },
        { title: "Produksi Jahit", url: "/produksi/jahit" },
        { title: "Produksi Steam", url: "/produksi/steam" },
      ],
    },
    {
      title: "Karyawan",
      url: "/karyawan",
      icon: UsersIcon,
      items: [
        { title: "Data Karyawan", url: "/karyawan/data" },
        { title: "Absensi", url: "#", comingSoon: true },
        { title: "Penggajian", url: "/karyawan/penggajian" },
      ],
    },
    {
      title: "Penjualan",
      url: "/penjualan",
      icon: ShirtIcon,
      items: [
        { title: "Ringkasan Penjualan", url: "/penjualan" },
        { title: "Order Penjualan", url: "/penjualan/order" },
        { title: "Data Buyer", url: "/penjualan/buyer" },
        { title: "Retur", url: "/penjualan/retur" },
      ],
    },
    {
      title: "Keuangan",
      url: "/keuangan",
      icon: WalletIcon,
      items: [
        { title: "Ringkasan Keuangan", url: "/keuangan" },
        { title: "Pemasukan", url: "/keuangan?tipe=pemasukan" },
        { title: "Pengeluaran", url: "/keuangan?tipe=pengeluaran" },
      ],
    },
    {
      title: "Laporan",
      url: "/laporan",
      icon: BarChartIcon,
      items: [
        { title: "Ringkasan Laporan", url: "/laporan" },
        { title: "Laporan Keuangan", url: "/keuangan" },
        { title: "Laporan Gaji", url: "/karyawan/penggajian" },
      ],
    },
  ];

  const navSecondary = [
    {
      title: "Pengaturan",
      url: "/pengaturan",
      icon: SettingsIcon,
    },
  ];

  const navMain = $derived(
    allNavMain
      .filter((item) => {
        if (item.title === "Karyawan") return $isKaryawanManager;
        return true;
      })
      .map((item) => {
        if (item.title !== "Produksi") return item;
        const role = $userRole;
        const isAdminLike = [
          "admin_gudang",
          "admin_hr",
          "admin_keuangan",
          "owner",
          "developer",
        ].includes(role ?? "");
        const subitems = [
          ...(isAdminLike
            ? [{ title: "Monitor Produksi", url: "/monitor-produksi" }]
            : []),
          ...(role === "kepala_cutting" || isAdminLike
            ? [{ title: "Produksi Cutting", url: "/produksi/cutting" }]
            : []),
          ...(role === "kepala_jahit" || isAdminLike
            ? [{ title: "Produksi Jahit", url: "/produksi/jahit" }]
            : []),
          ...(role === "kepala_steam" || isAdminLike
            ? [{ title: "Produksi Steam", url: "/produksi/steam" }]
            : []),
        ];
        // Arahkan top-level klik ke halaman relevan per role
        const topUrl =
          role === "kepala_cutting"
            ? "/produksi/cutting"
            : role === "kepala_jahit"
              ? "/produksi/jahit"
              : role === "kepala_steam"
                ? "/produksi/steam"
                : "/monitor-produksi";
        return { ...item, url: topUrl, items: subitems };
      }),
  );
</script>

<Sidebar.Root bind:ref variant="inset" {...restProps}>
  <Sidebar.Header>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton size="lg">
          {#snippet child({ props })}
            <a href="/dashboard" {...props}>
              <div
                class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
              >
                <HandbagIcon class="size-4" />
              </div>
              <div class="grid flex-1 text-start text-sm leading-tight">
                <span class="truncate font-medium">Zarqa</span>
                <span class="truncate text-xs">Moeslim Fashion</span>
              </div>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Header>

  <Sidebar.Content>
    <NavMain items={navMain} />
    <NavSecondary items={navSecondary} class="mt-auto" />
  </Sidebar.Content>

  <Sidebar.Footer>
    <NavUser {user} />
  </Sidebar.Footer>
</Sidebar.Root>
