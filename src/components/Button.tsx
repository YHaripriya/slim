import { Button as Btn, Divider, Tooltip } from 'antd'
import React from 'react'
import type { IconType } from 'react-icons'
import { StyledButton } from './styledElements/styleHelper'

interface ButtonProps {
  icon:
    | IconType
    | React.ComponentType<Record<string, never>>
    | React.ForwardRefExoticComponent<object>
  tooltip?: string
  label?: string
  onClick?: (options: React.SyntheticEvent) => void
  isSelected?: boolean
  /** Use design-system toolbar style (StyledButton) when set */
  variant?: 'toolbar'
}

/**
 * React component for a button.
 */
class Button extends React.Component<ButtonProps, Record<string, never>> {
  constructor(props: ButtonProps) {
    super(props)
    this.handleClick = this.handleClick.bind(this)
  }

  handleClick(event: React.SyntheticEvent): void {
    if (this.props.onClick !== undefined) {
      this.props.onClick(event)
    }
  }

  render(): React.ReactNode {
    const Icon = this.props.icon
    if (Icon === undefined) {
      return null
    }

    let text: React.ReactNode
    if (this.props.label != null) {
      text = (
        <>
          <Divider type="vertical" />
          {this.props.label}
        </>
      )
    }

    const useToolbarStyle = this.props.variant === 'toolbar'

    let button: React.ReactNode
    if (useToolbarStyle) {
      button = (
        <StyledButton
          onClick={this.handleClick}
          icon={<Icon />}
          selected={this.props.isSelected ?? false}
        >
          {text}
        </StyledButton>
      )
    } else if (this.props.isSelected ?? false) {
      button = (
        <Btn
          onClick={this.handleClick}
          icon={<Icon />}
          type="primary"
          style={{ lineHeight: '1.0' }}
        >
          {text}
        </Btn>
      )
    } else {
      button = (
        <Btn
          onClick={this.handleClick}
          icon={<Icon />}
          type="default"
          style={{ lineHeight: '1.0' }}
        >
          {text}
        </Btn>
      )
    }

    if (this.props.tooltip !== undefined) {
      return <Tooltip title={this.props.tooltip}>{button}</Tooltip>
    } else {
      return button
    }
  }
}

export default Button
