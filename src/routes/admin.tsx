import { createFileRoute } from "@tanstack/react-router";
import { AdminPanel } from "@/components/admin-panel";
export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administrar loja | AM Acessórios e Makes" },
      {
        name: "description",
        content: "Produtos, banners, cupons e perfil da AM Acessórios e Makes.",
      },
      { property: "og:title", content: "Administrar AM Acessórios e Makes" },
      { property: "og:description", content: "Painel de gestão da loja." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPanel,
});
