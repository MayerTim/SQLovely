create or alter proc [dbo].[example_mssql_proc]
as
begin try
select sysdatetime() as created_at;
end try
begin catch
throw;
end catch
go
