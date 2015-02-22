
# kiss

[![NPM version][npm-image]][npm-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]
[![Dependency Status][david-image]][david-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]
[![Gittip][gittip-image]][gittip-url]

Koa Static Server - HTTP/2 static server.
The goal for this static server is to keep web development simpler!
It parses your files and HTTP/2 pushes its dependencies automatically!
It is also extensible with the end-goal of integrating
polyfilling and transpilation so that you don't have to worry about that in a build step.

- When streaming HTML, this middleware will buffer the response in memory.
  This is required because the current dependency parser does not support streaming.

## Example

```js
let koa = require('koa')
let app = koa()

let server = require('kiss')()
// mount the public folder at root
server.mount(__dirname + '/public')
// expose `/client`
server.mount('/client', __dirname + '/client')
app.use(server)
```

## API

### var server = new Kiss(options)

### server.mount([prefix], folder)

### server.etag(fn)

### server.cacheControl(maxAge)

### server.hidden(enable)

[gitter-image]: https://badges.gitter.im/jonathanong/kiss.png
[gitter-url]: https://gitter.im/jonathanong/kiss
[npm-image]: https://img.shields.io/npm/v/kiss.svg?style=flat-square
[npm-url]: https://npmjs.org/package/kiss
[github-tag]: http://img.shields.io/github/tag/jonathanong/kiss.svg?style=flat-square
[github-url]: https://github.com/jonathanong/kiss/tags
[travis-image]: https://img.shields.io/travis/jonathanong/kiss.svg?style=flat-square
[travis-url]: https://travis-ci.org/jonathanong/kiss
[coveralls-image]: https://img.shields.io/coveralls/jonathanong/kiss.svg?style=flat-square
[coveralls-url]: https://coveralls.io/r/jonathanong/kiss
[david-image]: http://img.shields.io/david/jonathanong/kiss.svg?style=flat-square
[david-url]: https://david-dm.org/jonathanong/kiss
[license-image]: http://img.shields.io/npm/l/kiss.svg?style=flat-square
[license-url]: LICENSE
[downloads-image]: http://img.shields.io/npm/dm/kiss.svg?style=flat-square
[downloads-url]: https://npmjs.org/package/kiss
[gittip-image]: https://img.shields.io/gratipay/jonathanong.svg?style=flat-square
[gittip-url]: https://gratipay.com/jonathanong/
