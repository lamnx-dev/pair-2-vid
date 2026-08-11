declare module "piper-phonemize" {
  export function initialize(): Promise<void>
  export function phonemize(text: string, voice?: string): number[][]
  export function phonemizeToString(text: string, voice?: string): string[] | string
  export const version: string
}
