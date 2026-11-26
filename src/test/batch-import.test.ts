import { describe, expect, it, vi } from "vitest";
import {
  AUTO_DETECT_OPTION,
  BATCH_ITEM_DELAY_MS,
  parseBatchPrice,
  resolveBatchOption,
  runSequentialBatchImport,
  type BatchQueueItem,
} from "@/components/batch-import-dialog";
import type { Product } from "@/data/catalog";

function makeQueueItem(id: string, fileName: string, status: BatchQueueItem["status"] = "queued"): BatchQueueItem {
  return {
    id,
    file: new File(["img"], fileName, { type: "image/jpeg" }),
    previewUrl: `blob:${id}`,
    status,
    generatedName: "",
    resolvedCategory: "",
    resolvedMaterial: "",
    savedActive: true,
    error: "",
  };
}

describe("Batch import helpers and sequential runner", () => {
  it("parses Brazilian and standard decimal prices safely", () => {
    expect(parseBatchPrice("10,00")).toBe(10);
    expect(parseBatchPrice("19.95")).toBe(19.95);
    expect(parseBatchPrice("6")).toBe(6);
    expect(parseBatchPrice("0")).toBe(0);
    expect(parseBatchPrice("-12")).toBe(0);
    expect(parseBatchPrice("abc")).toBe(0);
  });

  it("overrides AI category/material when user selects fixed values and uses AI when auto-detect is selected", () => {
    const categories = ["Brincos", "Maquiagens", "Bolsas"];
    const materials = ["Bijuteria Fina", "Maquiagem", "Couro"];

    expect(resolveBatchOption("Brincos", "Maquiagens", categories, "Brincos")).toBe("Brincos");
    expect(resolveBatchOption(AUTO_DETECT_OPTION, "maquiagens", categories, "Brincos")).toBe(
      "Maquiagens",
    );
    expect(resolveBatchOption("Couro", "Maquiagem", materials, "Bijuteria Fina")).toBe("Couro");
    expect(resolveBatchOption(AUTO_DETECT_OPTION, "bijuteria fina", materials, "Bijuteria Fina")).toBe(
      "Bijuteria Fina",
    );
  });

  it("processes sequentially (1 at a time), waits 800ms between items, isolates failures and cleans orphan uploads", async () => {
    const items = [
      makeQueueItem("q1", "argola.jpg"),
      makeQueueItem("q2", "falha-ia.jpg"),
      makeQueueItem("q3", "falha-save.jpg"),
      makeQueueItem("q4", "gloss.jpg"),
    ];

    let inFlight = 0;
    let maxConcurrency = 0;
    const savedProducts: Product[] = [];
    const deletedUrls: string[] = [];
    const waitedDurations: number[] = [];
    const statusHistory: Record<string, BatchQueueItem["status"][]> = {};
    const finalItems = new Map(items.map((i) => [i.id, { ...i }]));

    const result = await runSequentialBatchImport({
      items,
      targetIds: items.map((i) => i.id),
      settings: {
        price: 10,
        selectedCategory: AUTO_DETECT_OPTION,
        selectedMaterial: "Bijuteria Fina",
        autoPublish: false,
      },
      availableCategories: ["Brincos", "Maquiagens"],
      availableMaterials: ["Bijuteria Fina", "Maquiagem"],
      onItemUpdate: (id, patch) => {
        const current = finalItems.get(id);
        if (current) {
          Object.assign(current, patch);
          if (patch.status) {
            statusHistory[id] = [...(statusHistory[id] ?? []), patch.status];
          }
        }
      },
      onProgress: () => {},
      deps: {
        createId: () => `prod-${savedProducts.length + 1}`,
        analyzeImage: async ({ file }) => {
          inFlight += 1;
          maxConcurrency = Math.max(maxConcurrency, inFlight);
          await Promise.resolve();
          inFlight -= 1;
          if (file.name === "falha-ia.jpg") {
            throw new Error("A IA está sobrecarregada no momento.");
          }
          return {
            name: file.name === "gloss.jpg" ? "Gloss Brilho" : "Brinco Argola",
            category: file.name === "gloss.jpg" ? "maquiagens" : "brincos",
            material: "Maquiagem",
            description: "Descrição gerada pela IA.",
            characteristics: [{ label: "Acabamento", value: "Polido" }],
          };
        },
        uploadImage: async (file) => ({
          url: `https://cdn.example/${file.name}`,
          original: 1000,
          compressed: 500,
          wasCompressed: true,
        }),
        deleteImage: async (url) => {
          deletedUrls.push(url);
        },
        saveProduct: async (product) => {
          if (product.image_url.includes("falha-save.jpg")) {
            throw new Error("Falha ao gravar no banco.");
          }
          savedProducts.push(product);
        },
        wait: async (ms) => {
          waitedDurations.push(ms);
        },
      },
    });

    expect(maxConcurrency).toBe(1);
    expect(waitedDurations).toEqual([
      BATCH_ITEM_DELAY_MS,
      BATCH_ITEM_DELAY_MS,
      BATCH_ITEM_DELAY_MS,
    ]);
    expect(result).toEqual({ succeeded: 2, failed: 2 });
    expect(savedProducts).toHaveLength(2);
    expect(deletedUrls).toEqual(["https://cdn.example/falha-save.jpg"]);

    // Verify fixed material override vs AI auto-detected category and product flags
    expect(savedProducts[0]).toMatchObject({
      name: "Brinco Argola",
      category: "Brincos",
      material: "Bijuteria Fina",
      price: 10,
      sale_price: 0,
      is_on_sale: false,
      active: false,
      featured: false,
      in_stock: true,
    });
    expect(savedProducts[1]).toMatchObject({
      name: "Gloss Brilho",
      category: "Maquiagens",
      material: "Bijuteria Fina",
      price: 10,
      active: false,
    });

    expect(statusHistory["q1"]).toEqual(["analyzing", "uploading", "saving", "done"]);
    expect(finalItems.get("q2")?.status).toBe("error");
    expect(finalItems.get("q2")?.error).toContain("sobrecarregada");
    expect(finalItems.get("q3")?.status).toBe("error");
    expect(finalItems.get("q4")?.status).toBe("done");
  });

  it("retries only failed items when targetIds contains failed ids", async () => {
    const items = [
      makeQueueItem("ok-1", "ja-foi.jpg", "done"),
      makeQueueItem("err-1", "tentar.jpg", "error"),
    ];
    const analyzeSpy = vi.fn().mockResolvedValue({
      name: "Cinto Dourado",
      category: "Cintos",
      material: "Couro",
      description: "Cinto elegante.",
      characteristics: [{ label: "Cor", value: "Caramelo" }],
    });
    const saveSpy = vi.fn().mockResolvedValue(undefined);

    const result = await runSequentialBatchImport({
      items,
      targetIds: ["err-1"],
      settings: {
        price: 25,
        selectedCategory: "Cintos",
        selectedMaterial: "Couro",
        autoPublish: true,
      },
      availableCategories: ["Cintos"],
      availableMaterials: ["Couro"],
      onItemUpdate: () => {},
      onProgress: () => {},
      deps: {
        analyzeImage: analyzeSpy,
        uploadImage: async () => ({
          url: "https://cdn.example/tentar.jpg",
          original: 1000,
          compressed: 400,
          wasCompressed: true,
        }),
        deleteImage: async () => {},
        saveProduct: saveSpy,
        wait: async () => {},
      },
    });

    expect(result).toEqual({ succeeded: 1, failed: 0 });
    expect(analyzeSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0]?.[0]).toMatchObject({
      name: "Cinto Dourado",
      active: true,
      price: 25,
    });
  });

  it("converts HEIC files before AI analysis and upload with 'converting' status", async () => {
    const heicFile = new File(["heic"], "IMG_9999.HEIC", { type: "image/heic" });
    const convertedFile = new File(["jpg"], "IMG_9999.jpg", { type: "image/jpeg" });
    const item: BatchQueueItem = {
      id: "heic-1",
      file: heicFile,
      previewUrl: "",
      status: "queued",
      generatedName: "",
      resolvedCategory: "",
      resolvedMaterial: "",
      savedActive: true,
      error: "",
    };

    const statuses: BatchQueueItem["status"][] = [];
    const analyzeSpy = vi.fn().mockResolvedValue({
      name: "Brinco Pérola",
      category: "Brincos",
      material: "Bijuteria Fina",
      description: "Brinco delicado.",
      characteristics: [{ label: "Cor", value: "Dourado" }],
    });
    const uploadSpy = vi.fn().mockResolvedValue({
      url: "https://cdn.example/IMG_9999.webp",
      original: 1000,
      compressed: 300,
      wasCompressed: true,
    });

    const result = await runSequentialBatchImport({
      items: [item],
      targetIds: ["heic-1"],
      settings: {
        price: 15,
        selectedCategory: "Brincos",
        selectedMaterial: "Bijuteria Fina",
        autoPublish: true,
      },
      availableCategories: ["Brincos"],
      availableMaterials: ["Bijuteria Fina"],
      onItemUpdate: (_id, patch) => {
        if (patch.status) statuses.push(patch.status);
      },
      onProgress: () => {},
      deps: {
        normalizeImage: vi.fn().mockResolvedValue(convertedFile),
        analyzeImage: analyzeSpy,
        uploadImage: uploadSpy,
        deleteImage: async () => {},
        saveProduct: async () => {},
        wait: async () => {},
      },
    });

    expect(result).toEqual({ succeeded: 1, failed: 0 });
    expect(statuses).toEqual(["converting", "analyzing", "uploading", "saving", "done"]);
    expect(analyzeSpy.mock.calls[0]?.[0]?.file).toBe(convertedFile);
    expect(uploadSpy.mock.calls[0]?.[0]).toBe(convertedFile);
  });
});
