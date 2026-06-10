CREATE PROCEDURE dbo.update_status(
  IN item_id integer,
  IN status_code integer
)
BEGIN
  IF status_code = 1 THEN
    UPDATE dbo.items SET state = 'new'
    WHERE id = item_id;
  ELSEIF status_code = 2 THEN
    UPDATE dbo.items SET state = 'active'
    WHERE id = item_id;
  ELSE
    UPDATE dbo.items SET state = 'archived'
    WHERE id = item_id;
  ENDIF;
END;
