create procedure dbo.protected_text_query_keywords()
begin
select "from", [where], 'select from where order by' as literal_value, description
from dbo.keyword_notes
where "from" = 'order by' and [where] like '%select%' -- group by should stay lower-case in comment
order by "from", [where];
end;
