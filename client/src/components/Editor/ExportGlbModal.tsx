import Button from '../ui/Button'
import Field from '../ui/Field'
import Modal from '../ui/Modal'

// Ask for a file name, then download the scene as .glb.
export default function ExportGlbModal({
  open,
  name,
  onNameChange,
  onCancel,
  onExport,
}: {
  open: boolean
  name: string
  onNameChange: (name: string) => void
  onCancel: () => void
  onExport: () => void
}) {
  return (
    <Modal
      open={open}
      title="Export Scene as GLB"
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onExport}>
            Export
          </Button>
        </>
      }
    >
      <Field
        label="File name"
        placeholder="scene"
        hint=".glb is added for you."
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onExport()
        }}
      />
    </Modal>
  )
}
