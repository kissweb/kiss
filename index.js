'use strict'

const resolve = require('resolve-path')
const rawBody = require('raw-body')
const parse = require('deps-parse')
const mime = require('mime-types')
const spdy = require('spdy-push')
const assert = require('assert')
const path = require('path')
const etag = require('etag')
const fs = require('mz/fs')
const url = require('url')
const ms = require('ms')

module.exports = Kiss

/**
 *   let fn = Kiss(options)
 *   app.use(fn)
 *
 * Not a typical middleware function :D
 */

function Kiss(options, _options) {
  if (typeof options === 'string') {
    let root = options
    options = _options || Object.create(null)
    options.root = root
  }
  if (!(this instanceof Kiss)) return new Kiss(options)

  this._folders = []

  options = this.options = Object.create(options || null)
  if (options.cacheControl !== undefined) this.cacheControl(options.cacheControl)
  if (typeof options.etag === 'function') this.etag(options.etag)
  if (options.hidden !== undefined) this.hidden(options.hidden)
  if (typeof options.root === 'string') this.mount(options.root)
}

/**
 * Pretend Kiss is a generator function so `app.use()` works.
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/GeneratorFunction
 * Can be removed when ES7 async functions are merged in.
 */

/* istanbul ignore next */
Kiss.prototype.constructor = Object.getPrototypeOf(function* () {}).constructor

/**
 * Support .call() for middleware dispatchers.
 */

Kiss.prototype.call = function* (context, next) {
  yield* next

  let res = context.response

  // push dependencies if the response is already handled
  if (res.body != null) yield* this.serveDependencies(context, next)

  // return if response is already handled
  if (res.body || res.status !== 404) return

  // try to serve the response
  let served = yield* this.serve(context, next)
  // push the dependencies if the response was served
  if (served) yield* this.serveDependencies(context, next)
}

/**
 * Serve a file as the response to the request.
 * Note: assumes you're using your own compression middleware,
 * so be sure to `app.use(require('koa-compress')())`!
 * TODO: maybe handle compression here
 *
 * @returns {Boolean} Pushable - whether to attempt to push dependencies
 */

Kiss.prototype.serve = function* (context) {
  let req = context.request
  let pathname = req.path
  let stats = yield* this.lookup(context, '/', pathname)
  if (!stats) return

  let res = context.response
  switch (req.method) {
    case 'HEAD':
    case 'GET':
      break
    case 'OPTIONS':
      res.set('Allow', 'OPTIONS,HEAD,GET')
      res.status = 204
      return
    default:
      res.set('Allow', 'OPTIONS,HEAD,GET')
      res.status = 405
      return
  }

  res.status = 200
  if (stats.mtime instanceof Date) res.lastModified = stats.mtime
  if (typeof stats.size === 'number') res.length = stats.size
  res.type = stats.type || path.extname(stats.pathname)
  res.etag = yield this._etag(stats)
  res.set('Cache-Control', this._cacheControl)

  // do we push dependencies on 304s?
  let fresh = req.fresh
  if (fresh) return res.status = 304

  if (req.method === 'HEAD') return

  assert('body' in stats || 'filename' in stats)
  res.body = 'body' in stats
    ? stats.body
    : fs.createReadStream(stats.filename)
  return true
}

/**
 * Push the current request's dependencies.
 * Note that if the response is currently streamed,
 * which is default for files,
 * the entire stream will be buffered in memory
 */

Kiss.prototype.serveDependencies = function* (context) {
  // http2 push is not supported
  if (!context.req.isSpdy) return

  // not a supported dependency type
  let req = context.request
  let res = context.response
  let type = res.is('html', 'css', 'js')
  if (!type) return

  // buffer the response
  let body = res.body = yield* bodyToString(res.body)
  yield* this.pushDependencies(context, req.path, type, body)
}

/**
 * Push dependencies.
 */

Kiss.prototype.pushDependencies = function* (context, pathname, type, body) {
  assert(typeof pathname === 'string')
  assert(typeof body === 'string')

  // js
  if (type === 'js') {
    let deps = yield parse.js(body).catch(onerror)
    if (!deps || !deps.length) return
    yield deps.map(function* (name) {
      let stats = yield* this.lookup(context, pathname, name)
      if (stats) yield* this.spdyPush(context, stats)
    }, this)
    return
  }

  // css
  if (type === 'css') {
    let deps = yield parse.css(body).catch(onerror)
    // note: we do not push urls() because they are conditional
    if (!deps || !deps.imports) return
    yield deps.imports.map(function* (dep) {
      // don't push dependencies with media queries as they are conditional
      if (dep.media) return
      let stats = yield* this.lookup(context, pathname, dep.path)
      if (stats) yield* this.spdyPush(context, stats)
    }, this)
    return
  }

  // html
  assert(type === 'html')
  let deps = yield parse.html(body).catch(onerror)
  if (!deps || !deps.length) return
  yield deps.map(function* (node) {
    let stats
    switch (node.type) {
      // TODO: parse inline module dependencies
      case 'module':
      case 'script':
        if (node.inline) return
        stats = yield* this.lookup(context, pathname, node.path)
        break
      // TODO: parse inline style imports
      case 'style': return
      case 'stylesheet':
        // don't push style sheets with media queries as they are conditional
        if (node.attrs.media) return
        stats = yield* this.lookup(context, pathname, node.path)
        break
      case 'import':
        stats = yield* this.lookup(context, pathname, node.path)
        break
    }
    if (stats) yield* this.spdyPush(context, stats)
  }, this)
}

/**
 * Push a dependency using SPDY.
 */

Kiss.prototype.spdyPush = function* (context, stats) {
  if (!context.res.isSpdy) return

  let options = {
    path: stats.pathname,
    priority: this.priority(stats),
    headers: {
      'cache-control': this._cacheControl,
      'etag': yield this._etag(stats),
    },
  }

  if (stats.mtime instanceof Date)
    options.headers['last-modified'] = stats.mtime.toUTCString()
  if (stats.type)
    options.headers['content-type'] = stats.type

  let etag = yield this._etag(stats)
  if (etag)
  if (!/^(W\/)?"/.test(etag))
    options.headers.etag = '"' + etag + '"'

  if ('body' in stats) {
    options.body = stats.body
  } else if (stats.filename) {
    options.filename = stats.filename
  }

  assert('body' in options || 'filename' in options)

  let promises = [
    spdy(context.res).push(options),
  ]

  // push this file's dependencies
  switch (stats.ext) {
    case 'html':
    case 'css':
    case 'js':
      // buffer the file in memory if necessary
      if (options.filename) {
        options.body = yield fs.readFile(options.filename, 'utf8')
        delete options.filename
      }
      options.body = yield* bodyToString(options.body)
      promises.push(this.pushDependencies(context, stats.pathname, stats.ext, options.body))
      break
  }

  // push this file and its dependencies in parallel
  yield promises
}

/**
 * Lookup function.
 */

Kiss.prototype.lookup = function* (context, basepath, pathname) {
  // if all middleware fails, use local file lookups
  // it does not support absolute URLs, obviously
  if (~pathname.indexOf('://') || !pathname.indexOf('//')) return
  return yield* this.lookupFilename(url.resolve(basepath, pathname))
}

/**
 * Lookup a web path such as `/file/index.js` based on all the support paths.
 * This is the default lookup function.
 */

Kiss.prototype.lookupFilename = function* (pathname) {
  // if options.hidden, leading dots anywhere in the path can not be handled
  if (!this.options.hidden && pathname.split('/').filter(Boolean).some(hasLeadingDot)) return

  for (let pair of this._folders) {
    let prefix = pair[0]
    if (pathname.indexOf(prefix) !== 0) continue
    let folder = pair[1]
    let suffix = pathname.replace(prefix, '')
    if (suffix[0] === '/') continue
    if (!suffix || /\/$/.test(suffix)) suffix += 'index.html'
    let filename = resolve(folder, suffix)
    // TODO: make sure symlinked folders work
    let stats = yield fs.stat(filename).catch(ignoreENOENT)
    if (!stats) continue
    // TODO: handle directories?
    if (!stats.isFile()) continue
    stats.ext = mime.extension(mime.lookup(path.extname(filename)))
    stats.type = mime.contentType(path.extname(filename))
    stats.filename = filename
    stats.pathname = pathname
    return stats
  }
}

/**
 * Mount a path as a static server.
 * Like Express's `.use()`, except `.use()` in this instance
 * will be reserved for middleware.
 */

Kiss.prototype.mount = function (prefix, folder) {
  if (typeof folder !== 'string') {
    // no prefix
    folder = prefix
    prefix = '/'
  }

  assert(prefix[0] === '/', 'Mounted paths must begin with a `/`.')
  if (!/\/$/.test(prefix)) prefix += '/'

  this._folders.push([
    prefix,
    path.resolve(folder),
  ])
  return this
}

/**
 * Use middleware for this server.
 */

/* istanbul ignore next */
Kiss.prototype.use = function () {
  throw new Error('Not implemented.')
}

/**
 * Transform files.
 */

/* istanbul ignore next */
Kiss.prototype.transform = function () {
  throw new Error('Not implemented.')
}

/**
 * Alias a path as another path.
 * Essentially a symlink.
 * Should support both files and folders.
 */

/* istanbul ignore next */
Kiss.prototype.alias = function () {
  throw new Error('Not implemented.')
}

/**
 * Define a custom, virtual path.
 * Ex. kiss.define('/polyfill.js', (context, next) -> [stats])
 */

/* istanbul ignore next */
Kiss.prototype.define = function () {
  throw new Error('Not implemented.')
}

/**
 * Set the etag function with caching.
 * Assumes the etag function is always async.
 */

Kiss.prototype.etag = function (fn) {
  assert(typeof fn === 'function')
  this._etag = function (stats) {
    return Promise.resolve(stats.etag || (stats.etag = fn(stats)))
  }
  return this
}

/**
 * Set the default etag function.
 * Requires `stat.mtime` and `stat.size`.
 */

Kiss.prototype.etag(function (stats) {
  return etag(stats, {
    weak: true,
  })
})

/**
 * Set the cache control.
 * TODO: support actual cache control headers
 */

Kiss.prototype.cacheControl = function (age) {
  // human readable string to ms
  if (typeof age === 'string') age = ms(age)
  // ms to seconds
  age = Math.round(age / 1000)
  this._cacheControl = 'public, max-age=' + age
  return this
}

/**
 * Set the default cache control, which is about a year.
 */

Kiss.prototype.cacheControl(31536000000)

/**
 * Enable or disable hidden file support.
 */

Kiss.prototype.hidden = function (val) {
  this.options.hidden = !!val
  return this
}

/**
 * Get the priority of a file depending on the type of file.
 */

Kiss.prototype.priority = function (stats) {
  // remove the charset or anything
  switch (stats.ext) {
    case 'html': return 3
    case 'css': return 4
    case 'js': return 5
  }
  return 7
}

/**
 * Ignore missing file errors on `.stat()`
 */

/* istanbul ignore next */
function ignoreENOENT(err) {
  if (err.code !== 'ENOENT') throw err
}

/**
 * Check if a string has a leading dot,
 * specifically for ignoring parts of a path.
 */

function hasLeadingDot(x) {
  return /^\./.test(x)
}

/**
 * Convert a body to a string.
 */

function* bodyToString(body) {
  if (typeof body === 'string') return body
  if (Buffer.isBuffer(body)) return body.toString()
  if (body._readableState) return yield rawBody(body, { encoding: 'utf8', })
  /* istanbul ignore next */
  throw new Error('Could not convert body to string.')
}

function onerror(err) {
  console.error(err.stack)
}
