const HEIC_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

const HEIC_EXT_RE = /\.(heic|heif)$/i;

export type HeicConverter = (options: {
  blob: Blob;
  toType?: string;
  quality?: number;
}) => Promise<Blob | Blob[]>;

export function isHeicFile(file: Pick<File, "name" | "type">): boolean {
  const mime = (file.type ?? "").trim().toLowerCase();
  if (HEIC_MIME_TYPES.has(mime)) return true;
  return HEIC_EXT_RE.test(file.name.trim().toLowerCase());
}

function toJpegFileName(originalName: string): string {
  const clean = originalName.trim();
  if (!clean) return "imagem.jpg";
  if (HEIC_EXT_RE.test(clean)) {
    return clean.replace(HEIC_EXT_RE, ".jpg");
  }
  return `${clean}.jpg`;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "";
}

export async function normalizeImageFile(
  file: File,
  converter?: HeicConverter,
): Promise<File> {
  if (!isHeicFile(file)) {
    return file;
  }

  const nextName = toJpegFileName(file.name);
  let converted: Blob | Blob[];

  try {
    const convert: HeicConverter =
      converter ??
      (await import("heic2any")).default;

    converted = await convert({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });
  } catch (err) {
    const rawMsg = extractErrorMessage(err);
    // Algumas fotos exportadas com extensão .heic já possuem conteúdo JPEG/PNG legível pelo navegador.
    if (/already browser readable/i.test(rawMsg)) {
      const detectedMime = /image\/[a-z0-9.+-]+/i.exec(rawMsg)?.[0]?.toLowerCase() ?? "image/jpeg";
      return new File([file], nextName, {
        type: detectedMime,
        lastModified: Date.now(),
      });
    }
    throw new Error(
      "Não foi possível converter a imagem HEIC/HEIF para JPEG. Tente novamente ou salve a foto em JPG.",
    );
  }

  const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
  if (!(jpegBlob instanceof Blob)) {
    throw new Error("Não foi possível converter a imagem HEIC/HEIF para JPEG.");
  }

  return new File([jpegBlob], nextName, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
