CREATE PROCEDURE dbo.exception_resume_guard()
BEGIN
  ON EXCEPTION RESUME
  DECLARE "validation_error" EXCEPTION FOR SQLSTATE VALUE '75000';
  SELECT 'exception when others then begin' AS note -- exception when others then begin
END;
