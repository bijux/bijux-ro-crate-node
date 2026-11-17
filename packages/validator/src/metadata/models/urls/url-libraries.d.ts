declare module 'whatwg-url/lib/url-state-machine.js' {
  type Host = string | number | number[]
  interface URLRecord { scheme: string; host: Host | null }
  const parser: {
    basicURLParse(value: string, options: {rustFileURLs: boolean}): URLRecord | null
    serializeHost(host: Host): string
    serializeURL(record: URLRecord): string
  }
  export default parser
}

declare module 'tr46' {
  const tr46: {
    toASCII(domain: string, options: {
      checkHyphens: boolean; checkBidi: boolean; checkJoiners: boolean
      useSTD3ASCIIRules: boolean; verifyDNSLength: boolean
      transitionalProcessing: boolean; ignoreInvalidPunycode: boolean
    }): string | null
  }
  export default tr46
}
