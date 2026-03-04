import { useEffect, useLayoutEffect, useMemo, useState } from 'react'

import type DicomWebManager from '../DicomWebManager'
import type { Slide } from '../data/slides'
import { fetchImageMetadata } from '../services/fetchImageMetadata'

interface UseSlidesProps {
  clients?: { [key: string]: DicomWebManager }
  studyInstanceUID?: string
  /** When false, do not fetch; load worklist first then enable to fetch slides */
  enabled?: boolean
}

interface UseSlidesReturn {
  slides: Slide[]
  isLoading: boolean
  error: Error | null
}

const slidesCache = new Map<string, Slide[]>()
const pendingRequests = new Map<string, Promise<Slide[]>>()
const cacheTimestamps = new Map<string, number>()

// Cache expiration time: 30 minutes
const CACHE_EXPIRATION_TIME = 30 * 60 * 1000

// Clean up expired cache entries
const cleanupExpiredCache = (): void => {
  const now = Date.now()
  for (const [key, timestamp] of cacheTimestamps.entries()) {
    if (now - timestamp > CACHE_EXPIRATION_TIME) {
      slidesCache.delete(key)
      cacheTimestamps.delete(key)
    }
  }
}

// Utility functions for cache management
export const clearSlidesCache = (studyInstanceUID?: string): void => {
  if (
    studyInstanceUID !== null &&
    studyInstanceUID !== undefined &&
    studyInstanceUID !== '' &&
    studyInstanceUID.length > 0
  ) {
    slidesCache.delete(studyInstanceUID)
    cacheTimestamps.delete(studyInstanceUID)
    pendingRequests.delete(studyInstanceUID)
  } else {
    slidesCache.clear()
    cacheTimestamps.clear()
    pendingRequests.clear()
  }
}

export const getCachedSlides = (
  studyInstanceUID: string,
): Slide[] | undefined => {
  return slidesCache.get(studyInstanceUID)
}

export const isSlidesCached = (studyInstanceUID: string): boolean => {
  return slidesCache.has(studyInstanceUID)
}

/**
 * Hook to fetch and manage whole slide microscopy images for a given study.
 * Values are cached so they can be reused if props are not provided.
 * If no arguments are provided, returns the most recently cached slides.
 *
 * @param props - Hook configuration props (optional)
 * @param props.clients - Map of DICOM web clients keyed by storage class
 * @param props.studyInstanceUID - Study instance UID to fetch slides for
 */
export const useSlides = ({
  clients,
  studyInstanceUID,
  enabled = true,
}: UseSlidesProps = {}): UseSlidesReturn => {
  const [slides, setSlides] = useState<Slide[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<Error | null>(null)

  // Clear stale slides as soon as study changes so we never render with wrong study's data
  useLayoutEffect(() => {
    if (
      !enabled ||
      !studyInstanceUID ||
      studyInstanceUID.length === 0 ||
      !clients
    ) {
      return
    }
    if (slidesCache.has(studyInstanceUID)) {
      return
    }
    setSlides([])
    setIsLoading(true)
    setError(null)
  }, [enabled, studyInstanceUID, clients])

  useEffect(() => {
    // Clean up expired cache entries periodically
    cleanupExpiredCache()

    if (!enabled) {
      setSlides([])
      setIsLoading(false)
      setError(null)
      return
    }

    // If no arguments provided, return cached slides if available
    if (
      clients === null ||
      clients === undefined ||
      studyInstanceUID === null ||
      studyInstanceUID === undefined ||
      studyInstanceUID === '' ||
      studyInstanceUID.length === 0
    ) {
      // Get the most recently cached slides (last entry in the cache)
      const cachedEntries = Array.from(slidesCache.entries())
      if (cachedEntries.length > 0) {
        const lastCachedSlides = cachedEntries[cachedEntries.length - 1][1]
        setSlides(lastCachedSlides)
        setIsLoading(false)
        setError(null)
      } else {
        setSlides([])
        setIsLoading(false)
        setError(null)
      }
      return
    }

    const cachedData = slidesCache.get(studyInstanceUID)
    if (cachedData !== undefined) {
      setSlides(cachedData)
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)
    setSlides([]) // Clear stale slides for previous study so redirect/first-series uses correct data

    // Ensure any in-flight request for a *different* study never triggers unhandled rejection
    // when it fails after the user has already switched (root cause of "request failed" on toggle).
    for (const [uid, p] of pendingRequests.entries()) {
      if (uid !== studyInstanceUID) p.catch(() => {})
    }

    const fetchSlides = async (): Promise<void> => {
      // Check if there's already a pending request for this study
      let pendingRequest = pendingRequests.get(studyInstanceUID)

      if (pendingRequest === undefined) {
        // Create a new promise for this request.
        // Root cause of "request failed" on study switch: when you toggle to study B,
        // the in-flight request for study A is still running. When it fails or is
        // aborted, that promise rejects. The effect that started it is no longer
        // active (we're now in the effect for B), so the rejection is unhandled.
        // Attach .catch() so the promise never triggers unhandledrejection.
        pendingRequest = new Promise<Slide[]>((resolve, reject): void => {
          fetchImageMetadata({
            clients,
            studyInstanceUID,
            onSuccess: (newSlides) => {
              slidesCache.set(studyInstanceUID, newSlides)
              cacheTimestamps.set(studyInstanceUID, Date.now())
              resolve(newSlides)
            },
            onError: (err) => {
              reject(err)
            },
          }).catch((err) => {
            reject(err)
          })
        })
        pendingRequest.catch(() => {
          // Swallow rejection when user has already switched study (no one is awaiting).
        })
        pendingRequests.set(studyInstanceUID, pendingRequest)
      }

      try {
        const newSlides = await Promise.resolve(pendingRequest)
        setSlides(newSlides)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        setSlides([])
      } finally {
        pendingRequests.delete(studyInstanceUID)
        setIsLoading(false)
      }
    }

    void fetchSlides().catch((err) => {
      setError(err instanceof Error ? err : new Error(String(err)))
      setSlides([])
      setIsLoading(false)
      pendingRequests.delete(studyInstanceUID)
    })
  }, [clients, studyInstanceUID, enabled])

  // Memoize the return value to prevent unnecessary re-renders
  return useMemo(
    () => ({
      slides,
      isLoading,
      error,
    }),
    [slides, isLoading, error],
  )
}
