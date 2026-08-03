import { resolveMasterProducts } from "../lib/server/resolve-master-products";

async function main() {
  const products = await resolveMasterProducts();
  const p = products.find(
    (x) => x.isin && String(x.underlying ?? "").toLowerCase().includes("nifty"),
  );
  console.log(
    JSON.stringify(
      {
        count: products.length,
        sample: p && { isin: p.isin, name: p.name, underlying: p.underlying },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
