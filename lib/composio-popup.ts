type ComposioPopupOptions = {
  width?: number
  height?: number
}

export function openComposioPopup(
  url: string,
  name: string,
  options: ComposioPopupOptions = {}
) {
  const width = options.width ?? 560
  const height = options.height ?? 760
  const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0
  const dualScreenTop = window.screenTop ?? window.screenY ?? 0
  const viewportWidth =
    window.innerWidth ?? document.documentElement.clientWidth ?? screen.width
  const viewportHeight =
    window.innerHeight ?? document.documentElement.clientHeight ?? screen.height
  const left = Math.max(0, dualScreenLeft + (viewportWidth - width) / 2)
  const top = Math.max(0, dualScreenTop + (viewportHeight - height) / 2)

  return window.open(
    url,
    name,
    [
      'popup=yes',
      `width=${width}`,
      `height=${height}`,
      `left=${Math.round(left)}`,
      `top=${Math.round(top)}`,
      'resizable=yes',
      'scrollbars=yes'
    ].join(',')
  )
}
