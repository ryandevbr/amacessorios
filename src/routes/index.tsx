import { createFileRoute } from "@tanstack/react-router";
import { Storefront } from "@/components/storefront";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AM Acessórios e Makes | Loja Online e Física — Caruaru" },
      {
        name: "description",
        content:
          "Acessórios, bijuterias, bolsas, cintos e maquiagens a partir de R$ 6. Monte sua sacola online, retire na Rua Paulista, 45 — Boa Vista, Caruaru - PE ou receba em casa.",
      },
      {
        property: "og:title",
        content: "AM Acessórios e Makes | Loja Online e Física — Caruaru",
      },
      {
        property: "og:description",
        content:
          "Acessórios e makes para transformar o seu look todos os dias. Retirada na loja física no bairro Boa Vista (Caruaru - PE) ou entrega pelo WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Storefront,
});
