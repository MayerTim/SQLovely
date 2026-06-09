create procedure dbo.example_watcom_proc()
begin
if exists(select 1) then
select 'do not uppercase string content' as message;
else
// Watcom-style comment should stay a comment
select 0;
endif;
end;
