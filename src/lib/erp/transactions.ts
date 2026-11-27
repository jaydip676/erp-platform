import { Prisma } from "@prisma/client";
import { todayISO } from "@/lib/dates";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { ApiError, parseISODate } from "@/lib/api-route";
import { addLedger, r4, departmentItemTotal, productBalance, rawMaterialBalance, storeItemBalance } from "@/lib/erp/stock";
import { DEPARTMENTS, PROCESS_FLOW, WIP_DEPARTMENTS, type Stage } from "@/lib/erp/flow";
import { allowedConsumedKg, maxConsumedKg } from "@/lib/erp/extrusion-limit";
import { getSetting } from "@/lib/erp/settings";
import type { User } from "@prisma/client";
import { reverseVoucherTx } from "@/lib/erp/voucher-reverse";
import { STORE_GROUPS, drawInOrder, finalGroup, formulaTag, masterGroup } from "@/lib/erp/codes";

type Tx = Prisma.TransactionClient;

function stamp(d = new Date(todayISO() + "T00:00:00.000Z")) {
  const y = d.getUTCFullYear() % 100;
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function nextNo(tx: Tx, kind: "voucher" | "batch", prefix: string, on?: Date) {
  const start = `${prefix}-${stamp(on)}-`;
  const rows =
    kind === "voucher"
      ? await tx.voucher.findMany({ where: { voucherNo: { startsWith: start } }, select: { voucherNo: true } })
      : await tx.batch.findMany({ where: { batchNo: { startsWith: start } }, select: { batchNo: true } });
  let max = 0;
  for (const row of rows) {
    const no = "voucherNo" in row ? row.voucherNo : row.batchNo;
    const n = Number(no.slice(-4));
    if (n > max) max = n;
  }
  return `${start}${String(max + 1).padStart(4, "0")}`;
}

// Departments almost never change, so each is looked up once and remembered for a while.
const deptCache = new Map<string, { d: Awaited<ReturnType<typeof prisma.department.findFirst>> & object; exp: number }>();
export async function deptByCode(code: string) {
  const hit = deptCache.get(code);
  if (hit && hit.exp > Date.now()) return hit.d;
  const found = await prisma.department.findFirst({ where: { code } });
  if (found) {
    deptCache.set(code, { d: found, exp: Date.now() + 10 * 60_000 });
    return found;
  }
  const d = found;
  if (d) return d;
  // A known department that the database does not have yet (seed not run): create it.
  const known = DEPARTMENTS.find(([c]) => c === code);
  if (!known) throw new ApiError("Invalid department");
  try {
    return await prisma.department.create({ data: { code, name: known[1] } });
  } catch {
    const again = await prisma.department.findFirst({ where: { code } });
    if (again) return again;
    throw new ApiError("Invalid department");
  }
}

export async function postPurchase(
  user: User,
  body: { material_id: number; quantity_kg: number; date: string; reference?: string },
) {
  const m = await prisma.rawMaterial.findUnique({ where: { id: body.material_id } });
  if (!m) throw new ApiError("Material not found", 404);
  const voucherDate = parseISODate(body.date);
  const raw = await deptByCode("RAW");

  return prisma.$transaction(async (tx) => {
    const v = await tx.voucher.create({
      data: {
        voucherNo: await nextNo(tx, "voucher", "PUR"),
        voucherType: "PURCHASE",
        voucherDate,
        inputQty: body.quantity_kg,
        notes: body.reference ?? null,
        createdBy: user.id,
      },
    });
    await addLedger(tx, v.id, "RAW", m.id, raw.id, {
      qtyIn: body.quantity_kg,
      unit: "KG",
    });
    return { voucher_no: v.voucherNo, message: "Purchase stock posted" };
  });
}

export async function postStorePurchase(
  user: User,
  body: { store_item_id: number; quantity: number; date: string; reference?: string },
) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: body.store_item_id, group: { in: STORE_GROUPS }, active: true },
  });
  if (!item) throw new ApiError("Store item not found", 404);
  const voucherDate = parseISODate(body.date);
  const store = await deptByCode("STORE");

  return prisma.$transaction(async (tx) => {
    const v = await tx.voucher.create({
      data: {
        voucherNo: await nextNo(tx, "voucher", "SPU"),
        voucherType: "STORE_PURCHASE",
        voucherDate,
        departmentId: store.id,
        inputQty: body.quantity,
        notes: body.reference ?? null,
        createdBy: user.id,
      },
    });
    await addLedger(tx, v.id, "STORE", item.id, store.id, { qtyIn: body.quantity, unit: item.unit });
    return { voucher_no: v.voucherNo, message: "Store receipt posted", item: item.name, unit: item.unit };
  });
}

export async function postMasterBatch(
  user: User,
  body: { date: string; formula_id?: number | null; items: { material_id: number; kg: number }[] },
) {
  const total = r4(body.items.reduce((s, i) => s + i.kg, 0));
  if (total <= 0) throw new ApiError("Batch weight must be positive");

  const voucherDate = parseISODate(body.date);
  const raw = await deptByCode("RAW");
  const master = await deptByCode("MASTER");

  // Batch number: MB-<formula>-<YYMMDD>-<0001>. A manual mix uses MN as the formula part.
  let tag = "MN";
  if (body.formula_id) {
    const recipe = await prisma.recipe.findUnique({ where: { id: body.formula_id } });
    if (!recipe) throw new ApiError("Formula not found", 404);
    tag = formulaTag(recipe);
  }

  return prisma.$transaction(async (tx) => {
    const active = await tx.batch.findFirst({
      where: { batchType: "MASTER", status: "MIXING" },
    });
    if (active) throw new ApiError(`Master mixing ${active.batchNo} is still in progress.`, 409);

    const need = new Map<number, number>();
    for (const i of body.items) need.set(i.material_id, (need.get(i.material_id) ?? 0) + i.kg);
    for (const [materialId, kg] of need) {
      const m = await tx.rawMaterial.findUnique({ where: { id: materialId } });
      const bal = await rawMaterialBalance(tx, materialId);
      if (!m || bal + 0.0005 < kg) throw new ApiError(`Raw material stock insufficient: ${m?.code ?? materialId}`);
    }

    const b = await tx.batch.create({
      data: {
        batchNo: await nextNo(tx, "batch", `MB-${tag}`, voucherDate),
        batchType: "MASTER",
        totalKg: total,
        availableKg: total,
        status: "READY",
      },
    });
    const v = await tx.voucher.create({
      data: {
        voucherNo: await nextNo(tx, "voucher", "MBV"),
        voucherType: "MASTER_BATCH",
        voucherDate,
        batchId: b.id,
        consumedKg: total,
        createdBy: user.id,
      },
    });
    for (const i of body.items) {
      await addLedger(tx, v.id, "RAW", i.material_id, raw.id, { qtyOut: i.kg, unit: "KG" });
    }
    await addLedger(tx, v.id, "BATCH", b.id, master.id, { qtyIn: total, unit: "KG" });
    return { batch_no: b.batchNo, total_kg: total, status: b.status };
  });
}

export async function postFinalBatch(
  user: User,
  body: {
    date: string;
    master_group: string;
    master_kg: number;
    formula_id?: number | null;
    additional_items: { material_id: number; kg: number }[];
  },
) {
  const add = r4(body.additional_items.reduce((s, i) => s + i.kg, 0));
  const total = r4(body.master_kg + add);
  const voucherDate = parseISODate(body.date);
  // Batch number: FB-<final formula>-<master group>-<YYMMDD>-<0001>, e.g. FB-V2-MB-MASTERV2-261123-0001.
  let finalTag = "MN";
  if (body.formula_id) {
    const recipe = await prisma.recipe.findUnique({ where: { id: body.formula_id } });
    if (!recipe) throw new ApiError("Formula not found", 404);
    finalTag = formulaTag(recipe);
  }
  const md = await deptByCode("MASTER");
  const fd = await deptByCode("FINAL");
  const rd = await deptByCode("RAW");

  return prisma.$transaction(async (tx) => {
    // Every ready batch of the group, oldest first (MB-V2-...-0001 before 0002).
    const ready = await tx.batch.findMany({
      where: { batchType: "MASTER", status: "READY", availableKg: { gt: 0 } },
      orderBy: { id: "asc" },
    });
    const pool = ready.filter((b) => masterGroup(b.batchNo) === body.master_group);
    if (pool.length === 0) throw new ApiError(`No ready ${body.master_group} master batch`);
    const have = pool.reduce((sum, b) => sum + Number(b.availableKg), 0);
    if (have + 0.0005 < body.master_kg) throw new ApiError(`${body.master_group} has only ${Number(have.toFixed(3))} KG left`);

    const need = new Map<number, number>();
    for (const i of body.additional_items) need.set(i.material_id, (need.get(i.material_id) ?? 0) + i.kg);
    for (const [materialId, kg] of need) {
      const bal = await rawMaterialBalance(tx, materialId);
      if (bal + 0.0005 < kg) throw new ApiError(`Additional material stock insufficient: ${materialId}`);
    }

    // Use up the first batch, then the next, until the KG is covered.
    const draws: { batch: (typeof pool)[number]; kg: number }[] = [];
    let remaining = body.master_kg;
    for (const batch of pool) {
      if (remaining <= 0.0000001) break;
      const take = Math.min(remaining, Number(batch.availableKg));
      if (take > 0) draws.push({ batch, kg: Number(take.toFixed(3)) });
      remaining -= take;
    }

    const b = await tx.batch.create({
      data: {
        batchNo: await nextNo(tx, "batch", `FB-${finalTag}-${body.master_group}`, voucherDate),
        batchType: "FINAL",
        parentBatchId: draws[0].batch.id,
        totalKg: total,
        availableKg: total,
        status: "READY",
      },
    });
    const v = await tx.voucher.create({
      data: {
        voucherNo: await nextNo(tx, "voucher", "FBV"),
        voucherType: "FINAL_BATCH",
        voucherDate,
        batchId: b.id,
        consumedKg: total,
        notes: `From ${draws.map((d) => `${d.batch.batchNo} (${d.kg} KG)`).join(", ")}`,
        createdBy: user.id,
      },
    });
    for (const d of draws) {
      const left = r4(Math.max(Number(d.batch.availableKg) - d.kg, 0));
      await tx.batch.update({
        where: { id: d.batch.id },
        data: { availableKg: left, status: left <= 0.0005 ? "CONSUMED" : "READY" },
      });
      await addLedger(tx, v.id, "BATCH", d.batch.id, md.id, { qtyOut: d.kg, unit: "KG" });
    }
    await addLedger(tx, v.id, "BATCH", b.id, fd.id, { qtyIn: total, unit: "KG" });
    for (const i of body.additional_items) {
      await addLedger(tx, v.id, "RAW", i.material_id, rd.id, { qtyOut: i.kg, unit: "KG" });
    }
    return {
      batch_no: b.batchNo,
      total_kg: total,
      parent_batch: draws.map((d) => `${d.batch.batchNo} (${d.kg} KG)`).join(", "),
    };
  });
}

export async function postProcess(
  user: User,
  stage: string,
  body: {
    date: string;
    product_id: number;
    source_product_id?: number;
    input_qty: number;
    output_qty: number;
    repair_qty: number;
    second_qty: number;
    scrap_qty: number;
    batch_id?: number | null;
    final_group?: string;
    machine_id?: number | null;
    consumed_kg: number;
    revert_kg?: number;
    quality_grade_id?: number | null;
    final_weight_kg?: number | null;
    notes?: string;
  },
  /** Set when an admin edits an entry: that voucher is taken back out first, in the same transaction. */
  opts?: { replaces?: string },
) {
  if (!isStage(stage)) throw new ApiError("Unknown production stage", 404);
  const flow = PROCESS_FLOW[stage];

  const prod = await prisma.product.findUnique({ where: { id: body.product_id } });
  if (!prod) throw new ApiError("Product not found", 404);

  if (body.output_qty <= 0) throw new ApiError(stage === "extrusion" ? "Enter the Green Tube PCS." : stage === "curing" ? "Enter the Pressed Qty." : stage === "inspection" ? "Enter the Unpacked PCS (OK Tubes)." : "Enter the Finished Good PCS.");
  // Only Inspection has Repair / Second / Scrap. The PCS entered are the OK tubes that move on;
  // the source loses the OK tubes plus everything rejected.
  const repairQty = stage === "inspection" ? body.repair_qty : 0;
  const secondQty = stage === "inspection" ? body.second_qty : 0;
  const scrapQty = stage === "inspection" ? body.scrap_qty : 0;
  const revertKg = stage === "extrusion" ? body.revert_kg ?? 0 : 0;
  const totalRej = repairQty + secondQty + scrapQty;
  const usedQty = body.output_qty + totalRej;
  if (stage !== "extrusion" && usedQty > body.input_qty) {
    throw new ApiError(`Only ${body.input_qty} PCS are available. ${totalRej > 0 ? "OK, Repair, Second and Scrap together" : "The PCS entered"} cannot be more than that.`);
  }
  if (stage === "extrusion" && body.consumed_kg <= 0) throw new ApiError("Enter the actual KG consumed.");
  if (stage === "extrusion" && revertKg > body.consumed_kg + 0.0005) {
    throw new ApiError("Revert KG cannot be more than the actual KG consumed.");
  }
  let maxKg: number | null = null;
  // Admin → Settings can switch the KG limit off; then any Actual KG consumed is accepted.
  if (stage === "extrusion" && (await getSetting("extrusion_kg_limit")).value) {
    const specs = await prisma.catalogItem.findMany({ where: { size: prod.size, active: true } });
    const spec = specs.find((row) => row.weightKg > 0);
    if (!spec) throw new ApiError(`Set the KG for ${prod.size} on the product list.`);
    maxKg = maxConsumedKg(spec.weightKg, body.output_qty, spec.exKg);
    if (body.consumed_kg > allowedConsumedKg(maxKg) + 0.0005) {
      throw new ApiError(
        `Actual KG consumed cannot be more than ${allowedConsumedKg(maxKg)} KG. The limit is ${maxKg.toFixed(3)} KG, rounded up to a whole KG. That is ${body.output_qty} PCS × ${spec.weightKg} KG plus ${spec.exKg}% ExKg.`,
      );
    }
  }

  const sd = stage === "extrusion" ? null : await deptByCode(flow.source);
  const td = await deptByCode(flow.target);
  const voucherDate = parseISODate(body.date);
  const prefix = stage.slice(0, 3).toUpperCase();

  return prisma.$transaction(async (tx) => {
    if (opts?.replaces) await reverseVoucherTx(tx, user, opts.replaces, "Edited");
    // Final batches are used as one pool, oldest first: batch 1 until it is empty, then batch 2, and so on.
    let drawn: { id: number; kg: number }[] = [];
    const back = new Map<number, number>();
    if (stage === "extrusion") {
      if (!body.final_group) throw new ApiError("Select the final batch group.");
      const all = await tx.batch.findMany({
        where: { batchType: "FINAL", status: "READY", availableKg: { gt: 0 } },
        orderBy: { id: "asc" },
      });
      const pool = all.filter((x) => finalGroup(x.batchNo) === body.final_group);
      const have = pool.reduce((sum, x) => sum + Number(x.availableKg), 0);
      if (have + 0.0005 < body.consumed_kg) {
        throw new ApiError(`${body.final_group} has only ${Number(have.toFixed(3))} KG left.`);
      }
      const { out } = drawInOrder(pool.map((x) => ({ id: x.id, available_kg: Number(x.availableKg) })), body.consumed_kg);
      drawn = out.map((d) => ({ id: d.batch.id, kg: r4(d.kg) }));
      // Rework goes back to the batches it came from, the last one drawn first.
      let rest = revertKg;
      for (const d of [...drawn].reverse()) {
        const give = Math.min(rest, d.kg);
        if (give > 0) back.set(d.id, give);
        rest -= give;
      }
      for (const d of drawn) {
        const b = pool.find((x) => x.id === d.id)!;
        const left = r4(Number(b.availableKg) - d.kg + (back.get(d.id) ?? 0));
        await tx.batch.update({
          where: { id: b.id },
          data: { availableKg: left, status: left <= 0.0005 ? "CONSUMED" : "READY" },
        });
      }
      body.batch_id = drawn[0]?.id ?? null;
    } else if (sd) {
      const bal = await productBalance(tx, body.source_product_id ?? body.product_id, sd.id);
      if (bal < usedQty) throw new ApiError(`Only ${bal} PCS are waiting in ${sd.name}.`);
    }

    const v = await tx.voucher.create({
      data: {
        voucherNo: await nextNo(tx, "voucher", prefix),
        voucherType: stage.toUpperCase(),
        voucherDate,
        departmentId: td.id,
        batchId: body.batch_id ?? null,
        productId: prod.id,
        machineId: body.machine_id ?? null,
        inputQty: body.input_qty,
        outputQty: body.output_qty,
        consumedKg: body.consumed_kg,
        revertKg,
        repairQty,
        secondQty,
        scrapQty,
        finalWeightKg: stage === "packing" && body.final_weight_kg ? body.final_weight_kg : null,
        notes: [body.notes, opts?.replaces ? `Edited from ${opts.replaces}` : null].filter(Boolean).join(" · ") || null,
        createdBy: user.id,
      },
    });
    if (opts?.replaces) {
      const old = await tx.voucher.findUnique({ where: { voucherNo: opts.replaces }, select: { id: true, notes: true } });
      if (old) await tx.voucher.update({ where: { id: old.id }, data: { notes: `${old.notes ?? ""} Replaced by ${v.voucherNo}.`.trim() } });
    }

    if (stage === "extrusion") {
      const finalDept = await deptByCode("FINAL");
      for (const d of drawn) {
        await addLedger(tx, v.id, "BATCH", d.id, finalDept.id, { qtyOut: d.kg, unit: "KG" });
        const give = back.get(d.id) ?? 0;
        if (give > 0) await addLedger(tx, v.id, "BATCH", d.id, finalDept.id, { qtyIn: give, unit: "KG" });
      }
    } else if (sd) {
      await addLedger(tx, v.id, "PRODUCT", body.source_product_id ?? prod.id, sd.id, {
        qtyOut: usedQty,
        unit: "PCS",
      });
    }

    const goodQty = body.output_qty;
    const packingUsed: { name: string; qty: number; unit: string }[] = [];
    if (goodQty > 0) {
      await addLedger(tx, v.id, "PRODUCT", prod.id, td.id, { qtyIn: goodQty, unit: "PCS" });
    }
    // Admins can switch the packing deduction off under Masters → Auto Consumption Packing.
    const autoDeduct = stage === "packing" ? (await getSetting("packing_auto_deduction")).value : false;
    if (stage === "packing" && goodQty > 0 && autoDeduct) {
      const rules = await tx.packingConsumption.findMany({
        where: { active: true, size: prod.size },
        include: { item: true, qualityGrade: true },
      });
      const common = rules.filter((rule) => rule.qualityGradeId == null);
      const branded = rules.filter((rule) => rule.qualityGradeId != null);
      if (branded.length > 0 && !body.quality_grade_id) {
        throw new ApiError("Select the brand. That chooses which bag is deducted.");
      }
      const bag = branded.filter((rule) => rule.qualityGradeId === body.quality_grade_id);
      // A qty of 0 means nothing is deducted for that item.
      const lines = [...common, ...bag].filter((rule) => rule.consQty > 0);
      const store = lines.length > 0 ? await deptByCode("STORE") : null;
      // An admin can let Pouch Items go below zero; everything else must be in stock.
      const pouchNegative = (await getSetting("pouch_allow_negative")).value;
      for (const line of lines) {
        if (pouchNegative && line.item.group === "Pouch Item") continue;
        const need = Number((line.consQty * goodQty).toFixed(4));
        const have = await storeItemBalance(tx, line.itemId);
        if (have + 0.0001 < need) {
          throw new ApiError(`${line.item.name} stock is short. Need ${need} ${line.item.unit}, available ${have}. Receive it into the packing store.`);
        }
      }
      for (const line of lines) {
        const need = Number((line.consQty * goodQty).toFixed(4));
        await addLedger(tx, v.id, "STORE", line.itemId, store!.id, { qtyOut: need, unit: line.item.unit });
        packingUsed.push({ name: line.item.name, qty: need, unit: line.item.unit });
      }
    }
    const rejectParts = [
      ["REPAIR", repairQty],
      ["SECOND", secondQty],
      ["SCRAP", scrapQty],
    ] as const;
    for (const [rejectionType, quantity] of rejectParts) {
      if (quantity <= 0) continue;
      await tx.rejection.create({
        data: {
          voucherId: v.id,
          departmentId: td.id,
          productId: prod.id,
          rejectionType,
          quantity,
          reason: body.notes ?? null,
          rejectionDate: voucherDate,
        },
      });
    }

    return {
      voucher_no: v.voucherNo,
      stage,
      output_qty: body.output_qty,
      rejection_qty: totalRej,
      good_qty: body.output_qty,
      revert_kg: revertKg,
      max_kg: maxKg,
      target_department: flow.target,
      packing_used: packingUsed,
      auto_deduction: autoDeduct,
    };
  });
}

export async function postOpeningStock(
  user: User,
  body: {
    item_type: "RAW" | "PRODUCT" | "BATCH" | "STORE";
    item_id: number;
    department_code: string;
    quantity: number;
    unit: string;
    date: string;
  },
) {
  const openingDate = parseISODate(body.date);
  const dept = await deptByCode(body.department_code);

  if (body.item_type === "RAW" && !(await prisma.rawMaterial.findUnique({ where: { id: body.item_id } }))) {
    throw new ApiError("Raw material not found", 404);
  }
  if (body.item_type === "PRODUCT" && !(await prisma.product.findUnique({ where: { id: body.item_id } }))) {
    throw new ApiError("Product not found", 404);
  }
  if (body.item_type === "BATCH" && !(await prisma.batch.findUnique({ where: { id: body.item_id } }))) {
    throw new ApiError("Batch not found", 404);
  }
  if (body.item_type === "STORE") {
    const item = await prisma.inventoryItem.findFirst({ where: { id: body.item_id, group: { in: STORE_GROUPS }, active: true } });
    if (!item) throw new ApiError("Store item not found", 404);
  }

  return prisma.$transaction(async (tx) => {
    const v = await tx.voucher.create({
      data: {
        voucherNo: await nextNo(tx, "voucher", "OPN"),
        voucherType: "OPENING",
        voucherDate: openingDate,
        departmentId: dept.id,
        inputQty: body.quantity,
        createdBy: user.id,
        notes: "Opening stock entry",
      },
    });
    await addLedger(tx, v.id, body.item_type, body.item_id, dept.id, {
      qtyIn: body.quantity,
      unit: body.unit,
    });
    if (body.item_type === "BATCH") {
      await tx.batch.update({
        where: { id: body.item_id },
        data: {
          availableKg: new Decimal(body.quantity),
          totalKg: new Decimal(body.quantity),
          status: "READY",
        },
      });
    }
    return { voucher_no: v.voucherNo, message: "Opening stock posted" };
  });
}

export async function getDashboard() {
  const batches = await prisma.batch.findMany();
  const masterKg = batches
    .filter((b) => b.batchType === "MASTER" && b.status === "READY")
    .reduce((s, b) => s + Number(b.availableKg), 0);
  const finalKg = batches
    .filter((b) => b.batchType === "FINAL" && b.status === "READY")
    .reduce((s, b) => s + Number(b.availableKg), 0);

  const pipeline = [];
  for (const [code, name] of WIP_DEPARTMENTS) {
    const d = await prisma.department.findFirst({ where: { code } });
    pipeline.push({
      code,
      name,
      pcs: d ? await departmentItemTotal(prisma, d.id, "PRODUCT") : 0,
    });
  }

  return {
    master_batch_kg: masterKg,
    final_batch_kg: finalKg,
    extrusion_wip_pcs: pipeline.find((p) => p.code === "EXTRUSION")?.pcs ?? 0,
    cured_pcs: pipeline.find((p) => p.code === "CURED")?.pcs ?? 0,
    finished_goods_pcs: pipeline.find((p) => p.code === "FG")?.pcs ?? 0,
    products: await prisma.product.count(),
    batches: batches.length,
    pipeline,
  };
}

export function isStage(stage: string): stage is Stage {
  return stage in PROCESS_FLOW;
}
/** A master batch that nothing has been drawn from yet. Only these can be edited or deleted. */
async function untouchedMaster(tx: Tx, batchId: number) {
  const batch = await tx.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.batchType !== "MASTER" || batch.status !== "READY") throw new ApiError("Master batch not found", 404);
  const used = await tx.batch.count({ where: { parentBatchId: batch.id, status: { not: "DELETED" } } });
  if (used > 0 || Math.abs(Number(batch.availableKg) - Number(batch.totalKg)) > 0.0005) {
    throw new ApiError(`${batch.batchNo} is already used in a final batch, so it cannot be changed.`, 409);
  }
  const voucher = await tx.voucher.findFirst({ where: { batchId: batch.id, voucherType: "MASTER_BATCH" }, orderBy: { id: "asc" } });
  if (!voucher) throw new ApiError("Master batch voucher not found", 404);
  return { batch, voucher };
}

/** What the batch consumes now: raw out minus raw back in, per material. */
async function masterNetItems(tx: Tx, voucherId: number) {
  const rows = await tx.stockLedger.findMany({ where: { voucherId, itemType: "RAW" } });
  const net = new Map<number, number>();
  for (const r of rows) net.set(r.itemId, (net.get(r.itemId) ?? 0) + Number(r.qtyOut) - Number(r.qtyIn));
  return net;
}

export async function deleteMasterBatch(user: User, batchId: number) {
  const raw = await deptByCode("RAW");
  const master = await deptByCode("MASTER");
  return prisma.$transaction(async (tx) => {
    const { batch, voucher } = await untouchedMaster(tx, batchId);
    const net = await masterNetItems(tx, voucher.id);
    // Give the materials back and take the batch out of stock.
    for (const [id, kg] of net) {
      if (kg > 0.0000001) await addLedger(tx, voucher.id, "RAW", id, raw.id, { qtyIn: kg, unit: "KG" });
    }
    await addLedger(tx, voucher.id, "BATCH", batch.id, master.id, { qtyOut: Number(batch.totalKg), unit: "KG" });
    await tx.batch.update({ where: { id: batch.id }, data: { status: "DELETED", availableKg: 0 } });
    await tx.voucher.update({ where: { id: voucher.id }, data: { status: "VOID", notes: `Deleted by ${user.username}` } });
    return { batch_no: batch.batchNo };
  });
}

/**
 * Deletes a final batch nothing has been taken from yet. The master batches it used get their KG back,
 * the extra raw materials return to stock, and the batch leaves the final stock.
 */
export async function deleteFinalBatch(user: User, batchId: number) {
  const raw = await deptByCode("RAW");
  const master = await deptByCode("MASTER");
  const fin = await deptByCode("FINAL");
  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({ where: { id: batchId } });
    if (!batch || batch.batchType !== "FINAL" || batch.status !== "READY") throw new ApiError("Final batch not found", 404);
    const voucher = await tx.voucher.findFirst({ where: { batchId: batch.id, voucherType: "FINAL_BATCH" }, orderBy: { id: "asc" } });
    if (!voucher) throw new ApiError("Final batch voucher not found", 404);
    const other = await tx.stockLedger.count({ where: { itemType: "BATCH", itemId: batch.id, voucherId: { not: voucher.id } } });
    if (other > 0 || Math.abs(Number(batch.availableKg) - Number(batch.totalKg)) > 0.0005) {
      throw new ApiError(`${batch.batchNo} is already used in production, so it cannot be deleted.`, 409);
    }

    const entries = await tx.stockLedger.findMany({ where: { voucherId: voucher.id } });
    for (const e of entries) {
      const out = Number(e.qtyOut);
      if (e.itemType === "BATCH" && e.departmentId === master.id && out > 0) {
        // Give the KG back to the master batch it came from.
        const mb = await tx.batch.findUnique({ where: { id: e.itemId } });
        if (mb) {
          await tx.batch.update({ where: { id: mb.id }, data: { availableKg: r4(Number(mb.availableKg) + out), status: "READY" } });
        }
        await addLedger(tx, voucher.id, "BATCH", e.itemId, master.id, { qtyIn: out, unit: "KG" });
      } else if (e.itemType === "RAW" && out > 0) {
        await addLedger(tx, voucher.id, "RAW", e.itemId, raw.id, { qtyIn: out, unit: "KG" });
      }
    }
    await addLedger(tx, voucher.id, "BATCH", batch.id, fin.id, { qtyOut: Number(batch.totalKg), unit: "KG" });
    await tx.batch.update({ where: { id: batch.id }, data: { status: "DELETED", availableKg: 0, parentBatchId: null } });
    await tx.voucher.update({ where: { id: voucher.id }, data: { status: "VOID", notes: `Deleted by ${user.username}. ${voucher.notes ?? ""}`.trim() } });
    return { batch_no: batch.batchNo };
  });
}
