import { UndoOutlined } from '@ant-design/icons'
import {
  Checkbox,
  Descriptions,
  Divider,
  Layout,
  Menu,
  message,
  Row,
  Select,
  Space,
  Tooltip,
} from 'antd'
import type { CheckboxChangeEvent } from 'antd/es/checkbox'
// skipcq: JS-C1003
import * as dcmjs from 'dcmjs'
// skipcq: JS-C1003
import * as dmv from 'dicom-microscopy-viewer'
// skipcq: JS-C1003
import type * as dwc from 'dicomweb-client'
import type { DebouncedFunc } from 'lodash'
import debounce from 'lodash/debounce'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FaCrosshairs,
  FaDrawPolygon,
  FaEye,
  FaEyeSlash,
  FaHandPaper,
  FaHandPointer,
  FaSave,
  FaTrash,
} from 'react-icons/fa'
import { runValidations } from '../contexts/ValidationContext'
import { useViewerPanels } from '../contexts/ViewerPanelsContext'
import { useViewerToolbar } from '../contexts/ViewerToolbarContext'
import { StorageClasses } from '../data/uids'
import DicomMetadataStore from '../services/DICOMMetadataStore'
import NotificationMiddleware, {
  NotificationMiddlewareContext,
} from '../services/NotificationMiddleware'
import { adaptRoiToAnnotation } from '../services/RoiToAnnotationAdapter'
import type { AnnotationCategoryAndType } from '../types/annotations'
import { CustomError, errorTypes } from '../utils/CustomError'
import generateReport from '../utils/generateReport'
import { logger } from '../utils/logger'
import { withRouter } from '../utils/router'
import { getSegmentationType, getSegmentColor } from '../utils/segmentColors'
import { findContentItemsByName } from '../utils/sr'
import AnnotationGroupList from './AnnotationGroupList'
import AnnotationList from './AnnotationList'
import Btn from './Button'
import ClusteringSettings from './ClusteringSettings'
import Equipment from './Equipment'
import HoveredRoiTooltip from './HoveredRoiTooltip'
import MappingList from './MappingList'
import OpticalPathList from './OpticalPathList'
import Report, { MeasurementReport } from './Report'
import SegmentList from './SegmentList'
import {
  DEFAULT_ANNOTATION_COLOR_PALETTE,
  DEFAULT_ANNOTATION_OPACITY,
  DEFAULT_ANNOTATION_STROKE_COLOR,
  DEFAULT_ROI_FILL_COLOR,
  DEFAULT_ROI_RADIUS,
  DEFAULT_ROI_STROKE_COLOR,
  DEFAULT_ROI_STROKE_WIDTH,
} from './SlideViewer/constants'
import SlideViewerContent from './SlideViewer/SlideViewerContent'
import SlideViewerModals from './SlideViewer/SlideViewerModals'
import SlideViewerSidebar from './SlideViewer/SlideViewerSidebar'
import type {
  Evaluation,
  SlideViewerProps,
  SlideViewerState,
  StyleOptions,
} from './SlideViewer/types'
import { getSlideViewerAnnotationOptions } from './SlideViewer/useSlideViewerState'
import {
  cleanupViewers,
  createViewersForSlide,
  getOpticalPathStateFromViewer,
} from './SlideViewer/useSlideViewerViewers'
import {
  areROIsEqual,
  buildKey,
  formatRoiStyle,
  getRoiKey,
} from './SlideViewer/utils/roiUtils'
import {
  containsROIAnnotations,
  describesSpecimenSubject,
  implementsTID1500,
} from './SlideViewer/utils/viewerUtils'
import SpecimenList from './SpecimenList'

const SELECTION_STROKE_COLOR = [0, 153, 255]
const SELECTION_FILL_COLOR = [255, 255, 255]
const defaultRoiStyle: dmv.viewer.ROIStyleOptions = {
  stroke: {
    color: DEFAULT_ROI_STROKE_COLOR,
    width: DEFAULT_ROI_STROKE_WIDTH,
  },
  fill: { color: DEFAULT_ROI_FILL_COLOR },
  image: {
    circle: {
      fill: { color: DEFAULT_ROI_STROKE_COLOR },
      radius: DEFAULT_ROI_RADIUS,
    },
  },
}
const selectedRoiStyle: dmv.viewer.ROIStyleOptions = {
  stroke: { color: [...SELECTION_STROKE_COLOR, 1], width: 3 },
  fill: { color: [...SELECTION_FILL_COLOR, 0.5] },
  image: {
    circle: {
      radius: 5,
      fill: { color: [...SELECTION_STROKE_COLOR, 1] },
    },
  },
}

function createSegmentPaletteColorLookupTable(
  segmentColor: number[],
): dmv.color.PaletteColorLookupTable {
  const paletteData = [[0, 0, 0], segmentColor]
  return dmv.color.buildPaletteColorLookupTable({
    data: paletteData,
    firstValueMapped: 0,
  })
}

function getOpenSubMenuItems(): string[] {
  return ['specimens', 'optical-paths', 'annotations', 'presentation-states']
}

function getGeometryTypeOptionsMapping(): {
  [key: string]: React.ReactNode
} {
  return {
    point: (
      <Select.Option key="point" value="point">
        Point
      </Select.Option>
    ),
    circle: (
      <Select.Option key="circle" value="circle">
        Circle
      </Select.Option>
    ),
    box: (
      <Select.Option key="box" value="box">
        Box
      </Select.Option>
    ),
    polygon: (
      <Select.Option key="polygon" value="polygon">
        Polygon
      </Select.Option>
    ),
    line: (
      <Select.Option key="line" value="line">
        Line
      </Select.Option>
    ),
    freehandpolygon: (
      <Select.Option key="freehandpolygon" value="freehandpolygon">
        Polygon (freehand)
      </Select.Option>
    ),
    freehandline: (
      <Select.Option key="freehandline" value="freehandline">
        Line (freehand)
      </Select.Option>
    ),
  }
}

/**
 * React component for interactive viewing of an individual digital slide,
 * which corresponds to one DICOM Series of DICOM Slide Microscopy images and
 * potentially one or more associated DICOM Series of DICOM SR documents.
 */
function SlideViewer(props: SlideViewerProps) {
  const {
    findingOptions,
    evaluationOptions,
    geometryTypeOptions,
    measurements: _measurements,
    roiStyles: initialRoiStyles,
  } = useMemo(
    () => getSlideViewerAnnotationOptions(props.annotations, defaultRoiStyle),
    [props.annotations],
  )

  const volumeViewportRef = useRef<HTMLDivElement>(null)
  const labelViewportRef = useRef<HTMLDivElement>(null)
  const volumeViewerRef = useRef<dmv.viewer.VolumeImageViewer | null>(null)
  const labelViewerRef = useRef<dmv.viewer.LabelImageViewer | null>(null)
  const hoveredRoisRef = useRef<
    Array<{ roi: dmv.roi.ROI; annotationGroupUID: string | null }>
  >([])
  const lastPixelRef = useRef<[number, number]>([0, 0])
  const keysDownRef = useRef(new Set<string>())
  const lastHoveredRoiSignatureRef = useRef<string | null>(null)
  const annotationGroupMetadataCacheRef = useRef(
    new Map<string, dmv.metadata.MicroscopyBulkSimpleAnnotations>(),
  )
  const roiStylesRef = useRef<{
    [key: string]: dmv.viewer.ROIStyleOptions
  }>({ ...initialRoiStyles })
  const defaultAnnotationStylesRef = useRef<{
    [annotationUID: string]: StyleOptions
  }>({})

  if (
    Object.keys(roiStylesRef.current).length === 0 &&
    Object.keys(initialRoiStyles).length > 0
  ) {
    Object.assign(roiStylesRef.current, initialRoiStyles)
  }

  const [state, setState] = useState<SlideViewerState>({
    selectedRoiUIDs: new Set(),
    visibleRoiUIDs: new Set(),
    visibleSegmentUIDs: new Set(),
    visibleMappingUIDs: new Set(),
    visibleAnnotationGroupUIDs: new Set(),
    visibleOpticalPathIdentifiers: new Set(),
    activeOpticalPathIdentifiers: new Set(),
    presentationStates: [],
    selectedFinding: undefined,
    selectedEvaluations: [],
    generatedReport: undefined,
    isLoading: false,
    isAnnotationModalVisible: false,
    isSelectedRoiModalVisible: false,
    isHoveredRoiTooltipVisible: false,
    hoveredRoiTooltipX: 0,
    hoveredRoiTooltipY: 0,
    hoveredRoiAttributes: [],
    isSelectedMagnificationValid: false,
    isReportModalVisible: false,
    isRoiDrawingActive: false,
    isRoiTranslationActive: false,
    isRoiModificationActive: false,
    isGoToModalVisible: false,
    isSelectedXCoordinateValid: false,
    isSelectedYCoordinateValid: false,
    selectedXCoordinate: undefined,
    validXCoordinateRange: [0, 0],
    selectedYCoordinate: undefined,
    validYCoordinateRange: [0, 0],
    selectedMagnification: undefined,
    areRoisHidden: false,
    selectedSeriesInstanceUID: undefined,
    selectedSegmentationSeriesInstanceUID: undefined,
    pixelDataStatistics: {},
    selectedPresentationStateUID: props.selectedPresentationStateUID,
    loadingFrames: new Set(),
    isICCProfilesEnabled: true,
    isSegmentationInterpolationEnabled: false,
    isParametricMapInterpolationEnabled: true,
    customizedSegmentColors: {},
    clusteringPixelSizeThreshold: null,
    isClusteringEnabled: true,
  })
  const updateState = useCallback((update: Partial<SlideViewerState>) => {
    setState((prev) => ({ ...prev, ...update }))
  }, [])

  const { caseDetailsOpen, viewerLayersOpen } = useViewerPanels()
  const { setToolbar: setViewerToolbar } = useViewerToolbar()

  const handlePointerMoveDebouncedRef = useRef<
    DebouncedFunc<(event: CustomEventInit) => void>
  >(null as unknown as DebouncedFunc<(event: CustomEventInit) => void>)

  const stateRef = useRef(state)
  stateRef.current = state
  const propsRef = useRef(props)
  propsRef.current = props

  const _getVolumeViewer = () => volumeViewerRef.current ?? undefined
  const _getLabelViewer = () => labelViewerRef.current

  const _defaultAnnotationStyles = defaultAnnotationStylesRef.current

  const populateViewportsRef = useRef<() => void>(() => {})

  useEffect(() => {
    const {
      location,
      studyInstanceUID: _studyInstanceUID,
      seriesInstanceUID: _seriesInstanceUID,
      slide,
      clients,
      preload,
    } = propsRef.current
    const _pathname = location.pathname
    const isClusteringEnabled = stateRef.current.isClusteringEnabled
    const clusteringPixelSizeThreshold =
      stateRef.current.clusteringPixelSizeThreshold

    if (volumeViewportRef.current) volumeViewportRef.current.innerHTML = ''
    if (labelViewportRef.current) labelViewportRef.current.innerHTML = ''
    cleanupViewers(volumeViewerRef.current, labelViewerRef.current)

    const viewportResult = createViewersForSlide({
      clients,
      slide,
      preload,
      clusteringPixelSizeThreshold: isClusteringEnabled
        ? (clusteringPixelSizeThreshold ?? undefined)
        : undefined,
    })
    volumeViewerRef.current = viewportResult.volumeViewer
    labelViewerRef.current = viewportResult.labelViewer

    const opticalPathState = getOpticalPathStateFromViewer(
      viewportResult.volumeViewer,
    )
    const [offset, size] = viewportResult.boundingBox

    setState((prev) => ({
      ...prev,
      visibleRoiUIDs: new Set(),
      visibleSegmentUIDs: new Set(),
      visibleMappingUIDs: new Set(),
      visibleAnnotationGroupUIDs: new Set(),
      visibleOpticalPathIdentifiers:
        opticalPathState.visibleOpticalPathIdentifiers,
      activeOpticalPathIdentifiers:
        opticalPathState.activeOpticalPathIdentifiers,
      presentationStates: [],
      loadingFrames: new Set(),
      selectedSeriesInstanceUID: undefined,
      validXCoordinateRange: [offset[0], offset[0] + size[0]],
      validYCoordinateRange: [offset[1], offset[1] + size[1]],
    }))

    populateViewportsRef.current()

    return () => {
      cleanupViewers(volumeViewerRef.current, labelViewerRef.current)
      volumeViewerRef.current = null
      labelViewerRef.current = null
    }
  }, [])

  /**
   * Retrieve Presentation State instances that reference the any images of
   * the currently selected series.
   */
  const loadPresentationStates = (): void => {
    logger.log('search for Presentation State instances')
    const client =
      props.clients[StorageClasses.ADVANCED_BLENDING_PRESENTATION_STATE]
    client
      .searchForInstances({
        studyInstanceUID: props.studyInstanceUID,
        queryParams: {
          Modality: 'PR',
        },
      })
      .then((matchedInstances: dwc.api.Instance[] | null): void => {
        if (matchedInstances === null || matchedInstances === undefined) {
          matchedInstances = []
        }
        matchedInstances.forEach(
          (rawInstance: dwc.api.Instance, index: number) => {
            const { dataset } = dmv.metadata.formatMetadata(rawInstance)
            const instance = dataset as dmv.metadata.Instance
            logger.log(`retrieve PR instance "${instance.SOPInstanceUID}"`)
            client
              .retrieveInstance({
                studyInstanceUID: props.studyInstanceUID,
                seriesInstanceUID: instance.SeriesInstanceUID,
                sopInstanceUID: instance.SOPInstanceUID,
              })
              .then((retrievedInstance: dwc.api.Dataset): void => {
                const data = dcmjs.data.DicomMessage.readFile(retrievedInstance)
                const { dataset } = dmv.metadata.formatMetadata(data.dict)
                if (props.slide.areVolumeImagesMonochrome) {
                  const presentationState =
                    dataset as unknown as dmv.metadata.AdvancedBlendingPresentationState
                  let doesMatch = false
                  presentationState.AdvancedBlendingSequence.forEach(
                    (blendingItem) => {
                      doesMatch = props.slide.seriesInstanceUIDs.includes(
                        blendingItem.SeriesInstanceUID,
                      )
                    },
                  )
                  if (doesMatch) {
                    logger.log(
                      'include Advanced Blending Presentation State instance ' +
                        `"${presentationState.SOPInstanceUID}"`,
                    )
                    if (
                      index === 0 &&
                      (props.selectedPresentationStateUID === null ||
                        props.selectedPresentationStateUID === undefined)
                    ) {
                      setPresentationState(presentationState)
                    } else {
                      if (
                        presentationState.SOPInstanceUID ===
                        props.selectedPresentationStateUID
                      ) {
                        setPresentationState(presentationState)
                      }
                    }
                    setState((state) => {
                      const mapping: {
                        [
                          sopInstanceUID: string
                        ]: dmv.metadata.AdvancedBlendingPresentationState
                      } = {}
                      state.presentationStates.forEach((instance) => {
                        mapping[instance.SOPInstanceUID] = instance
                      })
                      mapping[presentationState.SOPInstanceUID] =
                        presentationState
                      return {
                        ...state,
                        presentationStates: Object.values(mapping),
                      }
                    })
                  }
                } else {
                  logger.log(
                    `ignore presentation state "${instance.SOPInstanceUID}", ` +
                      'application of presentation states for color images ' +
                      'has not (yet) been implemented',
                  )
                }
              })
              .catch((error) => {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                NotificationMiddleware.onError(
                  NotificationMiddlewareContext.SLIM,
                  new CustomError(
                    errorTypes.VISUALIZATION,
                    'Presentation State could not be loaded',
                  ),
                )
                logger.error(
                  'failed to load presentation state ' +
                    `of SOP instance "${instance.SOPInstanceUID}" ` +
                    `of series "${instance.SeriesInstanceUID}" ` +
                    `of study "${props.studyInstanceUID}": `,
                  error,
                )
              })
          },
        )
      })
      .catch((error) => {
        logger.error(error)
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        NotificationMiddleware.onError(
          NotificationMiddlewareContext.SLIM,
          new CustomError(
            errorTypes.VISUALIZATION,
            'Presentation State could not be loaded',
          ),
        )
      })
  }

  /**
   * Set presentation state as specified by a DICOM Presentation State instance.
   */
  const setPresentationState = (
    presentationState: dmv.metadata.AdvancedBlendingPresentationState,
  ): void => {
    const opticalPaths = volumeViewerRef.current?.getAllOpticalPaths() ?? []
    logger.log(
      `apply Presentation State instance "${presentationState.SOPInstanceUID}"`,
    )
    const opticalPathStyles: {
      [opticalPathIdentifier: string]: {
        opacity: number
        paletteColorLookupTable?: dmv.color.PaletteColorLookupTable
        limitValues?: number[]
      } | null
    } = {}
    opticalPaths.forEach((opticalPath) => {
      // First, deactivate and hide all optical paths and reset style
      const identifier = opticalPath.identifier
      volumeViewerRef.current?.hideOpticalPath(identifier)
      volumeViewerRef.current?.deactivateOpticalPath(identifier) ?? undefined
      const style =
        volumeViewerRef.current?.getOpticalPathDefaultStyle(identifier) ??
        undefined
      volumeViewerRef.current?.setOpticalPathStyle(identifier, style ?? {}) ??
        undefined

      presentationState.AdvancedBlendingSequence.forEach((blendingItem) => {
        /**
         * Referenced Instance Sequence should be used instead of Referenced
         * Image Sequence, but that's easy to mix up and we have encountered
         * implementations that get it wrong.
         */
        let refInstanceItems = blendingItem.ReferencedInstanceSequence
        if (refInstanceItems === undefined) {
          refInstanceItems = blendingItem.ReferencedImageSequence
        }
        if (refInstanceItems === undefined) {
          return
        }
        refInstanceItems.forEach((imageItem) => {
          const isReferenced = opticalPath.sopInstanceUIDs.includes(
            imageItem.ReferencedSOPInstanceUID,
          ) as boolean
          if (isReferenced) {
            let paletteColorLUT: dmv.color.PaletteColorLookupTable | undefined
            if (
              blendingItem.PaletteColorLookupTableSequence !== null &&
              blendingItem.PaletteColorLookupTableSequence !== undefined
            ) {
              const cpLUTItem = blendingItem.PaletteColorLookupTableSequence[0]
              paletteColorLUT = new dmv.color.PaletteColorLookupTable({
                uid:
                  cpLUTItem.PaletteColorLookupTableUID !== null &&
                  cpLUTItem.PaletteColorLookupTableUID !== undefined
                    ? cpLUTItem.PaletteColorLookupTableUID
                    : '',
                redDescriptor: cpLUTItem.RedPaletteColorLookupTableDescriptor,
                greenDescriptor:
                  cpLUTItem.GreenPaletteColorLookupTableDescriptor,
                blueDescriptor: cpLUTItem.BluePaletteColorLookupTableDescriptor,
                redData:
                  cpLUTItem.RedPaletteColorLookupTableData !== null &&
                  cpLUTItem.RedPaletteColorLookupTableData !== undefined
                    ? new Uint16Array(cpLUTItem.RedPaletteColorLookupTableData)
                    : undefined,
                greenData:
                  cpLUTItem.GreenPaletteColorLookupTableData !== null &&
                  cpLUTItem.GreenPaletteColorLookupTableData !== undefined
                    ? new Uint16Array(
                        cpLUTItem.GreenPaletteColorLookupTableData,
                      )
                    : undefined,
                blueData:
                  cpLUTItem.BluePaletteColorLookupTableData !== null &&
                  cpLUTItem.BluePaletteColorLookupTableData !== undefined
                    ? new Uint16Array(cpLUTItem.BluePaletteColorLookupTableData)
                    : undefined,
                redSegmentedData:
                  cpLUTItem.SegmentedRedPaletteColorLookupTableData !== null &&
                  cpLUTItem.SegmentedRedPaletteColorLookupTableData !==
                    undefined
                    ? new Uint16Array(
                        cpLUTItem.SegmentedRedPaletteColorLookupTableData,
                      )
                    : undefined,
                greenSegmentedData:
                  cpLUTItem.SegmentedGreenPaletteColorLookupTableData !==
                    null &&
                  cpLUTItem.SegmentedGreenPaletteColorLookupTableData !==
                    undefined
                    ? new Uint16Array(
                        cpLUTItem.SegmentedGreenPaletteColorLookupTableData,
                      )
                    : undefined,
                blueSegmentedData:
                  cpLUTItem.SegmentedBluePaletteColorLookupTableData !== null &&
                  cpLUTItem.SegmentedBluePaletteColorLookupTableData !==
                    undefined
                    ? new Uint16Array(
                        cpLUTItem.SegmentedBluePaletteColorLookupTableData,
                      )
                    : undefined,
              })
            }

            let limitValues: [number, number] | undefined
            if (
              blendingItem.SoftcopyVOILUTSequence !== null &&
              blendingItem.SoftcopyVOILUTSequence !== undefined
            ) {
              const voiLUTItem = blendingItem.SoftcopyVOILUTSequence[0]
              const windowCenter = voiLUTItem.WindowCenter
              const windowWidth = voiLUTItem.WindowWidth
              limitValues = [
                windowCenter - windowWidth * 0.5,
                windowCenter + windowWidth * 0.5,
              ]
            }

            opticalPathStyles[identifier] = {
              opacity: 1,
              paletteColorLookupTable: paletteColorLUT,
              limitValues,
            }
          }
        })
      })
    })

    const selectedOpticalPathIdentifiers: Set<string> = new Set()
    Object.keys(opticalPathStyles).forEach((identifier) => {
      const styleOptions = opticalPathStyles[identifier]
      if (styleOptions !== null) {
        volumeViewerRef.current?.setOpticalPathStyle(identifier, styleOptions)
        volumeViewerRef.current?.activateOpticalPath(identifier)
        volumeViewerRef.current?.showOpticalPath(identifier)
        selectedOpticalPathIdentifiers.add(identifier)
      } else {
        volumeViewerRef.current?.hideOpticalPath(identifier)
        volumeViewerRef.current?.deactivateOpticalPath(identifier)
      }
    })
    const searchParams = new URLSearchParams(props.location.search)
    searchParams.set('state', presentationState.SOPInstanceUID)
    props.navigate(
      {
        pathname: props.location.pathname,
        search: searchParams.toString(),
      },
      { replace: true },
    )
    setState((_state) => ({
      ..._state,
      activeOpticalPathIdentifiers: selectedOpticalPathIdentifiers,
      visibleOpticalPathIdentifiers: selectedOpticalPathIdentifiers,
      selectedPresentationStateUID: presentationState.SOPInstanceUID,
    }))
  }

  const getRoiStyle = (key?: string): dmv.viewer.ROIStyleOptions => {
    if (key === null || key === undefined) {
      return defaultRoiStyle
    }
    if (roiStylesRef.current[key] !== undefined) {
      return roiStylesRef.current[key]
    }
    return defaultRoiStyle
  }

  const loadDerivedDataset = (derivedDataset: dmv.metadata.Dataset): void => {
    logger.debug('Loading derived dataset:', derivedDataset)

    const Comprehensive3DSR = StorageClasses.COMPREHENSIVE_3D_SR
    const ComprehensiveSR = StorageClasses.COMPREHENSIVE_SR
    const MicroscopyBulkSimpleAnnotation =
      StorageClasses.MICROSCOPY_BULK_SIMPLE_ANNOTATION
    const Segmentation = StorageClasses.SEGMENTATION
    const ParametricMap = StorageClasses.PARAMETRIC_MAP
    const OpticalPath = StorageClasses.OPTICAL_PATH
    const AdvancedBlendingPresentationState =
      StorageClasses.ADVANCED_BLENDING_PRESENTATION_STATE
    const ColorSoftcopyPresentationState =
      StorageClasses.COLOR_SOFTCOPY_PRESENTATION_STATE
    const GrayscaleSoftcopyPresentationState =
      StorageClasses.GRAYSCALE_SOFTCOPY_PRESENTATION_STATE
    const PseudocolorSoftcopyPresentationState =
      StorageClasses.PSEUDOCOLOR_SOFTCOPY_PRESENTATION_STATE

    if (
      (derivedDataset as { SOPClassUID: string }).SOPClassUID ===
      Comprehensive3DSR
    ) {
      // ROIs don't have seriesInstanceUID property, so we show all ROIs
      // that match the frame of reference (already filtered during addAnnotations)
      const allRois = volumeViewerRef.current?.getAllROIs() ?? []
      allRois.forEach((roi) => {
        handleAnnotationVisibilityChange({
          roiUID: roi.uid,
          isVisible: true,
        })
      })
      logger.debug('Loading Comprehensive 3D SR')
    } else if (
      (derivedDataset as { SOPClassUID: string }).SOPClassUID ===
      MicroscopyBulkSimpleAnnotation
    ) {
      const allAnnotationGroups =
        volumeViewerRef.current?.getAllAnnotationGroups() ?? []
      const annotationGroup = allAnnotationGroups.find((annotationGroup) => {
        return (
          annotationGroup.seriesInstanceUID ===
          (derivedDataset as { SeriesInstanceUID: string }).SeriesInstanceUID
        )
      })
      if (annotationGroup !== undefined) {
        handleAnnotationGroupVisibilityChange({
          annotationGroupUID: annotationGroup.uid,
          isVisible: true,
        })
      }
      logger.debug('Loading Microscopy Bulk Simple Annotation')
    } else if (
      (derivedDataset as { SOPClassUID: string }).SOPClassUID === Segmentation
    ) {
      const allSegments = volumeViewerRef.current?.getAllSegments() ?? []
      const derivedSeriesInstanceUID = (
        derivedDataset as { SeriesInstanceUID: string }
      ).SeriesInstanceUID
      const matchingSegments = allSegments.filter((segment) => {
        return segment.seriesInstanceUID === derivedSeriesInstanceUID
      })
      matchingSegments.forEach((segment) => {
        handleSegmentVisibilityChange({
          segmentUID: segment.uid,
          isVisible: true,
        })
      })
      logger.debug('Loading Segmentation')
    } else if (
      (derivedDataset as { SOPClassUID: string }).SOPClassUID === ParametricMap
    ) {
      const allParameterMappings =
        volumeViewerRef.current?.getAllParameterMappings() ?? []
      const derivedSeriesInstanceUID = (
        derivedDataset as { SeriesInstanceUID: string }
      ).SeriesInstanceUID
      const matchingMappings = allParameterMappings.filter(
        (parameterMapping) => {
          return parameterMapping.seriesInstanceUID === derivedSeriesInstanceUID
        },
      )
      matchingMappings.forEach((parameterMapping) => {
        handleMappingVisibilityChange({
          mappingUID: parameterMapping.uid,
          isVisible: true,
        })
      })
      logger.debug('Loading Parametric Map')
    } else if (
      (derivedDataset as { SOPClassUID: string }).SOPClassUID === OpticalPath
    ) {
      const allOpticalPaths =
        volumeViewerRef.current?.getAllOpticalPaths() ?? []
      const derivedSeriesInstanceUID = (
        derivedDataset as { SeriesInstanceUID: string }
      ).SeriesInstanceUID
      const matchingOpticalPaths = allOpticalPaths.filter((opticalPath) => {
        return opticalPath.seriesInstanceUID === derivedSeriesInstanceUID
      })
      matchingOpticalPaths.forEach((opticalPath) => {
        handleOpticalPathVisibilityChange({
          opticalPathIdentifier: opticalPath.identifier,
          isVisible: true,
        })
      })
      logger.debug('Loading Optical Path')
    } else if (
      (derivedDataset as { SOPClassUID: string }).SOPClassUID ===
      ComprehensiveSR
    ) {
      logger.debug('TODO: Loading Comprehensive SR')
    } else if (
      (derivedDataset as { SOPClassUID: string }).SOPClassUID ===
      AdvancedBlendingPresentationState
    ) {
      logger.debug('TODO: Loading Advanced Blending Presentation State')
    } else if (
      (derivedDataset as { SOPClassUID: string }).SOPClassUID ===
      ColorSoftcopyPresentationState
    ) {
      logger.debug('TODO: Loading Color Softcopy Presentation State')
    } else if (
      (derivedDataset as { SOPClassUID: string }).SOPClassUID ===
      GrayscaleSoftcopyPresentationState
    ) {
      logger.debug('TODO: Loading Grayscale Softcopy Presentation State')
    } else if (
      (derivedDataset as { SOPClassUID: string }).SOPClassUID ===
      PseudocolorSoftcopyPresentationState
    ) {
      logger.debug('TODO: Loading Pseudocolor Softcopy Presentation State')
    }
  }

  /**
   * Retrieve Structured Report instances that contain regions of interests
   * with 3D spatial coordinates defined in the same frame of reference as the
   * currently selected series and add them to the VOLUME image viewer.
   */
  const addAnnotations = async (): Promise<void> => {
    return await new Promise<void>((resolve, reject) => {
      logger.log('search for Comprehensive 3D SR instances')
      const client = props.clients[StorageClasses.COMPREHENSIVE_3D_SR]
      client
        .searchForInstances({
          studyInstanceUID: props.studyInstanceUID,
          queryParams: {
            Modality: 'SR',
          },
        })
        .then((matchedInstances): void => {
          if (matchedInstances === null || matchedInstances === undefined) {
            matchedInstances = []
          }
          if (matchedInstances.length === 0) {
            resolve()
            return
          }
          matchedInstances.forEach((i) => {
            const { dataset } = dmv.metadata.formatMetadata(i)
            const instance = dataset as dmv.metadata.Instance
            if (instance.SOPClassUID === StorageClasses.COMPREHENSIVE_3D_SR) {
              logger.log(`retrieve SR instance "${instance.SOPInstanceUID}"`)
              client
                .retrieveInstance({
                  studyInstanceUID: props.studyInstanceUID,
                  seriesInstanceUID: instance.SeriesInstanceUID,
                  sopInstanceUID: instance.SOPInstanceUID,
                })
                .then((retrievedInstance): void => {
                  const data =
                    dcmjs.data.DicomMessage.readFile(retrievedInstance)
                  const { dataset } = dmv.metadata.formatMetadata(data.dict)
                  const report =
                    dataset as unknown as dmv.metadata.Comprehensive3DSR
                  /*
                   * Perform a couple of checks to ensure the document content of the
                   * report fullfils the requirements of the application.
                   */
                  if (!implementsTID1500(report)) {
                    logger.debug(
                      `ignore SR document "${report.SOPInstanceUID}" ` +
                        'because it is not structured according to template ' +
                        'TID 1500 "MeasurementReport"',
                    )
                    return
                  }
                  if (!describesSpecimenSubject(report)) {
                    logger.debug(
                      `ignore SR document "${report.SOPInstanceUID}" ` +
                        'because it does not describe a specimen subject',
                    )
                    return
                  }
                  if (!containsROIAnnotations(report)) {
                    logger.debug(
                      `ignore SR document "${report.SOPInstanceUID}" ` +
                        'because it does not contain any suitable ROI annotations',
                    )
                    return
                  }

                  const content = new MeasurementReport(report)
                  content.ROIs.forEach((roi) => {
                    logger.log(`add ROI "${roi.uid}"`)
                    const scoord3d = roi.scoord3d
                    const image = props.slide.volumeImages[0]
                    if (
                      scoord3d.frameOfReferenceUID === image.FrameOfReferenceUID
                    ) {
                      /*
                       * ROIs may get assigned new UIDs upon re-rendering of the
                       * page and we need to ensure that we don't add them twice.
                       * The same ROI may be stored in multiple SR documents and
                       * we don't want them to show up twice.
                       * TODO: We should probably either "merge" measurements and
                       * quantitative evaluations or pick the ROI from the "best"
                       * available report (COMPLETE and VERIFIED).
                       */
                      const doesROIExist = volumeViewerRef.current
                        ?.getAllROIs()
                        ?.some((otherROI: dmv.roi.ROI): boolean => {
                          return areROIsEqual(otherROI, roi)
                        })
                      if (!doesROIExist) {
                        try {
                          // Add ROI without style such that it won't be visible.
                          volumeViewerRef.current?.addROI(roi, {})
                          const roiAsAnnotation = adaptRoiToAnnotation(roi)
                          formatAnnotation(roiAsAnnotation)
                        } catch {
                          logger.error(`could not add ROI "${roi.uid}"`)
                        }
                      } else {
                        logger.debug(`skip already existing ROI "${roi.uid}"`)
                      }
                    } else {
                      logger.debug(
                        `skip ROI "${roi.uid}" ` +
                          `of SR document "${report.SOPInstanceUID}"` +
                          'because it is defined in another frame of reference',
                      )
                    }
                  })
                  resolve()
                })
                .catch((error) => {
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  NotificationMiddleware.onError(
                    NotificationMiddlewareContext.SLIM,
                    new CustomError(
                      errorTypes.VISUALIZATION,
                      'Annotations could not be loaded',
                    ),
                  )
                  logger.error(
                    'failed to load ROIs ' +
                      `of SOP instance "${instance.SOPInstanceUID}" ` +
                      `of series "${instance.SeriesInstanceUID}" ` +
                      `of study "${props.studyInstanceUID}": `,
                    error,
                  )
                })
              /*
               * React is not aware of the fact that ROIs have been added via the
               * viewer (the viewport is a ref object) and won't show the
               * annotations in the user interface unless an update is forced.
               */
              setState((s) => ({ ...s }))
            }
          })
        })
        .catch((error) => {
          console.error(error)
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          NotificationMiddleware.onError(
            NotificationMiddlewareContext.SLIM,
            new CustomError(
              errorTypes.VISUALIZATION,
              'Annotations could not be loaded',
            ),
          )
          reject(
            error instanceof Error
              ? error
              : new Error(String(error as unknown)),
          )
        })
    })
  }

  /**
   * Retrieve Microscopy Bulk Simple Annotations instances that contain
   * annotation groups defined in the same frame of reference as the currently
   * selected series and add them to the VOLUME image viewer.
   */
  const addAnnotationGroups = async (): Promise<void> => {
    return await new Promise<void>((resolve, reject) => {
      logger.log('search for Microscopy Bulk Simple Annotations instances')
      const client =
        props.clients[StorageClasses.MICROSCOPY_BULK_SIMPLE_ANNOTATION]
      client
        .searchForSeries({
          studyInstanceUID: props.studyInstanceUID,
          queryParams: {
            Modality: 'ANN',
          },
        })
        .then((matchedSeries): void => {
          if (matchedSeries === null || matchedSeries === undefined) {
            matchedSeries = []
          }
          if (matchedSeries.length === 0) {
            resolve()
            return
          }
          matchedSeries.forEach((s) => {
            const { dataset } = dmv.metadata.formatMetadata(s)
            const series = dataset as dmv.metadata.Series
            client
              .retrieveSeriesMetadata({
                studyInstanceUID: props.studyInstanceUID,
                seriesInstanceUID: series.SeriesInstanceUID,
              })
              .then((retrievedMetadata): void => {
                const annotations: dmv.metadata.MicroscopyBulkSimpleAnnotations[] =
                  retrievedMetadata.map((metadata) => {
                    return new dmv.metadata.MicroscopyBulkSimpleAnnotations({
                      metadata,
                    })
                  })
                // annotations = annotations.filter(ann => {
                //   const refImage = props.slide.volumeImages[0]
                //   return (
                //     ann.FrameOfReferenceUID === refImage.FrameOfReferenceUID &&
                //     ann.ContainerIdentifier === refImage.ContainerIdentifier
                //   )
                // })
                annotations.forEach((ann) => {
                  try {
                    volumeViewerRef.current?.addAnnotationGroups(ann)
                    resolve()
                  } catch (error: unknown) {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    NotificationMiddleware.onError(
                      NotificationMiddlewareContext.SLIM,
                      new CustomError(
                        errorTypes.VISUALIZATION,
                        'Microscopy Bulk Simple Annotations cannot be displayed.',
                      ),
                    )
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    logger.error('failed to add annotation groups:', error)
                  }
                  ann.AnnotationGroupSequence.forEach((item) => {
                    const annotationGroupUID = item.AnnotationGroupUID
                    const finding = item.AnnotationPropertyTypeCodeSequence[0]
                    const key = buildKey(finding)
                    const style = roiStylesRef.current[key]
                    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
                    if (
                      style !== null &&
                      style !== undefined &&
                      style.fill !== null &&
                      style.fill !== undefined
                    ) {
                      volumeViewerRef.current?.setAnnotationGroupStyle(
                        annotationGroupUID,
                        { color: style.fill.color },
                      )
                    }
                  })
                })
                /*
                 * React is not aware of the fact that annotation groups have been
                 * added via the viewer (the underlying HTML viewport element is a
                 * ref object) and won't show the annotation groups in the user
                 * interface unless an update is forced.
                 */
                setState((s) => ({ ...s }))
              })
              .catch((error) => {
                console.error(error)
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                NotificationMiddleware.onError(
                  NotificationMiddlewareContext.SLIM,
                  new CustomError(
                    errorTypes.VISUALIZATION,
                    'Retrieval of metadata of Microscopy Bulk Simple Annotations ' +
                      'instances failed.',
                  ),
                )
              })
          })
        })
        .catch((error) => {
          console.error(error)
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          NotificationMiddleware.onError(
            NotificationMiddlewareContext.SLIM,
            new CustomError(
              errorTypes.VISUALIZATION,
              'Search for Microscopy Bulk Simple Annotations instances failed.',
            ),
          )
          reject(
            error instanceof Error
              ? error
              : new Error(String(error as unknown)),
          )
        })
    })
  }

  /**
   * Retrieve Segmentation instances that contain segments defined in the same
   * frame of reference as the currently selected series and add them to the
   * VOLUME image viewer.
   */
  const addSegmentations = async (): Promise<void> => {
    return await new Promise<void>((resolve, reject) => {
      console.info('search for Segmentation instances')
      const client = props.clients[StorageClasses.SEGMENTATION]
      client
        .searchForSeries({
          studyInstanceUID: props.studyInstanceUID,
          queryParams: {
            Modality: 'SEG',
          },
        })
        .then((matchedSeries): void => {
          if (matchedSeries === null || matchedSeries === undefined) {
            matchedSeries = []
          }
          if (matchedSeries.length === 0) {
            resolve()
            return
          }
          matchedSeries.forEach((s, _i) => {
            const { dataset } = dmv.metadata.formatMetadata(s)
            const series = dataset as dmv.metadata.Series
            client
              .retrieveSeriesMetadata({
                studyInstanceUID: props.studyInstanceUID,
                seriesInstanceUID: series.SeriesInstanceUID,
              })
              .then((retrievedMetadata): void => {
                const segmentations: dmv.metadata.Segmentation[] = []
                retrievedMetadata.forEach((metadata) => {
                  const seg = new dmv.metadata.Segmentation({ metadata })
                  const refImage = props.slide.volumeImages[0]
                  if (
                    seg.FrameOfReferenceUID === refImage.FrameOfReferenceUID &&
                    seg.ContainerIdentifier === refImage.ContainerIdentifier
                  ) {
                    segmentations.push(seg)
                  }
                })
                if (segmentations.length > 0) {
                  try {
                    volumeViewerRef.current?.addSegments(segmentations)
                    resolve()
                  } catch (error: unknown) {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    NotificationMiddleware.onError(
                      NotificationMiddlewareContext.SLIM,
                      new CustomError(
                        errorTypes.VISUALIZATION,
                        'Segmentations cannot be displayed',
                      ),
                    )
                    console.error('failed to add segments: ', error)
                  }
                  /*
                   * React is not aware of the fact that segments have been added via
                   * the viewer (the underlying HTML viewport element is a ref object)
                   * and won't show the segments in the user interface unless an update
                   * is forced.
                   */
                  setState((s) => ({ ...s }))
                }
              })
              .catch((error) => {
                console.error(error)
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                NotificationMiddleware.onError(
                  NotificationMiddlewareContext.SLIM,
                  new CustomError(
                    errorTypes.VISUALIZATION,
                    'Retrieval of metadata of Segmentation instances failed.',
                  ),
                )
              })
          })
        })
        .catch((error) => {
          console.error(error)
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          NotificationMiddleware.onError(
            NotificationMiddlewareContext.SLIM,
            new CustomError(
              errorTypes.VISUALIZATION,
              'Search for Segmentation instances failed.',
            ),
          )
          reject(
            error instanceof Error
              ? error
              : new Error(String(error as unknown)),
          )
        })
    })
  }

  /**
   * Retrieve Parametric Map instances that contain mappings defined in the same
   * frame of reference as the currently selected series and add them to the
   * VOLUME image viewer.
   */
  const addParametricMaps = async (): Promise<void> => {
    return await new Promise<void>((resolve, reject) => {
      console.info('search for Parametric Map instances')
      const client = props.clients[StorageClasses.PARAMETRIC_MAP]
      client
        .searchForSeries({
          studyInstanceUID: props.studyInstanceUID,
          queryParams: {
            Modality: 'OT',
          },
        })
        .then((matchedSeries): void => {
          if (matchedSeries === null || matchedSeries === undefined) {
            matchedSeries = []
          }
          if (matchedSeries.length === 0) {
            resolve()
            return
          }
          matchedSeries.forEach((s) => {
            const { dataset } = dmv.metadata.formatMetadata(s)
            const series = dataset as dmv.metadata.Series
            client
              .retrieveSeriesMetadata({
                studyInstanceUID: props.studyInstanceUID,
                seriesInstanceUID: series.SeriesInstanceUID,
              })
              .then((retrievedMetadata): void => {
                const parametricMaps: dmv.metadata.ParametricMap[] = []
                retrievedMetadata.forEach((metadata) => {
                  const pm = new dmv.metadata.ParametricMap({ metadata })
                  const refImage = props.slide.volumeImages[0]
                  if (
                    pm.FrameOfReferenceUID === refImage.FrameOfReferenceUID &&
                    pm.ContainerIdentifier === refImage.ContainerIdentifier
                  ) {
                    parametricMaps.push(pm)
                  } else {
                    console.warn(
                      `skip Parametric Map instance "${pm.SOPInstanceUID}"`,
                    )
                  }
                })
                if (parametricMaps.length > 0) {
                  try {
                    volumeViewerRef.current?.addParameterMappings(
                      parametricMaps,
                    )
                    resolve()
                  } catch (error: unknown) {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    NotificationMiddleware.onError(
                      NotificationMiddlewareContext.SLIM,
                      new CustomError(
                        errorTypes.VISUALIZATION,
                        'Parametric Map cannot be displayed',
                      ),
                    )
                    console.error('failed to add mappings: ', error)
                  }
                  /*
                   * React is not aware of the fact that mappings have been added via
                   * the viewer (the underlying HTML viewport element is a ref object)
                   * and won't show the mappings in the user interface unless an update
                   * is forced.
                   */
                  setState((s) => ({ ...s }))
                }
              })
              .catch((error) => {
                console.error(error)
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                NotificationMiddleware.onError(
                  NotificationMiddlewareContext.SLIM,
                  new CustomError(
                    errorTypes.VISUALIZATION,
                    'Retrieval of metadata of Parametric Map instances failed.',
                  ),
                )
              })
          })
        })
        .catch((error) => {
          console.error(error)
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          NotificationMiddleware.onError(
            NotificationMiddlewareContext.SLIM,
            new CustomError(
              errorTypes.VISUALIZATION,
              'Search for Parametric Map instances failed.',
            ),
          )
          reject(
            error instanceof Error
              ? error
              : new Error(String(error as unknown)),
          )
        })
    })
  }

  /**
   * Populate viewports of the VOLUME and LABEL image viewers.
   */
  const populateViewports = (): void => {
    console.info('populate viewports...')
    updateState({
      isLoading: true,
      presentationStates: [],
    })

    if (volumeViewportRef.current !== null) {
      volumeViewerRef.current?.render({ container: volumeViewportRef.current })
    }
    if (
      labelViewportRef.current !== null &&
      labelViewerRef.current !== null &&
      labelViewerRef.current !== undefined
    ) {
      labelViewerRef.current.render({ container: labelViewportRef.current })
    }

    updateState({ isLoading: false })

    setDefaultPresentationState()
    loadPresentationStates()

    Promise.allSettled([
      addAnnotations(),
      addAnnotationGroups(),
      addSegmentations(),
      addParametricMaps(),
    ])
      .then(() => {
        console.debug(
          'Loaded annotations, annotation groups, segmentations, and parametric maps!',
        )
        if (
          props.derivedDataset !== null &&
          props.derivedDataset !== undefined
        ) {
          loadDerivedDataset(props.derivedDataset)
        }
      })
      .catch((error) => {
        console.error('Failed to add derived data:', error)
      })
  }
  populateViewportsRef.current = populateViewports

  const onRoiModified = (_event: CustomEventInit): void => {
    // Update state to trigger rendering
    setState((state) => ({
      ...state,
      visibleRoiUIDs: new Set(state.visibleRoiUIDs),
    }))
  }

  const onWindowResize = (_event: Event): void => {
    console.info('resize viewports')
    volumeViewerRef.current?.resize()
    if (
      labelViewerRef.current !== null &&
      labelViewerRef.current !== undefined
    ) {
      labelViewerRef.current.resize()
    }
  }

  const onRoiDrawn = (event: CustomEventInit): void => {
    const roi = event.detail.payload as dmv.roi.ROI
    const selectedFinding = state.selectedFinding
    const selectedEvaluations = state.selectedEvaluations
    if (roi !== undefined && selectedFinding !== undefined) {
      logger.debug(`add ROI "${roi.uid}"`)
      const findingItem = new dcmjs.sr.valueTypes.CodeContentItem({
        name: new dcmjs.sr.coding.CodedConcept({
          value: '121071',
          meaning: 'Finding',
          schemeDesignator: 'DCM',
        }),
        value: selectedFinding,
        relationshipType: 'CONTAINS',
      })
      roi.addEvaluation(findingItem)
      selectedEvaluations.forEach((evaluation: Evaluation) => {
        const item = new dcmjs.sr.valueTypes.CodeContentItem({
          name: evaluation.name,
          value: evaluation.value,
          relationshipType: 'CONTAINS',
        })
        roi.addEvaluation(item)
      })
      const key = buildKey(selectedFinding)
      const style = getRoiStyle(key)
      volumeViewerRef.current?.addROI(roi, style)
      setState((state) => {
        const visibleRoiUIDs = new Set(state.visibleRoiUIDs)
        visibleRoiUIDs.add(roi.uid)
        return { ...state, visibleRoiUIDs }
      })
    } else {
      logger.debug(`could not add ROI "${roi.uid}"`)
    }
  }

  const onRoiDoubleClicked = (event: CustomEventInit): void => {
    const selectedRoi = event.detail.payload as dmv.roi.ROI
    if (selectedRoi !== null) {
      // Check if this is a bulk annotation by checking if the ROI UID starts with any annotation group UID
      const roiUid = selectedRoi.uid
      const allAnnotationGroups =
        volumeViewerRef.current?.getAllAnnotationGroups() ?? []
      const isBulkAnnotation = allAnnotationGroups.some((annotationGroup) =>
        roiUid?.startsWith(`${String(annotationGroup.uid)}-`),
      )

      // Don't show modal for bulk annotations
      if (isBulkAnnotation) {
        return
      }

      updateState({
        selectedRoi,
        isSelectedRoiModalVisible: true,
      })
    } else {
      updateState({
        selectedRoi: undefined,
        isSelectedRoiModalVisible: false,
      })
    }
  }

  const setHoveredRoiAttributes = (
    hoveredRois: Array<{ roi: dmv.roi.ROI; annotationGroupUID: string | null }>,
  ): void => {
    const rois = volumeViewerRef.current?.getAllROIs() ?? []

    if (hoveredRois.length === 0) {
      updateState({ hoveredRoiAttributes: [] })
      return
    }

    const result = hoveredRois.map(({ roi, annotationGroupUID }) => {
      // Handle bulk annotations
      if (annotationGroupUID !== null && annotationGroupUID !== undefined) {
        try {
          let annotationGroupMetadata =
            annotationGroupMetadataCacheRef.current.get(annotationGroupUID)
          if (annotationGroupMetadata === undefined) {
            annotationGroupMetadata =
              volumeViewerRef.current?.getAnnotationGroupMetadata(
                annotationGroupUID,
              )
            if (annotationGroupMetadata !== undefined) {
              annotationGroupMetadataCacheRef.current.set(
                annotationGroupUID,
                annotationGroupMetadata,
              )
            }
          }
          const metadataForGroup = annotationGroupMetadata
          if (metadataForGroup === undefined) {
            return {
              index: 0,
              roiUid: roi.uid,
              attributes: [],
              seriesDescription: '',
            }
          }
          const annotationGroupItem =
            metadataForGroup.AnnotationGroupSequence.find(
              (item) => item.AnnotationGroupUID === annotationGroupUID,
            )

          if (annotationGroupItem != null) {
            const attributes: Array<{ name: string; value: string }> = []

            // Get Series Description for sorting
            let seriesDescription = ''
            if (
              metadataForGroup.SeriesInstanceUID !== undefined &&
              metadataForGroup.SeriesInstanceUID !== null
            ) {
              seriesDescription = getSeriesDescription(
                metadataForGroup.SeriesInstanceUID,
              )
              if (
                seriesDescription !== undefined &&
                seriesDescription !== null &&
                seriesDescription !== ''
              ) {
                attributes.push({
                  name: 'Series Description',
                  value: seriesDescription,
                })
              }
            }

            // Add Annotation Group Label
            if (
              annotationGroupItem.AnnotationGroupLabel !== undefined &&
              annotationGroupItem.AnnotationGroupLabel !== ''
            ) {
              attributes.push({
                name: 'Annotation Group Label',
                value: annotationGroupItem.AnnotationGroupLabel,
              })
            }

            // Add Property Category if available
            if (
              annotationGroupItem.AnnotationPropertyCategoryCodeSequence !==
                undefined &&
              annotationGroupItem.AnnotationPropertyCategoryCodeSequence
                .length > 0
            ) {
              const propertyCategory =
                annotationGroupItem.AnnotationPropertyCategoryCodeSequence[0]
              const categoryValue =
                propertyCategory.CodeMeaning !== undefined &&
                propertyCategory.CodeMeaning !== ''
                  ? propertyCategory.CodeMeaning
                  : propertyCategory.CodeValue
              attributes.push({
                name: 'Property category',
                value: categoryValue,
              })
            }

            // Add Property Type if available
            if (
              annotationGroupItem.AnnotationPropertyTypeCodeSequence !==
                undefined &&
              annotationGroupItem.AnnotationPropertyTypeCodeSequence.length > 0
            ) {
              const propertyType =
                annotationGroupItem.AnnotationPropertyTypeCodeSequence[0]
              const typeValue =
                propertyType.CodeMeaning !== undefined &&
                propertyType.CodeMeaning !== ''
                  ? propertyType.CodeMeaning
                  : propertyType.CodeValue
              attributes.push({
                name: 'Property type',
                value: typeValue,
              })
            }

            // Extract annotation index from ROI UID (format: annotationGroupUID-annotationIndex)
            // For bulk annotations, the UID format is annotationGroupUID-annotationIndex
            const roiUid = roi.uid
            let annotationIndex = 0
            if (
              roiUid !== undefined &&
              roiUid !== null &&
              roiUid !== '' &&
              roiUid.includes('-')
            ) {
              const uidParts = roiUid.split('-')
              // The last part should be the annotation index
              const lastPart = uidParts[uidParts.length - 1]
              const parsedIndex = parseInt(lastPart, 10)
              if (!Number.isNaN(parsedIndex)) {
                annotationIndex = parsedIndex
              }
            }

            return {
              index: annotationIndex + 1,
              roiUid,
              attributes,
              seriesDescription,
            }
          }
        } catch (error) {
          logger.warn(
            `Failed to get annotation group metadata for ${annotationGroupUID}:`,
            error,
          )
          // Fall through to SR annotation handling
        }
      }

      // Handle SR annotations (existing logic)
      if (rois.length === 0) {
        return {
          index: 0,
          roiUid: roi.uid,
          attributes: [],
          seriesDescription: '',
        }
      }

      const attributes: Array<{ name: string; value: string }> = []
      const evaluations = roi.evaluations
      evaluations.forEach(
        (
          item:
            | dcmjs.sr.valueTypes.TextContentItem
            | dcmjs.sr.valueTypes.CodeContentItem,
        ) => {
          const nameValue = item.ConceptNameCodeSequence[0].CodeValue
          const nameMeaning = item.ConceptNameCodeSequence[0].CodeMeaning
          const name = `${nameMeaning}`
          if (item.ValueType === dcmjs.sr.valueTypes.ValueTypes.CODE) {
            const codeContentItem = item as dcmjs.sr.valueTypes.CodeContentItem
            const valueMeaning =
              codeContentItem.ConceptCodeSequence[0].CodeMeaning
            // For consistency with Segment and Annotation Group
            if (nameValue === '276214006') {
              attributes.push({
                name: 'Property category',
                value: `${valueMeaning}`,
              })
            } else if (nameValue === '121071') {
              attributes.push({
                name: 'Property type',
                value: `${valueMeaning}`,
              })
            } else if (nameValue === '111001') {
              attributes.push({
                name: 'Algorithm Name',
                value: `${valueMeaning}`,
              })
            } else {
              attributes.push({
                name,
                value: `${valueMeaning}`,
              })
            }
          } else if (item.ValueType === dcmjs.sr.valueTypes.ValueTypes.TEXT) {
            const textContentItem = item as dcmjs.sr.valueTypes.TextContentItem
            attributes.push({
              name,
              value: textContentItem.TextValue,
            })
          }
        },
      )

      const index = (rois.findIndex((r) => r.uid === roi.uid) ?? 0) + 1
      return {
        index,
        roiUid: roi.uid,
        attributes,
        seriesDescription: '',
      }
    })

    // Sort results: first by ROI index, then by series description
    result.sort((a, b) => {
      // First sort by ROI index
      const indexComparison = a.index - b.index
      if (indexComparison !== 0) {
        return indexComparison
      }
      // Then sort by series description
      const aDesc =
        a.seriesDescription !== null &&
        a.seriesDescription !== undefined &&
        a.seriesDescription !== ''
          ? a.seriesDescription
          : ''
      const bDesc =
        b.seriesDescription !== null &&
        b.seriesDescription !== undefined &&
        b.seriesDescription !== ''
          ? b.seriesDescription
          : ''
      return aDesc.localeCompare(bDesc)
    })

    updateState({ hoveredRoiAttributes: result })
  }

  const clearHoveredRois = (): void => {
    hoveredRoisRef.current = []
  }

  const isSamePixelAsLast = (event: MouseEvent): boolean => {
    return (
      event.clientX === lastPixelRef.current[0] &&
      event.clientY === lastPixelRef.current[1]
    )
  }

  const onPointerMove = (event: CustomEventInit): void => {
    handlePointerMoveDebouncedRef.current(event)
  }

  const handlePointerMoveEvent = (event: CustomEventInit): void => {
    const { features: featuresWithROIs, event: evt } = event.detail.payload
    const originalEvent = evt.originalEvent

    if (!isSamePixelAsLast(originalEvent)) {
      lastPixelRef.current = [originalEvent.clientX, originalEvent.clientY]
      clearHoveredRois()
    }

    // Extract unique ROIs from all features
    const allRois: Array<{
      roi: dmv.roi.ROI
      annotationGroupUID: string | null
    }> = []
    if (
      featuresWithROIs !== null &&
      featuresWithROIs !== undefined &&
      featuresWithROIs.length > 0
    ) {
      for (const item of featuresWithROIs) {
        if (item.feature !== null && item.feature !== undefined) {
          allRois.push({
            roi: item.feature,
            annotationGroupUID:
              item.annotationGroupUID !== null &&
              item.annotationGroupUID !== undefined
                ? item.annotationGroupUID
                : null,
          })
        }
      }
    }

    // Get unique ROIs by UID
    const uniqueRoiMap = new Map<
      string,
      { roi: dmv.roi.ROI; annotationGroupUID: string | null }
    >()
    for (const item of allRois) {
      if (!uniqueRoiMap.has(item.roi.uid)) {
        uniqueRoiMap.set(item.roi.uid, item)
      }
    }

    // Filter out non-visible ROIs
    const visibleRois = Array.from(uniqueRoiMap.values()).filter(
      ({ roi, annotationGroupUID }) => {
        // For bulk annotations, check annotation group visibility
        if (annotationGroupUID !== null && annotationGroupUID !== undefined) {
          return state.visibleAnnotationGroupUIDs.has(annotationGroupUID)
        }
        // For SR annotations, check ROI visibility
        return state.visibleRoiUIDs.has(roi.uid)
      },
    )

    hoveredRoisRef.current = visibleRois

    if (hoveredRoisRef.current.length > 0) {
      const roiSignature = hoveredRoisRef.current
        .map(
          ({ roi, annotationGroupUID }) =>
            `${roi.uid}:${annotationGroupUID ?? ''}`,
        )
        .sort((a, b) => a.localeCompare(b))
        .join('|')

      if (
        lastHoveredRoiSignatureRef.current === roiSignature &&
        state.isHoveredRoiTooltipVisible
      ) {
        updateState({
          hoveredRoiTooltipX: originalEvent.clientX,
          hoveredRoiTooltipY: originalEvent.clientY,
        })
        return
      }

      lastHoveredRoiSignatureRef.current = roiSignature
      setHoveredRoiAttributes(hoveredRoisRef.current)
      updateState({
        isHoveredRoiTooltipVisible: true,
        hoveredRoiTooltipX: originalEvent.clientX,
        hoveredRoiTooltipY: originalEvent.clientY,
      })
    } else {
      lastHoveredRoiSignatureRef.current = null
      updateState({
        isHoveredRoiTooltipVisible: false,
      })
    }
  }

  const getUpdatedSelectedRois = (
    newSelectedRoiUid?: string,
  ): { selectedRoiUIDs: Set<string>; selectedRoi?: dmv.roi.ROI } => {
    const selectedRoiUid = newSelectedRoiUid
    const emptySelection = {
      selectedRoiUIDs: new Set<string>(),
      selectedRoi: undefined,
    }

    if (selectedRoiUid === undefined) {
      return emptySelection
    }

    const selectedRoi = volumeViewerRef.current?.getROI(selectedRoiUid)
    if (selectedRoi === undefined) {
      return emptySelection
    }

    logger.debug(`selected ROI "${selectedRoi.uid}"`)

    if (!keysDownRef.current.has('Shift')) {
      return {
        selectedRoiUIDs: new Set([selectedRoi.uid]),
        selectedRoi,
      }
    }

    const oldSelectedRois = Array.from(state.selectedRoiUIDs)
    return {
      selectedRoiUIDs: new Set([...oldSelectedRois, selectedRoi.uid]),
      selectedRoi,
    }
  }

  const resetUnselectedRoiStyles = (selectionState: {
    selectedRoiUIDs: Set<string>
  }): void => {
    volumeViewerRef.current?.getAllROIs().forEach((roi) => {
      const uid = roi.uid
      if (
        selectionState.selectedRoiUIDs.has(uid) ||
        !state.visibleRoiUIDs.has(uid)
      ) {
        return
      }
      const key = getRoiKey(roi)
      const style = getRoiStyle(key)
      volumeViewerRef.current?.setROIStyle(uid, style)
    })
  }

  const onMapClicked = (event: CustomEventInit): void => {
    const roisClicked = (event.detail?.payload?.rois ?? []) as dmv.roi.ROI[]

    if (roisClicked.length !== 0) {
      return
    }

    const updatedSelectedRois = getUpdatedSelectedRois()
    updateState(updatedSelectedRois)

    // @ts-expect-error clearSelections method exists but is not typed in dmv.viewer.VolumeImageViewer
    volumeViewerRef.current?.clearSelections()

    resetUnselectedRoiStyles(updatedSelectedRois)
  }

  const onRoiSelected = (event: CustomEventInit): void => {
    const payload = event.detail?.payload
    const roiPayload = payload as dmv.roi.ROI | { uid?: string } | undefined
    const isRoiObject =
      roiPayload !== null &&
      roiPayload !== undefined &&
      typeof roiPayload === 'object' &&
      'uid' in roiPayload &&
      'scoord3d' in roiPayload

    if (isRoiObject) {
      const selectedRoi = roiPayload
      const updatedSelectedRois = !keysDownRef.current.has('Shift')
        ? {
            selectedRoiUIDs: new Set([selectedRoi.uid]),
            selectedRoi,
          }
        : {
            selectedRoiUIDs: new Set([
              ...Array.from(state.selectedRoiUIDs),
              selectedRoi.uid,
            ]),
            selectedRoi,
          }
      updateState(updatedSelectedRois)
      resetUnselectedRoiStyles(updatedSelectedRois)
    } else {
      const selectedRoiUid = (payload as { uid?: string } | undefined)?.uid
      const updatedSelectedRois = getUpdatedSelectedRois(selectedRoiUid)
      updateState(updatedSelectedRois)
      resetUnselectedRoiStyles(updatedSelectedRois)
    }
  }

  const handleAnnotationSelection = (uid: string): void => {
    // @ts-expect-error clearSelections method exists but is not typed in dmv.viewer.VolumeImageViewer
    volumeViewerRef.current?.clearSelections()
    const updatedSelectedRois = getUpdatedSelectedRois(uid)
    updateState(updatedSelectedRois)
    volumeViewerRef.current?.getAllROIs().forEach((roi) => {
      let style = {}
      if (updatedSelectedRois.selectedRoiUIDs.has(roi.uid)) {
        style = selectedRoiStyle
        setState((state) => {
          const visibleRoiUIDs = new Set(state.visibleRoiUIDs)
          visibleRoiUIDs.add(roi.uid)
          return { ...state, visibleRoiUIDs }
        })
      } else {
        if (state.visibleRoiUIDs.has(roi.uid)) {
          const key = getRoiKey(roi)
          style = getRoiStyle(key)
        }
      }
      volumeViewerRef.current?.setROIStyle(roi.uid, style)
    })
  }

  const handleRoiSelectionCancellation = (): void => {
    logger.log('cancel ROI selection')
    updateState({
      isSelectedRoiModalVisible: false,
    })
  }

  const onLoadingStarted = (_event: CustomEventInit): void => {
    updateState({ isLoading: true })
  }

  const onLoadingEnded = (_event: CustomEventInit): void => {
    updateState({ isLoading: false })
  }

  const onFrameLoadingStarted = (event: CustomEventInit): void => {
    const frameInfo: {
      studyInstanceUID: string
      seriesInstanceUID: string
      sopInstanceUID: string
      sopClassUID: string
      frameNumber: string
      channelIdentifier: string
    } = event.detail.payload
    const key: string = `${frameInfo.sopInstanceUID}-${frameInfo.frameNumber}`
    setState((state) => {
      const loadingFrames = new Set(state.loadingFrames)
      loadingFrames.add(key)
      return { ...state, loadingFrames }
    })
  }

  const onFrameLoadingError = (_event: CustomEventInit): void => {
    console.error('Failed to load frame')
  }

  const onLoadingError = (event: CustomEventInit): void => {
    const message = (event.detail?.payload?.message ??
      'Failed to load data') as string
    console.error(message)
    NotificationMiddleware.onError(
      NotificationMiddlewareContext.SLIM,
      new CustomError(errorTypes.VISUALIZATION, message),
    )
  }

  const onFrameLoadingEnded = (event: CustomEventInit): void => {
    const frameInfo: {
      studyInstanceUID: string
      seriesInstanceUID: string
      sopInstanceUID: string
      sopClassUID: string
      frameNumber: string
      channelIdentifier: string
      pixelArray: Uint8Array | Uint16Array | Float32Array | null
    } = event.detail.payload
    const key = `${frameInfo.sopInstanceUID}-${frameInfo.frameNumber}`
    setState((state) => {
      const loadingFrames = new Set(state.loadingFrames)
      loadingFrames.delete(key)
      const isLoading = loadingFrames.size > 0
      return {
        ...state,
        isLoading,
        loadingFrames,
      }
    })
    if (
      frameInfo.sopClassUID ===
        StorageClasses.VL_WHOLE_SLIDE_MICROSCOPY_IMAGE &&
      props.slide.areVolumeImagesMonochrome
    ) {
      const opticalPathIdentifier = frameInfo.channelIdentifier
      if (
        !(opticalPathIdentifier in state.pixelDataStatistics) &&
        frameInfo.pixelArray !== null
      ) {
        /*
         * There are limits on the number of arguments Math.min and Math.max
         * functions can accept. Therefore, we compute values in smaller chunks.
         */
        const size = 2 ** 16
        const chunks = Math.ceil(frameInfo.pixelArray.length / size)
        let offset = 0
        const minValues: number[] = []
        const maxValues: number[] = []
        for (let i = 0; i < chunks; i++) {
          offset = i * size
          const pixels = frameInfo.pixelArray.slice(offset, offset + size)
          minValues.push(Math.min(...pixels))
          maxValues.push(Math.max(...pixels))
        }
        const min = Math.min(...minValues)
        const max = Math.max(...maxValues)
        setState((state) => {
          const stats = state.pixelDataStatistics
          if (
            stats[opticalPathIdentifier] !== null &&
            stats[opticalPathIdentifier] !== undefined
          ) {
            stats[opticalPathIdentifier] = {
              min: Math.min(stats[opticalPathIdentifier].min, min),
              max: Math.max(stats[opticalPathIdentifier].max, max),
              numFramesSampled:
                stats[opticalPathIdentifier].numFramesSampled + 1,
            }
          } else {
            stats[opticalPathIdentifier] = {
              min,
              max,
              numFramesSampled: 1,
            }
          }
          if (state.selectedPresentationStateUID === null) {
            const style = {
              ...volumeViewerRef.current?.getOpticalPathStyle(
                opticalPathIdentifier,
              ),
            }
            style.limitValues = [
              stats[opticalPathIdentifier].min,
              stats[opticalPathIdentifier].max,
            ]
            volumeViewerRef.current?.setOpticalPathStyle(
              opticalPathIdentifier,
              style,
            )
          }
          return state
        })
      }
    }
  }

  const onRoiRemoved = (event: CustomEventInit): void => {
    const roi = event.detail.payload as dmv.roi.ROI
    logger.debug(`removed ROI "${roi.uid}"`)
  }

  const componentCleanup = (): void => {
    document.body.removeEventListener(
      'dicommicroscopyviewer_roi_drawn',
      onRoiDrawn,
    )
    document.body.removeEventListener(
      'dicommicroscopyviewer_viewport_clicked',
      onMapClicked,
    )
    document.body.removeEventListener(
      'dicommicroscopyviewer_roi_selected',
      onRoiSelected,
    )
    document.body.removeEventListener(
      'dicommicroscopyviewer_roi_double_clicked',
      onRoiDoubleClicked,
    )
    document.body.removeEventListener(
      'dicommicroscopyviewer_pointer_move',
      onPointerMove,
    )
    document.body.removeEventListener(
      'dicommicroscopyviewer_roi_removed',
      onRoiRemoved,
    )
    document.body.removeEventListener(
      'dicommicroscopyviewer_roi_modified',
      onRoiModified,
    )
    document.body.removeEventListener(
      'dicommicroscopyviewer_loading_started',
      onLoadingStarted,
    )
    document.body.removeEventListener(
      'dicommicroscopyviewer_loading_ended',
      onLoadingEnded,
    )
    document.body.removeEventListener(
      'dicommicroscopyviewer_frame_loading_started',
      onFrameLoadingStarted,
    )
    document.body.removeEventListener(
      'dicommicroscopyviewer_frame_loading_ended',
      onFrameLoadingEnded,
    )
    document.body.removeEventListener('keyup', onKeyUp)
    document.body.removeEventListener('keyup', onKeyDown)
    window.removeEventListener('resize', onWindowResize)

    if (
      volumeViewerRef.current !== null &&
      volumeViewerRef.current !== undefined
    ) {
      volumeViewerRef.current.cleanup()
    }
    if (
      labelViewerRef.current !== null &&
      labelViewerRef.current !== undefined
    ) {
      labelViewerRef.current.cleanup()
    }
    /*
     * FIXME: React appears to not clean the content of referenced
     * HTMLDivElement objects when the page is reloaded. As a consequence,
     * optical paths and other display items cannot be toggled or updated after
     * a manual page reload. I have tried using ref callbacks and passing the
     * ref objects from the parent component via the props. Both didn't work
     * either.
     */
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    keysDownRef.current.add(event.key)
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    keysDownRef.current.delete(event.key)
    if (event.key === 'Escape') {
      if (state.isRoiDrawingActive) {
        logger.log('deactivate drawing of ROIs')
        volumeViewerRef.current?.deactivateDrawInteraction()
        volumeViewerRef.current?.activateSelectInteraction({})
      } else if (state.isRoiModificationActive) {
        logger.log('deactivate modification of ROIs')
        volumeViewerRef.current?.deactivateModifyInteraction()
        volumeViewerRef.current?.activateSelectInteraction({})
      } else if (state.isRoiTranslationActive) {
        logger.log('deactivate translation of ROIs')
        volumeViewerRef.current?.deactivateTranslateInteraction()
        volumeViewerRef.current?.activateSelectInteraction({})
      }
      updateState({
        isAnnotationModalVisible: false,
        isSelectedRoiModalVisible: false,
        isRoiTranslationActive: false,
        isRoiDrawingActive: false,
        isRoiModificationActive: false,
        isGoToModalVisible: false,
      })
    } else if (event.altKey) {
      if (event.code === 'KeyD') {
        handleRoiDrawing()
      } else if (event.code === 'KeyM') {
        handleRoiModification()
      } else if (event.code === 'KeyT') {
        handleRoiTranslation()
      } else if (event.code === 'KeyR') {
        handleRoiRemoval()
      } else if (event.code === 'KeyV') {
        handleRoiVisibilityChange()
      } else if (event.code === 'KeyS') {
        handleReportGeneration()
      } else if (event.code === 'KeyG') {
        handleGoTo()
      }
    }
  }

  const componentSetup = (): void => {
    document.body.addEventListener(
      'dicommicroscopyviewer_roi_drawn',
      onRoiDrawn,
    )
    document.body.addEventListener(
      'dicommicroscopyviewer_roi_selected',
      onRoiSelected,
    )
    document.body.addEventListener(
      'dicommicroscopyviewer_viewport_clicked',
      onMapClicked,
    )
    document.body.addEventListener(
      'dicommicroscopyviewer_roi_double_clicked',
      onRoiDoubleClicked,
    )
    document.body.addEventListener(
      'dicommicroscopyviewer_pointer_move',
      onPointerMove,
    )
    document.body.addEventListener(
      'dicommicroscopyviewer_roi_removed',
      onRoiRemoved,
    )
    document.body.addEventListener(
      'dicommicroscopyviewer_roi_modified',
      onRoiModified,
    )
    document.body.addEventListener(
      'dicommicroscopyviewer_loading_started',
      onLoadingStarted,
    )
    document.body.addEventListener(
      'dicommicroscopyviewer_loading_ended',
      onLoadingEnded,
    )
    document.body.addEventListener(
      'dicommicroscopyviewer_loading_error',
      onLoadingError,
    )
    document.body.addEventListener(
      'dicommicroscopyviewer_frame_loading_started',
      onFrameLoadingStarted,
    )
    document.body.addEventListener(
      'dicommicroscopyviewer_frame_loading_ended',
      onFrameLoadingEnded,
    )
    document.body.addEventListener(
      'dicommicroscopyviewer_frame_loading_error',
      onFrameLoadingError,
    )
    document.body.addEventListener('keyup', onKeyUp)
    document.body.addEventListener('keydown', onKeyDown)
    window.addEventListener('beforeunload', componentCleanup)
    window.addEventListener('resize', onWindowResize)
  }

  useEffect(() => {
    handlePointerMoveDebouncedRef.current = debounce(
      handlePointerMoveEvent,
      0,
      { leading: true, trailing: true },
    )
    componentSetup()
    if (!props.slide.areVolumeImagesMonochrome) {
      let hasICCProfile = false
      const image = props.slide.volumeImages[0]
      const metadataItem = image.OpticalPathSequence[0]
      if (
        metadataItem.ICCProfile === null ||
        metadataItem.ICCProfile === undefined
      ) {
        if ('OpticalPathSequence' in image.bulkdataReferences) {
          // @ts-expect-error bulkdataReferences type does not include OpticalPathSequence property
          const bulkdataItem = image.bulkdataReferences.OpticalPathSequence[0]
          if ('ICCProfile' in bulkdataItem) {
            hasICCProfile = true
          }
        }
      } else {
        hasICCProfile = true
      }
      if (!hasICCProfile) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        message.warning('No ICC Profile was found for color images')
      }
    }
    return () => {
      componentCleanup()
      handlePointerMoveDebouncedRef.current?.cancel()
      window.removeEventListener('beforeunload', componentCleanup)
      cleanupViewers(volumeViewerRef.current, labelViewerRef.current)
    }
  }, [
    // biome-ignore lint/correctness/useExhaustiveDependencies: setup/cleanup/handler intentionally in deps
    componentCleanup,
    // biome-ignore lint/correctness/useExhaustiveDependencies: setup/cleanup/handler intentionally in deps
    componentSetup,
    // biome-ignore lint/correctness/useExhaustiveDependencies: setup/cleanup/handler intentionally in deps
    handlePointerMoveEvent,
    props.slide.areVolumeImagesMonochrome,
    props.slide.volumeImages[0],
  ])

  /**
   * Handler that gets called when a finding has been selected for annotation.
   *
   * @param value - Code value of the coded finding that got selected
   * @param option - Option that got selected
   */
  const handleAnnotationFindingSelection = (
    value: string,
    _option: { label: React.ReactNode },
  ): void => {
    findingOptions.forEach((finding) => {
      if (finding.CodeValue === value) {
        console.info(`selected finding "${finding.CodeMeaning}"`)
        updateState({
          selectedFinding: finding,
          selectedEvaluations: [],
        })
      }
    })
  }

  /**
   * Handler that gets called when a geometry type has been selected for
   * annotation.
   *
   * @param value - Code value of the coded finding that got selected
   * @param option - Option that got selected
   */
  const handleAnnotationGeometryTypeSelection = (
    value: string,
    _option: { label: string },
  ): void => {
    updateState({ selectedGeometryType: value })
  }

  /**
   * Handler that gets called when measurements have been selected for
   * annotation.
   */
  const handleAnnotationMeasurementActivation = (
    event: CheckboxChangeEvent,
  ): void => {
    const active: boolean = event.target.checked
    if (active) {
      updateState({ selectedMarkup: 'measurement' })
    } else {
      updateState({ selectedMarkup: undefined })
    }
  }

  /**
   * Handler that gets called when an evaluation has been selected for an
   * annotation.
   *
   * @param value - Code value of the coded evaluation that got selected
   * @param option - Option that got selected
   */
  const handleAnnotationEvaluationSelection = (
    value: string,
    option: { label: dcmjs.sr.coding.CodedConcept },
  ): void => {
    const selectedFinding = state.selectedFinding
    if (selectedFinding !== undefined) {
      const key = buildKey(selectedFinding)
      const name = option.label
      evaluationOptions[key].forEach((evaluation) => {
        if (
          evaluation.name.CodeValue === name.CodeValue &&
          evaluation.name.CodingSchemeDesignator === name.CodingSchemeDesignator
        ) {
          evaluation.values.forEach((code) => {
            if (code.CodeValue === value) {
              const filteredEvaluations = state.selectedEvaluations.filter(
                (item: Evaluation) => item.name !== evaluation.name,
              )
              updateState({
                selectedEvaluations: [
                  ...filteredEvaluations,
                  { name, value: code },
                ],
              })
            }
          })
        }
      })
    }
  }

  /**
   * Handler that gets called when an evaluation has been cleared for an
   * annotation.
   */
  const handleAnnotationEvaluationClearance = (): void => {
    updateState({
      selectedEvaluations: [],
    })
  }

  const handleXCoordinateSelection = (value: number | string | null): void => {
    if (value !== null && value !== undefined) {
      const x = Number(value)
      setState((state) => {
        const isValid =
          x >= state.validXCoordinateRange[0] &&
          x <= state.validXCoordinateRange[1]
        return {
          ...state,
          selectedXCoordinate: x,
          isSelectedXCoordinateValid: isValid,
        }
      })
    } else {
      updateState({
        selectedXCoordinate: undefined,
        isSelectedXCoordinateValid: false,
      })
    }
  }

  const handleYCoordinateSelection = (value: number | string | null): void => {
    if (value !== null && value !== undefined) {
      const y = Number(value)
      setState((state) => {
        const isValid =
          y >= state.validYCoordinateRange[0] &&
          y <= state.validYCoordinateRange[1]
        return {
          ...state,
          selectedYCoordinate: y,
          isSelectedYCoordinateValid: isValid,
        }
      })
    } else {
      updateState({
        selectedYCoordinate: undefined,
        isSelectedYCoordinateValid: false,
      })
    }
  }

  const handleMagnificationSelection = (
    value: number | string | null,
  ): void => {
    if (value !== null && value !== undefined) {
      const magnification = Number(value)
      setState((state) => {
        const isValid = magnification >= 0 && magnification <= 40
        return {
          ...state,
          selectedMagnification: magnification,
          isSelectedMagnificationValid: isValid,
        }
      })
    } else {
      updateState({
        selectedMagnification: undefined,
        isSelectedMagnificationValid: false,
      })
    }
  }

  /**
   * Handler that gets called when the selection of slide position was
   * completed.
   */
  const handleSlidePositionSelection = (): void => {
    if (
      state.isSelectedXCoordinateValid &&
      state.isSelectedYCoordinateValid &&
      state.isSelectedMagnificationValid &&
      state.selectedXCoordinate !== null &&
      state.selectedXCoordinate !== undefined &&
      state.selectedYCoordinate !== null &&
      state.selectedYCoordinate !== undefined &&
      state.selectedMagnification !== null &&
      state.selectedMagnification !== undefined
    ) {
      console.info(
        'select slide position ' +
          `(${state.selectedXCoordinate}, ` +
          `${state.selectedYCoordinate}) ` +
          `at ${state.selectedMagnification}x magnification`,
      )

      const viewer = volumeViewerRef.current
      if (viewer === null || viewer === undefined) return
      const factor = state.selectedMagnification
      /**
       * On an optical microscope an objective with 1x magnification
       * corresponds to approximately 10 micrometer pixel spacing
       * (due to the ocular).
       */
      const targetPixelSpacing = 0.01 / factor
      const diffs = []
      for (let i = 0; i < viewer.numLevels; i++) {
        const actualPixelSpacing = viewer.getPixelSpacing(i)[0]
        diffs.push(Math.abs(targetPixelSpacing - actualPixelSpacing))
      }
      const level = diffs.indexOf(Math.min(...diffs))
      viewer.navigate({
        position: [state.selectedXCoordinate, state.selectedYCoordinate],
        level,
      })
      const point = new dmv.scoord3d.Point({
        coordinates: [state.selectedXCoordinate, state.selectedYCoordinate, 0],
        frameOfReferenceUID: viewer.frameOfReferenceUID,
      })
      const roi = new dmv.roi.ROI({ scoord3d: point })
      viewer.addROI(roi, defaultRoiStyle)
      setState((state) => {
        const visibleRoiUIDs = new Set(state.visibleRoiUIDs)
        visibleRoiUIDs.add(roi.uid)
        return {
          ...state,
          visibleRoiUIDs,
          isGoToModalVisible: false,
        }
      })
    }
  }

  /**
   * Handler that gets called when the selection of a slide position was
   * canceled.
   */
  const handleSlidePositionSelectionCancellation = (): void => {
    console.info('cancel slide position selection')
    updateState({
      isGoToModalVisible: false,
      selectedXCoordinate: undefined,
      selectedYCoordinate: undefined,
      selectedMagnification: undefined,
    })
  }

  /**
   * Handler that gets called when annotation configuration has been completed.
   */
  const handleAnnotationConfigurationCompletion = (): void => {
    logger.debug('complete annotation configuration')
    const finding = state.selectedFinding
    const geometryType = state.selectedGeometryType
    const markup = state.selectedMarkup
    if (geometryType !== undefined && finding !== undefined) {
      volumeViewerRef.current?.activateDrawInteraction({ geometryType, markup })
      updateState({
        isAnnotationModalVisible: false,
        isRoiDrawingActive: true,
      })
    } else {
      NotificationMiddleware.onError(
        NotificationMiddlewareContext.SLIM,
        new CustomError(
          errorTypes.VISUALIZATION,
          'Could not complete annotation configuration',
        ),
      )
    }
  }

  /**
   * Handler that gets called when annotation configuration has been cancelled.
   */
  const handleAnnotationConfigurationCancellation = (): void => {
    logger.log('cancel annotation configuration')
    volumeViewerRef.current?.activateSelectInteraction({})
    updateState({
      isAnnotationModalVisible: false,
      isRoiDrawingActive: false,
    })
  }

  /**
   * Handler that gets called when a report should be generated for the current
   * set of annotations.
   */
  const handleReportGeneration = (): void => {
    logger.log('save ROIs')
    const rois = volumeViewerRef.current?.getAllROIs() ?? []
    const opticalPaths = volumeViewerRef.current?.getAllOpticalPaths() ?? []
    const metadata =
      opticalPaths.length > 0
        ? volumeViewerRef.current?.getOpticalPathMetadata(
            opticalPaths[0].identifier,
          )
        : undefined
    setState((prevState) => {
      const report = generateReport({
        rois,
        metadata: metadata ?? [],
        user: props.user,
        app: props.app,
        visibleRoiUIDs: prevState.visibleRoiUIDs,
      })
      return {
        ...prevState,
        isReportModalVisible: report.isReportModalVisible,
        generatedReport: report.generatedReport,
      }
    })
  }

  /**
   * Handler that gets called when a report should be verified. The current
   * list of annotations will be presented to the user together with other
   * pertinent metadata about the patient, study, and specimen.
   */
  const handleReportVerification = (): void => {
    logger.log('verify report generation')
    if (state.generatedReport !== undefined) {
      const client = props.clients[StorageClasses.COMPREHENSIVE_3D_SR]
      // The Comprehensive3DSR object should have a write method or similar
      // For now, let's try to access it as an ArrayBuffer directly
      client
        .storeInstances({
          datasets: [
            (state.generatedReport as unknown as dcmjs.data.DicomDict).write(),
          ],
        })
        .then(() => message.info('Annotations were saved.'))
        .catch((error) => {
          logger.error(error)
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          NotificationMiddleware.onError(
            NotificationMiddlewareContext.SLIM,
            new CustomError(
              errorTypes.ENCODINGANDDECODING,
              'Annotations could not be saved',
            ),
          )
        })
    }
    updateState({
      isReportModalVisible: false,
      generatedReport: undefined,
    })
  }

  /**
   * Handler that gets called when report generation has been cancelled.
   */
  const handleReportCancellation = (): void => {
    updateState({
      isReportModalVisible: false,
      generatedReport: undefined,
    })
  }

  /**
   * Handle toggling of annotation visibility, i.e., whether a given
   * annotation should be either displayed or hidden by the viewer.
   */
  const handleAnnotationVisibilityChange = ({
    roiUID,
    isVisible,
  }: {
    roiUID: string
    isVisible: boolean
  }): void => {
    if (isVisible) {
      logger.log(`show ROI ${roiUID}`)
      const roi = volumeViewerRef.current?.getROI(roiUID)
      if (roi === undefined) return
      const key = getRoiKey(roi)
      const style = getRoiStyle(key)
      volumeViewerRef.current?.setROIStyle(roi.uid, style)
      setState((state) => {
        const visibleRoiUIDs = new Set(state.visibleRoiUIDs)
        visibleRoiUIDs.add(roi.uid)
        return { ...state, visibleRoiUIDs }
      })
    } else {
      logger.log(`hide ROI ${roiUID}`)
      setState((state) => {
        const selectedRoiUIDs = new Set(state.selectedRoiUIDs)
        selectedRoiUIDs.delete(roiUID)
        const visibleRoiUIDs = new Set(state.visibleRoiUIDs)
        visibleRoiUIDs.delete(roiUID)
        return { ...state, visibleRoiUIDs, selectedRoiUIDs }
      })
      volumeViewerRef.current?.setROIStyle(roiUID, {})
    }
  }

  /**
   * Handle toggling of annotation group visibility, i.e., whether a given
   * annotation group should be either displayed or hidden by the viewer.
   */
  const handleAnnotationGroupVisibilityChange = ({
    annotationGroupUID,
    isVisible,
  }: {
    annotationGroupUID: string
    isVisible: boolean
  }): void => {
    const allAnnotationGroups =
      volumeViewerRef.current?.getAllAnnotationGroups() ?? []
    const annotationGroup = allAnnotationGroups.find(
      (ag) => ag.uid === annotationGroupUID,
    )
    if (annotationGroup !== null && annotationGroup !== undefined) {
      runValidations({
        dialog: true,
        context: { annotationGroup, slide: props.slide },
      })
    }

    logger.log(`change visibility of annotation group ${annotationGroupUID}`)
    if (isVisible) {
      logger.log(`show annotation group ${annotationGroupUID}`)
      try {
        volumeViewerRef.current?.showAnnotationGroup(annotationGroupUID)
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        NotificationMiddleware.onError(
          NotificationMiddlewareContext.SLIM,
          new CustomError(
            errorTypes.VISUALIZATION,
            'Failed to show annotation group.',
          ),
        )
        throw error
      }
      setState((state) => {
        const visibleAnnotationGroupUIDs = new Set(
          state.visibleAnnotationGroupUIDs,
        )
        visibleAnnotationGroupUIDs.add(annotationGroupUID)
        return { ...state, visibleAnnotationGroupUIDs }
      })
    } else {
      logger.log(`hide annotation group ${annotationGroupUID}`)
      volumeViewerRef.current?.hideAnnotationGroup(annotationGroupUID)
      setState((state) => {
        const visibleAnnotationGroupUIDs = new Set(
          state.visibleAnnotationGroupUIDs,
        )
        visibleAnnotationGroupUIDs.delete(annotationGroupUID)
        return { ...state, visibleAnnotationGroupUIDs }
      })
    }
  }

  /**
   * Handle change of annotation group style.
   */
  const handleAnnotationGroupStyleChange = ({
    uid,
    styleOptions,
  }: {
    uid: string
    styleOptions: {
      opacity?: number
      color?: number[]
      measurement?: dcmjs.sr.coding.CodedConcept
    }
  }): void => {
    logger.log(`change style of annotation group ${uid}`)
    try {
      volumeViewerRef.current?.setAnnotationGroupStyle(uid, styleOptions)
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      NotificationMiddleware.onError(
        NotificationMiddlewareContext.SLIM,
        new CustomError(
          errorTypes.VISUALIZATION,
          'Failed to change style of annotation group.',
        ),
      )
      throw error
    }
  }

  const generateRoiStyle = (
    styleOptions: StyleOptions,
  ): dmv.viewer.ROIStyleOptions => {
    const opacity = styleOptions.opacity ?? DEFAULT_ANNOTATION_OPACITY
    const strokeColor = styleOptions.color ?? DEFAULT_ANNOTATION_STROKE_COLOR
    const fillColor = styleOptions.contourOnly
      ? [0, 0, 0, 0]
      : strokeColor.map((c) => Math.min(c + 25, 255))
    return formatRoiStyle({
      fill: { color: [...fillColor, opacity] },
      stroke: { color: [...strokeColor, opacity] },
      radius: defaultRoiStyle.stroke?.width,
    })
  }

  const handleRoiStyleChange = ({
    uid,
    styleOptions,
  }: {
    uid: string
    styleOptions: StyleOptions
  }): void => {
    logger.log(`change style of ROI ${uid}`)
    try {
      defaultAnnotationStylesRef.current[uid] = styleOptions
      const style = generateRoiStyle(styleOptions)
      const roi = volumeViewerRef.current?.getROI(uid)
      if (roi === undefined) return
      const key = getRoiKey(roi) as string
      roiStylesRef.current[key] = style
      volumeViewerRef.current?.setROIStyle(uid, style)
      state.visibleRoiUIDs.add(uid)
    } catch (error) {
      NotificationMiddleware.onError(
        NotificationMiddlewareContext.SLIM,
        new CustomError(
          errorTypes.VISUALIZATION,
          'Failed to change style of ROI.',
        ),
      )
      throw error
    }
  }

  /**
   * Handle toggling of segment visibility, i.e., whether a given
   * segment should be either displayed or hidden by the viewer.
   */
  const handleSegmentVisibilityChange = ({
    segmentUID,
    isVisible,
  }: {
    segmentUID: string
    isVisible: boolean
  }): void => {
    logger.log(`change visibility of segment ${segmentUID}`)
    if (isVisible) {
      logger.log(`show segment ${segmentUID}`)
      volumeViewerRef.current?.showSegment(segmentUID)
      setState((state) => {
        const visibleSegmentUIDs = new Set(state.visibleSegmentUIDs)
        visibleSegmentUIDs.add(segmentUID)
        return { ...state, visibleSegmentUIDs }
      })
    } else {
      logger.log(`hide segment ${segmentUID}`)
      volumeViewerRef.current?.hideSegment(segmentUID)
      setState((state) => {
        const visibleSegmentUIDs = new Set(state.visibleSegmentUIDs)
        visibleSegmentUIDs.delete(segmentUID)
        return { ...state, visibleSegmentUIDs }
      })
    }
  }

  /**
   * Handle change of segment style.
   */
  const handleSegmentStyleChange = ({
    segmentUID,
    styleOptions,
  }: {
    segmentUID: string
    styleOptions: {
      opacity?: number
      color?: number[]
    }
  }): void => {
    logger.log(`change style of segment ${segmentUID}`)

    /** Track user customization if color is provided */
    if (styleOptions.color !== undefined) {
      const color = styleOptions.color
      setState((state) => ({
        ...state,
        customizedSegmentColors: {
          ...state.customizedSegmentColors,
          [segmentUID]: color,
        },
      }))
    }

    /** If color is provided, create a palette color lookup table */
    let paletteColorLookupTable: dmv.color.PaletteColorLookupTable | undefined
    if (styleOptions.color !== undefined) {
      paletteColorLookupTable = createSegmentPaletteColorLookupTable(
        styleOptions.color,
      )
    }

    volumeViewerRef.current?.setSegmentStyle(segmentUID, {
      opacity: styleOptions.opacity,
      paletteColorLookupTable,
    })
  }

  /**
   * Handle toggling of mapping visibility, i.e., whether a given
   * mapping should be either displayed or hidden by the viewer.
   */
  const handleMappingVisibilityChange = ({
    mappingUID,
    isVisible,
  }: {
    mappingUID: string
    isVisible: boolean
  }): void => {
    logger.log(`change visibility of mapping ${mappingUID}`)
    if (isVisible) {
      logger.log(`show mapping ${mappingUID}`)
      volumeViewerRef.current?.showParameterMapping(mappingUID)
      setState((state) => {
        const visibleMappingUIDs = new Set(state.visibleMappingUIDs)
        visibleMappingUIDs.add(mappingUID)
        return { ...state, visibleMappingUIDs }
      })
    } else {
      logger.log(`hide mapping ${mappingUID}`)
      volumeViewerRef.current?.hideParameterMapping(mappingUID)
      setState((state) => {
        const visibleMappingUIDs = new Set(state.visibleMappingUIDs)
        visibleMappingUIDs.delete(mappingUID)
        return { ...state, visibleMappingUIDs }
      })
    }
  }

  /**
   * Handle change of mapping style.
   */
  const handleMappingStyleChange = ({
    mappingUID,
    styleOptions,
  }: {
    mappingUID: string
    styleOptions: {
      opacity?: number
    }
  }): void => {
    logger.log(`change style of mapping ${mappingUID}`)
    volumeViewerRef.current?.setParameterMappingStyle(mappingUID, styleOptions)
  }

  /**
   * Handle toggling of optical path visibility, i.e., whether a given
   * optical path should be either displayed or hidden by the viewer.
   */
  const handleOpticalPathVisibilityChange = ({
    opticalPathIdentifier,
    isVisible,
  }: {
    opticalPathIdentifier: string
    isVisible: boolean
  }): void => {
    logger.log(`change visibility of optical path ${opticalPathIdentifier}`)
    if (isVisible) {
      logger.log(`show optical path ${opticalPathIdentifier}`)
      volumeViewerRef.current?.showOpticalPath(opticalPathIdentifier)
      setState((state) => {
        const visibleOpticalPathIdentifiers = new Set(
          state.visibleOpticalPathIdentifiers,
        )
        visibleOpticalPathIdentifiers.add(opticalPathIdentifier)
        return { ...state, visibleOpticalPathIdentifiers }
      })
    } else {
      logger.log(`hide optical path ${opticalPathIdentifier}`)
      volumeViewerRef.current?.hideOpticalPath(opticalPathIdentifier)
      setState((state) => {
        const visibleOpticalPathIdentifiers = new Set(
          state.visibleOpticalPathIdentifiers,
        )
        visibleOpticalPathIdentifiers.delete(opticalPathIdentifier)
        return { ...state, visibleOpticalPathIdentifiers }
      })
    }
  }

  /**
   * Handle change of optical path style.
   */
  const handleOpticalPathStyleChange = ({
    opticalPathIdentifier,
    styleOptions,
  }: {
    opticalPathIdentifier: string
    styleOptions: {
      opacity?: number
      color?: number[]
      limitValues?: number[]
    }
  }): void => {
    logger.log(`change style of optical path ${opticalPathIdentifier}`)
    volumeViewerRef.current?.setOpticalPathStyle(
      opticalPathIdentifier,
      styleOptions,
    )
  }

  /**
   * Handle toggling of optical path activity, i.e., whether a given
   * optical path should be either added or removed from the viewport.
   */
  const handleOpticalPathActivityChange = ({
    opticalPathIdentifier,
    isActive,
  }: {
    opticalPathIdentifier: string
    isActive: boolean
  }): void => {
    logger.log(`change activity of optical path ${opticalPathIdentifier}`)
    if (isActive) {
      logger.log(`activate optical path ${opticalPathIdentifier}`)
      volumeViewerRef.current?.activateOpticalPath(opticalPathIdentifier)
      setState((state) => {
        const activeOpticalPathIdentifiers = new Set(
          state.activeOpticalPathIdentifiers,
        )
        activeOpticalPathIdentifiers.add(opticalPathIdentifier)
        return { ...state, activeOpticalPathIdentifiers }
      })
    } else {
      logger.log(`deactivate optical path ${opticalPathIdentifier}`)
      volumeViewerRef.current?.deactivateOpticalPath(opticalPathIdentifier)
      setState((state) => {
        const activeOpticalPathIdentifiers = new Set(
          state.activeOpticalPathIdentifiers,
        )
        activeOpticalPathIdentifiers.delete(opticalPathIdentifier)
        return { ...state, activeOpticalPathIdentifiers }
      })
    }
  }

  /**
   * Set default presentation state that is either defined by metadata included
   * in the DICOM Slide Microscopy instance or by the viewer.
   */
  const setDefaultPresentationState = (): void => {
    const visibleOpticalPathIdentifiers: Set<string> = new Set()
    const opticalPaths = volumeViewerRef.current?.getAllOpticalPaths() ?? []
    opticalPaths.sort((a, b) => {
      if (a.identifier.localeCompare(b.identifier) === 1) {
        return 1
      } else if (b.identifier.localeCompare(a.identifier) === 1) {
        return -1
      }
      return 0
    })
    opticalPaths.forEach((item: dmv.opticalPath.OpticalPath) => {
      const identifier = item.identifier
      const style =
        volumeViewerRef.current?.getOpticalPathDefaultStyle(identifier)
      if (style !== undefined) {
        volumeViewerRef.current?.setOpticalPathStyle(identifier, style)
      }
      volumeViewerRef.current?.hideOpticalPath(identifier)
      volumeViewerRef.current?.deactivateOpticalPath(identifier)
      if (item.isMonochromatic) {
        /*
         * If the image metadata contains a palette color lookup table for the
         * optical path, then it will be displayed by default.
         */
        if (
          item.paletteColorLookupTableUID !== null &&
          item.paletteColorLookupTableUID !== undefined
        ) {
          visibleOpticalPathIdentifiers.add(identifier)
        }
      } else {
        /* Color images will always be displayed by default. */
        visibleOpticalPathIdentifiers.add(identifier)
      }
    })

    /*
     * If no optical paths have been selected for visualization so far, select
     * first n optical paths and set a default value of interest (VOI) window
     * (using pre-computed pixel data statistics) and a default color.
     */
    if (visibleOpticalPathIdentifiers.size === 0) {
      const defaultColors = [[255, 255, 255]]
      opticalPaths.forEach((item: dmv.opticalPath.OpticalPath) => {
        const identifier = item.identifier
        if (item.isMonochromatic) {
          const numVisible = visibleOpticalPathIdentifiers.size
          if (numVisible < defaultColors.length) {
            const style = {
              ...volumeViewerRef.current?.getOpticalPathStyle(identifier),
            }
            const index = numVisible
            style.color = defaultColors[index]
            const stats = state.pixelDataStatistics[item.identifier]
            if (stats !== null && stats !== undefined) {
              style.limitValues = [stats.min, stats.max]
            }
            volumeViewerRef.current?.setOpticalPathStyle(item.identifier, style)
            visibleOpticalPathIdentifiers.add(item.identifier)
          }
        }
      })
    }

    console.info(
      `selected n=${visibleOpticalPathIdentifiers.size} optical paths ` +
        'for visualization',
    )
    visibleOpticalPathIdentifiers.forEach((identifier) => {
      volumeViewerRef.current?.showOpticalPath(identifier)
    })
    setState((_state) => ({
      ..._state,
      activeOpticalPathIdentifiers: new Set(visibleOpticalPathIdentifiers),
      visibleOpticalPathIdentifiers: new Set(visibleOpticalPathIdentifiers),
    }))
  }

  /**
   * Handler that gets called when a presentation state has been selected from
   * the current list of available presentation states.
   */
  const handlePresentationStateReset = (): void => {
    updateState({ selectedPresentationStateUID: undefined })
    const urlPath = props.location.pathname
    props.navigate(urlPath)
    setDefaultPresentationState()
  }

  /**
   * Handler that gets called when a presentation state has been selected from
   * the current list of available presentation states.
   */
  const handlePresentationStateSelection = (
    value?: string,
    _option?: unknown,
  ): void => {
    if (value !== null) {
      console.info(
        `select Presentation State instance "${value ?? 'undefined'}"`,
      )
      let presentationState:
        | (typeof state.presentationStates)[number]
        | undefined
      state.presentationStates.forEach((instance) => {
        if (instance.SOPInstanceUID === value) {
          presentationState = instance
        }
      })
      if (presentationState !== null && presentationState !== undefined) {
        let urlPath = props.location.pathname
        urlPath += `?state=${value ?? ''}`
        props.navigate(urlPath)
        setPresentationState(presentationState)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        NotificationMiddleware.onError(
          NotificationMiddlewareContext.SLIM,
          new CustomError(
            errorTypes.VISUALIZATION,
            'Presentation State could not be found',
          ),
        )
        console.log(
          'failed to handle section of presentation state: ' +
            `could not find instance "${value ?? 'undefined'}"`,
        )
      }
    } else {
      handlePresentationStateReset()
    }
    updateState({ selectedPresentationStateUID: value })
  }

  /**
   * Handler that will toggle the ROI drawing tool, i.e., either activate or
   * de-activate it, depending on its current state.
   */
  const handleRoiDrawing = (): void => {
    if (state.isRoiDrawingActive) {
      console.info('deactivate drawing of ROIs')
      volumeViewerRef.current?.deactivateDrawInteraction()
      volumeViewerRef.current?.activateSelectInteraction({})
      updateState({
        isAnnotationModalVisible: false,
        isSelectedRoiModalVisible: false,
        isRoiTranslationActive: false,
        isRoiDrawingActive: false,
        isRoiModificationActive: false,
        isGoToModalVisible: false,
      })
    } else {
      console.info('activate drawing of ROIs')
      updateState({
        isAnnotationModalVisible: true,
        isSelectedRoiModalVisible: false,
        isRoiDrawingActive: true,
        isRoiModificationActive: false,
        isRoiTranslationActive: false,
        isGoToModalVisible: false,
      })
      volumeViewerRef.current?.deactivateSelectInteraction()
      volumeViewerRef.current?.deactivateSnapInteraction()
      volumeViewerRef.current?.deactivateTranslateInteraction()
      volumeViewerRef.current?.deactivateModifyInteraction()
    }
  }

  /**
   * Handler that will toggle the ROI modification tool, i.e., either activate
   * or de-activate it, depending on its current state.
   */
  const handleRoiModification = (): void => {
    console.info('toggle modification of ROIs')
    if (volumeViewerRef.current?.isModifyInteractionActive) {
      volumeViewerRef.current?.deactivateModifyInteraction()
      volumeViewerRef.current?.deactivateSnapInteraction()
      volumeViewerRef.current?.activateSelectInteraction({})
      updateState({
        isRoiTranslationActive: false,
        isRoiDrawingActive: false,
        isRoiModificationActive: false,
      })
    } else {
      updateState({
        isRoiModificationActive: true,
        isRoiDrawingActive: false,
        isRoiTranslationActive: false,
      })
      volumeViewerRef.current?.deactivateDrawInteraction()
      volumeViewerRef.current?.deactivateTranslateInteraction()
      volumeViewerRef.current?.deactivateSelectInteraction()
      volumeViewerRef.current?.activateSnapInteraction({})
      volumeViewerRef.current?.activateModifyInteraction({})
    }
  }

  /**
   * Handler that will toggle the ROI translation tool, i.e., either activate
   * or de-activate it, depending on its current state.
   */
  const handleRoiTranslation = (): void => {
    console.info('toggle translation of ROIs')
    if (volumeViewerRef.current?.isTranslateInteractionActive) {
      volumeViewerRef.current?.deactivateTranslateInteraction()
      updateState({
        isRoiTranslationActive: false,
        isRoiDrawingActive: false,
        isRoiModificationActive: false,
      })
    } else {
      updateState({
        isRoiTranslationActive: true,
        isRoiDrawingActive: false,
        isRoiModificationActive: false,
      })
      volumeViewerRef.current?.deactivateModifyInteraction()
      volumeViewerRef.current?.deactivateSnapInteraction()
      volumeViewerRef.current?.deactivateDrawInteraction()
      volumeViewerRef.current?.deactivateSelectInteraction()
      volumeViewerRef.current?.activateTranslateInteraction({})
    }
  }

  const handleGoTo = (): void => {
    volumeViewerRef.current?.deactivateDrawInteraction()
    volumeViewerRef.current?.deactivateModifyInteraction()
    volumeViewerRef.current?.deactivateSnapInteraction()
    volumeViewerRef.current?.deactivateTranslateInteraction()
    volumeViewerRef.current?.deactivateSelectInteraction()
    updateState({
      isGoToModalVisible: true,
      isAnnotationModalVisible: false,
      isSelectedRoiModalVisible: false,
      isReportModalVisible: false,
      isRoiTranslationActive: false,
      isRoiModificationActive: false,
      isRoiDrawingActive: false,
    })
  }

  /**
   * Handler that will toggle the ROI removal tool, i.e., either activate
   * or de-activate it, depending on its current state.
   */
  const handleRoiRemoval = (): void => {
    volumeViewerRef.current?.deactivateDrawInteraction()
    volumeViewerRef.current?.deactivateSnapInteraction()
    volumeViewerRef.current?.deactivateTranslateInteraction()
    volumeViewerRef.current?.deactivateModifyInteraction()
    if (state.selectedRoiUIDs.size > 0) {
      state.selectedRoiUIDs.forEach((uid) => {
        if (uid === undefined) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          message.warning('No annotation was selected for removal')
          return
        }
        console.info(`remove ROI "${uid}"`)
        volumeViewerRef.current?.removeROI(uid)
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        message.info('Annotation was removed')
      })
      updateState({
        selectedRoiUIDs: new Set(),
        isRoiTranslationActive: false,
        isRoiDrawingActive: false,
        isRoiModificationActive: false,
      })
    } else {
      state.visibleRoiUIDs.forEach((uid) => {
        console.info(`remove ROI "${uid}"`)
        volumeViewerRef.current?.removeROI(uid)
      })
      updateState({
        visibleRoiUIDs: new Set(),
        isRoiTranslationActive: false,
        isRoiDrawingActive: false,
        isRoiModificationActive: false,
      })
    }
    volumeViewerRef.current?.activateSelectInteraction({})
  }

  /**
   * Handler that will toggle the ROI visibility tool, i.e., either activate
   * or de-activate it, depending on its current state.
   */
  const handleRoiVisibilityChange = (): void => {
    console.info('toggle visibility of ROIs')
    if (!state.areRoisHidden) {
      volumeViewerRef.current?.deactivateDrawInteraction()
      volumeViewerRef.current?.deactivateSnapInteraction()
      volumeViewerRef.current?.deactivateTranslateInteraction()
      volumeViewerRef.current?.deactivateSelectInteraction()
      volumeViewerRef.current?.deactivateModifyInteraction()
      volumeViewerRef.current?.hideROIs()
      updateState({
        areRoisHidden: true,
        isRoiDrawingActive: false,
        isRoiModificationActive: false,
        isRoiTranslationActive: false,
      })
    } else {
      volumeViewerRef.current?.showROIs()
      volumeViewerRef.current?.activateSelectInteraction({})
      state.selectedRoiUIDs.forEach((uid) => {
        if (uid !== undefined) {
          volumeViewerRef.current?.setROIStyle(uid, selectedRoiStyle)
        }
      })
      updateState({ areRoisHidden: false })
    }
  }

  const handleAnnotationGroupClick = (annotationGroupUID: string): void => {
    volumeViewerRef.current?.zoomToROI(annotationGroupUID)
  }

  const handleAnnotationGroupSelection = (value: string): void => {
    // Hide all currently visible annotation groups when selection changes
    state.visibleAnnotationGroupUIDs.forEach((annotationGroupUID) => {
      volumeViewerRef.current?.hideAnnotationGroup(annotationGroupUID)
    })

    // Reset the visible annotation groups state
    updateState({
      selectedSeriesInstanceUID: value,
      visibleAnnotationGroupUIDs: new Set(),
    })
  }

  const handleSegmentationSeriesSelection = (value: string): void => {
    // Hide all currently visible segments when selection changes
    state.visibleSegmentUIDs.forEach((segmentUID) => {
      volumeViewerRef.current?.hideSegment(segmentUID)
    })

    // Get all segments to determine which ones are in the new series
    const segments = volumeViewerRef.current?.getAllSegments() ?? []
    const segmentMetadata: {
      [segmentUID: string]: dmv.metadata.Segmentation[]
    } = {}

    // Group segments by series
    const segmentsBySeries: {
      [seriesUID: string]: dmv.segment.Segment[]
    } = {}

    segments.forEach((segment) => {
      segmentMetadata[segment.uid] =
        volumeViewerRef.current?.getSegmentMetadata(segment.uid) ?? []

      // Get the series UID for this segment
      const seriesUID =
        segmentMetadata[segment.uid]?.[0]?.SeriesInstanceUID ?? 'unknown'
      if (!(seriesUID in segmentsBySeries)) {
        segmentsBySeries[seriesUID] = []
      }
      segmentsBySeries[seriesUID].push(segment)
    })

    // Get segments for the selected series or all series
    const selectedSeriesSegments =
      value === 'all' ? segments : (segmentsBySeries[value] ?? [])

    // Determine if segments were visible before switching
    const hadVisibleSegments = state.visibleSegmentUIDs.size > 0

    // If segments were visible before switching, show all segments in the new series
    const newVisibleSegmentUIDs = new Set<string>()
    if (hadVisibleSegments && selectedSeriesSegments.length > 0) {
      selectedSeriesSegments.forEach((segment) => {
        newVisibleSegmentUIDs.add(segment.uid)
      })
    }

    // Update state with new visibility
    updateState({
      selectedSegmentationSeriesInstanceUID: value,
      visibleSegmentUIDs: newVisibleSegmentUIDs,
    })

    // Show segments that should be visible in the new series
    newVisibleSegmentUIDs.forEach((segmentUID) => {
      volumeViewerRef.current?.showSegment(segmentUID)
    })
  }

  const getSeriesDescription = (seriesInstanceUID: string): string => {
    // Get the study from DicomMetadataStore
    const study = DicomMetadataStore.getStudy(props.studyInstanceUID)

    if (study?.series !== null && study !== null && study !== undefined) {
      // Find the series that matches this series instance UID
      const series = study.series.find(
        (s) => s.SeriesInstanceUID === seriesInstanceUID,
      )

      if (
        series?.SeriesDescription !== undefined &&
        series.SeriesDescription !== ''
      ) {
        return series.SeriesDescription
      }
    }

    // Fallback to truncated UID if no description found
    return `Series ${seriesInstanceUID.slice(0, 8)}...`
  }

  /**
   * Handler that will toggle the ICC profile color management, i.e., either
   * enable or disable it, depending on its current state.
   */
  const handleICCProfilesToggle = (event: CheckboxChangeEvent): void => {
    const checked = event.target.checked
    updateState({ isICCProfilesEnabled: checked })
    volumeViewerRef.current?.toggleICCProfiles()
  }

  /**
   * Handler that will toggle the segmentation interpolation, i.e., either
   * enable or disable it, depending on its current state.
   */
  const handleSegmentationInterpolationToggle = (
    event: CheckboxChangeEvent,
  ): void => {
    const checked = event.target.checked
    updateState({ isSegmentationInterpolationEnabled: checked })
    ;(
      volumeViewerRef.current as { toggleSegmentationInterpolation(): void }
    ).toggleSegmentationInterpolation()
  }

  /**
   * Handler that will toggle the parametric map interpolation, i.e., either
   * enable or disable it, depending on its current state.
   */
  const handleParametricMapInterpolationToggle = (
    event: CheckboxChangeEvent,
  ): void => {
    const checked = event.target.checked
    updateState({ isParametricMapInterpolationEnabled: checked })
    ;(
      volumeViewerRef.current as { toggleParametricMapInterpolation(): void }
    ).toggleParametricMapInterpolation()
  }

  /**
   * Handler that toggles clustering on/off.
   */
  const handleClusteringToggle = (checked: boolean): void => {
    /** Ensure checked is a boolean */
    const newValue = Boolean(checked)

    /** Use functional setState to ensure we have the latest state */
    setState((prevState) => {
      /** Don't update if the value hasn't actually changed */
      if (prevState.isClusteringEnabled === newValue) {
        return prevState
      }

      /** When turning ON with Auto (null/undefined), use viewer default so clustering is enabled; undefined means "clustering off" in the viewer */
      const threshold = newValue
        ? (prevState.clusteringPixelSizeThreshold ?? 0.001)
        : undefined

      /**
       * Update viewer options immediately with the new state
       * Check if viewer exists and has the method before calling
       */
      if (
        volumeViewerRef.current !== null &&
        volumeViewerRef.current !== undefined &&
        typeof (
          volumeViewerRef.current as unknown as {
            setAnnotationOptions?(opts: object): void
          }
        ).setAnnotationOptions === 'function'
      ) {
        try {
          ;(
            volumeViewerRef.current as unknown as {
              setAnnotationOptions(opts: object): void
            }
          ).setAnnotationOptions({
            clusteringPixelSizeThreshold: threshold,
          })
        } catch (error) {
          console.error('Failed to update annotation options:', error)
        }
      }

      return { ...prevState, isClusteringEnabled: newValue }
    })
  }

  /**
   * Handler that updates the global clustering pixel size threshold.
   */
  const handleClusteringPixelSizeThresholdChange = (
    value: number | null,
  ): void => {
    updateState({ clusteringPixelSizeThreshold: value })
    if (state.isClusteringEnabled) {
      ;(
        volumeViewerRef.current as unknown as {
          setAnnotationOptions?(opts: object): void
        }
      ).setAnnotationOptions?.({
        clusteringPixelSizeThreshold: value ?? undefined,
      })
    }
  }

  const formatAnnotation = (annotation: AnnotationCategoryAndType): void => {
    const viewer = volumeViewerRef.current
    if (viewer === null || viewer === undefined) {
      return
    }
    const roi = viewer.getROI(annotation.uid)
    const key = getRoiKey(roi) as string
    const color =
      roiStylesRef.current[key] !== undefined
        ? roiStylesRef.current[key].stroke?.color.slice(0, 3)
        : DEFAULT_ANNOTATION_COLOR_PALETTE[
            Object.keys(roiStylesRef.current).length %
              DEFAULT_ANNOTATION_COLOR_PALETTE.length
          ]
    defaultAnnotationStylesRef.current[annotation.uid] = {
      color: color as number[],
      opacity: DEFAULT_ANNOTATION_OPACITY,
      contourOnly: false,
    }
    roiStylesRef.current[key] = generateRoiStyle(
      defaultAnnotationStylesRef.current[annotation.uid],
    )
  }

  const getDataFromViewer = (): {
    rois: dmv.roi.ROI[]
    segments: dmv.segment.Segment[]
    mappings: dmv.mapping.ParameterMapping[]
    annotationGroups: dmv.annotation.AnnotationGroup[]
    annotations: AnnotationCategoryAndType[]
  } => {
    const rois: dmv.roi.ROI[] = []
    const segments: dmv.segment.Segment[] = []
    const mappings: dmv.mapping.ParameterMapping[] = []
    const annotationGroups: dmv.annotation.AnnotationGroup[] = []

    const viewer = volumeViewerRef.current
    if (viewer === null || viewer === undefined) {
      return { rois, segments, mappings, annotationGroups, annotations: [] }
    }

    rois.push(...viewer.getAllROIs())
    segments.push(...viewer.getAllSegments())
    mappings.push(...viewer.getAllParameterMappings())
    const allAnnotationGroups = viewer.getAllAnnotationGroups()
    const filteredAnnotationGroups = allAnnotationGroups?.filter(
      (annotationGroup) =>
        props.slide.seriesInstanceUIDs.includes(
          annotationGroup.referencedSeriesInstanceUID,
        ),
    )
    annotationGroups.push(...(filteredAnnotationGroups ?? []))

    const annotations = rois.map((roi) => adaptRoiToAnnotation(roi))

    return { rois, segments, mappings, annotationGroups, annotations }
  }

  const getReport = (): React.ReactNode => {
    const dataset = state.generatedReport
    if (dataset !== undefined) {
      return <Report dataset={dataset} />
    }
    return undefined
  }

  const getAnnotationMenuItems = (rois: dmv.roi.ROI[]): React.ReactNode => {
    if (rois.length > 0) {
      return (
        <AnnotationList
          rois={rois}
          selectedRoiUIDs={state.selectedRoiUIDs}
          visibleRoiUIDs={state.visibleRoiUIDs}
          onSelection={handleAnnotationSelection}
          onVisibilityChange={handleAnnotationVisibilityChange}
        />
      )
    }
    return undefined
  }

  const getFindingOptions = (): React.ReactNode[] => {
    return findingOptions.map((finding, index) => {
      return (
        <Select.Option
          key={
            finding.CodeValue !== undefined && finding.CodeValue !== ''
              ? finding.CodeValue
              : `finding-${index}`
          }
          value={finding.CodeValue}
        >
          {finding.CodeMeaning}
        </Select.Option>
      )
    })
  }

  const getAnnotationConfigurations = (): React.ReactNode[] => {
    const findingOptions = getFindingOptions()
    const geometryTypeOptionsMapping = getGeometryTypeOptionsMapping()

    const annotationConfigurations: React.ReactNode[] = [
      <Select
        style={{ minWidth: 130 }}
        onSelect={handleAnnotationFindingSelection}
        key="annotation-finding"
        defaultActiveFirstOption
        placeholder="Select finding"
      >
        {findingOptions}
      </Select>,
    ]
    const selectedFinding = state.selectedFinding
    if (selectedFinding !== undefined) {
      const key = buildKey(selectedFinding)
      evaluationOptions[key].forEach((evaluation, index) => {
        const evaluationOptions = evaluation.values.map((code) => {
          return (
            <Select.Option
              key={
                code.CodeValue !== undefined && code.CodeValue !== ''
                  ? code.CodeValue
                  : `evaluation-${index}`
              }
              value={code.CodeValue}
              label={evaluation.name}
            >
              {code.CodeMeaning}
            </Select.Option>
          )
        })
        annotationConfigurations.push(
          <>
            {evaluation.name.CodeMeaning}
            <Select
              style={{ minWidth: 130 }}
              onSelect={handleAnnotationEvaluationSelection}
              allowClear
              onClear={handleAnnotationEvaluationClearance}
              defaultActiveFirstOption={false}
            >
              {evaluationOptions}
            </Select>
          </>,
        )
      })
      const geometryTypeOptionElements = geometryTypeOptions[key].map(
        (name: string) => {
          return geometryTypeOptionsMapping[name]
        },
      )
      annotationConfigurations.push(
        <>
          ROI geometry type
          <Select
            style={{ minWidth: 130 }}
            onSelect={handleAnnotationGeometryTypeSelection}
            key="annotation-geometry-type"
            placeholder="Select geometry type"
          >
            {geometryTypeOptionElements}
          </Select>
        </>,
      )
      annotationConfigurations.push(
        <Checkbox
          onChange={handleAnnotationMeasurementActivation}
          key="annotation-measurement"
        >
          measure
        </Checkbox>,
      )
    }

    return annotationConfigurations
  }

  const getSpecimenMenu = (): React.ReactNode => {
    return (
      <Menu.SubMenu key="specimens" title="Specimens">
        <SpecimenList
          metadata={props.slide.volumeImages[0]}
          showstain={false}
        />
      </Menu.SubMenu>
    )
  }

  const getEquipmentMenu = (): React.ReactNode => {
    return (
      <Menu.SubMenu key="equipment" title="Equipment">
        <Equipment metadata={props.slide.volumeImages[0]} />
      </Menu.SubMenu>
    )
  }

  const getOpticalPathMenu = (): React.ReactNode => {
    const viewer = volumeViewerRef.current
    if (viewer === null || viewer === undefined) {
      return null
    }
    const opticalPaths = viewer.getAllOpticalPaths()
    opticalPaths.sort((a, b) => {
      if (a.identifier.localeCompare(b.identifier) === 1) {
        return 1
      } else if (b.identifier.localeCompare(a.identifier) === 1) {
        return -1
      }
      return 0
    })
    const opticalPathStyles: {
      [identifier: string]: {
        opacity: number
        color?: number[]
        limitValues?: number[]
        paletteColorLookupTable?: dmv.color.PaletteColorLookupTable
      }
    } = {}
    const opticalPathMetadata: {
      [identifier: string]: dmv.metadata.VLWholeSlideMicroscopyImage[]
    } = {}
    opticalPaths.forEach((opticalPath) => {
      const identifier = opticalPath.identifier
      const metadata = viewer.getOpticalPathMetadata(identifier)
      opticalPathMetadata[identifier] = metadata
      const style = {
        ...viewer.getOpticalPathStyle(identifier),
      }
      opticalPathStyles[identifier] = style
    })
    return (
      <Menu.SubMenu key="optical-paths" title="Optical Paths">
        <OpticalPathList
          metadata={opticalPathMetadata}
          opticalPaths={opticalPaths}
          defaultOpticalPathStyles={opticalPathStyles}
          visibleOpticalPathIdentifiers={state.visibleOpticalPathIdentifiers}
          activeOpticalPathIdentifiers={state.activeOpticalPathIdentifiers}
          onOpticalPathVisibilityChange={handleOpticalPathVisibilityChange}
          onOpticalPathStyleChange={handleOpticalPathStyleChange}
          onOpticalPathActivityChange={handleOpticalPathActivityChange}
          selectedPresentationStateUID={state.selectedPresentationStateUID}
        />
      </Menu.SubMenu>
    )
  }

  const getPresentationStateMenu = (): React.ReactNode => {
    if (state.presentationStates.length > 0) {
      const presentationStateOptions = []
      state.presentationStates.forEach((instance, index) => {
        presentationStateOptions.push(
          <Select.Option
            key={
              instance.SOPInstanceUID !== undefined &&
              instance.SOPInstanceUID !== ''
                ? instance.SOPInstanceUID
                : `presentation-state-${index}`
            }
            value={instance.SOPInstanceUID}
            dropdownMatchSelectWidth={false}
            size="small"
          >
            {instance.ContentDescription !== undefined &&
            instance.ContentDescription !== ''
              ? instance.ContentDescription
              : 'Untitled'}
          </Select.Option>,
        )
      })
      presentationStateOptions.push(
        <Select.Option
          key="default-presentation-state"
          value={undefined}
          dropdownMatchSelectWidth={false}
          size="small"
        >
          {null}
        </Select.Option>,
      )
      return (
        <Menu.SubMenu key="presentation-states" title="Presentation States">
          <Space align="center" size={20} style={{ padding: '14px' }}>
            <Select
              style={{ minWidth: 200, maxWidth: 200 }}
              onSelect={handlePresentationStateSelection}
              key="presentation-states"
              value={state.selectedPresentationStateUID}
            >
              {presentationStateOptions}
            </Select>
            <Tooltip title="Reset">
              <Btn icon={UndoOutlined} onClick={handlePresentationStateReset} />
            </Tooltip>
          </Space>
        </Menu.SubMenu>
      )
    }
    return undefined
  }

  const getSegmentationMenu = (
    segments: dmv.segment.Segment[],
  ): React.ReactNode => {
    const viewer = volumeViewerRef.current
    if (segments.length === 0 || viewer === null || viewer === undefined) {
      return undefined
    }

    if (segments.length > 0) {
      const defaultSegmentStyles: {
        [segmentUID: string]: {
          opacity: number
          color?: number[]
        }
      } = {}
      const segmentMetadata: {
        [segmentUID: string]: dmv.metadata.Segmentation[]
      } = {}

      // Group segments by series
      const segmentsBySeries: {
        [seriesUID: string]: dmv.segment.Segment[]
      } = {}

      segments.forEach((segment, _index) => {
        segmentMetadata[segment.uid] = viewer.getSegmentMetadata(segment.uid)

        // Get the series UID for this segment
        const seriesUID =
          segmentMetadata[segment.uid]?.[0]?.SeriesInstanceUID ?? 'unknown'
        if (segmentsBySeries[seriesUID] === undefined) {
          segmentsBySeries[seriesUID] = []
        }
        segmentsBySeries[seriesUID].push(segment)

        if (
          getSegmentationType(
            segmentMetadata[segment.uid][0] as unknown as Record<
              string,
              unknown
            >,
          ) !== 'BINARY'
        ) {
          const defaultStyle = viewer.getSegmentStyle(segment.uid)
          defaultSegmentStyles[segment.uid] = {
            opacity: defaultStyle.opacity,
            color: undefined, // Non-BINARY segments don't have explicit colors
          }
        } else {
          const defaultStyle = viewer.getSegmentStyle(segment.uid)

          /** Get the best color for this segment (from DICOM metadata or generated) */
          const segmentColor = getSegmentColor(
            (segmentMetadata[segment.uid]?.[0] as unknown as Record<
              string,
              unknown
            >) ?? {},
            segment.number,
          )

          /** Use customized color if user has set one, otherwise use DICOM/generated color */
          const finalColor =
            state.customizedSegmentColors[segment.uid] ?? segmentColor

          defaultSegmentStyles[segment.uid] = {
            opacity: defaultStyle.opacity,
            color: finalColor,
          }

          viewer.setSegmentStyle(segment.uid, {
            opacity: defaultSegmentStyles[segment.uid].opacity,
            paletteColorLookupTable:
              defaultSegmentStyles[segment.uid].color !== null &&
              defaultSegmentStyles[segment.uid].color !== undefined
                ? createSegmentPaletteColorLookupTable(
                    defaultSegmentStyles[segment.uid].color as number[],
                  )
                : undefined,
          })
        }
      })

      // Initialize selected series if not set
      if (
        state.selectedSegmentationSeriesInstanceUID === undefined &&
        segments.length !== 0
      ) {
        updateState({ selectedSegmentationSeriesInstanceUID: 'all' })
      }

      // Create dropdown options for series
      const dropdownOptions = [
        {
          value: 'all',
          label: `All Series (${segments.length} segments)`,
        },
        ...Object.keys(segmentsBySeries).map((seriesUID) => ({
          value: seriesUID,
          label: `${getSeriesDescription(seriesUID)} (${segmentsBySeries[seriesUID]?.length ?? 0} segments)`,
        })),
      ]

      // Get segments for the selected series or all series
      const selectedSeriesSegments =
        state.selectedSegmentationSeriesInstanceUID === 'all'
          ? segments
          : state.selectedSegmentationSeriesInstanceUID !== undefined
            ? (segmentsBySeries[state.selectedSegmentationSeriesInstanceUID] ??
              [])
            : []

      return (
        <Menu.SubMenu key="segmentations" title="Segmentations">
          {/* Series Selection Dropdown */}
          <div
            style={{
              paddingLeft: '14px',
              paddingRight: '14px',
              paddingTop: '7px',
              paddingBottom: '7px',
            }}
          >
            <Select
              style={{ width: '100%' }}
              placeholder="Select a series"
              value={state.selectedSegmentationSeriesInstanceUID}
              onChange={handleSegmentationSeriesSelection}
              options={dropdownOptions}
            />
          </div>

          {/* Display segments for the selected series */}
          {selectedSeriesSegments.length > 0 && (
            <SegmentList
              segments={selectedSeriesSegments}
              metadata={segmentMetadata}
              defaultSegmentStyles={defaultSegmentStyles}
              visibleSegmentUIDs={state.visibleSegmentUIDs}
              onSegmentVisibilityChange={handleSegmentVisibilityChange}
              onSegmentStyleChange={handleSegmentStyleChange}
            />
          )}
        </Menu.SubMenu>
      )
    }
    return undefined
  }

  const getParametricMapMenu = (
    mappings: dmv.mapping.ParameterMapping[],
  ): React.ReactNode => {
    const viewer = volumeViewerRef.current
    if (mappings.length === 0 || viewer === null || viewer === undefined) {
      return undefined
    }
    if (mappings.length > 0) {
      const defaultMappingStyles: {
        [mappingUID: string]: {
          opacity: number
        }
      } = {}
      const mappingMetadata: {
        [mappingUID: string]: dmv.metadata.ParametricMap[]
      } = {}
      mappings.forEach((mapping) => {
        defaultMappingStyles[mapping.uid] = viewer.getParameterMappingStyle(
          mapping.uid,
        )
        mappingMetadata[mapping.uid] = viewer.getParameterMappingMetadata(
          mapping.uid,
        )
      })
      return (
        <Menu.SubMenu key="parmetric-maps" title="Parametric Maps">
          <MappingList
            mappings={mappings}
            metadata={mappingMetadata}
            defaultMappingStyles={defaultMappingStyles}
            visibleMappingUIDs={state.visibleMappingUIDs}
            onMappingVisibilityChange={handleMappingVisibilityChange}
            onMappingStyleChange={handleMappingStyleChange}
          />
        </Menu.SubMenu>
      )
    }
    return undefined
  }

  const getAnnotationGroupMenu = (
    annotationGroups: dmv.annotation.AnnotationGroup[],
  ): React.ReactNode => {
    const viewer = volumeViewerRef.current
    if (
      annotationGroups.length === 0 ||
      viewer === null ||
      viewer === undefined
    ) {
      return undefined
    }
    if (annotationGroups.length > 0) {
      const annotationGroupMetadata: {
        [
          annotationGroupUID: string
        ]: dmv.metadata.MicroscopyBulkSimpleAnnotations
      } = {}
      const defaultAnnotationGroupStyles: {
        [annotationUID: string]: {
          opacity: number
          color: number[]
        }
      } = {}
      annotationGroups.forEach((annotationGroup) => {
        defaultAnnotationGroupStyles[annotationGroup.uid] =
          viewer.getAnnotationGroupStyle(annotationGroup.uid)
        annotationGroupMetadata[annotationGroup.uid] =
          viewer.getAnnotationGroupMetadata(annotationGroup.uid)
      })

      // Group annotation groups by seriesInstanceUID
      const annotationGroupsBySeries: {
        [seriesInstanceUID: string]: dmv.annotation.AnnotationGroup[]
      } = {}
      annotationGroups.forEach((annotationGroup) => {
        const seriesUID = annotationGroup.seriesInstanceUID
        if (!(seriesUID in annotationGroupsBySeries)) {
          annotationGroupsBySeries[seriesUID] = []
        }
        annotationGroupsBySeries[seriesUID].push(annotationGroup)
      })

      // Initialize selected series if not set
      if (
        state.selectedSeriesInstanceUID === undefined &&
        annotationGroups.length !== 0
      ) {
        updateState({ selectedSeriesInstanceUID: 'all' })
      }

      // Create dropdown options for series
      const dropdownOptions = [
        {
          value: 'all',
          label: 'All',
        },
        ...Object.keys(annotationGroupsBySeries).map((seriesUID) => ({
          value: seriesUID,
          label: `${getSeriesDescription(seriesUID)} (${annotationGroupsBySeries[seriesUID]?.length ?? 0} groups)`,
        })),
      ]

      // Get annotation groups for the selected series or all series
      const selectedSeriesAnnotationGroups =
        state.selectedSeriesInstanceUID === 'all'
          ? annotationGroups
          : state.selectedSeriesInstanceUID !== undefined
            ? (annotationGroupsBySeries[state.selectedSeriesInstanceUID] ?? [])
            : []

      return (
        <Menu.SubMenu key="annotation-groups" title="Annotation Groups">
          {/* Series Selection Dropdown */}
          <div
            style={{
              paddingLeft: '14px',
              paddingRight: '14px',
              paddingTop: '7px',
              paddingBottom: '7px',
            }}
          >
            <Select
              style={{ width: '100%' }}
              placeholder="Select a series"
              value={state.selectedSeriesInstanceUID}
              onChange={handleAnnotationGroupSelection}
              options={dropdownOptions}
            />
          </div>

          {/* Display annotation groups for the selected series */}
          {selectedSeriesAnnotationGroups.length > 0 && (
            <AnnotationGroupList
              annotationGroups={selectedSeriesAnnotationGroups}
              metadata={annotationGroupMetadata}
              onAnnotationGroupClick={handleAnnotationGroupClick}
              defaultAnnotationGroupStyles={defaultAnnotationGroupStyles}
              visibleAnnotationGroupUIDs={state.visibleAnnotationGroupUIDs}
              onAnnotationGroupVisibilityChange={
                handleAnnotationGroupVisibilityChange
              }
              onAnnotationGroupStyleChange={handleAnnotationGroupStyleChange}
            />
          )}

          {/* Clustering Settings */}
          <ClusteringSettings
            isClusteringEnabled={state.isClusteringEnabled}
            clusteringPixelSizeThreshold={state.clusteringPixelSizeThreshold}
            onClusteringToggle={handleClusteringToggle}
            onThresholdChange={handleClusteringPixelSizeThresholdChange}
          />
        </Menu.SubMenu>
      )
    }
    return undefined
  }

  const getToolbar = (): {
    toolbar: React.ReactNode
    toolbarHeight: string
  } => {
    const annotationTools = [
      <Btn
        tooltip="Draw ROI [Alt+D]"
        icon={FaDrawPolygon}
        onClick={handleRoiDrawing}
        isSelected={state.isRoiDrawingActive}
        key="draw-roi-button"
      />,
      <Btn
        tooltip="Modify ROIs [Alt+M]"
        icon={FaHandPointer}
        onClick={handleRoiModification}
        isSelected={state.isRoiModificationActive}
        key="modify-roi-button"
      />,
      <Btn
        tooltip="Translate ROIs [Alt+T]"
        icon={FaHandPaper}
        onClick={handleRoiTranslation}
        isSelected={state.isRoiTranslationActive}
        key="translate-roi-button"
      />,
      <Btn
        tooltip="Remove selected ROI [Alt+R]"
        onClick={handleRoiRemoval}
        icon={FaTrash}
        key="remove-roi-button"
      />,
      <Btn
        tooltip="Show/Hide ROIs [Alt+V]"
        icon={state.areRoisHidden ? FaEye : FaEyeSlash}
        onClick={handleRoiVisibilityChange}
        isSelected={state.areRoisHidden}
        key="toggle-roi-visibility-button"
      />,
      <Btn
        tooltip="Save ROIs [Alt+S]"
        icon={FaSave}
        onClick={handleReportGeneration}
        key="generate-report-button"
      />,
    ]
    const controlTools = [
      <Btn
        tooltip="Go to [Alt+G]"
        icon={FaCrosshairs}
        onClick={handleGoTo}
        key="go-to-slide-position-button"
      />,
    ]

    let toolbar: React.ReactNode
    let toolbarHeight = '0px'

    if (props.enableAnnotationTools) {
      toolbar = (
        <Row justify="start" gutter={8} align="middle">
          {annotationTools.map((item) => {
            return (
              <React.Fragment key={(item as React.ReactElement).key}>
                {item}
              </React.Fragment>
            )
          })}
          {controlTools.map((item) => {
            return (
              <React.Fragment key={(item as React.ReactElement).key}>
                {item}
              </React.Fragment>
            )
          })}
        </Row>
      )
      toolbarHeight = '50px'
    }

    return { toolbar, toolbarHeight }
  }

  const getCursor = (): string => {
    if (state.isLoading) {
      return 'progress'
    }
    return 'default'
  }

  const getSelectedRoiInformation = (): React.ReactNode => {
    const viewer = volumeViewerRef.current
    if (
      viewer === null ||
      viewer === undefined ||
      state.selectedRoi === null ||
      state.selectedRoi === undefined
    ) {
      return undefined
    }
    {
      const allRois = viewer.getAllROIs()
      const roiIndex = allRois.findIndex(
        (roi) => roi.uid === state.selectedRoi?.uid,
      )

      const roiAttributes: Array<{
        name: string
        value: string
        unit?: string
      }> = [
        {
          name: '',
          value: `ROI ${roiIndex >= 0 ? roiIndex + 1 : 'N/A'}`,
        },
      ]
      const roiScoordAttributes: Array<{
        name: string
        value: string
      }> = [
        {
          name: 'Graphic type',
          value: state.selectedRoi.scoord3d.graphicType,
        },
      ]
      const roiEvaluationAttributes: Array<{
        name: string
        value: string
      }> = []
      state.selectedRoi.evaluations.forEach((item) => {
        if (item.ValueType === 'CODE') {
          const codeItem = item as dcmjs.sr.valueTypes.CodeContentItem
          roiEvaluationAttributes.push({
            name: codeItem.ConceptNameCodeSequence[0].CodeMeaning,
            value: codeItem.ConceptCodeSequence[0].CodeMeaning,
          })
        } else {
          const textItem = item as dcmjs.sr.valueTypes.TextContentItem
          roiEvaluationAttributes.push({
            name: textItem.ConceptNameCodeSequence[0].CodeMeaning,
            value: textItem.TextValue,
          })
        }
      })
      const roiMeasurmentAttributesPerOpticalPath: {
        [identifier: string]: Array<{
          name: string
          value: string
          unit?: string
        }>
      } = {}
      state.selectedRoi.measurements.forEach((item) => {
        let identifier = 'default'
        if (
          item.ContentSequence !== null &&
          item.ContentSequence !== undefined
        ) {
          const refItems = findContentItemsByName({
            content: item.ContentSequence,
            name: new dcmjs.sr.coding.CodedConcept({
              value: '121112',
              meaning: 'Source of Measurement',
              schemeDesignator: 'DCM',
            }),
          })
          if (refItems.length > 0) {
            identifier =
              // @ts-expect-error ReferencedSOPSequence type lacks ReferencedOpticalPathIdentifier property
              refItems[0].ReferencedSOPSequence[0]
                .ReferencedOpticalPathIdentifier
          }
        }
        if (!(identifier in roiMeasurmentAttributesPerOpticalPath)) {
          roiMeasurmentAttributesPerOpticalPath[identifier] = []
        }
        const measuredValueItem = item.MeasuredValueSequence[0]
        roiMeasurmentAttributesPerOpticalPath[identifier].push({
          name: item.ConceptNameCodeSequence[0].CodeMeaning,
          value: measuredValueItem.NumericValue.toString(),
          unit: measuredValueItem.MeasurementUnitsCodeSequence[0].CodeMeaning,
        })
      })
      const createRoiDescription = (
        attributes: Array<{ name: string; value: string; unit?: string }>,
      ): React.ReactNode[] => {
        return attributes.map((item) => {
          let value: string
          if (item.unit !== null && item.unit !== undefined) {
            value = `${item.value} [${item.unit}]`
          } else {
            value = item.value
          }
          return (
            <Descriptions.Item key={item.name} label={item.name}>
              {value}
            </Descriptions.Item>
          )
        })
      }
      const roiDescriptions = createRoiDescription(roiAttributes)
      const roiScoordDescriptions = createRoiDescription(roiScoordAttributes)
      const roiEvaluationDescriptions = createRoiDescription(
        roiEvaluationAttributes,
      )
      const roiMeasurementDescriptions = []
      for (const identifier in roiMeasurmentAttributesPerOpticalPath) {
        const descriptions = createRoiDescription(
          roiMeasurmentAttributesPerOpticalPath[identifier],
        )
        if (identifier === 'default') {
          roiMeasurementDescriptions.push(descriptions)
        } else {
          roiMeasurementDescriptions.push(
            <>
              <Divider orientation="left" orientationMargin={0} dashed plain>
                {identifier}
              </Divider>
              {descriptions}
            </>,
          )
        }
      }
      return (
        <>
          <Descriptions layout="horizontal" column={1}>
            {roiDescriptions}
          </Descriptions>
          <Divider orientation="left" orientationMargin={0}>
            Spatial coordinates
          </Divider>
          <Descriptions layout="horizontal" column={1}>
            {roiScoordDescriptions}
          </Descriptions>
          <Divider orientation="left" orientationMargin={0}>
            Evaluations
          </Divider>
          <Descriptions layout="horizontal" column={1}>
            {roiEvaluationDescriptions}
          </Descriptions>
          <Divider orientation="left" orientationMargin={0}>
            Measurements
          </Divider>
          <Descriptions layout="horizontal" column={1}>
            {roiMeasurementDescriptions}
          </Descriptions>
        </>
      )
    }
  }

  const getICCProfilesMenu = (): React.ReactNode => {
    const viewer = volumeViewerRef.current
    if (viewer === null || viewer === undefined) {
      return null
    }
    return (
      viewer.getICCProfiles().length > 0 && (
        <div style={{ margin: '0.9rem' }}>
          <Checkbox
            checked={state.isICCProfilesEnabled}
            onChange={handleICCProfilesToggle}
          >
            ICC Profiles
          </Checkbox>
        </div>
      )
    )
  }

  const getSegmentationInterpolationMenu = (): React.ReactNode => {
    const viewer = volumeViewerRef.current
    if (viewer === null || viewer === undefined) {
      return null
    }
    const segments = viewer.getAllSegments()
    return (
      segments.length > 0 && (
        <div style={{ margin: '0.9rem' }}>
          <Checkbox
            checked={state.isSegmentationInterpolationEnabled}
            onChange={handleSegmentationInterpolationToggle}
          >
            Segmentation Interpolation
          </Checkbox>
        </div>
      )
    )
  }

  const getParametricMapInterpolationMenu = (): React.ReactNode => {
    const viewer = volumeViewerRef.current
    if (viewer === null || viewer === undefined) {
      return null
    }
    const mappings = viewer.getAllParameterMappings()
    return (
      mappings.length > 0 && (
        <div style={{ margin: '0.9rem' }}>
          <Checkbox
            checked={state.isParametricMapInterpolationEnabled}
            onChange={handleParametricMapInterpolationToggle}
          >
            Parametric Map Interpolation
          </Checkbox>
        </div>
      )
    )
  }

  const { rois, segments, mappings, annotationGroups, annotations } =
    getDataFromViewer()

  const openSubMenuItems = getOpenSubMenuItems()
  const report = getReport()
  const annotationMenuItems = getAnnotationMenuItems(rois)
  const annotationConfigurations = getAnnotationConfigurations()
  const specimenMenu = getSpecimenMenu()
  const equipmentMenu = getEquipmentMenu()
  const opticalPathMenu = getOpticalPathMenu()
  const presentationStateMenu = getPresentationStateMenu()
  const segmentationMenu = getSegmentationMenu(segments)
  const parametricMapMenu = getParametricMapMenu(mappings)
  const annotationGroupMenu = getAnnotationGroupMenu(annotationGroups)
  const { toolbar, toolbarHeight } = getToolbar()
  useEffect(() => {
    setViewerToolbar(toolbar)
    return () => setViewerToolbar(null)
  }, [toolbar, setViewerToolbar])
  const cursor = getCursor()
  const selectedRoiInformation = getSelectedRoiInformation()
  const iccProfilesMenu = getICCProfilesMenu()
  const segmentationInterpolationMenu = getSegmentationInterpolationMenu()
  const parametricMapInterpolationMenu = getParametricMapInterpolationMenu()

  if (segmentationMenu !== null && segmentationMenu !== undefined) {
    openSubMenuItems.push('segmentations')
  }
  if (parametricMapMenu !== null && parametricMapMenu !== undefined) {
    openSubMenuItems.push('parametric-maps')
  }
  if (annotationGroupMenu !== null && annotationGroupMenu !== undefined) {
    openSubMenuItems.push('annotationGroups')
  }

  annotations?.forEach?.(formatAnnotation)

  return (
    <Layout style={{ height: '100%', position: 'relative' }} hasSider>
      <SlideViewerContent
        toolbar={null}
        toolbarHeight={toolbarHeight}
        cursor={cursor}
        volumeViewportRef={volumeViewportRef}
        caseDetailsOpen={caseDetailsOpen}
        viewerLayersOpen={viewerLayersOpen}
      >
        <SlideViewerModals
          isAnnotationModalVisible={state.isAnnotationModalVisible}
          onAnnotationConfigurationCompletion={
            handleAnnotationConfigurationCompletion
          }
          onAnnotationConfigurationCancellation={
            handleAnnotationConfigurationCancellation
          }
          isAnnotationOkDisabled={
            !(
              state.selectedFinding !== undefined &&
              state.selectedGeometryType !== undefined
            )
          }
          annotationConfigurations={annotationConfigurations}
          isSelectedRoiModalVisible={state.isSelectedRoiModalVisible}
          onRoiSelectionCancellation={handleRoiSelectionCancellation}
          selectedRoiInformation={selectedRoiInformation}
          isGoToModalVisible={state.isGoToModalVisible}
          onSlidePositionSelection={handleSlidePositionSelection}
          onSlidePositionSelectionCancellation={
            handleSlidePositionSelectionCancellation
          }
          validXCoordinateRange={state.validXCoordinateRange}
          validYCoordinateRange={state.validYCoordinateRange}
          isSelectedXCoordinateValid={state.isSelectedXCoordinateValid}
          isSelectedYCoordinateValid={state.isSelectedYCoordinateValid}
          isSelectedMagnificationValid={state.isSelectedMagnificationValid}
          onXCoordinateSelection={handleXCoordinateSelection}
          onYCoordinateSelection={handleYCoordinateSelection}
          onMagnificationSelection={handleMagnificationSelection}
          isReportModalVisible={state.isReportModalVisible}
          onReportVerification={handleReportVerification}
          onReportCancellation={handleReportCancellation}
          report={report}
        />
      </SlideViewerContent>

      {viewerLayersOpen && (
        <SlideViewerSidebar
          labelViewportRef={labelViewportRef}
          labelViewer={labelViewerRef.current ?? undefined}
          openSubMenuItems={openSubMenuItems}
          specimenMenu={specimenMenu}
          iccProfilesMenu={iccProfilesMenu}
          segmentationInterpolationMenu={segmentationInterpolationMenu}
          parametricMapInterpolationMenu={parametricMapInterpolationMenu}
          equipmentMenu={equipmentMenu}
          opticalPathMenu={opticalPathMenu}
          presentationStateMenu={presentationStateMenu}
          annotationMenuItems={annotationMenuItems}
          annotationGroupMenu={annotationGroupMenu}
          segmentationMenu={segmentationMenu}
          parametricMapMenu={parametricMapMenu}
          annotations={annotations}
          visibleRoiUIDs={state.visibleRoiUIDs}
          onAnnotationVisibilityChange={handleAnnotationVisibilityChange}
          onRoiStyleChange={handleRoiStyleChange}
          defaultAnnotationStyles={defaultAnnotationStylesRef.current}
        />
      )}

      {state.isHoveredRoiTooltipVisible &&
      state.hoveredRoiAttributes.length > 0 ? (
        <HoveredRoiTooltip
          xPosition={state.hoveredRoiTooltipX}
          yPosition={state.hoveredRoiTooltipY}
          rois={state.hoveredRoiAttributes}
        />
      ) : null}
    </Layout>
  )
}

export default withRouter(SlideViewer)
