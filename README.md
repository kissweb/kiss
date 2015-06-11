
# kiss

[![NPM version][npm-image]][npm-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]
[![Dependency Status][david-image]][david-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

Keeping web development simple with a Koa-based HTTP/2 static server.
This server seamlessly HTTP/2 pushes all your files dependencies!
You never have to explicitly `PUSH` assets to the client (unless you want to).

KISS hopes to simplify web development further by being extensible.
By using plugins for polyfilling, transpilation and, eventually, package management,
your build system will eventually become nonexistent.
Your server is the new build system.

## Supported Dependency Types

The following types of dependencies are parsed and HTTP pushed:

HTML:

- `<script src>` - scripts
- `<module src>` - modules
- `<link rel="stylesheet">` - stylesheets
- `<link rel="import">` - HTML imports

CSS:

- `@import "";` - CSS imports

JS:

- `import ''` - module imports

Dependencies that are conditional are not pushed automatically.
If the client has a good chance of not using the dependency at all,
extra latency is considered acceptable.
Some examples are:

- CSS `url()` dependencies, many of which are wrapped in `@media` or `@support` queries or conditional selectors.
- CSS dependences with media queries including `<link rel="stylesheet" media="">` and `@import "" screen;`.
- JS `System.import()`s, which are always dynamically loaded.

## Caveats

KISS only supports iojs.

iojs does not yet support HTTP2.
The current implementation uses [spdy](https://github.com/indutny/node-spdy),
which will most likely be the precursor for iojs' HTTP2 implementation.
SPDY is sufficient for testing and educational purposes.

When streaming HTML, this middleware will buffer the response in memory.
This is required because the current dependency parser does not support streaming (and probably never will).
This is not a big issue as you probably shouldn't be using streaming templating systems anyways.

KISS is not production-ready and will most likely not be production-ready for a while.
KISS will not attempt to become production-ready until load balancers such as nginx
support HTTP2 push from upstream servers.

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

You can also view the example by cloning this repo and running `./bin/kiss example`:

```bash
git clone git://github.com/kissweb/kiss
cd kiss
./bin/kiss example
```

Then opening the page in your browser:

```bash
open https://127.0.0.1:4000/
```

Be sure to accept the self-signed certificate!

## kiss(1)

KISS comes with a CLI for serving with a hope of replacing [serve](https://www.npmjs.com/package/serve).
To install:

```bash
npm i -g kiss
```

And to run:

```bash
kiss .
```

Note that, by default, KISS uses a self-signed certificate.
This is required as many browsers do not support HTTP2 without SSL.
Acknowledge this from your browser to continue working.

Type the following for more information:

```bash
kiss --help
```

## JS API

### var server = new Kiss([root], options)

Create a new KISS instance.

```js
var KISS = require('kiss')
var server = new KISS('public', {
  cacheControl: '1 year'
})
```

The `root` option is a shortcut for `server.mount(root)`.

### app.use(server)

You can use each instance:

```js
app.use(server)
```

### server.mount([prefix="/"], folder)

Mount a server path.
For example:

- `.mount('public')` -> `GET /index.html` -> `public/index.html`
- `.mount('/something', 'public')` -> `GET /something/index.html` -> `public/index.html`

You never want to have more than a single instance of KISS on a server.
By mounting multiple directories at once,

Folders resolve to the current working directory.

### server.etag(fn)

Add a custom ETag function.
By default, the [etag](https://github.com/jshttp/etag) module is used.
Function signature is `stats => <etag>`.

### server.cacheControl(maxAge)

Change the cache control header,
which defaults to `public, max-age=<1 year>`.
`maxAge` could either be a time in `ms` or a time string parsed using the [ms](https://github.com/rauchg/ms.js) module.

### server.hidden(enable)

If hidden directories are supported,
paths whose fragments begin with `.` are allowed.
Instead of enabling this option,
you should mount on paths like `server.mount('/.git', '.git')`

[gitter-image]: https://badges.gitter.im/kissweb/kiss.png
[gitter-url]: https://gitter.im/kissweb/kiss
[npm-image]: https://img.shields.io/npm/v/kiss.svg?style=flat-square
[npm-url]: https://npmjs.org/package/kiss
[github-tag]: http://img.shields.io/github/tag/kissweb/kiss.svg?style=flat-square
[github-url]: https://github.com/kissweb/kiss/tags
[travis-image]: https://img.shields.io/travis/kissweb/kiss.svg?style=flat-square
[travis-url]: https://travis-ci.org/kissweb/kiss
[coveralls-image]: https://img.shields.io/coveralls/kissweb/kiss.svg?style=flat-square
[coveralls-url]: https://coveralls.io/r/kissweb/kiss
[david-image]: http://img.shields.io/david/kissweb/kiss.svg?style=flat-square
[david-url]: https://david-dm.org/kissweb/kiss
[license-image]: http://img.shields.io/npm/l/kiss.svg?style=flat-square
[license-url]: LICENSE
[downloads-image]: http://img.shields.io/npm/dm/kiss.svg?style=flat-square
[downloads-url]: https://npmjs.org/package/kiss
[gittip-image]: https://img.shields.io/gratipay/jonathanong.svg?style=flat-square
[gittip-url]: https://gratipay.com/jonathanong/
