import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const loaderSource = await readFile(path.join(root, 'dist', 'loader.js'), 'utf8')
const fixedNow = Date.UTC(2026, 3, 28, 15, 0, 0)
const cacheBucket = String(Math.floor(fixedNow / 3600000))

function makeScript(attrs = {}) {
  return {
    async: Boolean(attrs.async),
    defer: Boolean(attrs.defer),
    type: attrs.type || '',
    nonce: attrs.nonce || '',
    getAttribute(name) {
      return attrs[name] ?? ''
    },
  }
}

function runLoader({ attrs = {}, readyState = 'loading', appendLoads = false } = {}) {
  const writes = []
  const appended = []
  const warnings = []
  const currentScript = makeScript(attrs)
  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [fixedNow]))
    }
  }
  const context = {
    Date: FixedDate,
    window: {
      console: {
        warn(message) {
          warnings.push(message)
        },
      },
      setTimeout(callback) {
        callback()
      },
    },
    document: null,
    console: {
      warn(message) {
        warnings.push(message)
      },
    },
  }

  const document = {
    currentScript,
    readyState,
    write(html) {
      writes.push(html)
    },
    createElement(tagName) {
      assert.equal(tagName, 'script')
      return {
        attrs: {},
        setAttribute(name, value) {
          this.attrs[name] = value
        },
      }
    },
    head: {
      appendChild(script) {
        appended.push(script)
        if (appendLoads) {
          context.window.OCWI = function OCWI() {
            return {
              updateConfig(value) {
                this.updated = value
              },
              getState() {
                return { ok: true }
              },
            }
          }
          script.onload()
        }
      },
    },
    getElementsByTagName() {
      return [currentScript]
    },
  }

  context.document = document
  context.window.document = document

  vm.runInNewContext(loaderSource, context)
  return { context, writes, appended, warnings }
}

{
  const { context, writes, appended } = runLoader()
  assert.equal(appended.length, 0)
  assert.equal(writes.length, 1)
  assert.match(
    writes[0],
    /src="https:\/\/cdn\.jsdelivr\.net\/npm\/ocwi-core@latest\/dist\/ocwi\.min\.js\?ocwi-loader-cache=\d+"/,
  )
  assert.equal(context.window.OCWI_LOADER.coreVersion, 'latest')
  assert.equal(
    context.window.OCWI_LOADER.coreUrl,
    `https://cdn.jsdelivr.net/npm/ocwi-core@latest/dist/ocwi.min.js?ocwi-loader-cache=${cacheBucket}`,
  )
  assert.equal(context.window.OCWI_LOADER.mode, 'document.write')
}

{
  const { writes } = runLoader({
    attrs: {
      'data-ocwi-version': '2.0.0-beta.1',
    },
  })
  assert.match(writes[0], /ocwi-core@2\.0\.0-beta\.1\/dist\/ocwi\.min\.js/)
  assert.doesNotMatch(writes[0], /ocwi-loader-cache=/)
}

{
  const { writes, context } = runLoader({
    attrs: {
      'data-ocwi-version': 'latest',
    },
  })
  assert.match(
    writes[0],
    new RegExp(`ocwi-core@latest\\/dist\\/ocwi\\.min\\.js\\?ocwi-loader-cache=${cacheBucket}`),
  )
  assert.equal(context.window.OCWI_LOADER.coreVersion, 'latest')
}

{
  const { writes, context, warnings } = runLoader({
    attrs: {
      'data-ocwi-version': 'bad/version',
    },
  })
  assert.match(
    writes[0],
    new RegExp(`ocwi-core@latest\\/dist\\/ocwi\\.min\\.js\\?ocwi-loader-cache=${cacheBucket}`),
  )
  assert.equal(context.window.OCWI_LOADER.coreVersion, 'latest')
  assert.ok(warnings.some((message) => message.includes('Ignoring invalid OCWI core version')))
}

{
  const { writes, context } = runLoader({
    attrs: {
      'data-ocwi-src': 'https://static.example.com/ocwi/custom.js',
    },
  })
  assert.match(writes[0], /src="https:\/\/static\.example\.com\/ocwi\/custom\.js"/)
  assert.equal(context.window.OCWI_LOADER.coreUrl, 'https://static.example.com/ocwi/custom.js')
  assert.doesNotMatch(writes[0], /ocwi-loader-cache=/)
}

{
  const { writes, appended } = runLoader({
    attrs: {
      nonce: 'nonce-123',
    },
  })
  assert.match(writes[0], /nonce="nonce-123"/)

  const dynamic = runLoader({
    readyState: 'complete',
    attrs: {
      nonce: 'nonce-456',
    },
  })
  assert.equal(dynamic.appended[0].attrs.nonce, 'nonce-456')
}

{
  const { context, writes, appended, warnings } = runLoader({
    attrs: { async: true },
    appendLoads: true,
  })
  assert.equal(writes.length, 0)
  assert.equal(appended.length, 1)
  assert.equal(context.window.OCWI_LOADER.mode, 'dynamic')
  assert.equal(context.window.OCWI_LOADER.loaded, true)
  assert.ok(warnings.some((message) => message.includes('not executed as a parser-blocking')))
}

{
  const { context, appended } = runLoader({
    readyState: 'complete',
  })
  assert.equal(appended.length, 1)
  assert.equal(typeof context.window.OCWI, 'function')
  const handle = context.window.OCWI('#chat', { api: { lumaUrl: 'https://luma.example/config' } })
  assert.equal(handle.getState(), null)
}

{
  const { context, appended } = runLoader({
    readyState: 'complete',
  })
  const calls = []
  const handle = context.window.OCWI('#chat')
  handle.updateConfig({ ui: { name: 'Queued' } })

  context.window.OCWI = function OCWI() {
    calls.push(Array.from(arguments))
    return {
      updates: [],
      updateConfig(value) {
        this.updates.push(value)
      },
      getState() {
        return { updates: this.updates.length }
      },
    }
  }

  appended[0].onload()

  const real = await handle.ready
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], ['#chat'])
  assert.deepEqual(real.updates, [{ ui: { name: 'Queued' } }])
  assert.deepEqual(handle.getState(), { updates: 1 })
}

// Core bundle network failure (404 / 5xx): the browser fires the injected
// script's onerror, which must reject deferred handles, record a diagnostic on
// window.OCWI_LOADER, clear the loading lock, and warn. See src/loader.js:119-125.
{
  const { context, appended, warnings } = runLoader({
    readyState: 'complete',
  })
  assert.equal(appended.length, 1)

  const handle = context.window.OCWI('#chat')
  let rejection = null
  handle.ready.catch((error) => {
    rejection = error
  })

  appended[0].onerror()
  await Promise.resolve()

  assert.match(context.window.OCWI_LOADER.error, /Failed to load OCWI core bundle/)
  assert.match(context.window.OCWI_LOADER.error, /ocwi\.min\.js/)
  assert.equal(context.window.OCWI_LOADER.loaded, false)
  assert.equal(context.window.__OCWI_LOADER_LOADING__, false)
  assert.ok(rejection, 'deferred handle.ready should reject on core load failure')
  assert.match(rejection.message, /Failed to load OCWI core bundle/)
  assert.ok(warnings.some((message) => message.includes('Failed to load OCWI core bundle')))
}

// CSP-blocked core load: a Content-Security-Policy that rejects the injected
// script presents to the loader identically to a network failure (the script
// element fires onerror without executing). The graceful failure + diagnostic
// surface through window.OCWI_LOADER exactly as the 404/5xx case does.
{
  const { context, appended, warnings } = runLoader({
    readyState: 'complete',
  })
  assert.equal(appended.length, 1)

  appended[0].onerror()

  assert.match(context.window.OCWI_LOADER.error, /Failed to load OCWI core bundle/)
  assert.equal(context.window.OCWI_LOADER.loaded, false)
  assert.equal(context.window.__OCWI_LOADER_LOADING__, false)
  assert.ok(warnings.some((message) => message.includes('Failed to load OCWI core bundle')))

  const handle = context.window.OCWI('#chat')
  let rejection = null
  handle.ready.catch((error) => {
    rejection = error
  })
  await Promise.resolve()
  assert.equal(rejection, null)
  assert.equal(handle.getState(), null)
}

console.log('loader tests passed')
