'use strict'

var request = require('supertest')
var assert = require('assert')
var path = require('path')
var koa = require('koa')

var Serve = require('..')

var app = koa()

app.use(Serve().mount(path.join(__dirname, 'fixtures')))
app.use(function* (next) {
  if (this.path === '/test') return this.status = 204
  yield* next
})

app.on('error', function () {})

var server = app.callback()

describe('Serve', function () {
  var headers

  describe('GET', function () {
    it('should serve html', function (done) {
      request(server)
      .get('/')
      .expect('Content-Type', /text\/html/)
      .expect('Cache-Control', /max-age=31536000/)
      .expect(200, function (err, res) {
        assert.ifError(err)
        headers = res.headers
        assert(headers.etag)
        assert(headers['last-modified'])
        done()
      })
    })

    it('should support if-none-match', function (done) {
      request(server)
      .get('/')
      .set('if-none-match', headers.etag)
      .expect(304, done)
    })

    it('should support if-modified-since', function (done) {
      request(server)
      .get('/')
      .set('if-modified-since', headers['last-modified'])
      .expect(304, done)
    })
  })

  describe('HEAD', function () {
    it('should serve', function (done) {
      request(server)
      .head('/')
      .expect(200, done)
    })

    it('should support if-none-match', function (done) {
      request(server)
      .head('/')
      .set('if-none-match', headers.etag)
      .expect(304, done)
    })

    it('should support if-modified-since', function (done) {
      request(server)
      .head('/')
      .set('if-modified-since', headers['last-modified'])
      .expect(304, done)
    })
  })

  describe('OPTIONS', function () {
    it('should set Allow', function (done) {
      request(server)
      .options('/')
      .expect('allow', /\bHEAD\b/)
      .expect('allow', /\bGET\b/)
      .expect('allow', /\bOPTIONS\b/)
      .expect(204, done);
    })
  })

  describe('POST', function () {
    it('should 405 w/ Allow', function (done) {
      request(server)
      .post('/')
      .expect('allow', /\bHEAD\b/)
      .expect('allow', /\bGET\b/)
      .expect('allow', /\bOPTIONS\b/)
      .expect(405, done);
    })
  })
})

describe('404s', function () {
  it('when file does not exist', function (done) {
    request(server)
    .get('/klajsdflkajsdlfkjasldkfj.lakjsdf')
    .expect(404, done)
  })

  it('when a folder', function (done) {
    request(server)
    .get('/a')
    .expect(404, done);
  })
})

describe('Defer', function () {
  it('should interfere with downstream middleware', function (done) {
    request(server)
    .get('/test')
    .expect(204, done);
  })
})

describe('malicious paths', function () {
  it('..', function (done) {
    request(server)
    .get('/../klajsdfkljasdf')
    .expect(404, done)
  })

  it('/./', function (done) {
    request(server)
    .get('/./index.js')
    .expect(404, done)
  })

  it('//', function (done) {
    request(server)
    .get('//asdfasdffs')
    .expect(404, done)
  })
})
