create procedure dbo.customer_summary(in customer_id integer)
begin
select today(), customer_id;
if customer_id is null then
select 'missing customer';
else
select 'loaded customer';
endif;
end;
