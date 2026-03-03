import { Layout } from 'antd'
import type React from 'react'

import {
  ViewerHeaderBar,
  ViewerHeaderCenter,
  ViewerHeaderLeft,
  ViewerHeaderRight,
} from '../styledElements/styleHelper'

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
  /** Left partition: navigator (ACTIVE SLIDE, worklist count, DICOM ID) */
  activeSlideNavigator?: React.ReactNode
  /** Right partition: e.g. coordinates; worklist/DICOM buttons are portaled here via setViewerHeaderRightContainer */
  rightHeaderContent?: React.ReactNode
  /** Called with the DOM element for the header right slot so the app header can portal worklist/DICOM buttons here */
  setViewerHeaderRightContainer?: (el: HTMLElement | null) => void
}

/**
 * Main content area component for the SlideViewer.
 * Viewport fills the full area; one header bar (three flex partitions) is overlaid at the top.
 */
const SlideViewerContent: React.FC<SlideViewerContentProps> = ({
  toolbar,
  cursor,
  volumeViewportRef,
  children,
  caseDetailsOpen = false,
  viewerLayersOpen = false,
  activeSlideNavigator,
  rightHeaderContent,
  setViewerHeaderRightContainer,
}) => {
  return (
    <Layout.Content
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        marginRight: 0,
      }}
    >
      {/* Viewport fills entire content area so slide viewer flows edge-to-edge from top */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          cursor,
        }}
        ref={volumeViewportRef}
        data-case-details-open={caseDetailsOpen}
        data-viewer-layers-open={viewerLayersOpen}
      />

      {/* Single header bar with three flex partitions: left | center | right */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        <ViewerHeaderBar style={{ pointerEvents: 'auto' }}>
          <ViewerHeaderLeft>{activeSlideNavigator ?? null}</ViewerHeaderLeft>
          <ViewerHeaderCenter>{toolbar}</ViewerHeaderCenter>
          <ViewerHeaderRight>
            {rightHeaderContent ?? null}
            {setViewerHeaderRightContainer != null ? (
              <div
                ref={setViewerHeaderRightContainer}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginLeft: 'auto',
                }}
              />
            ) : null}
          </ViewerHeaderRight>
        </ViewerHeaderBar>
      </div>

      {children}
    </Layout.Content>
  )
}

export default SlideViewerContent
