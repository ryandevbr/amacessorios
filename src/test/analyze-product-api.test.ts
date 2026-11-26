import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleAnalyzeProductRequest,
  parseAndNormalizeAiJson,
} from "@/server/analyze-product.server";

const SAMPLE_BASE64 = "UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=";

describe("POST /api/analyze-product multi-provider cascade", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env["VITE_SUPABASE_URL"];
    delete process.env["VITE_SUPABASE_ANON_KEY"];
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_ANON_KEY"];
    delete process.env["AI_PROVIDER_ORDER"];
    delete process.env["GROQ_API_KEY"];
    delete process.env["GROQ_MODEL"];
    delete process.env["GROQ_FALLBACK_MODELS"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["GEMINI_MODEL"];
    delete process.env["GEMINI_FALLBACK_MODELS"];
    delete process.env["OPENROUTER_API_KEY"];
    delete process.env["OPENROUTER_MODELS"];
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns 503 in Portuguese when no AI provider key is configured", async () => {
    const req = new Request("http://localhost/api/analyze-product", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageBase64: SAMPLE_BASE64, mimeType: "image/webp" }),
    });

    const res = await handleAnalyzeProductRequest(req);
    expect(res.status).toBe(503);
    const json = (await res.json()) as { code?: string; error?: string };
    expect(json.code).toBe("AI_NOT_CONFIGURED");
    expect(json.error).toContain("Nenhum provedor de IA");
  });

  it("returns 401 when Supabase is configured and Authorization header is missing", async () => {
    process.env["VITE_SUPABASE_URL"] = "https://example.supabase.co";
    process.env["VITE_SUPABASE_ANON_KEY"] = "anon-key";
    process.env["GROQ_API_KEY"] = "groq-test";

    const req = new Request("http://localhost/api/analyze-product", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageBase64: SAMPLE_BASE64, mimeType: "image/webp" }),
    });

    const res = await handleAnalyzeProductRequest(req);
    expect(res.status).toBe(401);
  });

  it("rejects private/loopback image URLs to prevent SSRF", async () => {
    process.env["GROQ_API_KEY"] = "groq-test";

    const req = new Request("http://localhost/api/analyze-product", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageUrl: "http://127.0.0.1/secret.png" }),
    });

    const res = await handleAnalyzeProductRequest(req);
    expect(res.status).toBe(400);
  });

  it("fails fast from default Groq model to Gemini 2.5 Flash fallback and returns meta", async () => {
    process.env["AI_PROVIDER_ORDER"] = "groq,gemini,openrouter";
    process.env["GROQ_API_KEY"] = "groq-test";
    process.env["GEMINI_API_KEY"] = "gemini-test";

    const fetchMock = vi
      .fn()
      // 1. Groq default model returns 503 with raw English error
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Service temporarily overloaded" } }), {
          status: 503,
        }),
      )
      // 2. Gemini primary returns 429
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Resource exhausted" } }), {
          status: 429,
        }),
      )
      // 3. Gemini default fallback (gemini-2.5-flash) succeeds with markdown-fenced JSON
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: [
                        "```json",
                        JSON.stringify({
                          name: "Gloss Labial Brilho Espelhado",
                          category: "maquiagens",
                          material: "maquiagem",
                          description:
                            "Gloss confortável com brilho espelhado para realçar os lábios em qualquer ocasião. Prático para levar na bolsa e retocar ao longo do dia.",
                          characteristics: [
                            { label: "Acabamento", value: "Brilho espelhado" },
                            { label: "Textura", value: "Leve e hidratante" },
                            { label: "Ocasião", value: "Dia a dia e noite" },
                          ],
                        }),
                        "```",
                      ].join("\n"),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    globalThis.fetch = fetchMock;

    const req = new Request("http://localhost/api/analyze-product", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imageBase64: SAMPLE_BASE64,
        mimeType: "image/webp",
        availableCategories: ["Brincos", "Maquiagens", "Bolsas"],
        availableMaterials: ["Bijuteria Fina", "Maquiagem", "Couro"],
      }),
    });

    const res = await handleAnalyzeProductRequest(req);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const groqBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      model?: string;
    };
    expect(groqBody.model).toBe("qwen/qwen3.8-27b");

    const json = (await res.json()) as {
      data: {
        name: string;
        category: string;
        material: string;
        characteristics: { label: string; value: string }[];
      };
      meta: { provider: string; model: string };
    };
    expect(json.data.name).toBe("Gloss Labial Brilho Espelhado");
    expect(json.data.category).toBe("Maquiagens");
    expect(json.data.material).toBe("Maquiagem");
    expect(json.data.characteristics).toHaveLength(3);
    expect(json.meta).toEqual({ provider: "gemini", model: "gemini-2.5-flash" });
  });

  it("never leaks raw English error when all providers fail with 503/429", async () => {
    process.env["GROQ_API_KEY"] = "groq-test";
    process.env["OPENROUTER_API_KEY"] = "or-test";
    process.env["OPENROUTER_MODELS"] = "vision/free-model";

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "This model is currently experiencing high demand" } }),
        {
          status: 503,
        },
      ),
    );

    const req = new Request("http://localhost/api/analyze-product", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imageBase64: SAMPLE_BASE64,
        mimeType: "image/webp",
        availableCategories: ["Brincos"],
        availableMaterials: ["Bijuteria Fina"],
      }),
    });

    const res = await handleAnalyzeProductRequest(req);
    expect(res.status).toBe(503);
    const json = (await res.json()) as { code?: string; error?: string };
    expect(json.code).toBe("AI_OVERLOADED");
    expect(json.error).toBe(
      "A IA está sobrecarregada no momento. Aguarde alguns segundos e toque novamente em 'Preencher detalhes com IA', ou preencha os campos manualmente.",
    );
    expect(json.error).not.toContain("high demand");
  });

  it("falls back safely to the first valid category/material when AI returns out-of-list values", () => {
    const parsed = parseAndNormalizeAiJson(
      '```json\n{"name":"Colar Luz","category":"Inexistente","material":"Ouro Maciço","description":"Brilho delicado.","characteristics":[{"label":"Cor","value":"Dourado"}]}\n```',
      ["Colares", "Brincos"],
      ["Bijuteria Fina", "Prata"],
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.category).toBe("Colares");
    expect(parsed?.material).toBe("Bijuteria Fina");
  });
});
