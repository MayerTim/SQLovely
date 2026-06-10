CREATE PROCEDURE dbo.lookup_events()
BEGIN
  SELECT event_id, 'active' AS source_name
  FROM dbo.active_events
  WHERE visible = 1
  UNION ALL
  SELECT event_id, 'archived' AS source_name
  FROM dbo.archived_events
  WHERE visible = 1
  ORDER BY event_id;
END;
