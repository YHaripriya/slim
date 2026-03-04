// skipcq: JS-C1003

import { SearchOutlined } from '@ant-design/icons'
import { Button, Collapse, Spin } from 'antd'
import type * as dmv from 'dicom-microscopy-viewer'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'

import type { Slide } from '../../data/slides'
import { parseDate, parseName } from '../../utils/values'
import {
  SlideGalleryCard,
  SlideGallerySearch,
  SlideGalleryStudyGroup,
  SlideGalleryTick,
} from '../styledElements/styleHelper'

export interface SlideGalleryPanelProps {
  slides: Slide[]
  selectedSlide: Slide | null
  onSlideSelect: (seriesInstanceUID: string) => void
  /** Studies from the worklist table (same data as main worklist) */
  worklistStudies?: dmv.metadata.Study[]
  worklistLoading?: boolean
  /** Current study UID (to highlight in worklist) */
  currentStudyInstanceUID?: string
  /** Called when user selects a study from the worklist (navigate to that study) */
  onStudySelect?: (studyInstanceUID: string) => void
  /** Current worklist fetch limit (show "Load more" when list length equals this) */
  worklistLimit?: number
  /** Load more worklist studies (increases limit and refetches) */
  onLoadMoreWorklist?: () => void
}

/** Placeholder thumbnail when no image is available */
const ThumbnailPlaceholder: React.FC<{ slide: Slide }> = () => (
  <div
    style={{
      width: '100%',
      height: 100,
      background: 'linear-gradient(135deg, #e8e8e8 0%, #f5f5f5 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      color: 'rgba(0,0,0,0.35)',
    }}
  >
    Slide
  </div>
)

/**
 * Slide Gallery panel for the left nav: search, list of slides with selected state
 * (blue border + circular tick), and accordion for selected slide details.
 */
const SlideGalleryPanel: React.FC<SlideGalleryPanelProps> = ({
  slides,
  selectedSlide,
  onSlideSelect,
  worklistStudies = [],
  worklistLoading = false,
  currentStudyInstanceUID,
  onStudySelect,
  worklistLimit = 200,
  onLoadMoreWorklist,
}) => {
  const [search, setSearch] = useState('')
  const selectedSeriesUid = selectedSlide?.seriesInstanceUIDs?.[0] ?? null
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  useEffect(() => {
    if (selectedSeriesUid) setExpandedKey(selectedSeriesUid)
  }, [selectedSeriesUid])

  const filteredWorklistStudies = useMemo(() => {
    if (!search.trim()) return worklistStudies
    const q = search.trim().toLowerCase()
    return worklistStudies.filter((study) => {
      const studyId = (study.StudyID ?? '').toString().toLowerCase()
      const accession = (study.AccessionNumber ?? '').toString().toLowerCase()
      const patientName = parseName(study.PatientName ?? null).toLowerCase()
      const patientId = (study.PatientID ?? '').toString().toLowerCase()
      const studyDate = parseDate(study.StudyDate ?? '').toLowerCase()
      return (
        studyId.includes(q) ||
        accession.includes(q) ||
        patientName.includes(q) ||
        patientId.includes(q) ||
        studyDate.includes(q)
      )
    })
  }, [worklistStudies, search])

  const filteredSlides = useMemo(() => {
    if (!search.trim()) return slides
    const q = search.trim().toLowerCase()
    return slides.filter((s) => {
      const id = s.containerIdentifier?.toLowerCase() ?? ''
      const desc = (s.description ?? '').toLowerCase()
      return id.includes(q) || desc.includes(q)
    })
  }, [slides, search])

  const showWorklist = worklistStudies.length > 0 || worklistLoading
  const showSlides = slides.length > 0

  return (
    <div
      style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <SearchOutlined
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'rgba(0,0,0,0.4)',
            fontSize: 14,
          }}
        />
        <SlideGallerySearch
          placeholder="Search worklist & slides..."
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSearch(e.target.value)
          }
        />
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {showWorklist && (
          <>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(0,0,0,0.5)',
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
                marginBottom: 4,
              }}
            >
              Worklist
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(0,0,0,0.4)',
                marginBottom: 8,
              }}
            >
              All studies (click to open)
            </div>
            {worklistLoading ? (
              <div style={{ padding: 16, textAlign: 'center' }}>
                <Spin size="small" />
              </div>
            ) : (
              filteredWorklistStudies.map((study) => {
                const studyUid = study.StudyInstanceUID ?? ''
                const isCurrentStudy =
                  currentStudyInstanceUID != null &&
                  studyUid === currentStudyInstanceUID
                return isCurrentStudy && showSlides ? (
                  <SlideGalleryStudyGroup key={studyUid}>
                    <SlideGalleryCard
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onStudySelect?.(studyUid)
                        }
                      }}
                      $selected
                      onClick={() => onStudySelect?.(studyUid)}
                    >
                      <div style={{ padding: '10px 12px 32px 12px' }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: 'rgba(0,0,0,0.88)',
                          }}
                        >
                          {study.StudyID ?? studyUid.slice(-12) ?? '—'}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'rgba(0,0,0,0.5)',
                            marginTop: 2,
                          }}
                        >
                          {parseName(study.PatientName ?? null) || '—'}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'rgba(0,0,0,0.4)',
                            marginTop: 2,
                          }}
                        >
                          {parseDate(study.StudyDate ?? '') || '—'}
                          {study.AccessionNumber != null &&
                            study.AccessionNumber !== '' &&
                            ` · ${study.AccessionNumber}`}
                        </div>
                      </div>
                      <SlideGalleryTick aria-hidden>✓</SlideGalleryTick>
                    </SlideGalleryCard>
                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: '1px solid rgba(0,0,0,0.06)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'rgba(0,0,0,0.5)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.02em',
                          marginBottom: 4,
                        }}
                      >
                        Slides in this study
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: 'rgba(0,0,0,0.4)',
                          marginBottom: 10,
                        }}
                      >
                        Series in the open study (click to switch slide)
                      </div>
                      {filteredSlides.map((slide) => {
                        const seriesUid = slide.seriesInstanceUIDs?.[0] ?? ''
                        const isSelected = selectedSeriesUid === seriesUid
                        const slideId =
                          slide.containerIdentifier?.replace(
                            /^ContainerIdentifier_/,
                            '',
                          ) ??
                          seriesUid?.slice(-12) ??
                          '—'
                        const description = slide.description?.trim() || 'Slide'

                        return (
                          <div key={seriesUid} style={{ marginBottom: 8 }}>
                            <SlideGalleryCard
                              $selected={isSelected}
                              onClick={() => onSlideSelect(seriesUid)}
                            >
                              <ThumbnailPlaceholder slide={slide} />
                              <div style={{ padding: '10px 12px 32px 12px' }}>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    fontSize: 13,
                                    color: 'rgba(0,0,0,0.88)',
                                  }}
                                >
                                  {slideId}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: 'rgba(0,0,0,0.5)',
                                    marginTop: 2,
                                  }}
                                >
                                  {description}
                                </div>
                              </div>
                              {isSelected && (
                                <SlideGalleryTick aria-hidden>
                                  ✓
                                </SlideGalleryTick>
                              )}
                            </SlideGalleryCard>

                            {isSelected && (
                              <Collapse
                                ghost
                                activeKey={
                                  expandedKey === seriesUid ? ['details'] : []
                                }
                                onChange={(keys) =>
                                  setExpandedKey(
                                    keys.includes('details') ? seriesUid : null,
                                  )
                                }
                                style={{ marginTop: -4, marginBottom: 8 }}
                              >
                                <Collapse.Panel
                                  header={
                                    <span
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: 'rgb(50, 120, 255)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.02em',
                                      }}
                                    >
                                      Slide details
                                    </span>
                                  }
                                  key="details"
                                >
                                  <div
                                    style={{
                                      fontSize: 12,
                                      color: 'rgba(0,0,0,0.65)',
                                      lineHeight: 1.6,
                                    }}
                                  >
                                    <div>
                                      <strong>Container:</strong>{' '}
                                      {slide.containerIdentifier ?? '—'}
                                    </div>
                                    <div>
                                      <strong>Series:</strong>{' '}
                                      {seriesUid
                                        ? `${seriesUid.slice(0, 20)}…`
                                        : '—'}
                                    </div>
                                    {slide.frameOfReferenceUID && (
                                      <div>
                                        <strong>Frame of reference:</strong>{' '}
                                        {slide.frameOfReferenceUID.slice(0, 24)}
                                        …
                                      </div>
                                    )}
                                    <div>
                                      <strong>Optical paths:</strong>{' '}
                                      {slide.opticalPathIdentifiers?.join(
                                        ', ',
                                      ) ?? '—'}
                                    </div>
                                    <div>
                                      <strong>Volume images:</strong>{' '}
                                      {slide.volumeImages?.length ?? 0}
                                    </div>
                                  </div>
                                </Collapse.Panel>
                              </Collapse>
                            )}
                          </div>
                        )
                      })}
                      {filteredSlides.length === 0 && (
                        <div
                          style={{
                            padding: 16,
                            textAlign: 'center',
                            color: 'rgba(0,0,0,0.45)',
                            fontSize: 12,
                          }}
                        >
                          {slides.length === 0
                            ? 'No slides in this study.'
                            : 'No slides match your search.'}
                        </div>
                      )}
                    </div>
                  </SlideGalleryStudyGroup>
                ) : (
                  <div key={studyUid} style={{ marginBottom: 8 }}>
                    <SlideGalleryCard
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onStudySelect?.(studyUid)
                        }
                      }}
                      $selected={false}
                      onClick={() => onStudySelect?.(studyUid)}
                    >
                      <div style={{ padding: '10px 12px 32px 12px' }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: 'rgba(0,0,0,0.88)',
                          }}
                        >
                          {study.StudyID ?? studyUid.slice(-12) ?? '—'}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'rgba(0,0,0,0.5)',
                            marginTop: 2,
                          }}
                        >
                          {parseName(study.PatientName ?? null) || '—'}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'rgba(0,0,0,0.4)',
                            marginTop: 2,
                          }}
                        >
                          {parseDate(study.StudyDate ?? '') || '—'}
                          {study.AccessionNumber != null &&
                            study.AccessionNumber !== '' &&
                            ` · ${study.AccessionNumber}`}
                        </div>
                      </div>
                      {isCurrentStudy && (
                        <SlideGalleryTick aria-hidden>✓</SlideGalleryTick>
                      )}
                    </SlideGalleryCard>
                  </div>
                )
              })
            )}
            {worklistStudies.length >= worklistLimit &&
              onLoadMoreWorklist != null && (
                <div style={{ marginTop: 8, marginBottom: 8 }}>
                  <Button
                    type="default"
                    size="small"
                    block
                    onClick={onLoadMoreWorklist}
                    disabled={worklistLoading}
                  >
                    {worklistLoading ? 'Loading…' : 'Load more studies'}
                  </Button>
                </div>
              )}
          </>
        )}
      </div>
    </div>
  )
}

export default SlideGalleryPanel
