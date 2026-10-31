import type { PoolClient } from 'pg';

export interface AuditEntry {
  customerId: number | null;
  userId: number;
  entityType: string;
  entityId: number | null;
  action: string;
  changes?: Record<string, unknown>;
}

export async function writeAuditEntry(client: PoolClient, entry: AuditEntry): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (customer_id, user_id, entity_type, entity_id, action, changes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entry.customerId, entry.userId, entry.entityType, entry.entityId, entry.action, entry.changes ?? null],
  );
}
