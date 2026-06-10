create procedure dbo.lookup_events()
begin
select event_id, 'active' as source_name from dbo.active_events where visible = 1 union all select event_id, 'archived' as source_name from dbo.archived_events where visible = 1 order by event_id;
end;
