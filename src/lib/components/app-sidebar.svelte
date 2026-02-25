<script lang="ts" module>
  import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
  import PackageIcon from "@lucide/svelte/icons/package";
  import ShirtIcon from "@lucide/svelte/icons/shirt";
  import TruckIcon from "@lucide/svelte/icons/truck";
  import WalletIcon from "@lucide/svelte/icons/wallet";
  import UsersIcon from "@lucide/svelte/icons/users";
  import BarChartIcon from "@lucide/svelte/icons/bar-chart-2";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import HandbagIcon from "@lucide/svelte/icons/handbag";
</script>

<script lang="ts">
  import NavMain from "./nav-main.svelte";
  import NavSecondary from "./nav-secondary.svelte";
  import NavUser from "./nav-user.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { currentUser, isGudangAccess, isKaryawanManager, isOwnerOrDev } from "$lib/stores/auth.store";
  import type { ComponentProps } from "svelte";

  let {
    ref = $bindable(null),
    ...restProps
  }: ComponentProps<typeof Sidebar.Root> = $props();

  const user = $derived({
    name: $currentUser?.name ?? "Admin",
    email: $currentUser?.email ?? "",
    avatar: "",
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
        { title: "Order Produksi", url: "/order-produksi" },
        { title: "Barang Jadi", url: "/barang-jadi" },
        { title: "Barang Keluar", url: "/barang-keluar" },
        { title: "Warna", url: "/warna" },
      ],
    },
    {
      title: "Karyawan",
      url: "/karyawan",
      icon: UsersIcon,
      items: [
        { title: "Data Karyawan", url: "/karyawan/data" },
        { title: "Absensi", url: "#", comingSoon: true },
        { title: "Penggajian", url: "#", comingSoon: true },
      ],
    },
    {
      title: "Penjualan",
      url: "#",
      icon: ShirtIcon,
      comingSoon: true,
      items: [
        { title: "Order Penjualan", url: "#" },
        { title: "Data Buyer", url: "#" },
        { title: "Retur", url: "#" },
      ],
    },
    {
      title: "Pengiriman",
      url: "#",
      icon: TruckIcon,
      comingSoon: true,
      items: [
        { title: "Jadwal Kirim", url: "#" },
        { title: "Tracking", url: "#" },
      ],
    },
    {
      title: "Keuangan",
      url: "#",
      icon: WalletIcon,
      comingSoon: true,
      items: [
        { title: "Pemasukan", url: "#" },
        { title: "Pengeluaran", url: "#" },
        { title: "Laporan Laba Rugi", url: "#" },
      ],
    },
    {
      title: "Laporan",
      url: "#",
      icon: BarChartIcon,
      comingSoon: true,
      items: [
        { title: "Laporan Produksi", url: "#" },
        { title: "Laporan Penjualan", url: "#" },
        { title: "Laporan Keuangan", url: "#" },
      ],
    },
  ];

  const navSecondary = [
    {
      title: "Pengaturan",
      url: "#",
      icon: SettingsIcon,
    },
  ];

  const navMain = $derived(
    allNavMain.filter((item) => {
      if (item.title === "Gudang")    return $isGudangAccess;
      if (item.title === "Karyawan")  return $isKaryawanManager;
      if (item.title === "Penjualan") return $isOwnerOrDev;
      if (item.title === "Pengiriman") return $isOwnerOrDev;
      if (item.title === "Keuangan")  return $isOwnerOrDev;
      if (item.title === "Laporan")   return $isOwnerOrDev;
      return true; // Dashboard selalu tampil
    })
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
