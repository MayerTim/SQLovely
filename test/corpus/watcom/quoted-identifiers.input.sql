create procedure dbo.quoted_identifiers()
begin
select "from", "where", [select], [order by]
from dbo.keyword_table
where "where" = 'active' and [select] is not null;
end;
