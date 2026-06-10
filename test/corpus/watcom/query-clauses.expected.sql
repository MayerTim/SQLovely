CREATE PROCEDURE dbo.find_orders(
  IN minimum_total numeric(12, 2)
)
BEGIN
  SELECT o.order_id, c.customer_name, SUM(
    i.amount
  ) AS total_amount
  FROM dbo.orders o
  LEFT OUTER JOIN dbo.customers c
    ON c.customer_id = o.customer_id
  LEFT OUTER JOIN dbo.order_items i
    ON i.order_id = o.order_id
  WHERE o.active = 1
    AND i.amount >= minimum_total
  GROUP BY o.order_id, c.customer_name
  ORDER BY c.customer_name, o.order_id;
END;
