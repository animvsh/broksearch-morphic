export function buildManagedPreviewSummary({
  command,
  files,
  previewUrl
}: {
  command: string
  files: Array<{ path: string }>
  previewUrl: string
}) {
  const fileList = files.map(file => file.path).join(', ')

  return [
    'Done. I updated the managed BrokCode preview.',
    '',
    `Built: ${command}`,
    fileList ? `Files: ${fileList}.` : null,
    `Preview: ${previewUrl}`,
    '',
    'You can keep editing this same cloud project from the chat.'
  ]
    .filter(Boolean)
    .join('\n')
}
