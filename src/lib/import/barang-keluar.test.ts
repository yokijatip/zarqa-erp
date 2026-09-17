import { describe, expect, it } from "vitest";
import { parseBarangKeluarText, splitImportItemsByStock } from "./barang-keluar";
import type { ModelBaju, ModelHijab, StokBarangJadi, StokHijab } from "$lib/types";

const modelBaju: ModelBaju = {
  id: "luna-set",
  nama_model: "LUNA ZARQA SET HIJAB",
  stok_model_id: "luna",
  ukuran_tersedia: ["S/M"],
  warna_tersedia: [{ warna_id: "burgundy", nama_warna: "BURGUNDY", kode_hex: "#800020" }],
  varian_penjualan: [
    {
      id: "set-hijab",
      nama_varian: "SET HIJAB",
      komponen: [
        { tipe: "model_baju", ref_id: "luna", nama: "LUNA ZARQA", jumlah: 1, kelola_stok: true },
        { tipe: "aksesori", model_hijab_id: "hijab-model", nama: "PASHMINA TURKISH", jumlah: 1, kelola_stok: true },
      ],
      aktif: true,
    },
  ],
  aktif: true,
};

const modelHijab: ModelHijab = {
  id: "hijab-model",
  nama_hijab: "PASHMINA TURKISH",
  warna_tersedia: [{ warna_id: "burgundy", nama_warna: "BURGUNDY", kode_hex: "#800020" }],
  harga_jual: 25000,
  harga_produksi: 10000,
  aktif: true,
};

const stokBaju: StokBarangJadi[] = [
  {
    id: "luna-burgundy-sm",
    model_id: "luna",
    nama_model: "LUNA ZARQA",
    ukuran: "S/M",
    nama_warna: "BURGUNDY",
    stok_tersedia: 10,
    total_masuk: 10,
    total_keluar: 0,
  },
];

const stokHijab: StokHijab[] = [
  {
    id: "hijab-burgundy",
    model_hijab_id: "hijab-model",
    nama_hijab: "PASHMINA TURKISH",
    warna_id: "burgundy",
    nama_warna: "BURGUNDY",
    stok_tersedia: 10,
    total_masuk: 10,
    total_keluar: 0,
    satuan: "pcs",
  },
];

const stokHijabHitam: StokHijab = {
  id: "hijab-hitam",
  model_hijab_id: "hijab-model",
  nama_hijab: "PASHMINA TURKISH",
  warna_id: "hitam",
  nama_warna: "HITAM",
  stok_tersedia: 10,
  total_masuk: 10,
  total_keluar: 0,
  satuan: "pcs",
};

describe("import barang keluar dengan add-on hijab", () => {
  it("memilih model set yang lebih spesifik dan membawa stok hijab sesuai warna baju", () => {
    const parsed = parseBarangKeluarText(
      "LUNA ZARQA SET HIJAB BURGUNDY S/M 2 Pcs 2 Pcs",
      [modelBaju],
      stokBaju,
      [modelHijab],
      stokHijab,
    );

    expect(parsed.unmatched_lines).toEqual([]);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      model_id: "luna-set",
      stok_model_id: "luna",
      nama_model: "LUNA ZARQA SET HIJAB",
      nama_warna: "BURGUNDY",
      detail_keluar: [{ ukuran: "S/M", jumlah_pcs: 2 }],
    });
    expect(parsed.items[0].komponen_varian?.[1]).toMatchObject({
      tipe: "aksesori",
      stok_hijab_id: "hijab-burgundy",
      ref_id: "hijab-burgundy",
    });

    const items = splitImportItemsByStock(parsed.items, stokBaju, stokHijab);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: "keluar", total_pcs: 2 });
    expect(items[0].komponen_varian?.[1].stok_hijab_id).toBe("hijab-burgundy");
  });

  it("menjadikan hijab tanpa stok sebagai pending dan mempertahankan model hijab", () => {
    const parsed = parseBarangKeluarText(
      "PASHMINA TURKISH\nBURGUNDY ALL SIZE 3 Pcs 3 Pcs",
      [],
      [],
      [modelHijab],
      [],
    );

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      jenis_produk: "hijab",
      model_hijab_id: "hijab-model",
      nama_hijab: "PASHMINA TURKISH",
      pending_pcs: 0,
      total_pcs: 3,
    });

    const items = splitImportItemsByStock(parsed.items, [], []);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      jenis_produk: "hijab",
      model_hijab_id: "hijab-model",
      status: "pending",
      total_pcs: 3,
    });
  });

  it("memakai warna hijab tetap jika add-on dikunci ke stok tertentu", () => {
    const configuredComponent = modelBaju.varian_penjualan![0].komponen[1];
    const fixedModel: ModelBaju = {
      ...modelBaju,
      varian_penjualan: [{
        ...modelBaju.varian_penjualan![0],
        komponen: [
          modelBaju.varian_penjualan![0].komponen[0],
          { ...configuredComponent, ref_id: "hijab-hitam", stok_hijab_id: "hijab-hitam" },
        ],
      }],
    };
    const parsed = parseBarangKeluarText(
      "LUNA ZARQA SET HIJAB BURGUNDY S/M 1 Pcs 1 Pcs",
      [fixedModel],
      stokBaju,
      [modelHijab],
      [...stokHijab, stokHijabHitam],
    );

    expect(parsed.items[0].komponen_varian?.[1]).toMatchObject({
      stok_hijab_id: "hijab-hitam",
      ref_id: "hijab-hitam",
    });
    const items = splitImportItemsByStock(parsed.items, stokBaju, [...stokHijab, stokHijabHitam]);
    expect(items[0].status).toBe("keluar");
  });

  it("memakai harga custom varian per ukuran saat import", () => {
    const customModel: ModelBaju = {
      ...modelBaju,
      varian_penjualan: [{
        ...modelBaju.varian_penjualan![0],
        harga_jual_mode: "custom",
        harga_jual_per_ukuran: { "S/M": 123000 },
        harga_produksi_mode: "custom",
        harga_produksi_per_ukuran: { "S/M": 87000 },
      }],
    };
    const parsed = parseBarangKeluarText(
      "LUNA ZARQA SET HIJAB BURGUNDY S/M 1 Pcs 1 Pcs",
      [customModel],
      stokBaju,
      [modelHijab],
      stokHijab,
    );

    expect(parsed.items[0]).toMatchObject({
      varian_id: "set-hijab",
      nama_varian: "SET HIJAB",
      detail_keluar: [{ ukuran: "S/M", jumlah_pcs: 1, harga_jual: 123000, harga_produksi: 87000 }],
    });
  });
});
