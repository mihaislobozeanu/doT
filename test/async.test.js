/* eslint-disable no-undef */
'use strict';

var testAsync = require('./util').testAsync;
var assert = require("assert");
var doT = require("..");

describe('doT Async', function () {
    var basictemplate = "<div>{{!it.foo}}</div>";

    describe('#templateAsync()', function () {
        it('should return a function', async function () {
            const compiledAsync = await doT.templateAsync(basictemplate);
            assert.equal(typeof compiledAsync, "function");
        });
    });

    describe('#() async', function () {
        it('should render the template asynchronously', async function () {
            const compiledAsync = await doT.templateAsync(basictemplate);
            assert.equal(await compiledAsync({ foo: "http" }), "<div>http</div>");
            assert.equal(await compiledAsync({ foo: "http://abc.com" }), "<div>http:&#47;&#47;abc.com</div>");
            assert.equal(await compiledAsync({}), "<div></div>");
        });
    });

    describe('async interpolate 2 numbers', function () {
        it('should print numbers next to each other asynchronously', async function () {
            await testAsync([
                '{{=it.one}}{{=it.two}}',
                '{{= it.one}}{{= it.two}}',
                '{{= it.one }}{{= it.two }}'
            ], { one: 1, two: 2 }, '12');
        });
    });

    describe('async/await inside template', function () {
        it('should support async/await inside evaluate', async function () {
            await testAsync([
                `{{
                it.asyncOperationExecuted = false;
                function asyncOperation() {
                  return Promise.resolve().then(() => { it.asyncOperationExecuted = true; });
                }
                await asyncOperation();
              }}Async executed is {{=it.asyncOperationExecuted}}`
            ], {}, 'Async executed is true');
        });

        it('should support async/await inside interpolate', async function () {
            await testAsync([
                `First async executed is {{=await (async () => {
                    const result = await new Promise(resolve => setTimeout(() => resolve('successful'), 0));
                    return result || 'unsuccessful';
                })()}};Second async executed is {{=await (async () => {
                    const result = await new Promise(resolve => setTimeout(() => resolve('true'), 0));
                    return result || 'false';
                })()}}`
            ], {}, 'First async executed is successful;Second async executed is true');
        });

        it('should support async/await inside encode', async function () {
            await testAsync([
                `Encoded async result: {{!await (async () => {
                    await new Promise(resolve => setTimeout(resolve, 0));
                    return '<script>alert("XSS")</script>';
                })()}}`
            ], {}, 'Encoded async result: &#60;script&#62;alert(&#34;XSS&#34;)&#60;&#47;script&#62;');
        });

        it('should support async/await inside define', async function () {
            await testAsync([
                `{{##async_defined=
                    await (async () => {
                        await new Promise(resolve => setTimeout(resolve, 0));
                        return 'defined successfully';
                    })()
                #}}Defined result: {{#def.async_defined}}`
            ], {}, 'Defined result: defined successfully');
        });

        it('should support async/await inside conditional', async function () {
            await testAsync([
                `{{? await (async () => {
                    await new Promise(resolve => setTimeout(resolve, 0));
                    return true;
                })() }}Condition met{{??}}Condition not met{{?}}`
            ], {}, 'Condition met');
        });

        it('should support async/await inside iterate', async function () {
            await testAsync([
                `{{~ await (async () => {
                    await new Promise(resolve => setTimeout(resolve, 0));
                    return [1, 2, 3];
                })() :value:index}}Item {{=index}}: {{=value}}{{~}}`
            ], {}, 'Item 0: 1Item 1: 2Item 2: 3');
        });

    });

    describe('invalid JS in async templates', function () {
        it('should throw exception', async function () {
            await assert.rejects(async function () {
                await doT.templateAsync('<div>{{= foo + }}</div>');
            });
        });
    });
});