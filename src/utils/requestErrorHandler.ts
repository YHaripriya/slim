/**
 * Global handler for DICOM "request failed" errors so they never surface as
 * uncaught runtime errors. Must be installed as early as possible (e.g. index.tsx).
 *
 * The dicomweb-client rejects promises with Error('request failed') when XHR fails.
 * If nothing catches that rejection (e.g. after switching studies), the browser
 * and React's overlay treat it as uncaught. This handler preventDefault()s and
 * dispatches a custom event so the Viewer can show in-app error UI.
 */

const REQUEST_FAILED = 'request failed'

function isRequestFailedReason(reason: unknown): boolean {
  if (reason instanceof Error) {
    const msg = reason.message ?? ''
    return msg === REQUEST_FAILED || msg.toLowerCase().includes(REQUEST_FAILED)
  }
  if (typeof reason === 'string') {
    return (
      reason === REQUEST_FAILED || reason.toLowerCase().includes(REQUEST_FAILED)
    )
  }
  return false
}

let lastRequestFailedError: Error | null = null

function dispatchRequestFailed(err: Error): void {
  console.error('[SLIM] Request failed (handled):', err)
  lastRequestFailedError = err
  window.dispatchEvent(new CustomEvent('slim-request-failed', { detail: err }))
}

/** Call from Viewer on mount to pick up any request-failed that fired before mount */
export function getAndClearLastRequestFailedError(): Error | null {
  const e = lastRequestFailedError
  lastRequestFailedError = null
  return e
}

function installGlobalRequestFailedHandler(): void {
  // Promise rejections: dicomweb-client uses reject(error), not throw
  window.addEventListener(
    'unhandledrejection',
    (event: PromiseRejectionEvent) => {
      if (!isRequestFailedReason(event.reason)) return
      event.preventDefault()
      event.stopPropagation()
      const err =
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason))
      dispatchRequestFailed(err)
    },
    { capture: true },
  )

  // Synchronous throws: e.g. from XHR onreadystatechange in some paths
  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      const msg = event.message ?? event.error?.message ?? ''
      if (
        msg === REQUEST_FAILED ||
        (typeof msg === 'string' && msg.toLowerCase().includes(REQUEST_FAILED))
      ) {
        event.preventDefault()
        event.stopPropagation()
        const err = event.error instanceof Error ? event.error : new Error(msg)
        dispatchRequestFailed(err)
        return true
      }
      return false
    },
    true,
  )
}

export { installGlobalRequestFailedHandler, isRequestFailedReason }
