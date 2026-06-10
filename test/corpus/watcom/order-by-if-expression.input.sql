create procedure dbo.sort_work_items()
begin
select w.work_item_id, w.priority_code, w.created_at
from dbo.work_items w
order by
if w.priority_code = 'urgent'
then
0 else 1
end if
w.created_at desc,
w.work_item_id;
end;
