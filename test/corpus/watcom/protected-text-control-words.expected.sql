CREATE PROCEDURE dbo.protected_text_control_words()
BEGIN
  -- if then else endif should stay lower-case in a comment
  SELECT CASE
    WHEN MESSAGE = 'if then else endif'
    THEN 'select from where'
    ELSE "else"
  END AS RESULT
  FROM dbo.audit_log
  WHERE note = 'begin end if'
    AND [order by] IS NOT NULL;
  /* order by where select should stay lower-case in block comment */
END;
