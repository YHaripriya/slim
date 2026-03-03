// skipcq: JS-C1003
import type * as dmv from 'dicom-microscopy-viewer'
// skipcq: JS-C1003
import type * as dwc from 'dicomweb-client'
import { useEffect, useRef } from 'react'

import type { Slide } from '../../data/slides'
import { constructViewers } from './utils/viewerUtils'

export interface CreateViewersOptions {
  clients: { [key: string]: dwc.api.DICOMwebClient }
  slide: Slide
  preload?: boolean
  clusteringPixelSizeThreshold?: number
}

export interface CreateViewersResult {
  volumeViewer: dmv.viewer.VolumeImageViewer
  labelViewer: dmv.viewer.LabelImageViewer | null
  /** [offset, size] from volumeViewer.boundingBox */
  boundingBox: readonly [number[], number[]]
}

/**
 * Create volume and label viewers for a slide, deactivate all optical paths,
 * and return viewers plus bounding box for initial state.
 * Use this in the class constructor and in componentDidUpdate (or in the hook).
 */
export function createViewersForSlide(
  options: CreateViewersOptions,
): CreateViewersResult {
  const { volumeViewer, labelViewer } = constructViewers({
    clients: options.clients,
    slide: options.slide,
    preload: options.preload,
    clusteringPixelSizeThreshold: options.clusteringPixelSizeThreshold,
  })

  volumeViewer.getAllOpticalPaths().forEach((opticalPath) => {
    volumeViewer.deactivateOpticalPath(opticalPath.identifier)
  })

  // Activate the first optical path so the slide image is visible by default
  const opticalPaths = volumeViewer.getAllOpticalPaths()
  if (opticalPaths.length > 0) {
    volumeViewer.activateOpticalPath(opticalPaths[0].identifier)
  }

  const [offset, size] = volumeViewer.boundingBox
  const boundingBox: [number[], number[]] = [offset, size]

  return {
    volumeViewer,
    labelViewer: labelViewer ?? null,
    boundingBox,
  }
}

export interface OpticalPathState {
  activeOpticalPathIdentifiers: Set<string>
  visibleOpticalPathIdentifiers: Set<string>
}

/**
 * Read active/visible optical path identifiers from a volume viewer.
 * Used when recreating viewers in componentDidUpdate to sync state.
 */
export function getOpticalPathStateFromViewer(
  volumeViewer: dmv.viewer.VolumeImageViewer,
): OpticalPathState {
  const activeOpticalPathIdentifiers = new Set<string>()
  const visibleOpticalPathIdentifiers = new Set<string>()

  volumeViewer.getAllOpticalPaths().forEach((opticalPath) => {
    const identifier = opticalPath.identifier
    if (volumeViewer.isOpticalPathVisible(identifier)) {
      visibleOpticalPathIdentifiers.add(identifier)
    }
    if (volumeViewer.isOpticalPathActive(identifier)) {
      activeOpticalPathIdentifiers.add(identifier)
    }
  })

  return {
    activeOpticalPathIdentifiers,
    visibleOpticalPathIdentifiers,
  }
}

/**
 * Clean up volume and label viewers (e.g. before recreating or on unmount).
 * No-op if volumeViewer is null/undefined.
 */
export function cleanupViewers(
  volumeViewer: dmv.viewer.VolumeImageViewer | null | undefined,
  labelViewer: dmv.viewer.LabelImageViewer | null | undefined,
): void {
  if (volumeViewer != null) {
    volumeViewer.cleanup()
  }
  if (labelViewer != null) {
    labelViewer.cleanup()
  }
}

export interface UseSlideViewerViewersOptions {
  clients: { [key: string]: dwc.api.DICOMwebClient }
  slide: Slide
  preload?: boolean
  clusteringPixelSizeThreshold?: number | null
  isClusteringEnabled?: boolean
}

/**
 * Hook: own viewer instances and recreate when slide/clients/preload change.
 * For use when SlideViewer is converted to a function component.
 * Returns refs to the current volume and label viewers.
 */
export function useSlideViewerViewers(options: UseSlideViewerViewersOptions): {
  volumeViewerRef: React.MutableRefObject<dmv.viewer.VolumeImageViewer | null>
  labelViewerRef: React.MutableRefObject<dmv.viewer.LabelImageViewer | null>
} {
  const volumeViewerRef = useRef<dmv.viewer.VolumeImageViewer | null>(null)
  const labelViewerRef = useRef<dmv.viewer.LabelImageViewer | null>(null)

  const {
    clients,
    slide,
    preload,
    clusteringPixelSizeThreshold,
    isClusteringEnabled = true,
  } = options

  useEffect(() => {
    const clustering =
      isClusteringEnabled && clusteringPixelSizeThreshold != null
        ? clusteringPixelSizeThreshold
        : undefined

    cleanupViewers(volumeViewerRef.current, labelViewerRef.current)
    volumeViewerRef.current = null
    labelViewerRef.current = null

    const result = createViewersForSlide({
      clients,
      slide,
      preload,
      clusteringPixelSizeThreshold: clustering,
    })

    volumeViewerRef.current = result.volumeViewer
    labelViewerRef.current = result.labelViewer

    return () => {
      cleanupViewers(result.volumeViewer, result.labelViewer)
      volumeViewerRef.current = null
      labelViewerRef.current = null
    }
  }, [
    clients,
    slide,
    preload,
    clusteringPixelSizeThreshold,
    isClusteringEnabled,
  ])

  return { volumeViewerRef, labelViewerRef }
}
