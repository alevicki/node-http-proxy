var httpProxy = exports,
    extend    = require('util')._extend,
    parse_url = require('url').parse,
    EE3       = require('eventemitter3').EventEmitter,
    http      = require('http'),
    https     = require('https'),
    web       = require('./passes/web-incoming'),
    ws        = require('./passes/ws-incoming');

httpProxy.Server = ProxyServer;

/**
 * Returns a function that creates the loader for
 * either `ws` or `web`'s  passes.
 *
 * Examples:
 *
 *    httpProxy.createRightProxy('ws')
 *    // => [Function]
 *
 * @param {String} Type Either 'ws' or 'web'
 * 
 * @return {Function} Loader Function that when called returns an iterator for the right passes
 *
 * @api private
 */

function createRightProxy(type) {
  var webPasses = Object.keys(web).map(function(pass) {
    return web[pass];
  });
  var wsPasses = Object.keys(ws).map(function(pass) {
    return ws[pass];
  });
  return function(options) {
    return function(req, res /*, [head], [opts] */) {
      var passes = (type === 'ws') ? (this.wsPasses || wsPasses) : (this.webPasses || webPasses),
          args = [].slice.call(arguments),
          cntr = args.length - 1,
          head, cbl;

      /* optional args parse begin */
      if(typeof args[cntr] === 'function') {
        cbl = args[cntr];

        cntr--;
      }

      if(
        !(args[cntr] instanceof Buffer) &&
        args[cntr] !== res
      ) {
        //Copy global options
        options = extend({}, options);
        //Overwrite with request options
        extend(options, args[cntr]);

        cntr--;
      }

      if(args[cntr] instanceof Buffer) {
        head = args[cntr];
      }

      /* optional args parse end */

      ['target', 'forward'].forEach(function(e) {
        if (typeof options[e] === 'string')
          options[e] = parse_url(options[e]);
      });
       
      if(typeof this.emit === 'undefined' && !cbl) { throw new Error("You need to pass a callback to handle errors") }

      for(var i=0; i < passes.length; i++) {
        /**
         * Call of passes functions
         * pass(req, res, options, head)
         *
         * In WebSockets case the `res` variable
         * refer to the connection socket
         * pass(req, socket, options, head)
         */
        if(passes[i](req, res, options, head, cbl ? false : this, cbl)) { // passes can return a truthy value to halt the loop
          break;
        }
      }
    };
  };
}
httpProxy.createRightProxy = createRightProxy;

function ProxyServer(options) {
  EE3.call(this);

  this.web = this.proxyRequest           = createRightProxy('web')(options);
  this.ws  = this.proxyWebsocketRequest  = createRightProxy('ws')(options);
  this.options = options;

  this.webPasses = Object.keys(web).map(function(pass) {
    return web[pass];
  });

  this.wsPasses = Object.keys(ws).map(function(pass) {
    return ws[pass];
  });

  this.on('error', function(err) {
    console.log(err);
  });
}

require('util').inherits(ProxyServer, EE3);

ProxyServer.prototype.listen = function(port) {
  var self    = this,
      closure = function(req, res) { self.web(req, res); };

  this._server  = this.options.ssl ?
    https.createServer(this.options.ssl, closure) :
    http.createServer(closure);

  if(this.options.ws) {
    this._server.on('upgrade', function(req, socket, head) { self.ws(req, socket, head); });
  }

  this._server.listen(port);

  return this;
};

ProxyServer.prototype.before = function(type, passName, callback) {
  if (type !== 'ws' || type !== 'web') {
    throw new Error('type must be `web` or `ws`');
  }
  var passes = (type === 'ws') ? this.wsPasses : this.webPasses,
      i = false;

  passes.forEach(function(v, idx) {
    if(v.name === passName) i = idx;
  })

  if(!i) throw new Error('No such pass');

  passes.splice(i, 0, callback);
};
ProxyServer.prototype.after = function(type, passName, callback) {
  if (type !== 'ws' || type !== 'web') {
    throw new Error('type must be `web` or `ws`');
  }
  var passes = (type === 'ws') ? this.wsPasses : this.webPasses,
      i = false;

  passes.forEach(function(v, idx) {
    if(v.name === passName) i = idx;
  })

  if(!i) throw new Error('No such pass');

  passes.splice(i++, 0, callback);
};
