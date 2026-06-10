create table dbo.audit_log(
id integer not null,
created_at timestamp not null,
description varchar(255) null,
amount numeric(12,2) null
);
