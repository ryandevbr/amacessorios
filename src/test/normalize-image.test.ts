import { describe, expect, it, vi } from "vitest";
import { isHeicFile, normalizeImageFile } from "@/lib/normalize-image";

describe("normalizeImageFile (HEIC/HEIF support)", () => {
  it("detects HEIC/HEIF by MIME type or file extension (case-insensitive)", () => {
    expect(isHeicFile(new File(["x"], "IMG_001.HEIC", { type: "" }))).toBe(true);
    expect(isHeicFile(new File(["x"], "foto.heif", { type: "application/octet-stream" }))).toBe(
      true,
    );
    expect(isHeicFile(new File(["x"], "sem-extensao", { type: "image/heic" }))).toBe(true);
    expect(isHeicFile(new File(["x"], "sem-extensao", { type: "image/heif" }))).toBe(true);
    expect(isHeicFile(new File(["x"], "foto.jpg", { type: "image/jpeg" }))).toBe(false);
    expect(isHeicFile(new File(["x"], "foto.webp", { type: "image/webp" }))).toBe(false);
  });

  it("returns non-HEIC files untouched without calling the converter", async () => {
    const jpg = new File(["jpg-data"], "produto.jpg", { type: "image/jpeg" });
    const converter = vi.fn();

    const result = await normalizeImageFile(jpg, converter);
    expect(result).toBe(jpg);
    expect(converter).not.toHaveBeenCalled();
  });

  it("converts HEIC file returning a single Blob into a .jpg File", async () => {
    const heic = new File(["heic-bytes"], "IMG_1234.HEIC", { type: "image/heic" });
    const converter = vi.fn().mockResolvedValue(new Blob(["jpeg-bytes"], { type: "image/jpeg" }));

    const result = await normalizeImageFile(heic, converter);
    expect(converter).toHaveBeenCalledWith({
      blob: heic,
      toType: "image/jpeg",
      quality: 0.9,
    });
    expect(result).toBeInstanceOf(File);
    expect(result.name).toBe("IMG_1234.jpg");
    expect(result.type).toBe("image/jpeg");
  });

  it("handles Blob[] returned by heic2any using the first frame", async () => {
    const heif = new File(["heif-bytes"], "live_photo.heif", { type: "image/heif" });
    const firstFrame = new Blob(["frame-1"], { type: "image/jpeg" });
    const secondFrame = new Blob(["frame-2"], { type: "image/jpeg" });
    const converter = vi.fn().mockResolvedValue([firstFrame, secondFrame]);

    const result = await normalizeImageFile(heif, converter);
    expect(result.name).toBe("live_photo.jpg");
    expect(result.type).toBe("image/jpeg");
    expect(result.size).toBe(firstFrame.size);
  });

  it("falls back gracefully when a .heic file already contains browser-readable JPEG bytes", async () => {
    const renamedJpeg = new File(["already-jpeg"], "foto.heic", { type: "" });
    const converter = vi.fn().mockRejectedValue({
      code: 1,
      message: "ERR_USER Image is already browser readable: image/jpeg",
    });

    const result = await normalizeImageFile(renamedJpeg, converter);
    expect(result.name).toBe("foto.jpg");
    expect(result.type).toBe("image/jpeg");
  });

  it("throws a clear Portuguese error when HEIC conversion genuinely fails", async () => {
    const broken = new File(["corrupted"], "quebrada.heic", { type: "image/heic" });
    const converter = vi.fn().mockRejectedValue(new Error("decode failed"));

    await expect(normalizeImageFile(broken, converter)).rejects.toThrow(
      "Não foi possível converter a imagem HEIC/HEIF para JPEG",
    );
  });
});
