BEGIN
  UPDATE "DBA"."OP_MATERIAL_PLAN"
  SET "Menge" = "vCurrentMenge" - "vMenge",
    "Zeitpunkt" = CURRENT time
  WHERE "lfd" = "iOPMaterialPlanLfd"
END;
