import { Layout } from 'antd'
import type React from 'react'

interface SlideViewerContentProps {
  toolbar: React.ReactNode
  toolbarHeight: string
  cursor: string
  volumeViewportRef: React.RefObject<HTMLDivElement>
  children: React.ReactNode
  /** When true, left panel (Case details / Slide metadata) is open; used to reposition ol-overviewmap */
  caseDetailsOpen?: boolean
  /** When true, right panel (Overlay masks / Layers) is open; used to reposition ol-overviewmap */
  viewerLayersOpen?: boolean
}

/**
 * Main content area component for the SlideViewer
 */
const SlideViewerContent: React.FC<SlideViewerContentProps> = ({
  toolbar,
  cursor,
  volumeViewportRef,
  children,
  caseDetailsOpen = false,
  viewerLayersOpen = false,
}) => {
  return (
    <Layout.Content style={{ height: '100%' }}>
      {toolbar}

      <div
        style={{
          // height: `calc(100% - ${toolbarHeight})`,
          height: '100%',
          overflow: 'hidden',
          cursor,
        }}
        ref={volumeViewportRef}
        data-case-details-open={caseDetailsOpen}
        data-viewer-layers-open={viewerLayersOpen}
      />

      {children}
    </Layout.Content>
  )
}

export default SlideViewerContent
