CREATE PROCEDURE dbo.classify_customer(
  IN score integer
)
BEGIN
  SELECT CASE
    WHEN score >= 90
    THEN 'gold'
    WHEN score >= 50
    THEN 'silver'
    ELSE 'standard'
  END AS customer_class;
END;
