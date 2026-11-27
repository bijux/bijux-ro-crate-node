import type {RecoveryResult} from '../../../drafts/recovery-codec'

export interface EditorRecovery {
  beginRecoverySelection(): number
  currentRecoverySelection(selection:number): boolean
  capture(): string
  adopt(result:RecoveryResult, backup:string, options?:{message?:string; verify?:()=>Promise<boolean>; current?:()=>boolean; committed?:()=>void; selection?:number}): Promise<boolean>
  readOnly(message:string, backup:string): void
  download(backup:string, filename:string): void
}
