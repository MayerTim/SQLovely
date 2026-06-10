CREATE PROCEDURE "fct"."metadata_boundary"()
-- METADATA
-- Description : Keeps CREATE PROCEDURE text in metadata comments untouched.
-- Version     : 1.0
-- Author      : Test Author
-- Updated By  : Test Author
-- Created     : 2026-06-10
-- Updated     : 2026-06-10
-- History     :
--   v1.0: Initial creation mentions SELECT FROM WHERE - 2026-06-10 Test Author
-- METADATA END
BEGIN
  SELECT 'CREATE PROCEDURE dbo.fake_object() should stay literal' AS description;
  -- CREATE FUNCTION dbo.fake_comment() should stay comment text
END;
