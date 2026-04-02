declare module 'express' {
  export type NextFunction = (error?: unknown) => void

  export type Request = {
    headers: Record<string, string | string[] | undefined>
    method: string
    originalUrl: string
    protocol: string
  }

  export type Response = {
    end(body?: Uint8Array): void
    json(body: unknown): void
    setHeader(name: string, value: string): void
    status(code: number): Response
  }

  export type RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => void | Promise<void>

  export type Express = {
    disable(name: string): Express
    get(path: string, ...handlers: RequestHandler[]): Express
    listen(port: number, hostname: string, callback?: () => void): void
  }

  type ExpressFactory = () => Express

  const express: ExpressFactory
  export default express
}
