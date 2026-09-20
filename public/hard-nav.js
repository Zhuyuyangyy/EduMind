(() => {
  'use strict'

  let navigating = false

  function findInternalLink(target) {
    if (!(target instanceof Element)) return null

    const link = target.closest('a[href]')
    if (!link) return null

    if (link.target === '_blank') return null
    if (link.hasAttribute('download')) return null

    const href = link.getAttribute('href')
    if (!href) return null

    if (
      href.startsWith('#') ||
      href.startsWith('javascript:') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:')
    ) {
      return null
    }

    let url

    try {
      url = new URL(link.href, window.location.href)
    } catch {
      return null
    }

    if (url.origin !== window.location.origin) return null

    const nextPath = url.pathname + url.search + url.hash
    const currentPath =
      window.location.pathname +
      window.location.search +
      window.location.hash

    if (nextPath === currentPath) return null

    return nextPath
  }

  function hardNavigate(event) {
    if (navigating) return

    if (
      typeof event.button === 'number' &&
      event.button !== 0
    ) {
      return
    }

    const nextPath = findInternalLink(event.target)
    if (!nextPath) return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    navigating = true

    document.documentElement.classList.add('hard-navigation-active')

    window.location.assign(nextPath)
  }

  /*
   * 使用 pointerdown，而不是等待 click。
   * 用户鼠标或触摸按下时立即执行完整页面跳转，
   * 不再等待 Vue Router 和首页模型任务。
   */
  document.addEventListener(
    'pointerdown',
    hardNavigate,
    {
      capture: true,
      passive: false,
    },
  )

  /*
   * 提高导航区域层级，防止 Three.js Canvas、
   * Live2D Canvas 或中枢 iframe 覆盖导航。
   */
  function protectNavigationLayer() {
    const selectors = [
      'header',
      'nav',
      'aside',
      '[role="navigation"]',
      '.sidebar',
      '.app-sidebar',
      '.app-header',
      '.navbar',
      '.navigation',
      '.menu',
    ]

    document
      .querySelectorAll(selectors.join(','))
      .forEach((element) => {
        if (!(element instanceof HTMLElement)) return

        const style = window.getComputedStyle(element)

        if (style.position === 'static') {
          element.style.position = 'relative'
        }

        element.style.zIndex = '2147483000'
        element.style.pointerEvents = 'auto'
        element.style.isolation = 'isolate'
      })
  }

  protectNavigationLayer()

  const observer = new MutationObserver(() => {
    protectNavigationLayer()
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
})()
