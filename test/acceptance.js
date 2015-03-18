
/**
 * Push multiple files at a time.
 */

var PassThrough = require('readable-stream/passthrough')
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

describe('this.body=', function () {
  it('should support custom bodies', function (done) {
    var app = koa()
    app.use(serve(fixture()))
    app.use(function* (next) {
      this.type = 'css'
      this.body = '@import "index.css";'
      this.etag = 'asdf'
    })
    fn = app.callback()

    var streams = []

    agent.on('push', function onpush(stream) {
      var length = streams.push(stream)
      assert(length <= 2)
      if (length === 1) return

      agent.removeListener('push', onpush)

      var urls = streams.map(function (stream) {
        return stream.url
      })

      assert(~urls.indexOf('/index.css'))
      assert(~urls.indexOf('/a.css'))
      done()
    })

    http.request({
      path: '/',
      agent: agent
    }).on('response', function (response) {
      assert.equal(response.statusCode, 200)
      assert(/text\/css/.test(response.headers['content-type']))
      response.resume()
      response.on('error', done)
    }).on('error', done).end()
  })

  it('it should not push when there is no body', function (done) {
    var app = koa()
    app.use(serve(fixture()))
    app.use(function* (next) {
      this.type = 'css'
      this.body = '@import "index.css";'
      this.etag = 'asdf'
      if (this.fresh) this.status = 304
    })
    fn = app.callback()

    var streams = []

    agent.on('push', throwError)

    http.request({
      path: '/',
      agent: agent,
      headers: {
        'if-none-match': '"asdf"'
      }
    }).on('response', function (response) {
      assert.equal(response.statusCode, 304)
      response.resume()
      response.on('error', done)
      response.on('end', function () {
        agent.removeListener('push', throwError)
        done()
      })
    }).on('error', done).end()

    function throwError() {
      throw new Error('boom')
    }
  })

  it('should support stream bodies', function (done) {
    var app = koa()
    app.use(serve(fixture()))
    app.use(function* (next) {
      this.type = 'css'
      var stream = this.body = new PassThrough()
      stream.end('@import "index.css";')
    })
    fn = app.callback()

    var streams = []

    agent.on('push', function onpush(stream) {
      var length = streams.push(stream)
      assert(length <= 2)
      if (length === 1) return

      agent.removeListener('push', onpush)

      var urls = streams.map(function (stream) {
        return stream.url
      })

      assert(~urls.indexOf('/index.css'))
      assert(~urls.indexOf('/a.css'))
      done()
    })

    http.request({
      path: '/',
      agent: agent
    }).on('response', function (response) {
      assert.equal(response.statusCode, 200)
      assert(/text\/css/.test(response.headers['content-type']))
      response.resume()
      response.on('error', done)
    }).on('error', done).end()
  })
})

agent.on('error', function (err) {
  console.error(err.stack)
  process.exit(1)
})

agent.on('push', function (stream) {
  console.log('pushed: %s', stream.url)
})

function fixture(file) {
  return path.join(__dirname, 'fixtures-acceptance', file || '')
}
