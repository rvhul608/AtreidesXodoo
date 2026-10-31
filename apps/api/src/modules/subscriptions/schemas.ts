import Decimal from 'decimal.js';
import { z } from 'zod';

// Shared by the subscriptions, portal and renewals routers.
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Must be a real calendar date');

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Quantities are NUMERIC(12,2): accept a JSON number or a decimal string, keep it as a string.
export const quantitySchema = z.union([z.number(), z.string().regex(/^\d{1,10}(\.\d{1,2})?$/)])
  .transform((value) => String(value))
  .refine((value) => {
    try {
      const quantity = new Decimal(value);
      return quantity.greaterThan(0) && quantity.decimalPlaces() <= 2 && quantity.lessThan(1e10);
    } catch {
      return false;
    }
  }, 'Quantity must be a positive number with at most 2 decimals');

export const lineSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().nullable().optional(),
  quantity: quantitySchema,
});
