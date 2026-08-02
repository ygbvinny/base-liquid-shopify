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

const variants = [
  { title: "Kit Dupla em Órbita (2un)", id: 51772238856487, weight: 0.65 },
  { title: "Kit Missão em Grupo (4un)", id: 51772238954791, weight: 1.20 },
  { title: "Kit Base Abastecida (6un)", id: 51772239053095, weight: 1.75 },
];

for (const v of variants) {
  const response = await fetch(`https://${domain}/admin/api/${apiVersion}/variants/${v.id}.json`, {
    method: "PUT",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      variant: {
        id: v.id,
        weight: v.weight,
        weight_unit: "kg",
        requires_shipping: true,
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`Erro atualizando ${v.title} (${response.status}):`, data);
    continue;
  }

  console.log(`${v.title} -> peso: ${data.variant.weight}${data.variant.weight_unit}, requires_shipping: ${data.variant.requires_shipping}`);
}
