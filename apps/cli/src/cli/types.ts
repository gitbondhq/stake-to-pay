export type BaseCommandOptions = {
  contract?: string
  rpcUrl?: string
}

export type WriteCommandOptions = BaseCommandOptions & {
  noWait?: boolean
  privateKey?: string
}
