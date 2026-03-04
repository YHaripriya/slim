import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Typography } from 'antd'
import type React from 'react'

const panelStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.97)',
  borderRadius: 10,
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  border: '1px solid rgba(0,0,0,0.06)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 200,
}

export interface ActiveSlideNavigatorProps {
  /** Current slide index (1-based for display), e.g. 6 */
  currentIndex: number
  /** Total number of slides in worklist, e.g. 30 */
  totalSlides: number
  /** Current DICOM/series identifier to display */
  dicomId: string
  onPrev?: () => void
  onNext?: () => void
  slideId: string
}

/**
 * Navigator panel showing active slide: worklist count (e.g. 6 of 30) and current DICOM ID.
 * Renders to the left of the toolbar per reference design.
 */
const ActiveSlideNavigator: React.FC<ActiveSlideNavigatorProps> = ({
  currentIndex,
  totalSlides,
  dicomId,
  onPrev,
  onNext,
  slideId,
}) => {
  const canPrev = currentIndex > 1
  const canNext = currentIndex < totalSlides

  return (
    <div style={panelStyle}>
      <Typography.Text
        strong
        style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}
      >
        ACTIVE SLIDE
      </Typography.Text>
      <Typography.Text ellipsis style={{ fontSize: 13 }} title={dicomId}>
        {slideId?.replace('ContainerIdentifier_', '') || '—'}
      </Typography.Text>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}
      >
        <Button
          type="text"
          size="small"
          icon={<LeftOutlined />}
          disabled={!canPrev}
          onClick={onPrev}
          style={{
            padding: '4px',
            borderRadius: 8,
            width: 32,
            height: 32,
          }}
        />
        <Typography.Text style={{ fontSize: 12 }}>
          {currentIndex} of {totalSlides}
        </Typography.Text>
        <Button
          type="text"
          size="small"
          icon={<RightOutlined />}
          disabled={!canNext}
          onClick={onNext}
          style={{
            padding: '4px',
            borderRadius: 8,
            width: 32,
            height: 32,
          }}
        />
      </div>
    </div>
  )
}

export default ActiveSlideNavigator
