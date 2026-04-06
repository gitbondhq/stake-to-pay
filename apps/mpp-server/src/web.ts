import type { AppConfig } from './config.js'

type HeaderMap = Record<string, string | string[] | undefined>

type OriginRequest = {
  headers: HeaderMap
  protocol: string
}

type WebRequestInput = OriginRequest & {
  method: string
  originalUrl: string
}

type WebResponseTarget = {
  end(body?: Uint8Array): void
  setHeader(name: string, value: string): void
  status(code: number): WebResponseTarget
}

export const getOrigin = (req: OriginRequest, config: AppConfig): string => {
  const hostHeader = req.headers.host
  const host =
    typeof hostHeader === 'string' && hostHeader.length > 0
      ? hostHeader
      : `${config.host}:${config.port}`

  return `${req.protocol}://${host}`
}

export const sendWebResponse = async (
  res: WebResponseTarget,
  response: Response,
) => {
  res.status(response.status)
  for (const [key, value] of response.headers) res.setHeader(key, value)

  const body = new Uint8Array(await response.arrayBuffer())
  res.end(body)
}

export const toWebRequest = (
  req: WebRequestInput,
  config: AppConfig,
): Request => {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(', '))
    else if (typeof value === 'string') headers.set(key, value)
  }

  return new Request(`${getOrigin(req, config)}${req.originalUrl}`, {
    headers,
    method: req.method,
  })
}
