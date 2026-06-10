CREATE PROCEDURE dbo.protected_text_query_keywords()
BEGIN
  SELECT "from", [where], 'select from where order by' AS literal_value, description
  FROM dbo.keyword_notes
  WHERE "from" = 'order by'
    AND [where] LIKE '%select%' -- group by should stay lower-case in comment
  ORDER BY "from", [where];
END;
