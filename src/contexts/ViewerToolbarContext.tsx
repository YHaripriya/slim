import type React from 'react'
import { createContext, useCallback, useContext, useState } from 'react'

export interface ViewerToolbarContextValue {
  toolbar: React.ReactNode
  setToolbar: (node: React.ReactNode) => void
  rightContent: React.ReactNode
  setRightContent: (node: React.ReactNode) => void
  /** DOM element for the viewer header right slot; Header portals worklist/DICOM buttons here so they appear in the common header. */
  viewerHeaderRightContainer: HTMLElement | null
  setViewerHeaderRightContainer: (el: HTMLElement | null) => void
}

const defaultContextValue: ViewerToolbarContextValue = {
  toolbar: null,
  setToolbar: () => {},
  rightContent: null,
  setRightContent: () => {},
  viewerHeaderRightContainer: null,
  setViewerHeaderRightContainer: () => {},
}

const ViewerToolbarContext =
  createContext<ViewerToolbarContextValue>(defaultContextValue)

export function ViewerToolbarProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  const [toolbar, setToolbarState] = useState<React.ReactNode>(null)
  const [rightContent, setRightContentState] = useState<React.ReactNode>(null)
  const [viewerHeaderRightContainer, setViewerHeaderRightContainerState] =
    useState<HTMLElement | null>(null)
  const setToolbar = useCallback((node: React.ReactNode) => {
    setToolbarState(node)
  }, [])
  const setRightContent = useCallback((node: React.ReactNode) => {
    setRightContentState(node)
  }, [])
  const setViewerHeaderRightContainer = useCallback(
    (el: HTMLElement | null) => {
      setViewerHeaderRightContainerState(el)
    },
    [],
  )

  const value: ViewerToolbarContextValue = {
    toolbar,
    setToolbar,
    rightContent,
    setRightContent,
    viewerHeaderRightContainer,
    setViewerHeaderRightContainer,
  }

  return (
    <ViewerToolbarContext.Provider value={value}>
      {children}
    </ViewerToolbarContext.Provider>
  )
}

export function useViewerToolbar(): ViewerToolbarContextValue {
  return useContext(ViewerToolbarContext)
}

export default ViewerToolbarContext
