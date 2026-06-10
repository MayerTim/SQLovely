CREATE PROCEDURE dbo.route_work_items(
  IN owner_id integer
)
BEGIN
  SELECT w.work_item_id, CASE
    WHEN w.status_code = 1
    THEN 'open'
    ELSE 'closed'
  END AS status_label
  FROM dbo.work_items w
  WHERE w.owner_id = owner_id
    AND ISNULL(
      w.archived,
      0
    ) = 0
  ORDER BY IF w.priority_code = 'urgent' THEN 0 ELSE 1 ENDIF, w.created_at;
  IF owner_id IS NULL THEN
    RETURN;
  END IF;
END;
