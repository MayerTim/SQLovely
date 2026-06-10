create procedure dbo.handle_import_errors()
begin
set status_code = 1;
exception when others then begin
set status_code = 0;
select sqlcode, sqlstate;
end
end;
