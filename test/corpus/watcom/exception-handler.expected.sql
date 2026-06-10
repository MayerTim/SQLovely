CREATE PROCEDURE dbo.handle_import_errors()
BEGIN
  SET status_code = 1;
EXCEPTION
  WHEN OTHERS THEN
    BEGIN
      SET status_code = 0;
      SELECT sqlcode, SQLSTATE;
    END
END;
