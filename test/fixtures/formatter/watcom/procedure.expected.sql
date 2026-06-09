CREATE PROCEDURE dbo.fixture_proc()
BEGIN
  SELECT TODAY();
  IF status = 'select' THEN
    SELECT 1;
  ELSE
    SELECT 2;
  ENDIF;
END;
