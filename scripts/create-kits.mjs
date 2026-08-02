import { readFileSync } from "node:fs";

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

const env = loadEnv(new URL("../.env", import.meta.url));
const domain = env.SHOPIFY_STORE_DOMAIN;
const token = env.API_ACESS_TOKEN;
const apiVersion = "2024-10";

if (!domain || !token) {
  console.error("Faltando SHOPIFY_STORE_DOMAIN ou API_ACESS_TOKEN no .env");
  process.exit(1);
}

const kits = [
  {
    title: "Kit Dupla em Órbita",
    body_html: "<p>Pra quem já sabe que um só não basta. 2 potes de BRIGZ.</p>",
    price: "54.90",
    units: "2 potes",
    image: "kit-dupla-em-orbita.webp",
  },
  {
    title: "Kit Missão em Grupo",
    body_html: "<p>Pra dividir com a tripulação. 4 potes de BRIGZ.</p>",
    price: "99.90",
    units: "4 potes",
    image: "kit-missao-em-grupo.webp",
  },
  {
    title: "Kit Base Abastecida",
    body_html: "<p>Pra nunca ficar sem BRIGZ na nave. 6 potes de BRIGZ.</p>",
    price: "139.90",
    units: "6 potes",
    image: "kit-base-abastecida.webp",
  },
];

for (const kit of kits) {
  const imagePath = new URL(`../assets/${kit.image}`, import.meta.url);
  const imageBase64 = readFileSync(imagePath).toString("base64");

  const response = await fetch(`https://${domain}/admin/api/${apiVersion}/products.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product: {
        title: kit.title,
        body_html: kit.body_html,
        vendor: "Brigz",
        product_type: "Kit",
        tags: ["kit", kit.units],
        status: "active",
        images: [{ attachment: imageBase64, filename: kit.image }],
        variants: [
          {
            price: kit.price,
            inventory_management: null,
          },
        ],
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`Erro criando "${kit.title}" (${response.status}):`, data);
    continue;
  }

  console.log(`Criado: ${data.product.title}`);
  console.log(`  ID: ${data.product.id}`);
  console.log(`  Admin: https://${domain}/admin/products/${data.product.id}`);
}
