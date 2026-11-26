const HEIC_EXT_RE = /\.(heic|heif)$/i;

export type HeicToConverter = (args: {
  blob: Blob;
  type: "image/jpeg";
  quality?: number;
}) => Promise<Blob>;

export interface NormalizeImageDeps {
  nativeDecode?: (file: File) => Promise<Blob | null>;
  heicToConvert?: HeicToConverter;
}

let conversionQueue: Promise<void> = Promise.resolve();

function enqueueConversion<T>(task: () => Promise<T>): Promise<T> {
  const run = conversionQueue.then(task, task);
  conversionQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function isHeicFile(file: Pick<File, "name" | "type">): boolean {
  const mime = (file.type ?? "").trim().toLowerCase();
  if (mime.includes("heic") || mime.includes("heif")) return true;
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
  if (err instanceof Error) return err.message.trim();
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message).trim();
  }
  return "";
}

async function canvasToJpegBlob(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob | null> {
  if (typeof document === "undefined" || width <= 0 || height <= 0) {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob && blob.size > 0 ? blob : null), "image/jpeg", 0.92);
  });
}

async function tryDecodeWithBitmap(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function") return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    return await canvasToJpegBlob(bitmap, bitmap.width, bitmap.height);
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

async function tryDecodeWithHtmlImage(file: File): Promise<Blob | null> {
  if (
    typeof Image === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return null;
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("native image decode failed"));
      el.src = objectUrl;
    });
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    return await canvasToJpegBlob(img, width, height);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function tryNativeDecodeToJpeg(file: File): Promise<Blob | null> {
  const viaBitmap = await tryDecodeWithBitmap(file);
  if (viaBitmap) return viaBitmap;
  return tryDecodeWithHtmlImage(file);
}

export async function normalizeImageFile(
  file: File,
  deps?: NormalizeImageDeps,
): Promise<File> {
  // Camada 0 — Detecção: se não for HEIC/HEIF, retorna o arquivo original intacto
  if (!isHeicFile(file)) {
    return file;
  }

  const nextName = toJpegFileName(file.name);

  // Camada 1 — Decodificação nativa / arquivos renomeados (.HEIC que já são JPEG/WebP ou suporte nativo HEVC)
  const nativeDecoder = deps?.nativeDecode ?? tryNativeDecodeToJpeg;
  try {
    const nativeJpeg = await nativeDecoder(file);
    if (nativeJpeg instanceof Blob && nativeJpeg.size > 0) {
      return new File([nativeJpeg], nextName, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
    }
  } catch {
    // Segue para a Camada 2 (WASM heic-to)
  }

  // Camada 2 — Fila sequencial (Mutex) + heic-to para decodificar apenas 1 HEIC por vez
  let convertedBlob: Blob;
  try {
    convertedBlob = await enqueueConversion(async () => {
      const convert: HeicToConverter =
        deps?.heicToConvert ?? (await import("heic-to")).heicTo;
      return convert({
        blob: file,
        type: "image/jpeg",
        quality: 0.9,
      });
    });
  } catch (err) {
    const reason = extractErrorMessage(err);
    const suffix = reason ? ` (${reason.slice(0, 80)})` : "";
    throw new Error(
      `Não foi possível converter a imagem HEIC/HEIF para JPEG${suffix}. Verifique se o arquivo não está corrompido.`,
    );
  }

  if (!(convertedBlob instanceof Blob) || convertedBlob.size === 0) {
    throw new Error("Não foi possível converter a imagem HEIC/HEIF para JPEG.");
  }

  return new File([convertedBlob], nextName, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
