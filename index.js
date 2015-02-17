'use strict'

/**
 * TODO:
 *
 *   - toggle hidden file support
 *   - CORS
 *   - middleware
 *
 */

const resolve = require('resolve-path')
const rawBody = require('raw-body')
const assert = require('assert')
const path = require('path')
const etag = require('etag')
const fs = require('mz/fs')
const ms = require('ms')

module.exports = Kiss

function Kiss(options) {
  if (!(this instanceof Kiss)) return new Kiss(options)

  this.options = options || Object.create(null)

  this._folders = []
}

/**
 * Pretend Kiss is a generator function so `app.use()` works.
 */

Kiss.prototype.constructor = Object.getPrototypeOf(function* () {}).constructor

/**
 * Support .call().
 */

Kiss.prototype.call = function* (context, next) {
  yield* next

  // push dependencies if the response is already handled
  yield* this.serveDependencies(context, next)

  // response is already handled
  let res = context.response
  if (res.body || res.status !== 404) return

  // serve the response
  let served = yield* this.serve(context, next)
  // push the dependencies
  if (served !== false) yield* this.serveDependencies(context, next)
}

/**
 * Push the current request's dependencies.
 */

Kiss.prototype.serveDependencies = function* (context) {
  let req = context.request
  let res = context.response
  let type = req.is('html', 'css', 'js')
  if (!type) return

  let body = res.body
  if (body == null) return // why would this happen?
  if (Buffer.isBuffer(body)) body = body.toString()
  if (body._readableState) body = yield rawBody(body, { encoding: 'utf8' })
  yield this.pushDependencies(req.path, type, body)
}

/**
 * Serve a file as the response to the request.
 * Note: assumes you're using your own compression middleware.
 */

Kiss.prototype.serve = function* (context) {
  let req = context.request
  let pathname = req.path
  let stats = yield* this.lookup(pathname)
  if (!stats) return false

  let res = context.response
  if (stats.mtime instanceof Date) res.lastModified = stats.mtime
  if (typeof stats.size === 'number') res.length = stats.size
  res.type = stats.type || path.extname(pathname)
  res.etag = yield this.etag(stats)

  let fresh = req.fresh
  switch (req.method) {
    case 'HEAD':
      res.status = fresh ? 304 : 200
      return
    case 'GET':
      if (fresh) return res.status = 304
      res.body = fs.createReadStream(stats.filename)
      return
    case 'OPTIONS':
      res.set('Allow', 'OPTIONS,HEAD,GET')
      res.status = 204
      return
    default:
      res.set('Allow', 'OPTIONS,HEAD,GET')
      res.status = 405
  }
}

/**
 * Mount a path as a static server.
 * Like Express's `.use()`, except `.use()` in this instance
 * will be reserved for plugins.
 */

Kiss.prototype.mount = function (prefix, folder) {
  if (typeof folder !== 'string') {
    // no prefix
    folder = prefix
    prefix = '/'
  }

  assert(prefix[0] === '/', 'Mounted paths must begin with a `/`.')
  if (!/\/$/.test(prefix)) prefix += '/'

  this._folders.push([prefix, path.resolve(folder)])
  return this
}

/**
 * Use plugins and middleware for this server.
 */

Kiss.prototype.use = function () {
  throw new Error('Not implemented.')
}

/**
 * Transform files.
 */

Kiss.prototype.transforms = function () {
  throw new Error('Not implemented.')
}

/**
 * Alias a path as another path.
 * Essentially a symlink.
 * Should support both files and folders.
 */

Kiss.prototype.alias = function () {
  throw new Error('Not implemented.')
}

/**
 * Define a custom, virtual path.
 * Ex. kiss.define('/polyfill.js', (context, next) -> [stats])
 */

Kiss.prototype.define = function () {
  throw new Error('Not implemented.')
}

/**
 * Lookup function.
 * TODO: lookup middleware
 */

Kiss.prototype.lookup = function* (pathname) {
  var stats = yield* this.lookupFilename(pathname)
  if (stats) return stats
}

/**
 * Lookup a web path such as `/file/index.js` based on all the support paths.
 * This is the default lookup function.
 */

Kiss.prototype.lookupFilename = function* (pathname) {
  if (/\/$/.test(pathname)) pathname += 'index.html'

  if (!this.options.hidden && pathname.split('/').filter(Boolean).some(hasLeadingDot)) return

  for (let pair of this._folders) {
    let prefix = pair[0]
    if (pathname.indexOf(prefix) !== 0) continue
    let folder = pair[1]
    let filename = resolve(folder, pathname.replace(prefix, ''))
    let stats = yield fs.lstat(filename).catch(ignoreENOENT)
    if (!stats) continue
    if (!stats.isFile()) continue
    stats.mount = pair
    stats.filename = filename
    stats.pathname = pathname
    return stats
  }
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
 */

Kiss.prototype.etag(function (stats) {
  return etag(stats, {
    weak: true
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
 * Set the default cache control.
 */

Kiss.prototype.cacheControl(31536000000)

/**
 * Ignore missing file errors on `.stat()`
 */

function ignoreENOENT(err) {
  if (err.code !== 'ENOENT') throw err
}

/**
 * Check if a filename has a leading dot file.
 */

function hasLeadingDot(x) {
  return /^\./.test(x)
}
