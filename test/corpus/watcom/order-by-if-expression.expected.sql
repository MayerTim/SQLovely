CREATE PROCEDURE dbo.sort_work_items()
BEGIN
  SELECT w.work_item_id, w.priority_code, w.created_at
  FROM dbo.work_items w
  ORDER BY
    IF w.priority_code = 'urgent' THEN 0 ELSE 1 ENDIF,
    w.created_at DESC,
    w.work_item_id;
END;
