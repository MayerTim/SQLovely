create procedure dbo.route_work_items(in owner_id integer)
begin
select w.work_item_id, case when w.status_code = 1 then 'open' else 'closed' end as status_label from dbo.work_items w where w.owner_id = owner_id and isnull(w.archived, 0) = 0 order by if w.priority_code = 'urgent' then 0 else 1 endif, w.created_at;
if owner_id is null then
return;
end if;
end;
