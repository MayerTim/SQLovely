export {
  applyExtras,
  type ApplySqlovelyExtrasOptions,
  type SqlovelyExtrasResult
} from './applyExtras';
export {
  findExistingMetadataHeader,
  insertOrUpdateMetadataHeader,
  METADATA_HEADER_END,
  METADATA_HEADER_START,
  type MetadataHeaderAction,
  type MetadataHeaderOptions,
  type MetadataHeaderResult
} from './metadataHeader';
export { detectPrimarySqlObject, type DetectedSqlObject } from './objectDetection';
