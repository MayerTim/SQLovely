CREATE TABLE dbo.audit_log(
  id integer NOT NULL,
  created_at TIMESTAMP NOT NULL,
  description varchar(255) NULL,
  amount numeric(12, 2) NULL
);
