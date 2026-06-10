create procedure dbo.find_orders(in minimum_total numeric(12,2))
begin
select o.order_id, c.customer_name, sum(i.amount) as total_amount from dbo.orders o left outer join dbo.customers c on c.customer_id = o.customer_id left outer join dbo.order_items i on i.order_id = o.order_id where o.active = 1 and i.amount >= minimum_total group by o.order_id, c.customer_name order by c.customer_name, o.order_id;
end;
