import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { money, type Product } from "@/data/catalog";
import { isHeicFile, normalizeImageFile } from "@/lib/normalize-image";
import { analyzeProductWithAi, type AiProductAnalysis } from "@/services/aiProductService";
import { mergeOptionValues, optionLookupKey } from "@/services/catalogOptionsService";
import {
  deleteStoreImage,
  uploadStoreImage,
  type UploadedStoreImage,
} from "@/services/storageService";

export const AUTO_DETECT_OPTION = "__AUTO__";
export const BATCH_ITEM_DELAY_MS = 800;

export type BatchItemStatus =
  | "converting"
  | "queued"
  | "analyzing"
  | "uploading"
  | "saving"
  | "done"
  | "error";

export interface BatchQueueItem {
  id: string;
  file: File;
  previewUrl: string;
  status: BatchItemStatus;
  generatedName: string;
  resolvedCategory: string;
  resolvedMaterial: string;
  savedActive: boolean;
  error: string;
}

export interface BatchImportSettings {
  price: number;
  selectedCategory: string;
  selectedMaterial: string;
  autoPublish: boolean;
}

export interface BatchImportRunnerDeps {
  normalizeImage: (file: File) => Promise<File>;
  analyzeImage: (params: {
    file: File;
    availableCategories: string[];
    availableMaterials: string[];
  }) => Promise<AiProductAnalysis>;
  uploadImage: (file: File) => Promise<UploadedStoreImage>;
  deleteImage: (url: string) => Promise<void>;
  saveProduct: (product: Product) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  createId: () => string;
}

export function parseBatchPrice(raw: string): number {
  const clean = raw.trim().replace(",", ".");
  const parsed = Number(clean);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100) / 100;
}

export function resolveBatchOption(
  selected: string,
  aiValue: string | undefined,
  available: string[],
  fallback: string,
): string {
  if (selected !== AUTO_DETECT_OPTION) {
    return selected;
  }
  if (aiValue) {
    const matched = available.find((opt) => optionLookupKey(opt) === optionLookupKey(aiValue));
    if (matched) return matched;
    if (aiValue.trim()) return aiValue.trim();
  }
  return available[0] ?? fallback;
}

function fallbackNameFromFile(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return withoutExt || "Produto importado";
}

function summarizeBatchError(err: unknown): string {
  const raw = err instanceof Error ? err.message.trim() : "";
  if (!raw) return "Falha inesperada ao processar a peça.";
  return raw.length > 140 ? `${raw.slice(0, 137)}...` : raw;
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runSequentialBatchImport(params: {
  items: BatchQueueItem[];
  targetIds: string[];
  settings: BatchImportSettings;
  availableCategories: string[];
  availableMaterials: string[];
  onItemUpdate: (id: string, patch: Partial<BatchQueueItem>) => void;
  onProgress: (current: number, total: number) => void;
  deps?: Partial<BatchImportRunnerDeps>;
}): Promise<{ succeeded: number; failed: number }> {
  const deps: BatchImportRunnerDeps = {
    normalizeImage: (file) => normalizeImageFile(file),
    analyzeImage: ({ file, availableCategories, availableMaterials }) =>
      analyzeProductWithAi({ file, availableCategories, availableMaterials }),
    uploadImage: (file) => uploadStoreImage(file, "products"),
    deleteImage: (url) => deleteStoreImage(url),
    saveProduct: async () => {},
    wait: waitMs,
    createId: () => crypto.randomUUID(),
    ...params.deps,
  };

  const targetSet = new Set(params.targetIds);
  const queue = params.items.filter((item) => targetSet.has(item.id));
  const total = queue.length;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < total; i += 1) {
    const item = queue[i];
    if (!item) continue;

    params.onProgress(i + 1, total);
    let uploadedUrl = "";

    try {
      let workingFile = item.file;
      if (isHeicFile(workingFile)) {
        params.onItemUpdate(item.id, { status: "converting", error: "" });
        workingFile = await deps.normalizeImage(workingFile);
        params.onItemUpdate(item.id, { file: workingFile });
      }

      params.onItemUpdate(item.id, { status: "analyzing", error: "" });
      const analysis = await deps.analyzeImage({
        file: workingFile,
        availableCategories: params.availableCategories,
        availableMaterials: params.availableMaterials,
      });

      const finalCategory = resolveBatchOption(
        params.settings.selectedCategory,
        analysis.category,
        params.availableCategories,
        "Brincos",
      );
      const finalMaterial = resolveBatchOption(
        params.settings.selectedMaterial,
        analysis.material,
        params.availableMaterials,
        "Bijuteria Fina",
      );
      const finalName = analysis.name.trim() || fallbackNameFromFile(workingFile.name);

      params.onItemUpdate(item.id, {
        status: "uploading",
        generatedName: finalName,
        resolvedCategory: finalCategory,
        resolvedMaterial: finalMaterial,
      });

      const uploaded = await deps.uploadImage(workingFile);
      uploadedUrl = uploaded.url;

      params.onItemUpdate(item.id, { status: "saving" });

      const product: Product = {
        id: deps.createId(),
        name: finalName,
        sku: "",
        category: finalCategory,
        material: finalMaterial,
        price: params.settings.price,
        sale_price: 0,
        is_on_sale: false,
        sale_label: "",
        image_url: uploaded.url,
        description: analysis.description.trim(),
        active: params.settings.autoPublish,
        featured: false,
        in_stock: true,
        characteristics: analysis.characteristics
          .map((c) => ({ attribute: c.label.trim(), value: c.value.trim() }))
          .filter((c) => c.attribute !== "" || c.value !== ""),
      };

      await deps.saveProduct(product);

      params.onItemUpdate(item.id, {
        status: "done",
        savedActive: params.settings.autoPublish,
        error: "",
      });
      succeeded += 1;
    } catch (err) {
      if (uploadedUrl) {
        void deps.deleteImage(uploadedUrl).catch(() => {});
      }
      params.onItemUpdate(item.id, {
        status: "error",
        error: summarizeBatchError(err),
      });
      failed += 1;
    }

    if (i < total - 1) {
      await deps.wait(BATCH_ITEM_DELAY_MS);
    }
  }

  return { succeeded, failed };
}

interface BatchImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  materials: string[];
  onSaveProduct: (product: Product) => Promise<void>;
  onBatchComplete: () => Promise<void>;
}

function StatusBadge({ item }: { item: BatchQueueItem }) {
  switch (item.status) {
    case "converting":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-accent/35 bg-secondary px-2.5 py-1 text-[10px] font-medium text-primary">
          <Loader2 size={11} className="animate-spin shrink-0" />
          Convertendo HEIC...
        </span>
      );
    case "queued":
      return (
        <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
          Na fila
        </span>
      );
    case "analyzing":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
          <Loader2 size={11} className="animate-spin shrink-0" />
          Analisando com IA...
        </span>
      );
    case "uploading":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-accent/35 bg-brand-accent/15 px-2.5 py-1 text-[10px] font-medium text-primary">
          <Loader2 size={11} className="animate-spin shrink-0" />
          Enviando foto...
        </span>
      );
    case "saving":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-accent/35 bg-brand-accent/15 px-2.5 py-1 text-[10px] font-medium text-primary">
          <Loader2 size={11} className="animate-spin shrink-0" />
          Salvando...
        </span>
      );
    case "done":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-600/12 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">
          {item.savedActive ? "Publicado ✓" : "Rascunho ✓"}
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[10px] font-semibold text-destructive">
          <AlertCircle size={11} className="shrink-0" />
          Falhou
        </span>
      );
  }
}

export function BatchImportDialog({
  open,
  onOpenChange,
  categories,
  materials,
  onSaveProduct,
  onBatchComplete,
}: BatchImportDialogProps) {
  const [priceInput, setPriceInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>(AUTO_DETECT_OPTION);
  const [selectedMaterial, setSelectedMaterial] = useState<string>(AUTO_DETECT_OPTION);
  const [autoPublish, setAutoPublish] = useState(true);
  const [items, setItems] = useState<BatchQueueItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [runProgress, setRunProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const priceInputRef = useRef<HTMLInputElement | null>(null);
  const stage3Ref = useRef<HTMLElement | null>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const batchSessionRef = useRef(0);

  const availableCategories = mergeOptionValues(categories);
  const availableMaterials = mergeOptionValues(materials);

  const revokeAllPreviews = () => {
    for (const url of previewUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    previewUrlsRef.current.clear();
  };

  const resetBatchState = () => {
    batchSessionRef.current += 1;
    revokeAllPreviews();
    setItems([]);
    setHasRun(false);
    setRunProgress({ current: 0, total: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    return () => {
      batchSessionRef.current += 1;
      revokeAllPreviews();
    };
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isRunning) return;
    if (!nextOpen) {
      resetBatchState();
      setPriceInput("");
      setSelectedCategory(AUTO_DETECT_OPTION);
      setSelectedMaterial(AUTO_DETECT_OPTION);
      setAutoPublish(true);
    }
    onOpenChange(nextOpen);
  };

  const convertPendingHeicItems = async (
    entries: Array<{ id: string; file: File }>,
    sessionId: number,
  ) => {
    for (const entry of entries) {
      if (sessionId !== batchSessionRef.current) return;
      try {
        const jpegFile = await normalizeImageFile(entry.file);
        if (sessionId !== batchSessionRef.current) return;

        const previewUrl = URL.createObjectURL(jpegFile);
        previewUrlsRef.current.add(previewUrl);

        let attached = false;
        setItems((prev) =>
          prev.map((row) => {
            if (row.id !== entry.id) return row;
            attached = true;
            return {
              ...row,
              file: jpegFile,
              previewUrl,
              status: "queued",
              error: "",
            };
          }),
        );
        if (!attached) {
          URL.revokeObjectURL(previewUrl);
          previewUrlsRef.current.delete(previewUrl);
        }
      } catch (err) {
        if (sessionId !== batchSessionRef.current) return;
        const message = summarizeBatchError(err);
        setItems((prev) =>
          prev.map((row) =>
            row.id === entry.id
              ? {
                  ...row,
                  status: "error",
                  error: message,
                }
              : row,
          ),
        );
      }
    }
  };

  const addFiles = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const validImages = incoming.filter(
      (file) => isHeicFile(file) || !file.type || file.type.startsWith("image/"),
    );
    const skipped = incoming.length - validImages.length;
    if (skipped > 0) {
      toast.error(
        skipped === 1
          ? "1 arquivo ignorado por não ser uma imagem."
          : `${skipped} arquivos ignorados por não serem imagens.`,
      );
    }
    if (validImages.length === 0) return;

    const heicToConvert: Array<{ id: string; file: File }> = [];
    const created: BatchQueueItem[] = validImages.map((file) => {
      const id = crypto.randomUUID();
      if (isHeicFile(file)) {
        heicToConvert.push({ id, file });
        return {
          id,
          file,
          previewUrl: "",
          status: "converting",
          generatedName: "",
          resolvedCategory: "",
          resolvedMaterial: "",
          savedActive: autoPublish,
          error: "",
        };
      }

      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      return {
        id,
        file,
        previewUrl,
        status: "queued",
        generatedName: "",
        resolvedCategory: "",
        resolvedMaterial: "",
        savedActive: autoPublish,
        error: "",
      };
    });

    setItems((prev) => [...prev, ...created]);

    if (heicToConvert.length > 0) {
      const sessionId = batchSessionRef.current;
      void convertPendingHeicItems(heicToConvert, sessionId);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (isRunning) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveItem = (id: string) => {
    if (isRunning) return;
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const parsedPrice = parseBatchPrice(priceInput);
  const convertingCount = items.filter((i) => i.status === "converting").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const queuedCount = items.filter((i) => i.status === "queued").length;

  const startProcessing = async (mode: "all" | "retry_failed") => {
    if (isRunning || convertingCount > 0) return;
    if (parsedPrice <= 0) {
      toast.error("Informe um preço único válido para o lote antes de iniciar.");
      priceInputRef.current?.focus();
      return;
    }

    const targets =
      mode === "retry_failed"
        ? items.filter((item) => item.status === "error")
        : items.filter((item) => item.status !== "done");

    if (targets.length === 0) {
      toast.error("Selecione ao menos uma foto para iniciar a importação.");
      return;
    }

    const targetIds = targets.map((item) => item.id);
    const targetSet = new Set(targetIds);

    setItems((prev) =>
      prev.map((item) =>
        targetSet.has(item.id)
          ? { ...item, status: "queued", error: "" }
          : item,
      ),
    );
    setIsRunning(true);
    setHasRun(true);
    setRunProgress({ current: 1, total: targets.length });

    setTimeout(() => {
      stage3Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);

    let batchSucceeded = 0;
    let batchFailed = 0;

    try {
      const result = await runSequentialBatchImport({
        items,
        targetIds,
        settings: {
          price: parsedPrice,
          selectedCategory,
          selectedMaterial,
          autoPublish,
        },
        availableCategories,
        availableMaterials,
        onItemUpdate: (id, patch) => {
          setItems((prev) =>
            prev.map((row) => {
              if (row.id !== id) return row;
              let nextPreview = row.previewUrl;
              if (patch.file && patch.file !== row.file && !isHeicFile(patch.file)) {
                if (row.previewUrl) {
                  URL.revokeObjectURL(row.previewUrl);
                  previewUrlsRef.current.delete(row.previewUrl);
                }
                nextPreview = URL.createObjectURL(patch.file);
                previewUrlsRef.current.add(nextPreview);
              }
              return { ...row, ...patch, previewUrl: nextPreview };
            }),
          );
        },
        onProgress: (current, total) => {
          setRunProgress({ current, total });
        },
        deps: {
          saveProduct: onSaveProduct,
        },
      });
      batchSucceeded = result.succeeded;
      batchFailed = result.failed;
    } finally {
      setIsRunning(false);
      try {
        await onBatchComplete();
      } catch {
        // Non-blocking: already reflected locally
      }
    }

    const totalItems = items.length;
    const totalSucceededNow =
      items.filter((i) => i.status === "done").length + batchSucceeded;

    if (batchFailed === 0 && totalSucceededNow > 0) {
      toast.success(
        `${totalSucceededNow} de ${totalItems} ${totalItems === 1 ? "produto importado" : "produtos importados"} com sucesso!`,
      );
    } else if (totalSucceededNow > 0) {
      toast.warning(
        `${totalSucceededNow} de ${totalItems} produtos importados com sucesso! ${batchFailed} ${batchFailed === 1 ? "item falhou" : "itens falharam"}.`,
      );
    } else {
      toast.error("Nenhuma peça foi importada. Confira os erros na fila e tente novamente.");
    }
  };

  const completedInRun = items.filter((i) => i.status === "done" || i.status === "error").length;
  const progressPercent = isRunning
    ? runProgress.total > 0
      ? Math.min(
          99,
          Math.round(((runProgress.current - 1) / runProgress.total) * 100) +
            Math.round(50 / runProgress.total),
        )
      : 0
    : items.length > 0
      ? Math.round((completedInRun / items.length) * 100)
      : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideCloseButton={isRunning}
        className="max-h-[92dvh] overflow-hidden flex flex-col w-[calc(100%-20px)] max-w-3xl p-0 gap-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (isRunning) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isRunning) e.preventDefault();
        }}
      >
        <div className="border-b px-5 sm:px-6 pt-5 pb-4 pr-14 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="font-display text-2xl sm:text-3xl leading-none">
              Importar em Lote (IA)
            </DialogTitle>
            {isRunning && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
                <Loader2 size={11} className="animate-spin" />
                Processando fila
              </span>
            )}
          </div>
          <DialogDescription className="text-xs mt-2">
            Selecione várias fotos com preço, categoria e material padrão para a IA preencher e
            publicar automaticamente na loja.
          </DialogDescription>
        </div>

        <div className="overflow-y-auto min-h-0 flex-1 px-5 sm:px-6 py-5 space-y-5">
          {/* Etapa 1 */}
          <section className="rounded-xl border bg-muted/35 p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                1
              </span>
              <div>
                <h3 className="text-lg sm:text-xl leading-tight text-foreground">
                  Configurações padrão do lote
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Aplicadas a todas as fotos enviadas neste lote.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <label>
                Preço único do lote (R$) *
                <input
                  ref={priceInputRef}
                  id="batch-price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  required
                  placeholder="Ex.: 10,00"
                  value={priceInput}
                  disabled={isRunning}
                  onChange={(e) => setPriceInput(e.target.value)}
                />
              </label>

              <label>
                Categoria do lote
                <select
                  id="batch-category"
                  value={selectedCategory}
                  disabled={isRunning}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value={AUTO_DETECT_OPTION}>Deixar a IA identificar por foto</option>
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Material / Linha do lote
                <select
                  id="batch-material"
                  value={selectedMaterial}
                  disabled={isRunning}
                  onChange={(e) => setSelectedMaterial(e.target.value)}
                >
                  <option value={AUTO_DETECT_OPTION}>Deixar a IA identificar por foto</option>
                  {availableMaterials.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3">
              <label
                htmlFor="batch-auto-publish"
                className="cursor-pointer gap-0.5 text-foreground"
              >
                <span className="text-xs sm:text-sm font-medium text-foreground">
                  Publicar automaticamente na vitrine após analisar
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {autoPublish
                    ? "Cada peça entra como ativa na vitrine assim que finalizada."
                    : "As peças serão salvas como inativas (rascunho) para revisão antes de publicar."}
                </span>
              </label>
              <Switch
                id="batch-auto-publish"
                checked={autoPublish}
                disabled={isRunning}
                onCheckedChange={setAutoPublish}
              />
            </div>
          </section>

          {/* Etapa 2 */}
          <section className="rounded-xl border bg-muted/35 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  2
                </span>
                <div>
                  <h3 className="text-lg sm:text-xl leading-tight text-foreground">
                    Seleção múltipla de fotos
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {items.length === 0
                      ? "Nenhuma imagem selecionada"
                      : `${items.length} ${items.length === 1 ? "imagem selecionada" : "imagens selecionadas"}${convertingCount > 0 ? ` · Convertendo ${convertingCount} HEIC...` : ""}`}
                  </p>
                </div>
              </div>
              {items.length > 0 && !isRunning && !hasRun && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                  onClick={resetBatchState}
                >
                  <Trash2 size={13} />
                  Limpar fotos
                </Button>
              )}
            </div>

            <label
              htmlFor="batch-file-input"
              onDragOver={(e) => {
                e.preventDefault();
                if (!isRunning) setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                isRunning
                  ? "cursor-not-allowed border-border bg-muted/40 opacity-60"
                  : isDragging
                    ? "cursor-pointer border-primary bg-primary/10"
                    : "cursor-pointer border-brand-accent/55 bg-background/85 hover:border-primary hover:bg-secondary/35"
              }`}
            >
              <input
                ref={fileInputRef}
                id="batch-file-input"
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                disabled={isRunning}
                onChange={handleFileInputChange}
                className="sr-only"
              />
              <span className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-primary">
                <ImagePlus size={20} />
              </span>
              <span className="text-sm font-medium text-foreground">
                {items.length === 0
                  ? "Selecionar fotos dos produtos"
                  : `${items.length} ${items.length === 1 ? "foto escolhida" : "fotos escolhidas"} — adicionar mais`}
              </span>
              <span className="text-[11px] text-muted-foreground">
                Toque para escolher da galeria ou arraste várias imagens de uma vez (JPG, PNG, WebP,
                HEIC/HEIF)
              </span>
            </label>

            {items.length > 0 && !hasRun && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                {items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="group relative overflow-hidden rounded-lg border bg-background"
                  >
                    {item.status === "converting" ? (
                      <div className="aspect-square w-full flex flex-col items-center justify-center gap-1.5 bg-secondary/50 px-2 text-center">
                        <Loader2 size={18} className="animate-spin text-primary" />
                        <span className="text-[10px] font-medium text-primary leading-tight">
                          Convertendo HEIC...
                        </span>
                      </div>
                    ) : item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div
                        className="aspect-square w-full flex flex-col items-center justify-center gap-1 bg-destructive/10 px-2 text-center text-destructive"
                        title={item.error}
                      >
                        <AlertCircle size={18} />
                        <span className="text-[10px] font-medium leading-tight">Erro HEIC</span>
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={isRunning}
                      aria-label={`Remover foto ${item.file.name}`}
                      onClick={() => handleRemoveItem(item.id)}
                      className="absolute top-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-foreground/80 text-background shadow-xs transition-colors hover:bg-destructive cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                    <div className="truncate bg-background/95 px-1.5 py-1 text-[10px] text-muted-foreground">
                      #{idx + 1} · {item.file.name}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Etapa 3 */}
          <section ref={stage3Ref} className="rounded-xl border bg-muted/35 p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                3
              </span>
              <div>
                <h3 className="text-lg sm:text-xl leading-tight text-foreground">
                  Fila de processamento e progresso
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Processamento sequencial (1 foto por vez) para respeitar os limites da IA.
                </p>
              </div>
            </div>

            {!hasRun && !isRunning ? (
              <div className="rounded-lg border border-dashed bg-background/70 px-4 py-4 text-xs text-muted-foreground leading-6">
                {convertingCount > 0 ? (
                  <p className="inline-flex items-center gap-2 text-primary font-medium">
                    <Loader2 size={14} className="animate-spin shrink-0" />
                    Convertendo {convertingCount}{" "}
                    {convertingCount === 1 ? "foto HEIC para JPEG" : "fotos HEIC para JPEG"} antes
                    de iniciar...
                  </p>
                ) : items.length > 0 ? (
                  <p>
                    <strong className="text-foreground">
                      {items.length} {items.length === 1 ? "peça pronta" : "peças prontas"}
                    </strong>{" "}
                    para análise com IA
                    {parsedPrice > 0 ? ` a ${money(parsedPrice)} cada` : " (informe o preço acima)"}
                    {" · "}
                    Categoria:{" "}
                    <strong className="text-foreground">
                      {selectedCategory === AUTO_DETECT_OPTION
                        ? "IA identifica"
                        : selectedCategory}
                    </strong>
                    {" · "}
                    Material:{" "}
                    <strong className="text-foreground">
                      {selectedMaterial === AUTO_DETECT_OPTION
                        ? "IA identifica"
                        : selectedMaterial}
                    </strong>
                    .
                  </p>
                ) : (
                  <p>
                    Defina o preço do lote na Etapa 1 e selecione as fotos na Etapa 2 para acompanhar
                    o progresso item a item aqui.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-foreground">
                      {isRunning
                        ? `Processando ${runProgress.current} de ${runProgress.total} ${runProgress.total === 1 ? "peça" : "peças"}...`
                        : `${doneCount} de ${items.length} ${items.length === 1 ? "produto importado" : "produtos importados"} com sucesso!`}
                    </span>
                    <span className="text-muted-foreground tabular-nums">{progressPercent}%</span>
                  </div>
                  <Progress value={progressPercent} />
                </div>

                {!isRunning && hasRun && (
                  <div
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-xs ${
                      errorCount === 0 && doneCount > 0
                        ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-900"
                        : doneCount > 0
                          ? "border-brand-accent/40 bg-secondary/70 text-foreground"
                          : "border-destructive/30 bg-destructive/10 text-destructive"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {errorCount === 0 && doneCount > 0 ? (
                        <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
                      ) : (
                        <AlertCircle size={16} className="shrink-0" />
                      )}
                      <span className="font-medium">
                        {errorCount === 0 && doneCount > 0
                          ? `${doneCount} de ${items.length} ${items.length === 1 ? "produto importado" : "produtos importados"} com sucesso!`
                          : doneCount > 0
                            ? `${doneCount} de ${items.length} produtos importados com sucesso! ${errorCount} ${errorCount === 1 ? "peça falhou" : "peças falharam"}.`
                            : `Não foi possível importar as peças (${errorCount} ${errorCount === 1 ? "falha" : "falhas"}).`}
                      </span>
                    </div>
                    {errorCount > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 border-primary/40 bg-background text-primary hover:bg-primary/10"
                        onClick={() => void startProcessing("retry_failed")}
                      >
                        <RotateCcw size={13} />
                        Tentar falhas novamente
                      </Button>
                    )}
                  </div>
                )}

                <div className="divide-y rounded-lg border bg-background overflow-hidden">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-2.5 sm:px-3.5 sm:py-3"
                    >
                      {item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt={item.generatedName || item.file.name}
                          className="h-12 w-12 shrink-0 rounded-md border bg-muted object-cover"
                        />
                      ) : (
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground">
                          {item.status === "converting" ? (
                            <Loader2 size={16} className="animate-spin text-primary" />
                          ) : item.status === "error" ? (
                            <AlertCircle size={16} className="text-destructive" />
                          ) : (
                            <ImagePlus size={16} />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs sm:text-sm font-medium text-foreground">
                          {item.generatedName || item.file.name}
                        </p>
                        {item.status === "error" ? (
                          <p className="mt-0.5 text-[11px] leading-snug text-destructive">
                            {item.error}
                          </p>
                        ) : item.resolvedCategory || item.resolvedMaterial ? (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {[item.resolvedCategory, item.resolvedMaterial]
                              .filter(Boolean)
                              .join(" · ")}
                            {parsedPrice > 0 ? ` · ${money(parsedPrice)}` : ""}
                          </p>
                        ) : (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {item.file.name}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        <StatusBadge item={item} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Sticky Footer */}
        <div className="border-t bg-background px-5 sm:px-6 py-3.5 shrink-0 flex flex-wrap items-center justify-between gap-3">
          {isRunning ? (
            <>
              <p className="text-[11px] text-muted-foreground">
                Aguarde a conclusão para evitar interromper a fila.
              </p>
              <Button type="button" disabled className="h-11 gap-2 ml-auto">
                <Loader2 size={15} className="animate-spin" />
                Processando {runProgress.current} de {runProgress.total}...
              </Button>
            </>
          ) : !hasRun ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="h-11 gap-2"
                disabled={items.length === 0 || convertingCount > 0}
                onClick={() => void startProcessing("all")}
              >
                {convertingCount > 0 ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Convertendo HEIC ({convertingCount})...
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    Iniciar importação ({items.length} {items.length === 1 ? "peça" : "peças"})
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {errorCount > 0 && (
                  <Button
                    type="button"
                    className="h-11 gap-2"
                    disabled={convertingCount > 0}
                    onClick={() => void startProcessing("retry_failed")}
                  >
                    <RotateCcw size={15} />
                    Tentar falhas novamente ({errorCount})
                  </Button>
                )}
                {queuedCount > 0 && (
                  <Button
                    type="button"
                    className="h-11 gap-2"
                    disabled={convertingCount > 0}
                    onClick={() => void startProcessing("all")}
                  >
                    <Sparkles size={15} />
                    Importar pendentes ({queuedCount})
                  </Button>
                )}
                <Button type="button" variant="outline" className="h-11" onClick={resetBatchState}>
                  Novo lote
                </Button>
              </div>
              <Button
                type="button"
                variant={errorCount > 0 ? "outline" : "default"}
                className="h-11 ml-auto"
                onClick={() => handleOpenChange(false)}
              >
                Concluir
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
