'use strict';

var assert = require('assert');
var doT = require('../doT');

exports.test = function (templates, data, result) {
    templates.forEach(function (tmpl) {
        var fn = doT.template(tmpl);
        assert.strictEqual(fn(data), result);
    });
};

exports.testAsync = async function (templates, data, result) {
    for (let tmpl of templates) {
        var fn = await doT.templateAsync(tmpl);
        const render = await fn(data);
        assert.strictEqual(render, result);
    }
};