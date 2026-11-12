import { TOOLS, type Tool } from '../../pages/editor2d/types'

// The 2D editor's tools, down the left side.
export default function ToolPalette({
  activeTool,
  onSelect,
}: {
  activeTool: Tool
  onSelect: (tool: Tool) => void
}) {
  return (
    <div className="editor-sidebar left-sidebar" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map(({ tool, label, Icon, title }) => (
        <button
          key={tool}
          className={`tool-btn ${activeTool === tool ? 'active' : ''}`}
          onClick={() => onSelect(tool)}
          title={title}
          aria-pressed={activeTool === tool}
        >
          <Icon size={16} aria-hidden="true" /> {label}
        </button>
      ))}
    </div>
  )
}
