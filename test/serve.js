'use strict'

var request = require('supertest')
var assert = require('assert')
var path = require('path')
var koa = require('koa')

var Serve = require('..')

describe('Serve', function () {
  it('should serve html', function (done) {
    var app = koa()
    app.use(Serve().mount(path.join(__dirname, 'fixtures')))

    request(app.callback())
    .get('/')
    .expect('Content-Type', /text\/html/)
    .expect('Cache-Control', /max-age=31536000/)
    .expect(200, function (err, res) {
      assert.ifError(err)
      assert(res.headers.etag)
      assert(res.headers['last-modified'])
      done()
    })
  })
})
