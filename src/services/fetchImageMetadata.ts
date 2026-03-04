// skipcq: JS-C1003
import * as dmv from 'dicom-microscopy-viewer'

import type DicomWebManager from '../DicomWebManager'
import { createSlides, type Slide } from '../data/slides'
import { StorageClasses } from '../data/uids'
import { CustomError, errorTypes } from '../utils/CustomError'
import NotificationMiddleware, {
  NotificationMiddlewareContext,
} from './NotificationMiddleware'

interface FetchImageMetadataParams {
  clients: { [key: string]: DicomWebManager }
  studyInstanceUID: string
  onSuccess: (slides: Slide[]) => void
  onError: (error: Error) => void
}

export const fetchImageMetadata = async ({
  clients,
  studyInstanceUID,
  onSuccess,
  onError,
}: FetchImageMetadataParams): Promise<void> => {
  const reportError = (err: unknown): void => {
    const raw = err as Error
    console.error(raw)
    const message =
      raw?.message === 'request failed' ||
      raw?.message?.toLowerCase().includes('fetch') ||
      raw?.message?.toLowerCase().includes('network')
        ? 'Request failed. The server may be unreachable or the request was rejected.'
        : 'Image metadata could not be retrieved or decoded.'
    const errorToReport = new CustomError(
      errorTypes.ENCODINGANDDECODING,
      message,
    )
    onError(errorToReport)
    NotificationMiddleware.onError(
      NotificationMiddlewareContext.SLIM,
      errorToReport,
    )
  }

  try {
    const images: dmv.metadata.VLWholeSlideMicroscopyImage[][] = []
    console.info(`search for series of study "${studyInstanceUID}"...`)

    const client = clients[StorageClasses.VL_WHOLE_SLIDE_MICROSCOPY_IMAGE]
    const matchedSeries = await Promise.resolve(
      client.searchForSeries({
        queryParams: {
          Modality: 'SM',
          StudyInstanceUID: studyInstanceUID,
        },
      }),
    )

    await Promise.all(
      matchedSeries.map(async (s) => {
        const { dataset } = dmv.metadata.formatMetadata(s)
        const loadingSeries = dataset as dmv.metadata.Series
        console.info(
          `retrieve metadata of series "${loadingSeries.SeriesInstanceUID}"`,
        )
        const retrievedMetadata = await client.retrieveSeriesMetadata({
          studyInstanceUID,
          seriesInstanceUID: loadingSeries.SeriesInstanceUID,
        })

        const seriesImages: dmv.metadata.VLWholeSlideMicroscopyImage[] = []
        retrievedMetadata.forEach((item) => {
          if (
            item['00080016']?.Value?.[0] ===
            StorageClasses.VL_WHOLE_SLIDE_MICROSCOPY_IMAGE
          ) {
            const image = new dmv.metadata.VLWholeSlideMicroscopyImage({
              metadata: item,
            })
            seriesImages.push(image)
          }
        })

        if (seriesImages.length > 0) {
          images.push(seriesImages)
        }
      }),
    )
    const newSlides = createSlides(images)
    onSuccess(newSlides)
  } catch (err) {
    reportError(err)
  }
}
