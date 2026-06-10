create procedure dbo.exception_resume_guard()
begin
on exception resume
declare "validation_error" exception for sqlstate value '75000';
select 'exception when others then begin' as note -- exception when others then begin
end;
