import { paginationMeta, paginationValues } from '../../common/pagination.js';
import { transitionSubscription } from '../subscriptions/service.js';
import { listRenewalQueue, runChase as persistChase, type RenewalQueueRow } from './repository.js';

function publicQueueEntry(row: RenewalQueueRow) {
  return {
    id: Number(row.id),
    subscription_number: row.subscription_number,
    customer_id: Number(row.customer_id),
    customer_name: row.customer_name,
    plan_id: Number(row.plan_id),
    plan_name: row.plan_name,
    period: row.period,
    expiry_date: row.expiry_date,
    days_left: Number(row.days_left),
    can_renew: row.allow_renew,
  };
}

export async function runChase(asOf: string, actorId: number) {
  return persistChase(asOf, actorId);
}

export async function getRenewalQueue(input: { asOf: string; days: number; page: number; pageSize: number }) {
  const { limit, offset } = paginationValues(input);
  const result = await listRenewalQueue(input.asOf, input.days, limit, offset);
  return { data: result.rows.map(publicQueueEntry), meta: paginationMeta(input.page, input.pageSize, result.total) };
}

// One-click renew reuses the single subscription transition function (plan flag checks + history).
export async function renewSubscription(id: number, actorId: number, asOf?: string) {
  return transitionSubscription(id, 'renew', { id: actorId }, { reason: 'renewal_queue', asOf });
}
