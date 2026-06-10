create procedure dbo.update_status(in item_id integer, in status_code integer)
begin
if status_code = 1 then
update dbo.items set state = 'new' where id = item_id;
elseif status_code = 2 then
update dbo.items set state = 'active' where id = item_id;
else
update dbo.items set state = 'archived' where id = item_id;
endif;
end;
