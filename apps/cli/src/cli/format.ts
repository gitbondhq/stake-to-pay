import { writeFile } from 'node:fs/promises'

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, jsonReplacer, 2)}\n`)
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, jsonReplacer, 2)}\n`, 'utf8')
}

export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString()
  }

  return value
}
