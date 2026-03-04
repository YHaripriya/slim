// skipcq: JS-C1003
import * as dmv from 'dicom-microscopy-viewer'
import { useCallback, useEffect, useState } from 'react'

import type DicomWebManager from '../DicomWebManager'
import { StorageClasses } from '../data/uids'

const DEFAULT_LIMIT = 200

interface UseWorklistStudiesProps {
  clients?: { [key: string]: DicomWebManager }
  limit?: number
  enabled?: boolean
}

interface UseWorklistStudiesReturn {
  studies: dmv.metadata.Study[]
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Fetches worklist studies (SM modality) for use in Slide Gallery and elsewhere.
 * Same data source as the Worklist table.
 */
export function useWorklistStudies({
  clients,
  limit = DEFAULT_LIMIT,
  enabled = true,
}: UseWorklistStudiesProps = {}): UseWorklistStudiesReturn {
  const [studies, setStudies] = useState<dmv.metadata.Study[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchStudies = useCallback(() => {
    if (clients == null) {
      setStudies([])
      return
    }
    const client = clients[StorageClasses.VL_WHOLE_SLIDE_MICROSCOPY_IMAGE]
    if (client == null) {
      setStudies([])
      return
    }
    setIsLoading(true)
    setError(null)
    const queryParams: Record<string, string | number> = {
      ModalitiesInStudy: 'SM',
      limit,
    }
    const searchOptions = { queryParams }
    client
      .searchForStudies(searchOptions)
      .then((rawStudies) => {
        try {
          const formatted = rawStudies.slice(0, limit).map((study) => {
            try {
              const { dataset } = dmv.metadata.formatMetadata(study)
              return dataset as dmv.metadata.Study
            } catch (_e) {
              return null
            }
          })
          setStudies(
            formatted.filter((s): s is dmv.metadata.Study => s != null),
          )
        } catch (e) {
          setError(e instanceof Error ? e : new Error(String(e)))
          setStudies([])
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)))
        setStudies([])
      })
      .finally(() => setIsLoading(false))
  }, [clients, limit])

  useEffect(() => {
    if (enabled && clients != null) fetchStudies()
    else if (!enabled) setStudies([])
  }, [enabled, clients, fetchStudies])

  return { studies, isLoading, error, refetch: fetchStudies }
}
