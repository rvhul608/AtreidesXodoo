-- Billing loads each subscription's lines and the subscription lists batch-load lines by
-- subscription id; without this index both scan the whole subscription_items table.
CREATE INDEX IF NOT EXISTS subscription_items_subscription_idx ON subscription_items (subscription_id, id);
