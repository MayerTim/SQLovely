CREATE PROCEDURE dbo.recalculate_totals()
BEGIN
  FOR order_cursor AS orders insensitive CURSOR FOR
    SELECT order_id, customer_id
    FROM dbo.orders
    WHERE active = 1
    ORDER BY order_id
  DO
    UPDATE dbo.orders SET total = 0
    WHERE order_id = order_cursor.order_id;
  END FOR;
END;
