create procedure "fct"."metadata_boundary"()
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
begin
select 'CREATE PROCEDURE dbo.fake_object() should stay literal' as description;
-- CREATE FUNCTION dbo.fake_comment() should stay comment text
end;
