export interface ProductCharacteristic {
  attribute: string;
  value: string;
}
export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  material: string;
  price: number;
  sale_price: number;
  is_on_sale: boolean;
  sale_label: string;
  image_url: string;
  description: string;
  active: boolean;
  featured: boolean;
  in_stock: boolean;
  characteristics: ProductCharacteristic[];
}
export interface Coupon {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  min_order_value: number;
  expires_at: string;
  active: boolean;
  allow_on_sale: boolean;
}
export interface Banner {
  id: string;
  image_url: string;
  mobile_image_url?: string | null;
  alt: string;
  active: boolean;
  filter: string;
  display_order?: number;
}
export interface StoreAnnouncement {
  active: boolean;
  text: string;
  link: string;
}
export type PromoCtaType = "vitrine" | "whatsapp";
export interface StorePromotion {
  promo_active: boolean;
  promo_badge: string;
  promo_title: string;
  promo_description: string;
  promo_highlight: string;
  promo_cta_label: string;
  promo_cta_type: PromoCtaType;
}
export interface StoreSettings extends StorePromotion {
  announcement_active: boolean;
  announcement_text: string;
  announcement_link: string;
}
export const defaultPromotion: StorePromotion = {
  promo_active: false,
  promo_badge: "CAMPANHA ESPECIAL",
  promo_title: "",
  promo_description: "",
  promo_highlight: "",
  promo_cta_label: "Aproveitar promoção",
  promo_cta_type: "vitrine",
};
export interface AdminProfile {
  name: string;
  email: string;
  avatar: string;
}
export interface StoreData {
  products: Product[];
  coupons: Coupon[];
  banners: Banner[];
  announcement: StoreAnnouncement;
  promotion: StorePromotion;
  profile: AdminProfile;
}
export const emptyStoreData: StoreData = {
  products: [],
  coupons: [],
  banners: [],
  announcement: { active: false, text: "", link: "#vitrine" },
  promotion: { ...defaultPromotion },
  profile: { name: "Administradora", email: "", avatar: "" },
};

export const DEFAULT_CATEGORIES = [
  "Brincos",
  "Colares",
  "Chokers",
  "Pulseiras",
  "Braceletes",
  "Anéis",
  "Conjuntos",
  "Piercing Fake",
  "Cintos",
  "Bolsas",
  "Maquiagens",
  "Acessórios de Cabelo",
  "Chapéus & Lenços",
  "Meia-calça",
] as const;

export const DEFAULT_MATERIALS = [
  "Bijuteria Fina",
  "Prata",
  "Couro",
  "Maquiagem",
  "Acessório",
] as const;

export const categoriesList: string[] = [...DEFAULT_CATEGORIES];
export const materialsList: string[] = [...DEFAULT_MATERIALS];

interface DemoProductSeed {
  name: string;
  category: (typeof DEFAULT_CATEGORIES)[number];
  material: (typeof DEFAULT_MATERIALS)[number];
  price: number;
  description: string;
  characteristics: ProductCharacteristic[];
}

const demoSeeds: DemoProductSeed[] = [
  {
    name: "Brinco Argola Orgânica Dourada",
    category: "Brincos",
    material: "Bijuteria Fina",
    price: 18.0,
    description:
      "Argola leve com acabamento polido e design moderno para iluminar suas produções do dia a dia ou eventos especiais.",
    characteristics: [
      { attribute: "Acabamento", value: "Dourado polido" },
      { attribute: "Fecho", value: "Click prático" },
      { attribute: "Estilo", value: "Versátil e moderno" },
    ],
  },
  {
    name: "Gloss Labial Brilho Espelhado",
    category: "Maquiagens",
    material: "Maquiagem",
    price: 12.0,
    description:
      "Gloss confortável com efeito espelhado e toque hidratante que realça os lábios sozinho ou sobre o seu batom favorito.",
    characteristics: [
      { attribute: "Acabamento", value: "Brilho espelhado" },
      { attribute: "Textura", value: "Leve e confortável" },
      { attribute: "Ocasião", value: "Dia a dia e noite" },
    ],
  },
  {
    name: "Bolsa Tiracolo Caramelo Estruturada",
    category: "Bolsas",
    material: "Couro",
    price: 89.9,
    description:
      "Bolsa prática e elegante com alça ajustável e acabamento sofisticado, ideal para levar o essencial com muito charme.",
    characteristics: [
      { attribute: "Cor", value: "Caramelo" },
      { attribute: "Alça", value: "Tiracolo ajustável" },
      { attribute: "Estilo", value: "Casual elegante" },
    ],
  },
  {
    name: "Colar Ponto de Luz em Prata",
    category: "Colares",
    material: "Prata",
    price: 49.9,
    description:
      "Colar delicado com pingente brilhante, perfeito para usar sozinho ou criar mix estilosos com chokers.",
    characteristics: [
      { attribute: "Material", value: "Prata" },
      { attribute: "Detalhe", value: "Ponto de luz" },
      { attribute: "Estilo", value: "Clássico delicado" },
    ],
  },
  {
    name: "Cinto Fivela Dourada Caramelo",
    category: "Cintos",
    material: "Couro",
    price: 39.9,
    description:
      "Cinto coringa com fivela dourada minimalista que marca a cintura e eleva vestidos, jeans e alfaiataria.",
    characteristics: [
      { attribute: "Cor", value: "Caramelo" },
      { attribute: "Fivela", value: "Metal dourado" },
      { attribute: "Ocasião", value: "Versátil" },
    ],
  },
  {
    name: "Piranha de Cabelo Fosca Latte",
    category: "Acessórios de Cabelo",
    material: "Acessório",
    price: 8.0,
    description:
      "Prendedor de cabelo com acabamento fosco suave e excelente fixação para penteados rápidos e estilosos.",
    characteristics: [
      { attribute: "Cor", value: "Bege Latte" },
      { attribute: "Acabamento", value: "Fosco suave" },
      { attribute: "Fixação", value: "Firme e confortável" },
    ],
  },
  {
    name: "Choker Fita Laminada Dourada",
    category: "Chokers",
    material: "Bijuteria Fina",
    price: 24.9,
    description:
      "Choker maleável com brilho espelhado que se ajusta suavemente ao pescoço e valoriza qualquer decote.",
    characteristics: [
      { attribute: "Acabamento", value: "Laminado dourado" },
      { attribute: "Estilo", value: "Chique contemporâneo" },
      { attribute: "Ocasião", value: "Dia e noite" },
    ],
  },
  {
    name: "Paleta de Sombras Tons Terrosos",
    category: "Maquiagens",
    material: "Maquiagem",
    price: 29.9,
    description:
      "Cores neutras e cintilantes fáceis de esfumar para criar desde uma make natural até um esfumado marcante.",
    characteristics: [
      { attribute: "Tons", value: "Terrosos e cintilantes" },
      { attribute: "Acabamento", value: "Matte e brilho" },
      { attribute: "Pigmentação", value: "Alta fixação" },
    ],
  },
  {
    name: "Piercing Fake Cravejado",
    category: "Piercing Fake",
    material: "Bijuteria Fina",
    price: 6.0,
    description:
      "Piercing de pressão super confortável que dispensa furo e traz um toque moderno imediato ao mix de orelha.",
    characteristics: [
      { attribute: "Encaixe", value: "Pressão confortável" },
      { attribute: "Detalhe", value: "Pedrinhas brilhantes" },
      { attribute: "Estilo", value: "Moderno" },
    ],
  },
  {
    name: "Anel Regulável Cravejado em Prata",
    category: "Anéis",
    material: "Prata",
    price: 44.9,
    description:
      "Anel delicado com aro ajustável e brilho sutil, pensado para usar sozinho ou combinado com outros anéis.",
    characteristics: [
      { attribute: "Material", value: "Prata" },
      { attribute: "Ajuste", value: "Regulável" },
      { attribute: "Acabamento", value: "Polido" },
    ],
  },
  {
    name: "Conjunto Colar e Brinco Gota",
    category: "Conjuntos",
    material: "Bijuteria Fina",
    price: 54.9,
    description:
      "Dupla harmoniosa com design em gota para finalizar o look com elegância sem esforço ou presentear alguém especial.",
    characteristics: [
      { attribute: "Composição", value: "Colar + par de brincos" },
      { attribute: "Formato", value: "Gota polida" },
      { attribute: "Ocasião", value: "Presente e eventos" },
    ],
  },
  {
    name: "Lenço Estampado Toque de Seda",
    category: "Chapéus & Lenços",
    material: "Acessório",
    price: 22.0,
    description:
      "Lenço leve e versátil para usar no cabelo, no pescoço ou amarrado na alça da bolsa dando charme instantâneo.",
    characteristics: [
      { attribute: "Toque", value: "Macio acetinado" },
      { attribute: "Uso", value: "Cabelo, pescoço ou bolsa" },
      { attribute: "Estilo", value: "Fashion versátil" },
    ],
  },
];

export const initialData: StoreData = {
  products: demoSeeds.map((seed, i) => ({
    id: `am-${i + 1}`,
    name: seed.name,
    sku: `AM${String(i + 1).padStart(3, "0")}`,
    category: seed.category,
    material: seed.material,
    price: seed.price,
    sale_price: Number((seed.price * 0.8).toFixed(2)),
    is_on_sale: [0, 4, 10].includes(i),
    sale_label: "",
    image_url: "/logo.png",
    description: seed.description,
    active: true,
    featured: i < 4,
    in_stock: i !== 9,
    characteristics: seed.characteristics,
  })),
  coupons: [
    {
      id: "first",
      code: "PRIMEIRACOMPRA",
      type: "percent",
      value: 10,
      min_order_value: 0,
      expires_at: "",
      active: true,
      allow_on_sale: false,
    },
    {
      id: "fixed",
      code: "AMMAKE15",
      type: "fixed",
      value: 15,
      min_order_value: 120,
      expires_at: "",
      active: true,
      allow_on_sale: true,
    },
  ],
  banners: [
    {
      id: "b1",
      image_url: "/logo.png",
      alt: "Banner AM Acessórios e Makes",
      active: true,
      filter: "",
    },
    {
      id: "b2",
      image_url: "/logo.png",
      alt: "Banner AM Acessórios e Makes",
      active: true,
      filter: "Maquiagens",
    },
    {
      id: "b3",
      image_url: "/logo.png",
      alt: "Banner AM Acessórios e Makes",
      active: true,
      filter: "Bijuteria Fina",
    },
  ],
  announcement: {
    active: true,
    text: "Acessórios & Makes a partir de R$ 6 ✨ Use o cupom PRIMEIRACOMPRA e ganhe 10% OFF",
    link: "#vitrine",
  },
  promotion: { ...defaultPromotion },
  profile: { name: "Administradora", email: "", avatar: "" },
};

export const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const priceOf = (p: Product) => (p.is_on_sale ? p.sale_price : p.price);
