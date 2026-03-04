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
  /** Whether Worklist / Slide Gallery panel is open */
  worklistPanelOpen?: boolean
  /** Content to show when Slide Metadata is open (e.g. Patient, Study, Slides menu) */
  slideMetadataContent?: React.ReactNode
  /** Content to show when Overlay Masks is open (e.g. layers/specimens menu) */
  overlayContent?: React.ReactNode
  /** Content to show when Worklist panel is open (Slide Gallery) */
  worklistContent?: React.ReactNode
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
  worklistPanelOpen = false,
  slideMetadataContent,
  overlayContent,
  worklistContent,
  width = 300,
}) => {
  const isOpen = caseDetailsOpen || viewerLayersOpen || worklistPanelOpen
  const { setViewerLayersOpen, setCaseDetailsOpen, setWorklistPanelOpen } =
    useContext(ViewerPanelsContext)

  if (!isOpen) {
    return <LeftPanelContainer $open={false} $width={width} />
  }

  return (
    <LeftPanelContainer $open $width={width}>
      <LeftPanelContent>
        {worklistPanelOpen && worklistContent != null && (
          <>
            <PanelSectionTitle>
              Slide Gallery
              <CloseIconWrp onClick={() => setWorklistPanelOpen(false)}>
                <CloseOutlined />
              </CloseIconWrp>
            </PanelSectionTitle>
            {worklistContent}
          </>
        )}
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
              Overlay Masks
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
