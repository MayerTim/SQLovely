CREATE PROCEDURE dbo.protected_text()
BEGIN
  SELECT 'select from where join order by' AS note, "select" AS quoted_name -- select from comment should stay lower-case
  FROM dbo.notes
  WHERE MESSAGE = 'where from join'
    AND status = 'open';
  /*
  select from where in a block comment should stay lower-case
  */
  SELECT '[select]' AS literal_value;
END;
