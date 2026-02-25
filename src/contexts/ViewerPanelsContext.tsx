import { Button, Space, Tooltip } from 'antd'
import type React from 'react'
import { createContext, useCallback, useContext, useState } from 'react'

export interface ViewerPanelsState {
  caseDetailsOpen: boolean
  viewerLayersOpen: boolean
}

export interface ViewerPanelsContextValue extends ViewerPanelsState {
  isProvided: boolean
  setCaseDetailsOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  setViewerLayersOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  toggleCaseDetails: () => void
  toggleViewerLayers: () => void
}

const defaultState: ViewerPanelsState = {
  caseDetailsOpen: true,
  viewerLayersOpen: true,
}

const defaultContextValue: ViewerPanelsContextValue = {
  ...defaultState,
  isProvided: false,
  setCaseDetailsOpen: () => {},
  setViewerLayersOpen: () => {},
  toggleCaseDetails: () => {},
  toggleViewerLayers: () => {},
}

const ViewerPanelsContext =
  createContext<ViewerPanelsContextValue>(defaultContextValue)

export function ViewerPanelsProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  const [caseDetailsOpen, setCaseDetailsOpen] = useState(false)
  const [viewerLayersOpen, setViewerLayersOpen] = useState(false)

  const toggleCaseDetails = useCallback(() => {
    setViewerLayersOpen(false)
    setCaseDetailsOpen((prev) => !prev)
  }, [])

  const toggleViewerLayers = useCallback(() => {
    setCaseDetailsOpen(false)
    setViewerLayersOpen((prev) => !prev)
  }, [])

  const value: ViewerPanelsContextValue = {
    caseDetailsOpen,
    viewerLayersOpen,
    isProvided: true,
    setCaseDetailsOpen,
    setViewerLayersOpen,
    toggleCaseDetails,
    toggleViewerLayers,
  }

  return (
    <ViewerPanelsContext.Provider value={value}>
      {children}
    </ViewerPanelsContext.Provider>
  )
}

export function useViewerPanels(): ViewerPanelsContextValue {
  return useContext(ViewerPanelsContext)
}

/**
 * Toggle buttons for Case details and Layers panels. Renders nothing when
 * used outside ViewerPanelsProvider (e.g. on worklist).
 */
export function ViewerPanelToggles(): React.ReactElement | null {
  const panels = useViewerPanels()
  if (!panels.isProvided) {
    return null
  }
  return (
    <Space size="small">
      <Tooltip
        title={
          panels.caseDetailsOpen ? 'Hide Case details' : 'Show Case details'
        }
      >
        <Button
          type={panels.caseDetailsOpen ? 'primary' : 'default'}
          onClick={panels.toggleCaseDetails}
          style={{
            minWidth: '4rem',
            height: '2rem',
            borderRadius: '0.25rem',
            ...(panels.caseDetailsOpen
              ? {}
              : {
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                  borderColor: 'rgba(0,0,0,0.15)',
                  color: 'rgba(0,0,0,0.88)',
                }),
          }}
        >
          Slide Metadata
        </Button>
      </Tooltip>
      <Tooltip title={panels.viewerLayersOpen ? 'Hide Layers' : 'Show Layers'}>
        <Button
          type={panels.viewerLayersOpen ? 'primary' : 'default'}
          onClick={panels.toggleViewerLayers}
          style={{
            minWidth: '4rem',
            height: '2rem',
            borderRadius: '0.25rem',
            ...(panels.viewerLayersOpen
              ? {}
              : {
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                  borderColor: 'rgba(0,0,0,0.15)',
                  color: 'rgba(0,0,0,0.88)',
                }),
          }}
        >
          Overlay Masks
        </Button>
      </Tooltip>
    </Space>
  )
}

export default ViewerPanelsContext
