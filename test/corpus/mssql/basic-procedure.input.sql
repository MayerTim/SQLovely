create procedure dbo.get_active_widgets
as
begin
select widget_id, widget_name
from dbo.widget
where is_active = 1
order by widget_name;
end;
