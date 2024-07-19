// doT.js
// 2011-2014, Laura Doktorova, https://github.com/olado/doT
// Licensed under the MIT license.
/**
 * Modifyed by Paul Mihailescu https://github.com/Paul1324, on 19.07.2024
 * added support for asyncronous templates
 * created the templateAsync function that returns an async function for the processed template
 * extracted the common code of templateAsync and template into processTemplate
 * created resolveDefsAsync for asyncronouse defines
 */

function replaceAsync(str, re, callback) {
	str = String(str);
	const parts = [];
	let i = 0;
	if (Object.prototype.toString.call(re) == "[object RegExp]") {
		if (re.global)
			re.lastIndex = i;
		let m;
		while ((m = re.exec(str)) !== null) {
			const args = m.concat([m.index, m.input]);
			parts.push(str.slice(i, m.index), callback.apply(null, args));
			i = re.lastIndex;
			if (!re.global)
				break;
			if (m[0].length == 0)
				re.lastIndex++;
		}
	} else {
		re = String(re);
		i = str.indexOf(re);
		parts.push(str.slice(0, i), callback.apply(null, [re, i, str]));
		i += re.length;
	}
	parts.push(str.slice(i));
	return Promise.all(parts).then(function (strings) {
		return strings.join("");
	});
}

const AsyncFunction = async function () {}.constructor;

(function () {
	"use strict";

	var doT = {
		name: "doT",
		version: "1.1.1",
		templateSettings: {
			evaluate: /\{\{([\s\S]+?(\}?)+)\}\}/g,
			interpolate: /\{\{=([\s\S]+?)\}\}/g,
			encode: /\{\{!([\s\S]+?)\}\}/g,
			use: /\{\{#([\s\S]+?)\}\}/g,
			useParams: /(^|[^\w$])def(?:\.|\[[\'\"])([\w$\.]+)(?:[\'\"]\])?\s*\:\s*([\w$\.]+|\"[^\"]+\"|\'[^\']+\'|\{[^\}]+\})/g,
			define: /\{\{##\s*([\w\.$]+)\s*(\:|=)([\s\S]+?)#\}\}/g,
			defineParams: /^\s*([\w$]+):([\s\S]+)/,
			conditional: /\{\{\?(\?)?\s*([\s\S]*?)\s*\}\}/g,
			iterate: /\{\{~\s*(?:\}\}|([\s\S]+?)\s*\:\s*([\w$]+)\s*(?:\:\s*([\w$]+))?\s*\}\})/g,
			varname: "it",
			strip: true,
			append: true,
			selfcontained: false,
			doNotSkipEncoded: false
		},
		template: undefined, //fn, compile template
		compile: undefined, //fn, for express
		log: true
	}, _globals;

	doT.encodeHTMLSource = function (doNotSkipEncoded) {
		var encodeHTMLRules = { "&": "&#38;", "<": "&#60;", ">": "&#62;", '"': "&#34;", "'": "&#39;", "/": "&#47;" },
			matchHTML = doNotSkipEncoded ? /[&<>"'\/]/g : /&(?!#?\w+;)|<|>|"|'|\//g;
		return function (code) {
			return code ? code.toString().replace(matchHTML, function (m) { return encodeHTMLRules[m] || m; }) : "";
		};
	};

	_globals = (function () { return this || (0, eval)("this"); }());

	/* istanbul ignore else */
	if (typeof module !== "undefined" && module.exports) {
		module.exports = doT;
	} else if (typeof define === "function" && define.amd) {
		define(function () { return doT; });
	} else {
		_globals.doT = doT;
	}

	var startend = {
		append: { start: "'+(", end: ")+'", startencode: "'+encodeHTML(" },
		split: { start: "';out+=(", end: ");out+='", startencode: "';out+=encodeHTML(" }
	}, skip = /$^/;

	function processDefine(code, assign, value, def, c) {
		if (code.indexOf("def.") === 0) {
			code = code.substring(4);
		}
		if (!(code in def)) {
			if (assign === ":") {
				if (c.defineParams) value.replace(c.defineParams, function (m, param, v) {
					def[code] = { arg: param, text: v };
				});
				if (!(code in def)) def[code] = value;
			} else {
				return { code, value };
			}
		}
		return null;
	}

	function processUse(code, def, c) {
		if (c.useParams) code = code.replace(c.useParams, function (m, s, d, param) {
			if (def[d] && def[d].arg && param) {
				const rw = (d + ":" + param).replace(/'|\\/g, "_");
				def.__exp = def.__exp || {};
				def.__exp[rw] = def[d].text.replace(new RegExp("(^|[^\\w$])" + def[d].arg + "([^\\w$])", "g"), "$1" + param + "$2");
				return s + "def.__exp['" + rw + "']";
			}
		});
		return code;
	}

	function resolveDefs(c, block, def) {
		return ((typeof block === "string") ? block : block.toString())
			.replace(c.define || skip, function (m, code, assign, value) {
				let result = processDefine(code, assign, value, def, c);
				if (result) {
					new Function("def", `def['${result.code}']=${result.value}`)(def);
				}
				return "";
			})
			.replace(c.use || skip, function (m, code) {
				code = processUse(code, def, c);
				const v = new Function("def", "return " + code)(def);
				return v ? resolveDefs(c, v, def) : v;
			});
	}

	async function resolveDefsAsync(c, block, def) {
		let result = (typeof block === "string") ? block : block.toString();

		result = await replaceAsync(result, c.define || skip, async (m, code, assign, value) => {
			let processResult = processDefine(code, assign, value, def, c);
			if (processResult) {
				await new AsyncFunction("def", `def['${processResult.code}'] = ${processResult.value}`)(def);
			}
			return "";
		});

		result = await replaceAsync(result, c.use || skip, async (m, code) => {
			code = processUse(code, def, c);
			const v = await new AsyncFunction("def", "return " + code)(def);
			return v ? await resolveDefsAsync(c, v, def) : v;
		});

		return result;
	}

	function unescape(code) {
		return code.replace(/\\('|\\)/g, "$1").replace(/[\r\t\n]/g, " ");
	}

	function processTemplate(str, c) {
		const cse = c.append ? startend.append : startend.split;
		let needhtmlencode, sid = 0, indv;

		str = ("var out='" + (c.strip ? str.replace(/(^|\r|\n)\t* +| +\t*(\r|\n|$)/g, " ")
			.replace(/\r|\n|\t|\/\*[\s\S]*?\*\//g, "") : str)
			.replace(/'|\\/g, "\\$&")
			.replace(c.interpolate || skip, function (m, code) {
				return cse.start + unescape(code) + cse.end;
			})
			.replace(c.encode || skip, function (m, code) {
				needhtmlencode = true;
				return cse.startencode + unescape(code) + cse.end;
			})
			.replace(c.conditional || skip, function (m, elsecase, code) {
				return elsecase ?
					(code ? "';}else if(" + unescape(code) + "){out+='" : "';}else{out+='") :
					(code ? "';if(" + unescape(code) + "){out+='" : "';}out+='");
			})
			.replace(c.iterate || skip, function (m, iterate, vname, iname) {
				if (!iterate) return "';} } out+='";
				sid += 1; indv = iname || "i" + sid; iterate = unescape(iterate);
				return "';var arr" + sid + "=" + iterate + ";if(arr" + sid + "){var " + vname + "," + indv + "=-1,l" + sid + "=arr" + sid + ".length-1;while(" + indv + "<l" + sid + "){"
					+ vname + "=arr" + sid + "[" + indv + "+=1];out+='";
			})
			.replace(c.evaluate || skip, function (m, code) {
				return "';" + unescape(code) + "out+='";
			})
			+ "';return out;")
			.replace(/\n/g, "\\n").replace(/\t/g, '\\t').replace(/\r/g, "\\r")
			.replace(/(\s|;|\}|^|\{)out\+='';/g, '$1').replace(/\+''/g, "");
		//.replace(/(\s|;|\}|^|\{)out\+=''\+/g,'$1out+=');

		if (needhtmlencode) {
			if (!c.selfcontained && _globals && !_globals._encodeHTML) _globals._encodeHTML = doT.encodeHTMLSource(c.doNotSkipEncoded);
			str = "var encodeHTML = typeof _encodeHTML !== 'undefined' ? _encodeHTML : ("
				+ doT.encodeHTMLSource.toString() + "(" + (c.doNotSkipEncoded || '') + "));"
				+ str;
		}

		return str;
	}

	doT.template = function (tmpl, c, def) {
		c = c || doT.templateSettings;
		let str = (c.use || c.define) ? resolveDefs(c, tmpl, def || {}) : tmpl;

		str = processTemplate(str, c);
		try {
			return new Function(c.varname, str);
		} catch (e) {
			if (typeof console !== "undefined") console.log("Could not create a template function: " + str);
			throw e;
		}
	};

	doT.templateAsync = async function (tmpl, c, def) {
		c = c || doT.templateSettings;
		let str = (c.use || c.define) ? await resolveDefsAsync(c, tmpl, def || {}) : tmpl;

		str = processTemplate(str, c);
		try {
			return new AsyncFunction(c.varname, str);
		} catch (e) {
			if (typeof console !== "undefined") console.log("Could not create a template function: " + str);
			throw e;
		}
	};

	doT.compile = function (tmpl, def) {
		return doT.template(tmpl, null, def);
	};

	doT.compileAsync = function (tmpl, def) {
		return doT.templateAsync(tmpl, null, def);
	};
}());