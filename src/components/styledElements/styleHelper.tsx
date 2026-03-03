import { Button, Col } from 'antd'
import styled from 'styled-components'

interface StyledButtonProps {
  selected?: boolean
}

export const StyledButton = styled(Button)<StyledButtonProps>`
  && {
    min-width: 4rem;
    height: 2rem;
    border-radius: 0.25rem;
    border: none;
    color: #000;
    background-color: transparent;
  }

  /* ${(props) =>
    props.selected
      ? `&&{
          background-color: #4E1DCC !important;
          color: #fff;
          border: 1px solid #4E1DCC;
  }`
      : `&&{
          background-color: #f0f0f0;
  }`} */
  ${(props) =>
    props.selected
      ? `&&{
             color: rgb(50, 120, 255) !important;
    background: rgb(28, 131, 175, 0.08) !important;
         
  }`
      : `&&{
          color: rgba(0, 0, 0, 0.54);
  }`}

  &:hover {
    box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  }
`

/** Left panel container: overlay on top of slide viewer (right of icon nav), shows Slide Metadata or Overlay Masks */
export const LeftPanelContainer = styled.div<{
  $open: boolean
  $width?: number
}>`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: ${(p) => (p.$open ? `${p.$width ?? 300}px` : '0')};
  height: 100%;
  overflow: hidden;
  background: #fafafa;
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.12);
  transition: width 0.2s ease;
  display: flex;
  flex-direction: column;
  z-index: 15;
  pointer-events: ${(p) => (p.$open ? 'auto' : 'none')};
`

/** Inner scrollable area for panel content */
export const LeftPanelContent = styled.div`
  flex: 1;
  overflow: auto;
  padding: 0;
  .ant-menu {
    border-inline-end: none !important;
  }
`

/** Section title in panel (e.g. "Slide Metadata", "Overlay Masks") */
export const PanelSectionTitle = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  padding: 12px 16px 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: #fff;
`

/** Toolbar bar: same design system (light grey, border, padding) */
export const ToolbarContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 12px;
  min-height: 50px;
  background: #fafafa;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  margin: 0 8px;
  z-index: 11;
`

/** Single header bar for slide viewer: three flex partitions (left | center | right) */
export const ViewerHeaderBar = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 12px;
  gap: 12px;
  background: transparent;
  border-radius: 8px;
 
`

/** Left partition of viewer header (ACTIVE SLIDE) */
export const ViewerHeaderLeft = styled.div`
  flex: 0 0 auto;
  min-width: 0;
`

/** Center partition of viewer header (toolbar) */
export const ViewerHeaderCenter = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  justify-content: center;
  align-items: center;
`

/** Right partition of viewer header (coordinates, actions) */
export const ViewerHeaderRight = styled.div`
  flex: 0 0 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
`

/** Left icon nav container (vertical bar with icons) */
export const LeftNavContainer = styled.div`
  width: 48px;
  min-width: 48px;
  height: 100%;
  background: rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 8px;
  flex-shrink: 0;
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  z-index: 15;
`

/** Icon button in left nav */
export const LeftNavButton = styled(Button)<{ $selected?: boolean }>`
  && {
    width: 48px;
    height: 48px;
    border-radius: 0;
    border: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(0, 0, 0, 0.65);
    transition: background-color 0.25s linear;
  }
  ${(p) =>
    p.$selected
      ? `
    && {
      background-color: rgb(50, 120, 255) !important;
      color: #fff !important;
    }
  `
      : `
    &&:hover {
      background-color: rgba(0, 0, 0, 0.04);
      color: rgba(0, 0, 0, 0.88);
    }
  `}
`

export const CloseIconWrp = styled.div`
&&{
  cursor: pointer;
  height :1rem;
  width:1rem;
  span{
    height: 100%;
    width: 100%;
    svg{
    height: 100%;
    width: 100%;
  }
  }
  

}
  
`

export const RightMenu = styled(Col)`
  &&{
    display: flex;
    flex-direction: row;
    position: unset;
    width: max-content;

  }

`
