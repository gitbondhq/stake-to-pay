export async function fetchWithOptions(parameters: {
  authorization?: string | undefined
  url: string
}): Promise<Response> {
  const headers = new Headers()

  if (parameters.authorization) {
    headers.set('authorization', parameters.authorization)
  }

  return fetch(parameters.url, {
    headers,
    method: 'GET',
  })
}

export async function serializeHttpResponse(response: Response): Promise<{
  body: unknown
  headers: Record<string, string>
  ok: boolean
  redirected: boolean
  status: number
  statusText: string
  url: string
}> {
  const bodyText = await response.text()
  return {
    body: parseResponseBody(bodyText, response.headers.get('content-type')),
    headers: Object.fromEntries(response.headers.entries()),
    ok: response.ok,
    redirected: response.redirected,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
  }
}

function parseResponseBody(
  bodyText: string,
  contentType: string | null,
): unknown {
  if (bodyText.length === 0) return null

  const wantsJson =
    contentType?.includes('application/json') ||
    contentType?.includes('+json') ||
    bodyText.startsWith('{') ||
    bodyText.startsWith('[')

  if (wantsJson) {
    try {
      return JSON.parse(bodyText) as unknown
    } catch {
      return bodyText
    }
  }

  return bodyText
}
