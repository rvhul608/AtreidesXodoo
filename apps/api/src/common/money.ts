import Decimal from 'decimal.js';

const MAX_MONEY = new Decimal('9999999999.99');

export type Money = string & { readonly __brand: 'Money' };

/** Converts a decimal string to the API's fixed two-decimal money representation. */
export function toMoney(value: string | Decimal): Money {
  const decimal = new Decimal(value);

  if (!decimal.isFinite() || decimal.isNegative() || decimal.greaterThan(MAX_MONEY)) {
    throw new RangeError('Money must be between 0.00 and 9999999999.99');
  }

  return decimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2) as Money;
}

export function addMoney(...values: readonly (string | Decimal)[]): Money {
  return toMoney(values.reduce<Decimal>((total, value) => total.plus(value), new Decimal(0)));
}

export function subtractMoney(total: string | Decimal, amount: string | Decimal): Money {
  const result = new Decimal(total).minus(amount);

  if (result.isNegative()) {
    throw new RangeError('Money cannot be negative');
  }

  return toMoney(result);
}
