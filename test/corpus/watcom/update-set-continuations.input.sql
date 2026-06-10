begin
update "DBA"."OP_MATERIAL_PLAN"
set "Menge" = "vCurrentMenge"-"vMenge",
"Zeitpunkt"
= current time
where "lfd" = "iOPMaterialPlanLfd"
end;
