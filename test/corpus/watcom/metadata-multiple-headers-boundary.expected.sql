-- CREATE PROCEDURE dbo.comment_decoy() should not affect metadata boundaries
CREATE PROCEDURE dbo.first_metadata_boundary()
-- METADATA
-- Description : First object header mentions CREATE FUNCTION as prose.
-- Version     : 1.0
-- Author      : First Author
-- Updated By  : First Author
-- Created     : 2026-06-10
-- Updated     : 2026-06-10
-- History     :
--   v1.0: Created before the second metadata header - 2026-06-10 First Author
-- METADATA END
BEGIN
  SELECT 1;
END;

CREATE FUNCTION dbo.second_metadata_boundary() RETURNS integer
-- METADATA
-- Description : Second object header mentions CREATE TRIGGER as prose.
-- Version     : 1.0
-- Author      : Second Author
-- Updated By  : Second Author
-- Created     : 2026-06-10
-- Updated     : 2026-06-10
-- History     :
--   v1.0: Created after the first metadata header - 2026-06-10 Second Author
-- METADATA END
BEGIN
  RETURN 2;
END;
