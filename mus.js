/**
 * Mus v1.0.1
 * The Mustache.js wrapper
 * http://github.com/keta/mus
 *
 * @package Mus
 * @depends Mustache.js, jQuery
 *
 * Copyright 2012, Aleksandr "keta" Kavun
 * Licensed under the MIT license:
 * http://www.opensource.org/licenses/mit-license.php
 */

;
(function(window, document, $)
{
	"use strict";

/*!
 * mustache.js - Logic-less {{mustache}} templates with JavaScript
 * http://github.com/janl/mustache.js
 */
var Mustache = (typeof module !== "undefined" && module.exports) || {};

(function (exports) {

  exports.name = "mustache.js";
  exports.version = "0.5.0-dev";
  exports.tags = ["{{", "}}"];
  exports.parse = parse;
  exports.compile = compile;
  exports.render = render;
  exports.clearCache = clearCache;

  // This is here for backwards compatibility with 0.4.x.
  exports.to_html = function (template, view, partials, send) {
    var result = render(template, view, partials);

    if (typeof send === "function") {
      send(result);
    } else {
      return result;
    }
  };

  var _toString = Object.prototype.toString;
  var _isArray = Array.isArray;
  var _forEach = Array.prototype.forEach;
  var _trim = String.prototype.trim;

  var isArray;
  if (_isArray) {
    isArray = _isArray;
  } else {
    isArray = function (obj) {
      return _toString.call(obj) === "[object Array]";
    };
  }

  var forEach;
  if (_forEach) {
    forEach = function (obj, callback, scope) {
      return _forEach.call(obj, callback, scope);
    };
  } else {
    forEach = function (obj, callback, scope) {
      for (var i = 0, len = obj.length; i < len; ++i) {
        callback.call(scope, obj[i], i, obj);
      }
    };
  }

  var spaceRe = /^\s*$/;

  function isWhitespace(string) {
    return spaceRe.test(string);
  }

  var trim;
  if (_trim) {
    trim = function (string) {
      return string == null ? "" : _trim.call(string);
    };
  } else {
    var trimLeft, trimRight;

    if (isWhitespace("\xA0")) {
      trimLeft = /^\s+/;
      trimRight = /\s+$/;
    } else {
      // IE doesn't match non-breaking spaces with \s, thanks jQuery.
      trimLeft = /^[\s\xA0]+/;
      trimRight = /[\s\xA0]+$/;
    }

    trim = function (string) {
      return string == null ? "" :
        String(string).replace(trimLeft, "").replace(trimRight, "");
    };
  }

  var escapeMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;'
  };

  function escapeHTML(string) {
    return String(string).replace(/&(?!\w+;)|[<>"']/g, function (s) {
      return escapeMap[s] || s;
    });
  }

  /**
   * Adds the `template`, `line`, and `file` properties to the given error
   * object and alters the message to provide more useful debugging information.
   */
  function debug(e, template, line, file) {
    file = file || "<template>";

    var lines = template.split("\n"),
        start = Math.max(line - 3, 0),
        end = Math.min(lines.length, line + 3),
        context = lines.slice(start, end);

    var c;
    for (var i = 0, len = context.length; i < len; ++i) {
      c = i + start + 1;
      context[i] = (c === line ? " >> " : "    ") + context[i];
    }

    e.template = template;
    e.line = line;
    e.file = file;
    e.message = [file + ":" + line, context.join("\n"), "", e.message].join("\n");

    return e;
  }

  /**
   * Looks up the value of the given `name` in the given context `stack`.
   */
  function lookup(name, stack, defaultValue) {
    if (name === ".") {
      return stack[stack.length - 1];
    }

    var names = name.split(".");
    var lastIndex = names.length - 1;
    var target = names[lastIndex];

    var value, context, i = stack.length, j, localStack;
    while (i) {
      localStack = stack.slice(0);
      context = stack[--i];

      j = 0;
      while (j < lastIndex) {
        context = context[names[j++]];

        if (context == null) {
          break;
        }

        localStack.push(context);
      }

      if (context && typeof context === "object" && target in context) {
        value = context[target];
        break;
      }
    }

    // If the value is a function, call it in the current context.
    if (typeof value === "function") {
      value = value.call(localStack[localStack.length - 1]);
    }

    if (value == null)  {
      return defaultValue;
    }

    return value;
  }

  function renderSection(name, stack, callback, inverted) {
    var buffer = "";
    var value =  lookup(name, stack);

    if (inverted) {
      // From the spec: inverted sections may render text once based on the
      // inverse value of the key. That is, they will be rendered if the key
      // doesn't exist, is false, or is an empty list.
      if (value == null || value === false || (isArray(value) && value.length === 0)) {
        buffer += callback();
      }
    } else if (isArray(value)) {
      forEach(value, function (value) {
        stack.push(value);
        buffer += callback();
        stack.pop();
      });
    } else if (typeof value === "object") {
      stack.push(value);
      buffer += callback();
      stack.pop();
    } else if (typeof value === "function") {
      var scope = stack[stack.length - 1];
      var scopedRender = function (template) {
        return render(template, scope);
      };
      buffer += value.call(scope, callback(), scopedRender) || "";
    } else if (value) {
      buffer += callback();
    }

    return buffer;
  }

  /**
   * Parses the given `template` and returns the source of a function that,
   * with the proper arguments, will render the template. Recognized options
   * include the following:
   *
   *   - file     The name of the file the template comes from (displayed in
   *              error messages)
   *   - tags     An array of open and close tags the `template` uses. Defaults
   *              to the value of Mustache.tags
   *   - debug    Set `true` to log the body of the generated function to the
   *              console
   *   - space    Set `true` to preserve whitespace from lines that otherwise
   *              contain only a {{tag}}. Defaults to `false`
   */
  function parse(template, options) {
    options = options || {};

    var tags = options.tags || exports.tags,
        openTag = tags[0],
        closeTag = tags[tags.length - 1];

    var code = [
      'var buffer = "";', // output buffer
      "\nvar line = 1;", // keep track of source line number
      "\ntry {",
      '\nbuffer += "'
    ];

    var spaces = [],      // indices of whitespace in code on the current line
        hasTag = false,   // is there a {{tag}} on the current line?
        nonSpace = false; // is there a non-space char on the current line?

    // Strips all space characters from the code array for the current line
    // if there was a {{tag}} on it and otherwise only spaces.
    var stripSpace = function () {
      if (hasTag && !nonSpace && !options.space) {
        while (spaces.length) {
          code.splice(spaces.pop(), 1);
        }
      } else {
        spaces = [];
      }

      hasTag = false;
      nonSpace = false;
    };

    var sectionStack = [], updateLine, nextOpenTag, nextCloseTag;

    var setTags = function (source) {
      tags = trim(source).split(/\s+/);
      nextOpenTag = tags[0];
      nextCloseTag = tags[tags.length - 1];
    };

    var includePartial = function (source) {
      code.push(
        '";',
        updateLine,
        '\nvar partial = partials["' + trim(source) + '"];',
        '\nif (partial) {',
        '\n  buffer += render(partial,stack[stack.length - 1],partials);',
        '\n}',
        '\nbuffer += "'
      );
    };

    var openSection = function (source, inverted) {
      var name = trim(source);

      if (name === "") {
        throw debug(new Error("Section name may not be empty"), template, line, options.file);
      }

      sectionStack.push({name: name, inverted: inverted});

      code.push(
        '";',
        updateLine,
        '\nvar name = "' + name + '";',
        '\nvar callback = (function () {',
        '\n  return function () {',
        '\n    var buffer = "";',
        '\nbuffer += "'
      );
    };

    var openInvertedSection = function (source) {
      openSection(source, true);
    };

    var closeSection = function (source) {
      var name = trim(source);
      var openName = sectionStack.length != 0 && sectionStack[sectionStack.length - 1].name;

      if (!openName || name != openName) {
        throw debug(new Error('Section named "' + name + '" was never opened'), template, line, options.file);
      }

      var section = sectionStack.pop();

      code.push(
        '";',
        '\n    return buffer;',
        '\n  };',
        '\n})();'
      );

      if (section.inverted) {
        code.push("\nbuffer += renderSection(name,stack,callback,true);");
      } else {
        code.push("\nbuffer += renderSection(name,stack,callback);");
      }

      code.push('\nbuffer += "');
    };

    var sendPlain = function (source) {
      code.push(
        '";',
        updateLine,
        '\nbuffer += lookup("' + trim(source) + '",stack,"");',
        '\nbuffer += "'
      );
    };

    var sendEscaped = function (source) {
      code.push(
        '";',
        updateLine,
        '\nbuffer += escapeHTML(lookup("' + trim(source) + '",stack,""));',
        '\nbuffer += "'
      );
    };

    var line = 1, c, callback;
    for (var i = 0, len = template.length; i < len; ++i) {
      if (template.slice(i, i + openTag.length) === openTag) {
        i += openTag.length;
        c = template.substr(i, 1);
        updateLine = '\nline = ' + line + ';';
        nextOpenTag = openTag;
        nextCloseTag = closeTag;
        hasTag = true;

        switch (c) {
        case "!": // comment
          i++;
          callback = null;
          break;
        case "=": // change open/close tags, e.g. {{=<% %>=}}
          i++;
          closeTag = "=" + closeTag;
          callback = setTags;
          break;
        case ">": // include partial
          i++;
          callback = includePartial;
          break;
        case "#": // start section
          i++;
          callback = openSection;
          break;
        case "^": // start inverted section
          i++;
          callback = openInvertedSection;
          break;
        case "/": // end section
          i++;
          callback = closeSection;
          break;
        case "{": // plain variable
          closeTag = "}" + closeTag;
          // fall through
        case "&": // plain variable
          i++;
          nonSpace = true;
          callback = sendPlain;
          break;
        default: // escaped variable
          nonSpace = true;
          callback = sendEscaped;
        }

        var end = template.indexOf(closeTag, i);

        if (end === -1) {
          throw debug(new Error('Tag "' + openTag + '" was not closed properly'), template, line, options.file);
        }

        var source = template.substring(i, end);

        if (callback) {
          callback(source);
        }

        // Maintain line count for \n in source.
        var n = 0;
        while (~(n = source.indexOf("\n", n))) {
          line++;
          n++;
        }

        i = end + closeTag.length - 1;
        openTag = nextOpenTag;
        closeTag = nextCloseTag;
      } else {
        c = template.substr(i, 1);

        switch (c) {
        case '"':
        case "\\":
          nonSpace = true;
          code.push("\\" + c);
          break;
        case "\r":
          // Ignore carriage returns.
          break;
        case "\n":
          spaces.push(code.length);
          code.push("\\n");
          stripSpace(); // Check for whitespace on the current line.
          line++;
          break;
        default:
          if (isWhitespace(c)) {
            spaces.push(code.length);
          } else {
            nonSpace = true;
          }

          code.push(c);
        }
      }
    }

    if (sectionStack.length != 0) {
      throw debug(new Error('Section "' + sectionStack[sectionStack.length - 1].name + '" was not closed properly'), template, line, options.file);
    }

    // Clean up any whitespace from a closing {{tag}} that was at the end
    // of the template without a trailing \n.
    stripSpace();

    code.push(
      '";',
      "\nreturn buffer;",
      "\n} catch (e) { throw {error: e, line: line}; }"
    );

    // Ignore `buffer += "";` statements.
    var body = code.join("").replace(/buffer \+= "";\n/g, "");

    if (options.debug) {
      if (typeof console != "undefined" && console.log) {
        console.log(body);
      } else if (typeof print === "function") {
        print(body);
      }
    }

    return body;
  }

  /**
   * Used by `compile` to generate a reusable function for the given `template`.
   */
  function _compile(template, options) {
    var args = "view,partials,stack,lookup,escapeHTML,renderSection,render";
    var body = parse(template, options);
    var fn = new Function(args, body);

    // This anonymous function wraps the generated function so we can do
    // argument coercion, setup some variables, and handle any errors
    // encountered while executing it.
    return function (view, partials) {
      partials = partials || {};

      var stack = [view]; // context stack

      try {
        return fn(view, partials, stack, lookup, escapeHTML, renderSection, render);
      } catch (e) {
        throw debug(e.error, template, e.line, options.file);
      }
    };
  }

  // Cache of pre-compiled templates.
  var _cache = {};

  /**
   * Clear the cache of compiled templates.
   */
  function clearCache() {
    _cache = {};
  }

  /**
   * Compiles the given `template` into a reusable function using the given
   * `options`. In addition to the options accepted by Mustache.parse,
   * recognized options include the following:
   *
   *   - cache    Set `false` to bypass any pre-compiled version of the given
   *              template. Otherwise, a given `template` string will be cached
   *              the first time it is parsed
   */
  function compile(template, options) {
    options = options || {};

    // Use a pre-compiled version from the cache if we have one.
    if (options.cache !== false) {
      if (!_cache[template]) {
        _cache[template] = _compile(template, options);
      }

      return _cache[template];
    }

    return _compile(template, options);
  }

  /**
   * High-level function that renders the given `template` using the given
   * `view` and `partials`. If you need to use any of the template options (see
   * `compile` above), you must compile in a separate step, and then call that
   * compiled function.
   */
  function render(template, view, partials) {
    return compile(template)(view, partials);
  }

})(Mustache);


	var mus = '_', // Property name to mark compiled template properties
		selector = 'script[type="text/x-mus"]'; // Selector to filter templates in DOM

	/**
	 * Main Mus object
	 */
	window.Mus = {

		/**
		 * @var {Object} Mustache.parse() options
		 */
		options: {
			/**
			 *   Mustache.js options:
			 *
			 *   - file     The name of the file the template comes from (displayed
			 *              in error messages)
			 *   - tags     An array of open and close tags the `template` uses.
			 *              Defaults to the value of Mustache.tags
			 *   - debug    Set `true` to log the body of the generated function
			 *              to the console
			 *   - space    Set `true` to preserve whitespace from lines that
			 *              otherwise contain only a {{tag}}. Defaults to `false`
			 *
			 *   Mus specific options:
			 *
			 *   - url      The Mustache template of url for loading templates
			 *   - prefix   Prefix for template container element ids
			 */
			prefix: 'tpl'
		},

		/**
		 * Clears compiled-in templates
		 *
		 * @return {void}
		 */
		clear: function()
		{
			for (var name in Mus)
			{
				if (Mus.hasOwnProperty(name) && Mus[name].hasOwnProperty(mus))
				{
					delete Mus[name];
				}
			}
		},

		/**
		 * Compiles template in
		 *
		 * @param {String} name      Template name
		 * @param {String} template  Template contents
		 * @param {Object} [options] Custom options for generated template
		 *
		 * @throws {Error} When name inherits protected properties
		 *
		 * @return {Function} Callable template processing function
		 */
		set: function(name, template, options)
		{
			// Check for protected names
			if (Mus.hasOwnProperty(name) && !Mus[name].hasOwnProperty(mus))
			{
				throw new Error('Mus.set: "' + name + '" is incorrect template name.');
			}

			// Compile template
			Mus[name] = Mustache.compile(template, $.extend({}, Mus.options, options || {}));
			Mus[name][mus] = 1;

			// Return it
			return Mus[name];
		},

		/**
		 * Compiles template in from DOM elements
		 *
		 * @param {String|HTMLElement} el        HTML element, jQuery query or elements set
		 * @param {Object}             [options] Custom options for generated templates
		 *
		 * @throws {Error} When el is empty
		 *
		 * @return {void}
		 */
		dom: function(el, options)
		{
			// Try to find element
			var _el = $(el);
			if (!_el.length)
			{
				throw new Error('Mus.dom: template "' + el + '" not found.');
			}

			// Compile prefix regex
			var rx = Mus.options.prefix ? new RegExp('^' + Mus.options.prefix) : null;

			// Add each template
			_el.filter(selector).each(function(i, el){
				var $el = $(el),
					id = $el.attr('id'),
					tpl = $el.text().trim();

				// Convert element id to template name
				if (id && rx)
				{
					id = id.replace(rx, '');
					id = id.charAt(0).toLowerCase() + id.slice(1)
				}

				// Template should have contents and id
				if (!id.length || !tpl.length)
				{
					return null;
				}

				Mus.set(id, tpl, options);
			});
		},

		/**
		 * Renders template into the given element
		 *
		 * @param {String|HTMLElement} el     HTML element, jQuery query or elements set
		 * @param {String}             name   Template name
		 * @param {Object}             [data] Data to pass to the template renderer
		 * @param {String}             [url]  Template loading url (overriding one from options)
		 *
		 * @throws {Error} When target element not found, or name isn't String, or when template not found and autoloading isn't properly configured
		 *
		 * @return {Boolean} True if template succesfully rendered, False if rendering is deferred
		 */
		render: function(el, name, data, url)
		{
			var _el = $(el);
			data = data || {};

			// Check mandatory arguments
			if (_el.length)
			{
				throw new Error('Mus.render: target element not found.');
			}
			else if (typeof(name) !== 'string')
			{
				throw new Error('Mus.render: "' + name + '" is incorrect template name.');
			}

			if (!Mus.hasOwnProperty(name))
			{
				url = url || Mus.options.url;

				// There are no such template, but autoload isn't configured or url isn't passed, so throw an error
				if (!url)
				{
					throw new Error('Mus.render: template not found: ' + name + ' (autoload disabled).');
				}

				// Local data storage for callback function
				var render = {
					name: name,
					el: _el,
					data: data
				};

				// Make ajax request
				$.ajax({
					accepts: 'text/x-mus',
					url: Mustache.render(url, { name: name })
				}).success((function(data)
				{
					// Pass local data storage to the callback function
					return function(tpl)
					{
						// Compile template
						Mus.set(data.name, tpl);

						// Apply html to the target element
						data.el.html(Mus[data.name](data.data));
					}
				})(render));
			}
			else if (Mus[name].hasOwnProperty(mus))
			{
				// Template already exists, apply html
				_el.html(Mus[name](data));
				return true;
			}

			return false;
		}
	};

	/**
	 * jQuery Mus shortcut
	 */
	$.Mus = window.Mus;

	/**
	 * jQuery shortcut for using via $(el).mus(templateName, data)
	 *
	 * @param {String} name   Template name
	 * @param {Object} [data] Data to pass to the template renderer
	 * @param {String} [url]  Template loading url (overriding one from options)
	 *
	 * @return this
	 */
	$.fn.mus = function(name, data, url)
	{
		// Render template
		Mus.render(this, name, data, url);

		// Maintain chainability
		return this;
	};

	/**
	 * Auto-load predefined templates
	 */
	$(document).ready(function() {
		// Run Mus.dom against selected set
		Mus.dom($(selector));
	});

})(window, document, jQuery);
