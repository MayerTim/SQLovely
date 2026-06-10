export function legacyVersionPatterns(): readonly RegExp[] {
  return [
    /^\s*(?:version|vers\.?|ver\.?)\s*[:=]\s*v?([0-9]+(?:[.,][0-9]+){0,3})\b/iu
  ];
}

export function legacyAuthorPatterns(): readonly RegExp[] {
  return [
    /(?:^|\b)(?:author|created[ \t]+by|erstellt[ \t]+(?:von|durch)|ersteller|angelegt[ \t]+(?:von|durch))[ \t]*[:=][ \t]*(.+?)(?=[ \t]{2,}[\p{L}][\p{L} \t]*(?:[:=])|$)/iu
  ];
}

export function legacyUpdatedByPatterns(): readonly RegExp[] {
  return [
    /(?:^|\b)(?:updated[ \t]+by|last[ \t]+updated[ \t]+by|modified[ \t]+by|geändert[ \t]+(?:von|durch)|geaendert[ \t]+(?:von|durch)|geupdated[ \t]+(?:von|durch)|aktualisiert[ \t]+(?:von|durch))[ \t]*[:=][ \t]*(.+?)(?=[ \t]{2,}[\p{L}][\p{L} \t]*(?:[:=])|$)/iu
  ];
}

export function legacyCreatedDatePatterns(): readonly RegExp[] {
  return [
    /(?:^|\b)(?:created(?:[ \t]+(?:date|on|at))?|creation[ \t]+date|erstellt(?:[ \t]+(?:datum|am))?|erstellungsdatum|erstelldatum)[ \t]*[:=][ \t]*([^ \t]+)/iu
  ];
}

export function legacyUpdatedDatePatterns(): readonly RegExp[] {
  return [
    /(?:^|\b)(?:updated(?:[ \t]+(?:date|on|at))?|last[ \t]+updated|modified(?:[ \t]+(?:date|on|at))?|letzte[ \t]+(?:änderung|aenderung)|geändert(?:[ \t]+(?:am|datum))?|geaendert(?:[ \t]+(?:am|datum))?|geupdated(?:[ \t]+(?:am|datum))?|aktualisiert(?:[ \t]+am)?)[ \t]*[:=][ \t]*([^ \t]+)/iu
  ];
}

export function isLegacyMetadataFieldLine(value: string): boolean {
  return /^(?:description|beschreibung|version|vers\.?|ver\.?|author|created(?:[ \t]+(?:date|on|at|by))?|creation[ \t]+date|updated(?:[ \t]+(?:date|on|at|by))?|last[ \t]+updated(?:[ \t]+by)?|modified(?:[ \t]+(?:date|on|at|by))?|erstellt(?:[ \t]+(?:datum|am|von|durch))?|erstellungsdatum|erstelldatum|ersteller|angelegt[ \t]+(?:von|durch)|letzte[ \t]+(?:änderung|aenderung)|geändert(?:[ \t]+(?:am|datum|von|durch))?|geaendert(?:[ \t]+(?:am|datum|von|durch))?|geupdated(?:[ \t]+(?:am|datum|von|durch))?|aktualisiert(?:[ \t]+(?:am|von|durch))?)[ \t]*[:=]/iu.test(value);
}

export function isLegacyHistoryHeader(value: string): boolean {
  return /^(?:history|historie|verlauf|änderungen|aenderungen|changelog)[ \t]*:?$/iu.test(value);
}

export function isLegacyDescriptionLabelOnly(value: string): boolean {
  return /^(?:description|beschreibung)[ \t]*:?$/iu.test(value);
}

export function trimTrailingInlineLabel(value: string): string {
  return value
    .replace(/[ \t]+(?:author|created[ \t]+by|erstellt[ \t]+(?:von|durch)|ersteller|angelegt[ \t]+(?:von|durch)|updated[ \t]+by|last[ \t]+updated[ \t]+by|modified[ \t]+by|geändert[ \t]+(?:von|durch)|geaendert[ \t]+(?:von|durch)|geupdated[ \t]+(?:von|durch)|aktualisiert[ \t]+(?:von|durch)|created(?:[ \t]+(?:date|on|at))?|creation[ \t]+date|erstellt(?:[ \t]+(?:datum|am))?|erstellungsdatum|erstelldatum|updated(?:[ \t]+(?:date|on|at))?|last[ \t]+updated|modified(?:[ \t]+(?:date|on|at))?|letzte[ \t]+(?:änderung|aenderung)|geändert(?:[ \t]+(?:am|datum))?|geaendert(?:[ \t]+(?:am|datum))?|geupdated(?:[ \t]+(?:am|datum))?|aktualisiert(?:[ \t]+am)?)[ \t]*[:=].*$/iu, '')
    .trim();
}
