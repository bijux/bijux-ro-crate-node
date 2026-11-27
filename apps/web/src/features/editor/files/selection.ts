/** Retain a rejected browser selection without copying file payloads or rendering the files panel. */
export interface FileSelection {
  readonly input:HTMLInputElement
  readonly mode:'files' | 'directory'
  readonly issue:string
}
