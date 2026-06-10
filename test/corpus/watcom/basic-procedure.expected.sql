CREATE PROCEDURE dbo.customer_summary(
  IN customer_id integer
)
BEGIN
  SELECT TODAY(), customer_id;
  IF customer_id IS NULL THEN
    SELECT 'missing customer';
  ELSE
    SELECT 'loaded customer';
  ENDIF;
END;
