/**
 * One-time fix: Finished Goods saved with an alter unit used to get BAG as their main unit.
 * This sets the main unit to PCS and keeps the alter unit (for example 1 BAG = 30 BOX).
 * Run once: npm run db:fix-fg-unit
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.inventoryItem.findMany({ where: { group: "Finished Goods", unit: "BAG" } });
  if (rows.length === 0) {
    console.log("No Finished Goods items with BAG as the main unit. Nothing to change.");
    return;
  }
  for (const row of rows) {
    await prisma.inventoryItem.update({
      where: { id: row.id },
      data: { unit: "PCS", convUnit: "BAG" },
    });
    const alter = row.altQty != null && row.altUnit ? `${row.unitQty} BAG = ${row.altQty} ${row.altUnit}` : "no alter unit";
    console.log(`${row.code} ${row.name}: main unit BAG -> PCS (alter unit kept: ${alter})`);
  }
  console.log(`${rows.length} item(s) updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
