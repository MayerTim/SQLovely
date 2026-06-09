create procedure dbo.fixture_proc()
begin
select today();
if status = 'select' then
select 1;
else
select 2;
endif;
end;
