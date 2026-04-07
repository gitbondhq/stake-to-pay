export type BaseCommandOptions = {
  contract?: string
  rpcUrl?: string
}

export type SigningOptions = {
  account?: string
  keystore?: string
  passwordFile?: string
  privateKey?: string
}

export type WriteCommandOptions = BaseCommandOptions &
  SigningOptions & {
    noWait?: boolean
  }
