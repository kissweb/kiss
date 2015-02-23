
/**
 * Push multiple files at a time.
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

describe('this.body=', function () {
  it('should support custom bodies', function (done) {
    var app = koa()
    app.use(serve(fixture()))
    app.use(function* (next) {
      this.type = 'css'
      this.body = '@import "index.css";'
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
