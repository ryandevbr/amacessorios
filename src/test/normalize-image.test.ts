import { describe, expect, it, vi } from "vitest";
import { isHeicFile, normalizeImageFile } from "@/lib/normalize-image";

describe("normalizeImageFile (3-layer HEIC/HEIF conversion + mutex)", () => {
  it("detects HEIC/HEIF by MIME substring or file extension (case-insensitive)", () => {
    expect(isHeicFile(new File(["x"], "IMG_001.HEIC", { type: "" }))).toBe(true);
    expect(isHeicFile(new File(["x"], "foto.heif", { type: "application/octet-stream" }))).toBe(
      true,
    );
    expect(isHeicFile(new File(["x"], "sem-extensao", { type: "image/heic" }))).toBe(true);
    expect(isHeicFile(new File(["x"], "sem-extensao", { type: "image/heif-sequence" }))).toBe(true);
    expect(isHeicFile(new File(["x"], "foto.jpg", { type: "image/jpeg" }))).toBe(false);
    expect(isHeicFile(new File(["x"], "foto.webp", { type: "image/webp" }))).toBe(false);
  });

  it("returns non-HEIC files untouched without invoking native decode or heic-to", async () => {
    const jpg = new File(["jpg-data"], "produto.jpg", { type: "image/jpeg" });
    const nativeDecode = vi.fn();
    const heicToConvert = vi.fn();

    const result = await normalizeImageFile(jpg, { nativeDecode, heicToConvert });
    expect(result).toBe(jpg);
    expect(nativeDecode).not.toHaveBeenCalled();
    expect(heicToConvert).not.toHaveBeenCalled();
  });

  it("Layer 1: uses native browser/canvas decoding immediately and skips heic-to", async () => {
    const renamedJpeg = new File(["jpeg-bytes"], "DRIVE_PHOTO.HEIC", { type: "image/heic" });
    const nativeBlob = new Blob(["native-jpg"], { type: "image/jpeg" });
    const nativeDecode = vi.fn().mockResolvedValue(nativeBlob);
    const heicToConvert = vi.fn();

    const result = await normalizeImageFile(renamedJpeg, { nativeDecode, heicToConvert });
    expect(nativeDecode).toHaveBeenCalledWith(renamedJpeg);
    expect(heicToConvert).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(File);
    expect(result.name).toBe("DRIVE_PHOTO.jpg");
    expect(result.type).toBe("image/jpeg");
    expect(result.size).toBe(nativeBlob.size);
  });

  it("Layer 2: falls back to heic-to when native decoding returns null", async () => {
    const heic = new File(["heic-bytes"], "IMG_1234.HEIC", { type: "image/heic" });
    const nativeDecode = vi.fn().mockResolvedValue(null);
    const heicToConvert = vi
      .fn()
      .mockResolvedValue(new Blob(["wasm-jpeg"], { type: "image/jpeg" }));

    const result = await normalizeImageFile(heic, { nativeDecode, heicToConvert });
    expect(nativeDecode).toHaveBeenCalledWith(heic);
    expect(heicToConvert).toHaveBeenCalledWith({
      blob: heic,
      type: "image/jpeg",
      quality: 0.9,
    });
    expect(result).toBeInstanceOf(File);
    expect(result.name).toBe("IMG_1234.jpg");
    expect(result.type).toBe("image/jpeg");
  });

  it("serializes concurrent heic-to conversions via mutex (max concurrency = 1) and recovers after an error", async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];

    const heicToConvert = vi.fn(async ({ blob }: { blob: Blob; type: "image/jpeg"; quality?: number }) => {
      const name = blob instanceof File ? blob.name : "blob";
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(`start:${name}`);
      await new Promise((r) => setTimeout(r, 15));
      order.push(`end:${name}`);
      active -= 1;

      if (name === "corrupted.heic") {
        throw new Error("corrupt bitstream");
      }
      return new Blob([`jpg-${name}`], { type: "image/jpeg" });
    });

    const nativeDecode = vi.fn().mockResolvedValue(null);
    const f1 = new File(["1"], "first.heic", { type: "image/heic" });
    const f2 = new File(["2"], "corrupted.heic", { type: "image/heic" });
    const f3 = new File(["3"], "third.heif", { type: "image/heif" });

    const settled = await Promise.allSettled([
      normalizeImageFile(f1, { nativeDecode, heicToConvert }),
      normalizeImageFile(f2, { nativeDecode, heicToConvert }),
      normalizeImageFile(f3, { nativeDecode, heicToConvert }),
    ]);

    expect(maxActive).toBe(1);
    expect(order).toEqual([
      "start:first.heic",
      "end:first.heic",
      "start:corrupted.heic",
      "end:corrupted.heic",
      "start:third.heif",
      "end:third.heif",
    ]);

    expect(settled[0]?.status).toBe("fulfilled");
    if (settled[0]?.status === "fulfilled") {
      expect(settled[0].value.name).toBe("first.jpg");
      expect(settled[0].value.type).toBe("image/jpeg");
    }

    expect(settled[1]?.status).toBe("rejected");
    if (settled[1]?.status === "rejected") {
      expect(String(settled[1].reason)).toContain("Não foi possível converter a imagem HEIC/HEIF");
    }

    expect(settled[2]?.status).toBe("fulfilled");
    if (settled[2]?.status === "fulfilled") {
      expect(settled[2].value.name).toBe("third.jpg");
      expect(settled[2].value.type).toBe("image/jpeg");
    }
  });
});
