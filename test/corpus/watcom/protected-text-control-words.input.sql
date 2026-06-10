create procedure dbo.protected_text_control_words()
begin
-- if then else endif should stay lower-case in a comment
select case when message = 'if then else endif' then 'select from where' else "else" end as result
from dbo.audit_log
where note = 'begin end if' and [order by] is not null;
/* order by where select should stay lower-case in block comment */
end;
