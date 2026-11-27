(function () {
  var root = document.documentElement
  var query = window.matchMedia('(prefers-color-scheme: dark)')

  function resolve() {
    var stored
    try {
      stored = window.localStorage.getItem('pulse:theme')
    } catch (error) {
      stored = null
    }
    if (stored === 'light' || stored === 'dark') return stored
    return query.matches ? 'dark' : 'light'
  }

  function apply() {
    root.dataset.theme = resolve()
  }

  apply()
  try {
    query.addEventListener('change', apply)
  } catch (error) {
    // Older engines only expose addListener; the renderer re-applies the theme anyway.
  }
})()
