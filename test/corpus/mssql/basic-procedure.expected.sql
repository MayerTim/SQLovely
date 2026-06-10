CREATE PROCEDURE dbo.get_active_widgets
AS
BEGIN
  SELECT widget_id, widget_name
  FROM dbo.widget
  WHERE is_active = 1
  ORDER BY widget_name;
END;
