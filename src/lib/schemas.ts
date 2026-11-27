import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const materialSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  min_stock: z.number().optional().default(0),
});

export const purchaseSchema = z.object({
  material_id: z.number().int(),
  quantity_kg: z.number().positive(),
  date: z.string(),
  reference: z.string().optional(),
});

export const batchMaterialSchema = z.object({
  material_id: z.number().int(),
  kg: z.number().positive(),
});

export const masterBatchSchema = z.object({
  date: z.string(),
  machine_id: z.number().int().nullable().optional(),
  /** The Batch Master formula used. Missing means a manual mix (MN). */
  formula_id: z.number().int().nullable().optional(),
  items: z.array(batchMaterialSchema).min(1),
});

export const finalBatchSchema = z.object({
  date: z.string(),
  /** The master batch group to draw from, such as MB-V2. Its batches are used oldest first. */
  master_group: z.string().trim().min(1),
  master_kg: z.number().positive(),
  /** The final formula chosen on the page; it names the batch. Empty for a manual final batch. */
  formula_id: z.number().int().nullable().optional(),
  additional_items: z.array(batchMaterialSchema).optional().default([]),
});

export const processSchema = z.object({
  date: z.string(),
  /** Step 1 only: the final batch group to use, such as FB-FINALV1-MB-MASTERV1. Its batches are used oldest first. */
  final_group: z.string().trim().optional(),
  product_id: z.number().int().optional(),
  size: z.string().trim().min(1).optional(),
  valve: z.string().trim().min(1).optional(),
  input_qty: z.number().int().min(0),
  output_qty: z.number().int().min(0),
  repair_qty: z.number().int().min(0).optional().default(0),
  second_qty: z.number().int().min(0).optional().default(0),
  scrap_qty: z.number().int().min(0).optional().default(0),
  batch_id: z.number().int().nullable().optional(),
  machine_id: z.number().int().nullable().optional(),
  consumed_kg: z.number().min(0).optional().default(0),
  revert_kg: z.number().min(0).optional().default(0),
  quality_grade_id: z.number().int().nullable().optional(),
  /** Step 4 only: the final packing weight in KG. */
  final_weight_kg: z.number().min(0).nullable().optional(),
  notes: z.string().optional(),
});

export const openingStockSchema = z.object({
  item_type: z.enum(["RAW", "PRODUCT", "BATCH", "STORE"]),
  item_id: z.number().int(),
  department_code: z.string(),
  quantity: z.number().positive(),
  unit: z.string().optional().default("PCS"),
  date: z.string().optional().default("2026-11-01"),
});