-- Database-enforced commission integrity; apply only to development until approved.
-- On first transition to completed, automatically create a single R0.50 ledger entry.
-- If a completed order is subsequently changed, block the mutation.
CREATE OR REPLACE FUNCTION kc_record_completed_order_commission()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('completed','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Terminal order status cannot be changed';
  END IF;
  IF NEW.status = 'completed' AND NOT NEW.test_order
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO kc_commission_entries(order_id,shop_id,amount_cents)
    VALUES (NEW.id,NEW.shop_id,50)
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS kc_commission_on_order ON kc_orders;
CREATE TRIGGER kc_commission_on_order
AFTER INSERT OR UPDATE OF status ON kc_orders
FOR EACH ROW EXECUTE FUNCTION kc_record_completed_order_commission();
-- NOTE: a completed order must not be modified into a test order; enforce below.
CREATE OR REPLACE FUNCTION kc_prevent_completed_order_reclassification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('completed','rejected') AND
     (NEW.status IS DISTINCT FROM OLD.status OR NEW.test_order IS DISTINCT FROM OLD.test_order
      OR NEW.shop_id IS DISTINCT FROM OLD.shop_id) THEN
    RAISE EXCEPTION 'Cannot reclassify terminal order';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS kc_terminal_order_guard ON kc_orders;
CREATE TRIGGER kc_terminal_order_guard BEFORE UPDATE ON kc_orders
FOR EACH ROW EXECUTE FUNCTION kc_prevent_completed_order_reclassification();
