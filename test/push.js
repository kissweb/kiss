
/**
 * Push unit tests - only push a single file at a time.
 */

var assert = require('assert')
var spdy = require('spdy')
var http = require('http')
var path = require('path')
var koa = require('koa')

var serve = require('..')

var port = 4401

var server = spdy.createServer({
  ssl: false,
  plain: true,
}).on('request', function (req, res) {
  fn(req, res)
}).listen(port)

var agent = spdy.createAgent({
  host: '127.0.0.1',
  port: port,
  spdy: {
    ssl: false,
    plain: true,
  }
})

agent.on('error', function (err) {
  console.error(err.stack)
  process.exit(1)
})

agent.on('push', function (stream) {
  console.log('pushed: %s', stream.url)
})

describe('HTML Import', function () {
  before(function () {
    createServer('html-import')
  })

  it('should push the dependency', function (done) {
    assertStream('/imported.html', /text\/html/, done)
    request('/', done)
  })

  it('should not crash when pushing a nonexistent file', function (done) {
    assertNoStream('404.html', done)
  })
})

describe('HTML stylesheet', function () {
  before(function () {
    createServer('html-stylesheet')
  })

  it('should push the dependency', function (done) {
    assertStream('/index.css', /text\/css/, done)
    request('/', done)
  })

  it('should not support media queries', function (done) {
    assertNoStream('/query.html', done)
  })
})

describe('HTML script', function () {
  before(function () {
    createServer('html-script')
  })

  it('should push the dependency', function (done) {
    assertStream('/index.js', /application\/javascript/, done)
    request('/', done)
  })
})

describe('HTML module', function () {
  before(function () {
    createServer('html-module')
  })

  it('should push the dependency', function (done) {
    assertStream('/index.js', /application\/javascript/, done)
    request('/', done)
  })
})

describe('JS module', function () {
  before(function () {
    createServer('js-module')
  })

  it('should push the dependency', function (done) {
    assertStream('/x.js', /application\/javascript/, done)
    request('/index.js', done)
  })
})

describe('CSS import', function () {
  before(function () {
    createServer('css-import')
  })

  it('should push the dependency', function (done) {
    assertStream('/x.css', /text\/css/, done)
    request('/index.css', done)
  })

  it('should not push imports with media', function (done) {
    assertNoStream('/media.css', done)
  })
})

function createServer(name) {
  var app = koa()
  app.use(serve().mount(fixture(name)))
  fn = app.callback()
}

function assertNoStream(path, done) {
  agent.on('push', onpush)

  request(path, done, function () {
    agent.removeListener('push', onpush)
    done()
  })

  function onpush() {
    throw new Error('boom')
  }
}

function assertStream(path, type, done) {
  agent.on('push', function onpush(stream) {
    agent.removeListener('push', onpush)
    assert.equal(stream.url, path)
    assert(type.test(stream.headers['content-type']))
    stream.resume()
    done()
  })
}

function request(path, done, then) {
  http.request({
    path: path,
    agent: agent
  }).on('response', function (response) {
    assert.equal(response.statusCode, 200)
    response.resume()
    response.on('error', done)
    if (typeof then === 'function') response.on('end', then)
  }).on('error', done).end()
}

function fixture(name, file) {
  return path.join(__dirname, 'fixtures-push', name, file || '')
}
