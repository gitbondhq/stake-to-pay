import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const documentFileUrl = new URL('../content/document.md', import.meta.url)

export type LoadedDocument = {
  fullText: string
  path: string
  preview: string
  previewPath: string
  resource: string
  slug: string
  title: string
}

export const loadDocument = (): LoadedDocument => {
  const source = readFileSync(documentFileUrl, 'utf8').replace(/\r\n/g, '\n')
  const [heading, ...rest] = source.trim().split('\n')
  if (!heading?.startsWith('# ')) {
    throw new Error('apps/mpp-server/content/document.md must start with an H1 heading.')
  }

  const title = heading.slice(2).trim()
  if (!title) {
    throw new Error('apps/mpp-server/content/document.md H1 heading cannot be empty.')
  }

  const sections = rest
    .join('\n')
    .trim()
    .split(/\n\s*\n+/)
    .map(section => section.trim())
    .filter(section => section.length > 0)

  if (sections.length < 2) {
    throw new Error(
      'apps/mpp-server/content/document.md must include a preview paragraph and body content.',
    )
  }

  const preview = sections[0]!
  const fullTextSections = sections.slice(1)
  const slug = basename(documentFileUrl.pathname, '.md')
  const path = `/documents/${slug}`

  return {
    fullText: fullTextSections.join('\n\n'),
    path,
    preview,
    previewPath: `${path}/preview`,
    resource: `documents/${slug}`,
    slug,
    title,
  }
}
