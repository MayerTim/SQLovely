CREATE PROCEDURE dbo.quoted_identifiers()
BEGIN
  SELECT "from", "where", [select], [order by]
  FROM dbo.keyword_table
  WHERE "where" = 'active'
    AND [select] IS NOT NULL;
END;
