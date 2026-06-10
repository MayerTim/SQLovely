create procedure dbo.classify_customer(in score integer)
begin
select case when score >= 90 then 'gold' when score >= 50 then 'silver' else 'standard' end as customer_class;
end;
