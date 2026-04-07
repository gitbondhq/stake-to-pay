import { readFileSync } from 'node:fs'

import { parseRepoConfig, type RepoConfig } from '@gitbondhq/mppx-stake'

export function loadRepoConfig(repoConfigPath: URL): RepoConfig {
  return parseRepoConfig(JSON.parse(readFileSync(repoConfigPath, 'utf8')))
}
