// skipcq: JS-C1003
import * as dcmjs from 'dcmjs'
// skipcq: JS-C1003
import type * as dmv from 'dicom-microscopy-viewer'
import { useMemo } from 'react'

import type { AnnotationSettings } from '../../types/annotations'
import {
  DEFAULT_ROI_FILL_COLOR,
  DEFAULT_ROI_RADIUS,
  DEFAULT_ROI_STROKE_COLOR,
  DEFAULT_ROI_STROKE_WIDTH,
} from './constants'
import type { EvaluationOptions, Measurement } from './types'
import { buildKey, formatRoiStyle } from './utils/roiUtils'

const GEOMETRY_TYPE_OPTIONS = [
  'point',
  'circle',
  'box',
  'polygon',
  'line',
  'freehandpolygon',
  'freehandline',
] as const

const DEFAULT_ROI_STYLE: dmv.viewer.ROIStyleOptions = {
  stroke: {
    color: DEFAULT_ROI_STROKE_COLOR,
    width: DEFAULT_ROI_STROKE_WIDTH,
  },
  fill: {
    color: DEFAULT_ROI_FILL_COLOR,
  },
  image: {
    circle: {
      fill: { color: DEFAULT_ROI_STROKE_COLOR },
      radius: DEFAULT_ROI_RADIUS,
    },
  },
}

export interface SlideViewerAnnotationOptions {
  findingOptions: dcmjs.sr.coding.CodedConcept[]
  evaluationOptions: { [key: string]: EvaluationOptions[] }
  geometryTypeOptions: { [key: string]: string[] }
  measurements: Measurement[]
  roiStyles: { [key: string]: dmv.viewer.ROIStyleOptions }
}

/**
 * Pure function: build annotation-derived options from config.
 * Used by the class component constructor and by useSlideViewerState.
 */
export function getSlideViewerAnnotationOptions(
  annotations: AnnotationSettings[],
  defaultRoiStyle: dmv.viewer.ROIStyleOptions = DEFAULT_ROI_STYLE,
): SlideViewerAnnotationOptions {
  const findingOptions: dcmjs.sr.coding.CodedConcept[] = []
  const evaluationOptions: { [key: string]: EvaluationOptions[] } = {}
  const geometryTypeOptions: { [key: string]: string[] } = {}
  const measurements: Measurement[] = []
  const roiStyles: { [key: string]: dmv.viewer.ROIStyleOptions } = {}

  for (const annotation of annotations) {
    const finding = new dcmjs.sr.coding.CodedConcept(annotation.finding)
    findingOptions.push(finding)
    const key = buildKey(finding)

    geometryTypeOptions[key] =
      annotation.geometryTypes !== undefined
        ? annotation.geometryTypes
        : [...GEOMETRY_TYPE_OPTIONS]

    evaluationOptions[key] = []
    if (annotation.evaluations !== undefined) {
      for (const evaluation of annotation.evaluations) {
        evaluationOptions[key].push({
          name: new dcmjs.sr.coding.CodedConcept(evaluation.name),
          values: evaluation.values.map(
            (value) => new dcmjs.sr.coding.CodedConcept(value),
          ),
        })
      }
    }

    if (annotation.measurements !== undefined) {
      for (const measurement of annotation.measurements) {
        measurements.push({
          name: new dcmjs.sr.coding.CodedConcept(measurement.name),
          value: undefined,
          unit: new dcmjs.sr.coding.CodedConcept(measurement.unit),
        })
      }
    }

    if (annotation.style !== null && annotation.style !== undefined) {
      roiStyles[key] = formatRoiStyle(annotation.style)
    } else {
      roiStyles[key] = defaultRoiStyle
    }
  }

  return {
    findingOptions,
    evaluationOptions,
    geometryTypeOptions,
    measurements,
    roiStyles,
  }
}

/**
 * Hook: memoized annotation options from config.
 * Use this when SlideViewer is converted to a function component.
 */
export function useSlideViewerState(
  annotations: AnnotationSettings[],
): SlideViewerAnnotationOptions {
  return useMemo(
    () => getSlideViewerAnnotationOptions(annotations),
    [annotations],
  )
}
