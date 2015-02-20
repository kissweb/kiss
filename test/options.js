
var assert = require('assert')

var Serve = require('..')

describe('Hidden', function () {
  it('should set .options.hidden', function () {
    var serve = Serve({
      hidden: false
    })

    assert(!serve.options.hidden)

    serve.hidden(true)
    assert(serve.options.hidden)
  })
})

describe('Cache-Control', function () {
  it('should support ages as strings', function () {
    var serve = Serve({
      cacheControl: '1 year'
    })

    assert(!~serve._cacheControl.indexOf('NaN'))
  })
})

describe('ETag', function () {
  it('should support custom functions', function () {
    var serve = Serve({
      etag: function (stats) {
        return stats.mtime.toUTCString()
      }
    })

    var date = new Date()
    return serve._etag({
      mtime: date
    }).then(function (etag) {
      assert.equal(etag, date.toUTCString())
    })
  })
})
