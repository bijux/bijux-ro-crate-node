import {alternateNumericTable, numericOutcomesAgree} from './numeric-identity.js';
import {decodeCrateReference} from '@bijux/ro-crate-core'
import {parseTSV} from './tsv.js';
import {pythonString} from './format.js';
import type {CrateWorkspace, ValidationIssue} from '@bijux/ro-crate-core';
import type {CellValue} from './values.js';
import type {Table} from './tsv.js';

interface EntityReference { '@id': string }
interface MetadataEntity { '@id': string; tableSchema?: EntityReference; column?: EntityReference[]; propertyUrl?: string | null; columnName?: string }
interface Metadata { entities: Map<unknown, MetadataEntity>; modelTypes: Map<unknown, string>; parserContext?: {multivalued_properties?: unknown} }


const BIA = 'http://bia/';
const SCHEMA = 'http://schema.org/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

const METADATA_REFERENCE_TYPES = new Map<string | null | undefined, string>([
  [`${BIA}associatedBiologicalEntity`, 'BioSample'],
  [`${BIA}associatedImagingPreparationProtocol`, 'SpecimenImagingPreparationProtocol'],
  [`${BIA}associatedImageAcquisitionProtocol`, 'ImageAcquisitionProtocol'],
  [`${BIA}associatedAnnotationMethod`, 'AnnotationMethod'],
  [`${BIA}associatedProtocol`, 'Protocol'],
  [`${BIA}associatedSubject`, 'Specimen'],
  [`${SCHEMA}isPartOf`, 'Dataset'],
]);

const DEFAULT_LIST_PROPERTIES = new Set([
  ...METADATA_REFERENCE_TYPES.keys(), `${BIA}associatedSourceImage`,
]);
DEFAULT_LIST_PROPERTIES.delete(`${BIA}associatedSubject`);
DEFAULT_LIST_PROPERTIES.delete(`${SCHEMA}isPartOf`);

const PYTHON_WHITESPACE = '[\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
const LIST_SPLIT = new RegExp(`${PYTHON_WHITESPACE}*,${PYTHON_WHITESPACE}*`);
const LIST_TRIM = new RegExp(`^${PYTHON_WHITESPACE}+|${PYTHON_WHITESPACE}+$`, 'g');
const strip = (value: string) => value.replace(LIST_TRIM, '');

export class FileListValidationError extends Error {
  declare issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super('Validation failed.');
    this.name = 'FileListValidationError';
    this.issues = issues;
  }
}

function issue(issues: ValidationIssue[], message: string, location: string | null = null) {
  issues.push({ message, severity: 40, location_description: location });
}

function raiseErrors(issues: ValidationIssue[]) {
  if (issues.some(value => value.severity >= 40)) {
    throw new FileListValidationError(issues);
  }
}

function columnValues(table: Table, name: string | undefined) {
  const column = table.columns.get(name);
  if (!column) throw new Error(`'${name}'`);
  return column.values;
}

function references(value: CellValue | undefined) {
  if (value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  throw new TypeError(`'${typeof value === 'boolean' ? 'bool' : typeof value === 'bigint' ? 'int' : 'float'}' object is not iterable`);
}

function duplicateKey(value: CellValue) {
  if (typeof value === 'boolean') return value ? 1n : 0n;
  if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
  return value;
}

function referenceTypes(table: Table, columnName: string | undefined, types: CellValue[]) {
  const lookup = new Map<CellValue, CellValue>();
  for (const [index, value] of columnValues(table, columnName).entries()) {
    // List expansion can replace an aliased path/name column. Python cannot
    // finish constructing its dictionary when those current keys are lists.
    if (Array.isArray(value)) throw new TypeError("unhashable type: 'list'");
    lookup.set(value, types[index]);
  }
  return lookup;
}

/** Validate the single BIA file list, returning metadata IDs referenced by its rows. */
export async function validateFileList(metadata: Metadata, workspace: CrateWorkspace, issues: ValidationIssue[]) {
  const fileLists = [...metadata.entities.values()].filter(entity => metadata.modelTypes.get(entity['@id']) === 'FileList');
  if (fileLists.length !== 1) throw new Error(`Found unexpected number of file lists: ${fileLists.length}`);
  const fileList = fileLists[0];
  // FileList model validation requires tableSchema; the original lookup still throws if it is absent.
  const schema = metadata.entities.get(fileList.tableSchema!['@id']);
  if (!schema || !Array.isArray(schema.column)) throw new TypeError('File list tableSchema does not reference a TableSchema');
  const columns = new Map(schema.column.map(reference => {
    const column = metadata.entities.get(reference['@id']);
    if (!column) throw new TypeError(`Column ${reference['@id']} not found`);
    if (!Object.hasOwn(column, 'propertyUrl')) throw new TypeError(`Column ${reference['@id']} has no propertyUrl attribute`);
    return [reference['@id'], column];
  }));
  const byProperty = new Map([...columns.values()].filter(column => column.propertyUrl).map(column => [column.propertyUrl, column]));
  for (const property of [`${BIA}filePath`, `${SCHEMA}isPartOf`]) {
    if (!byProperty.has(property)) {
      issue(issues, `Missing column with required property: ${property}`,
        `At file list ${fileList['@id']} and TableSchema ${schema['@id']}`);
    }
  }
  raiseErrors(issues);

  const table = parseTSV(await workspace.readText(decodeCrateReference(fileList['@id'])));
  const alternative = alternateNumericTable(table);
  if (!alternative) return validateTable(metadata, fileList, schema, columns, byProperty, table, issues);
  const attempt = (candidate: Table) => {
    const findings: ValidationIssue[] = [];
    try { return {findings, inbound: validateTable(metadata, fileList, schema, columns, byProperty, candidate, findings)}; }
    catch (error) { return {findings, error}; }
  };
  const ordinary = attempt(table), fused = attempt(alternative);
  if (!numericOutcomesAgree(ordinary, fused)) throw new Error('File list validation depends on platform-specific numeric rounding');
  issues.push(...ordinary.findings);
  if (ordinary.error) throw ordinary.error;
  return ordinary.inbound;
}

function validateTable(metadata: Metadata, fileList: MetadataEntity, schema: MetadataEntity, columns: Map<string, MetadataEntity>, byProperty: Map<string | null | undefined, MetadataEntity>, table: Table, issues: ValidationIssue[]): Set<string> {
  // Required property checks have already rejected a missing file-path column.
  const pathName = byProperty.get(`${BIA}filePath`)!.columnName;
  const paths = columnValues(table, pathName);
  if (new Set(paths.map(duplicateKey)).size !== paths.length) {
    issue(issues, 'File list contains multiple references to the same file path.');
  }
  const context = metadata.parserContext ?? {};
  const listProperties = context.multivalued_properties ?? DEFAULT_LIST_PROPERTIES;
  if (!(listProperties instanceof Set) && !Array.isArray(listProperties)) {
    throw new TypeError('multivalued_properties in context should be a list (of string or URIRefs of the properties)');
  }
  for (const column of columns.values()) {
    if (!(listProperties instanceof Set ? listProperties.has(column.propertyUrl) : listProperties.includes(column.propertyUrl))) continue;
    const values = columnValues(table, column.columnName).map(value => {
      if (typeof value !== 'string' || !strip(value)) return [];
      return strip(value).replace(/^[\[\] ]+|[\[\] ]+$/g, '').split(LIST_SPLIT)
        .filter(part => strip(part)).map(part => strip(part).replace(/^["']+|["']+$/g, ''));
    });
    // columnValues above throws if this column is absent.
    table.columns.get(column.columnName)!.values = values;
    table.rows.forEach((row, index) => row.set(column.columnName, values[index]));
  }

  const referenceColumns = [...new Map([...columns.values()]
    .filter(column => METADATA_REFERENCE_TYPES.has(column.propertyUrl))
    .map(column => [column.columnName, column])).values()];
  // columnValues has already confirmed this column exists.
  const pathColumn = table.columns.get(pathName);
  const rowPath = (row: Map<string | undefined, CellValue>, index: number) => pythonString(row.get(pathName), pathColumn!.floating || pathColumn!.floatingIndices?.has(index));
  // Python returns only the first metadata-reference error from each row.
  for (const [index, row] of table.rows.entries()) {
    let invalid = false;
    for (const column of referenceColumns) {
      columnValues(table, column.columnName);
      for (const reference of references(row.get(column.columnName))) {
        let message;
        if (!metadata.entities.has(reference)) message = `${pythonString(reference)} does not exist in ro-crate-metadata.json`;
        else if (metadata.modelTypes.get(reference) !== METADATA_REFERENCE_TYPES.get(column.propertyUrl)) {
          message = `${pythonString(reference)} references an object of unexpected type.`;
        }
        if (message) {
          issue(issues, message, `In file list, at row: ${rowPath(row, index)}.`);
          invalid = true;
          break;
        }
      }
      if (invalid) break;
    }
  }

  const selfColumns = [...new Map([...columns.values()]
    .filter(column => column.propertyUrl === `${BIA}associatedSourceImage`)
    .map(column => [column.columnName, column])).values()];
  if (selfColumns.length) {
    const typeName = byProperty.get(RDF_TYPE)?.columnName;
    if (!typeName) {
      issue(issues, `File list contains columns that reference others (${selfColumns.map(column => column.columnName).join(', ')}) but no column with propertyUrl rdf:type.`);
    } else {
      const types = columnValues(table, typeName);
      const fileTypes = referenceTypes(table, pathName, types);
      const nameColumn = byProperty.get(`${SCHEMA}name`);
      const nameTypes = nameColumn?.columnName ? referenceTypes(table, nameColumn.columnName, types) : new Map();
      const selfIssues: ValidationIssue[] = [];
      for (const [index, row] of table.rows.entries()) {
        for (const column of selfColumns) {
          columnValues(table, column.columnName);
          for (const reference of references(row.get(column.columnName))) {
            const lookup = nameTypes.has(reference) ? nameTypes : fileTypes;
            let message;
            if (!lookup.has(reference)) message = `Reference '${reference}' not found in file list.`;
            else {
              const type = lookup.get(reference);
              if (Array.isArray(type)) {
                // pandas missingness is scalar-compatible only for singleton lists.
                // RDFLib then converts the entire list to its repr, not its member.
                if (type.length !== 1) throw new TypeError('The truth value of an array is ambiguous');
                message = `Reference '${reference}' has rdf:type '${pythonString(type)}', expected '${BIA}Image'.`;
              } else if (type === null || !type) message = `Reference '${reference}' has no rdf:type, expected '${BIA}Image'.`;
              else if (typeof type !== 'string') throw new TypeError('argument of type is not iterable');
              else if (type !== `${BIA}Image`) message = `Reference '${reference}' has rdf:type '${type}', expected '${BIA}Image'.`;
            }
            if (message) issue(selfIssues, message, `In file list, at row: ${rowPath(row, index)}`);
          }
        }
      }
      // The reference commits self-reference findings only after the full scan.
      for (const finding of selfIssues) issues.push(finding);
    }
  }
  raiseErrors(issues);

  const schemaNames = new Set([...columns.values()].map(column => column.columnName));
  const missing = table.names.filter(name => !schemaNames.has(name));
  if (missing.length) {
    throw new Error(`Schema does not contain columns with names that match data columns: {${missing.map(name => `'${name}'`).join(', ')}}`);
  }
  const inbound = new Set<string>();
  const columnIDs = new Map([...columns].map(([id, column]) => [column.columnName, id]));
  for (const [id, column] of columns) {
    if (!METADATA_REFERENCE_TYPES.has(column.propertyUrl)) continue;
    if (columnIDs.get(column.columnName) !== id || !table.columns.has(column.columnName)) throw new Error(`'${id}'`);
    for (const value of columnValues(table, column.columnName)) {
      for (const reference of references(value)) {
        if (String(reference)) inbound.add(String(reference));
      }
    }
  }
  return inbound;
}
