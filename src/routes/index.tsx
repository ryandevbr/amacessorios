import { createFileRoute } from "@tanstack/react-router";
import { Storefront } from "@/components/storefront";

// Atualize o domínio abaixo se o subdomínio na Vercel for diferente
const SITE_URL = "https://amacessorio.vercel.app";
const OG_IMAGE_URL = `${SITE_URL}/og-image.png`;
const OG_TITLE = "AM Acessórios e Makes | Catálogo Online e Loja Física";
const OG_DESCRIPTION =
  "Bijuterias, bolsas, cintos e maquiagens a partir de R$ 6. Monte sua sacola online e envie seu pedido direto pelo WhatsApp!";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AM Acessórios e Makes | Catálogo Online e Loja Física — Caruaru" },
      {
        name: "description",
        content:
          "Bijuterias, bolsas, cintos e maquiagens a partir de R$ 6. Monte sua sacola online e finalize pelo WhatsApp com retirada no Boa Vista (Caruaru-PE) ou entrega.",
      },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "AM Acessórios e Makes" },
      { property: "og:title", content: OG_TITLE },
      { property: "og:description", content: OG_DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:image", content: OG_IMAGE_URL },
      { property: "og:image:secure_url", content: OG_IMAGE_URL },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "AM Acessórios e Makes — Caruaru - PE" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: OG_TITLE },
      { name: "twitter:description", content: OG_DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE_URL },
    ],
  }),
  component: Storefront,
});
