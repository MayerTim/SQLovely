create procedure dbo.recalculate_totals()
begin
for order_cursor as orders insensitive cursor for
select order_id, customer_id from dbo.orders where active = 1 order by order_id
do
update dbo.orders set total = 0 where order_id = order_cursor.order_id;
end for;
end;
