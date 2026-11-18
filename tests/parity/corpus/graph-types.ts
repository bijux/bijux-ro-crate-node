export type JSONValue = null | boolean | number | string | JSONValue[] | {[key: string]: JSONValue}
export type GraphNode = {[key: string]: JSONValue}
export interface GraphCorpusInput {files: Record<string, string>}
export interface GraphCorpusDocument {'@context': JSONValue[]; '@graph': JSONValue}
export interface GraphCorpusCase {name: string; files: Record<string, string>; kind: 'mutation'}
