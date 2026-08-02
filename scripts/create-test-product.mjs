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

const response = await fetch(`https://${domain}/admin/api/${apiVersion}/products.json`, {
  method: "POST",
  headers: {
    "X-Shopify-Access-Token": token,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    product: {
      title: "Produto Teste API",
      body_html: "<p>Produto criado via API para teste de integração.</p>",
      vendor: "Brigz",
      product_type: "Teste",
      status: "draft",
    },
  }),
});

const data = await response.json();

if (!response.ok) {
  console.error(`Erro ${response.status}:`, data);
  process.exit(1);
}

console.log("Produto criado com sucesso:");
console.log(`ID: ${data.product.id}`);
console.log(`Título: ${data.product.title}`);
console.log(`Status: ${data.product.status}`);
console.log(`Admin URL: https://${domain}/admin/products/${data.product.id}`);
