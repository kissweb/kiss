
var assert = require('assert')
var path = require('path')
var co = require('co')

var Serve = require('..')

describe('Lookup', function () {
  it('should lookup multiple paths', co.wrap(function* () {
    var serve = Serve()

    serve.mount(path.resolve(__dirname, 'fixtures/a'))
    serve.mount(path.resolve(__dirname, 'fixtures/b'))
    serve.mount(path.resolve(__dirname, 'fixtures'))

    assert.equal(path.resolve(__dirname, 'fixtures/a/a.html'),
      (yield serve.lookupFilename('/a.html')).filename)
    assert.equal(path.resolve(__dirname, 'fixtures/b/b.html'),
      (yield serve.lookupFilename('/b.html')).filename)
    assert.equal(path.resolve(__dirname, 'fixtures/a/index.html'),
      (yield serve.lookupFilename('/index.html')).filename)
    assert.equal(path.resolve(__dirname, 'fixtures/a/index.html'),
      (yield serve.lookupFilename('/')).filename)
  }))

  it('should lookup paths in priority', co.wrap(function* () {
    var serve = Serve()

    serve.mount(path.resolve(__dirname, 'fixtures'))
    serve.mount(path.resolve(__dirname, 'fixtures/b'))
    serve.mount(path.resolve(__dirname, 'fixtures/a'))

    assert.equal(path.resolve(__dirname, 'fixtures/a/a.html'),
      (yield serve.lookupFilename('/a.html')).filename)
    assert.equal(path.resolve(__dirname, 'fixtures/b/b.html'),
      (yield serve.lookupFilename('/b.html')).filename)
    assert.equal(path.resolve(__dirname, 'fixtures/index.html'),
      (yield serve.lookupFilename('/index.html')).filename)
    assert.equal(path.resolve(__dirname, 'fixtures/index.html'),
      (yield serve.lookupFilename('/')).filename)
  }))

  it('should handle prefixes', co.wrap(function* () {
    var serve = Serve()

    serve.mount('/b', path.resolve(__dirname, 'fixtures/a'))
    serve.mount('/a', path.resolve(__dirname, 'fixtures/b'))
    serve.mount(path.resolve(__dirname, 'fixtures'))

    assert.equal(path.resolve(__dirname, 'fixtures/a/index.html'),
      (yield serve.lookupFilename('/b/index.html')).filename)
    assert.equal(path.resolve(__dirname, 'fixtures/a/index.html'),
      (yield serve.lookupFilename('/b/')).filename)
    assert.equal(path.resolve(__dirname, 'fixtures/a/test.js'),
      (yield serve.lookupFilename('/b/test.js')).filename)
  }))
})
