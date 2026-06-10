create procedure dbo.protected_text()
begin
select 'select from where join order by' as note, "select" as quoted_name -- select from comment should stay lower-case
from dbo.notes
where message = 'where from join' and status = 'open';
/*
select from where in a block comment should stay lower-case
*/
select '[select]' as literal_value;
end;
