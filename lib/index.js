/* jshint undef:true, unused:true, node:true */

var assert = require('assert');
var through = require('through');

var esprima = require('esprima');
var recast = require('recast');
var types = recast.types;
var n = types.namedTypes;
var b = types.builders;

var es6arrowFn = require('es6-arrow-function');

assert.ok(
  /harmony/.test(esprima.version),
  'looking for esprima harmony but found: ' + esprima.version
);

/**
 * Visits a node of an AST looking default params. This is intended to be used
 * with the ast-types `traverse()` function.
 *
 * @private
 * @param {Object} node
 * @this {ast-types.Path}
 */
function visitNode(node) {
  if (n.Function.check(node)) {
    var defaults = node.defaults;
    var params = node.params;
    var assignments = [];

    if (defaults && defaults.length > 0) {
      defaults.forEach(function(defaultExpression, i) {
        if (defaultExpression) {
          var param = params[i];
          var argumentExpression = b.memberExpression(
            b.identifier('arguments'),
            b.literal(i),
            true
          );

          // var a = (arguments[0] !== void 0 ? arguments[0] : someDefault);
          assignments.push(b.variableDeclaration(
            'var',
            [b.variableDeclarator(
              param,
              b.conditionalExpression(
                b.binaryExpression(
                  '!==',
                  argumentExpression,
                  b.unaryExpression('void', b.literal(0))
                ),
                argumentExpression,
                defaultExpression
              )
            )]
          ));
        }
      });

      node.params = node.params.slice(0, node.params.length - assignments.length);
      node.defaults = [];
      node.body.body.unshift.apply(node.body.body, assignments);
    }
  }
}

/**
 * Transform an Esprima AST generated from ES6 by replacing all default params
 * with an equivalent approach in ES5. Because of the way default params work,
 * we need to also transform arrow functions to normal functions first.
 *
 * NOTE: The argument may be modified by this function. To prevent modification
 * of your AST, pass a copy instead of a direct reference:
 *
 *   // instead of transform(ast), pass a copy
 *   transform(JSON.parse(JSON.stringify(ast));
 *
 * @param {Object} ast
 * @return {Object}
 */
function transform(ast) {
  return types.traverse(es6arrowFn.transform(ast), visitNode);
}

/**
 * Transform JavaScript written using ES6 by replacing all default params with
 * the equivalent ES5.
 *
 *   compile('function add(a=0, b=0){ return a + b; }');
 *   `function add() {
 *      var a = (arguments[0] !== void 0 ? arguments[0] : 0);
 *      var b = (arguments[1] !== void 0 ? arguments[1] : 0);
 *      return a + b;
 *    }`
 *
 *
 * @param {string} source
 * @return {string}
 */
function compile(source, mapOptions) {
  mapOptions = mapOptions || {};

  var recastOptions = {
    // Use the harmony branch of Esprima that installs with es6-default-params
    // instead of the master branch that recast provides.
    esprima: esprima,

    sourceFileName: mapOptions.sourceFileName,
    sourceMapName: mapOptions.sourceMapName
  };

  var ast = recast.parse(source, recastOptions);
  return recast.print(transform(ast), recastOptions);
}

module.exports = function () {
  var data = '';
  return through(write, end);

  function write (buf) { data += buf; }
  function end () {
      this.queue(module.exports.compile(data).code);
      this.queue(null);
  }
};

module.exports.compile = compile;
module.exports.transform = transform;
