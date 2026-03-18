/**
 * Shared test helper — capture process stdout/stderr and console.log/error.
 */

export interface CapturedOutput {
  out: () => string
  err: () => string
  restore: () => void
}

export function captureOutput(): CapturedOutput {
  const outChunks: string[] = []
  const errChunks: string[] = []
  const origOut = process.stdout.write
  const origErr = process.stderr.write
  const origLog = console.log
  const origConsoleErr = console.error

  process.stdout.write = ((c: string) => { outChunks.push(c); return true }) as typeof process.stdout.write
  process.stderr.write = ((c: string) => { errChunks.push(c); return true }) as typeof process.stderr.write
  console.log = (...args: unknown[]) => { outChunks.push(args.join(' ') + '\n') }
  console.error = (...args: unknown[]) => { errChunks.push(args.join(' ') + '\n') }

  return {
    out: () => outChunks.join(''),
    err: () => errChunks.join(''),
    restore: () => {
      process.stdout.write = origOut
      process.stderr.write = origErr
      console.log = origLog
      console.error = origConsoleErr
    },
  }
}
