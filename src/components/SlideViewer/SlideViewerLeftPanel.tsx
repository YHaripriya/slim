import { CloseOutlined } from '@ant-design/icons'
import type React from 'react'
import { useContext } from 'react'
import ViewerPanelsContext from '../../contexts/ViewerPanelsContext'
import {
  CloseIconWrp,
  LeftPanelContainer,
  LeftPanelContent,
  PanelSectionTitle,
} from '../styledElements/styleHelper'

export interface SlideViewerLeftPanelProps {
  /** Whether Slide Metadata panel is open */
  caseDetailsOpen: boolean
  /** Whether Overlay Masks panel is open */
  viewerLayersOpen: boolean
  /** Content to show when Slide Metadata is open (e.g. Patient, Study, Slides menu) */
  slideMetadataContent?: React.ReactNode
  /** Content to show when Overlay Masks is open (e.g. layers/specimens menu) */
  overlayContent?: React.ReactNode
  /** Panel width when open */
  width?: number
}

/**
 * Container to the right of the left icon nav. Shows Slide Metadata or Overlay Masks
 * content based on panel toggles. Styled with design system from styleHelper.
 */
const SlideViewerLeftPanel: React.FC<SlideViewerLeftPanelProps> = ({
  caseDetailsOpen,
  viewerLayersOpen,
  slideMetadataContent,
  overlayContent,
  width = 300,
}) => {
  const isOpen = caseDetailsOpen || viewerLayersOpen
  const { setViewerLayersOpen, setCaseDetailsOpen } =
    useContext(ViewerPanelsContext)

  if (!isOpen) {
    return <LeftPanelContainer $open={false} $width={width} />
  }

  return (
    <LeftPanelContainer $open $width={width}>
      <LeftPanelContent>
        {caseDetailsOpen && slideMetadataContent != null && (
          <>
            <PanelSectionTitle>
              Slide Metadata
              <CloseIconWrp onClick={() => setCaseDetailsOpen(false)}>
                <CloseOutlined />
              </CloseIconWrp>
            </PanelSectionTitle>
            {slideMetadataContent}
          </>
        )}
        {viewerLayersOpen && overlayContent != null && (
          <>
            <PanelSectionTitle>
              Overlay Masks{' '}
              <CloseIconWrp onClick={() => setViewerLayersOpen(false)}>
                <CloseOutlined />
              </CloseIconWrp>
            </PanelSectionTitle>
            {overlayContent}
          </>
        )}
      </LeftPanelContent>
    </LeftPanelContainer>
  )
}

export default SlideViewerLeftPanel
