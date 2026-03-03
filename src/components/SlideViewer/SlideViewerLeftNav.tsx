import {
  AppstoreOutlined,
  FileTextOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { Tooltip } from 'antd'

import { useViewerPanels } from '../../contexts/ViewerPanelsContext'
import { LeftNavButton, LeftNavContainer } from '../styledElements/styleHelper'

/**
 * Vertical left nav for the slide viewer: Slide Metadata, Overlay Masks, QC.
 * Styled with design system from styleHelper; uses ViewerPanelsContext toggles.
 */
const SlideViewerLeftNav: React.FC = () => {
  const panels = useViewerPanels()
  if (!panels.isProvided) return null

  return (
    <LeftNavContainer>
      <Tooltip
        title={
          panels.caseDetailsOpen ? 'Hide Slide Metadata' : 'Show Slide Metadata'
        }
        placement="right"
      >
        <LeftNavButton
          type="text"
          $selected={panels.caseDetailsOpen}
          icon={<FileTextOutlined style={{ fontSize: 18 }} />}
          onClick={panels.toggleCaseDetails}
        />
      </Tooltip>
      <Tooltip
        title={
          panels.viewerLayersOpen ? 'Hide Overlay Masks' : 'Show Overlay Masks'
        }
        placement="right"
      >
        <LeftNavButton
          type="text"
          $selected={panels.viewerLayersOpen}
          icon={<AppstoreOutlined style={{ fontSize: 18 }} />}
          onClick={panels.toggleViewerLayers}
        />
      </Tooltip>
      <Tooltip title="QC" placement="right">
        <LeftNavButton
          type="text"
          icon={<ToolOutlined style={{ fontSize: 18 }} />}
        />
      </Tooltip>
    </LeftNavContainer>
  )
}

export default SlideViewerLeftNav
