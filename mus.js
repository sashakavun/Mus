/**
 * Mus v1.0.3
 * The Mustache.js wrapper for jQuery
 * http://github.com/keta/mus
 *
 * @package Mus
 * @depends Mustache.js, jQuery
 *
 * Copyright 2012, Aleksandr "keta" Kavun
 * Licensed under the MIT license:
 * http://www.opensource.org/licenses/mit-license.php
 */

/*global Mustache: false, jQuery: false */
(function (window, document, $) {
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


	var Mus,
		selector = 'script[type="text/x-mus"]'; // Selector to filter templates in DOM

	/**
	 * Main Mus object
	 *
	 * @type {Function}
	 */
	window.Mus = $.mus = Mus = function (name, data, partials) {
		if (Mus.hasOwnProperty(name) && Mus.tpl.hasOwnProperty(name)) {
			return Mus.execute(name, data, partials);
		}

		throw new Error('Mus: "' + name + '" is incorrect template name.');
	};

	/**
	 * Applying properties
	 */
	$.extend(Mus, {

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
		 * @var {Object} Template helpers
		 */
		helpers: {},

		/**
		 * @var {Object} Template partials
		 */
		partials: {},

		/**
		 * @var {Object} Compiled templates
		 */
		tpl: {},

		/**
		 * Clears compiled-in templates
		 *
		 * @return {void}
		 */
		clear: function () {
			var name;
			for (name in Mus) {
				if (Mus.hasOwnProperty(name) && Mus.tpl.hasOwnProperty(name)) {
					delete Mus[name];
					delete Mus.tpl[name];
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
		set: function (name, template, options) {
			// Check for protected names
			if (Mus.hasOwnProperty(name) && !Mus.tpl.hasOwnProperty(name)) {
				throw new Error('Mus.set: "' + name + '" is incorrect template name.');
			}

			// Compile template
			Mus[name] = Mus.tpl[name] = Mustache.compile(
				template,
				$.extend({}, Mus.options, options || {})
			);

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
		dom: function (el, options) {
			var $el = $(el || selector),
				rx = null,
				len = 0,
				trim = !Mus.options.space;

			// Make regex and set minimal length for template
			if (Mus.options.prefix) {
				rx = new RegExp('^' + Mus.options.prefix);
				len = Mus.options.prefix.length;
			}

			// Filter out elements collection
			if (el !== selector) {
				$el = $el.filter(selector);
			}

			// Add each template
			$el.each(function (i, el) {
				var $el = $(el),
					id = $el.attr('id'),
					tpl = $el.text();

				// Trim whitespace from template
				if (trim) {
					tpl = tpl.trim();
				}

				// Convert element id to template name
				if (rx && (id.length > len)) {
					id = id.replace(rx, '');
					id = id.charAt(0).toLowerCase() + id.slice(1);
				}

				Mus.set(id, tpl, options);
			});
		},

		/**
		 * Renders template into the given element
		 *
		 * @param {String|HTMLElement} el         HTML element, jQuery query or elements set
		 * @param {String}             name       Template name
		 * @param {Object}             [data]     Data to pass to the template renderer
		 * @param {String}             [partials] Partials to pass to the template renderer
		 * @param {String}             [url]      Template loading url (overriding one from options)
		 *
		 * @throws {Error} When target element not found, or name isn't String, or when template not found and auto-loading isn't properly configured
		 *
		 * @return {Boolean} True if template successfully rendered, False if rendering is deferred
		 */
		render: function (el, name, data, partials, url) {
			var $el = $(el),
				render = {
					name: name,
					el: $el,
					data: data,
					partials: partials
				};

			// Check mandatory arguments
			if (!$el.length) {
				throw new Error('Mus.render: target element not found.');
			} else if (typeof name !== 'string') {
				throw new Error('Mus.render: "' + name + '" is incorrect template name.');
			}

			if (!Mus.hasOwnProperty(name)) {
				// Check for URL parameter
				if (!url) {
					if (typeof partials === 'string') {
						// Partials argument is skipped, and URL is placed istead of it
						url = partials;
						render.partials = null;
					} else if (typeof data === 'string') {
						// Partials and data are skipped, just URL is passed
						url = data;
						render.data = {};
					} else if (Mus.options.url) {
						// No URL was passwd
						url = Mus.options.url;
					} else {
						// There are no such template, but auto-load isn't configured or url isn't passed, so throw an error
						throw new Error('Mus.render: template not found: ' + name + ' (auto-load disabled).');
					}
				}

				// Make ajax request
				$.ajax({
					accepts: 'text/x-mus',
					url: Mustache.render(url, { name: name })
				}).success((function (data) {
					// Pass local data storage to the callback function
					return function (tpl) {
						// Compile template and set target element contents
						data.el.html(Mus.set(data.name, tpl)(data.name, data.data, data.partials));
					};
				}(render)));
			} else if (Mus.tpl.hasOwnProperty(name)) {
				// Template already exists, apply html
				$el.html(Mus.execute(name, data, partials));
				return true;
			}

			return false;
		},

		/**
		 * Executes template renderer by name
		 *
		 * @param {String} name       Template name
		 * @param {Object} [data]     Data to pass to the renderer
		 * @param {Object} [partials] Partials to pass to the renderer
		 *
		 * @trows {Error} If template was not successfully executed
		 *
		 * @return {String} Rendered content
		 */
		execute: function (name, data, partials) {
			return Mus[name](
				$.extend({}, Mus.helpers, data || {}),
				$.extend({}, Mus.partials, partials || {})
			);
		}
	});

	/**
	 * jQuery shortcut for using via $(el).mus(templateName, data)
	 *
	 * @param {String} name   Template name
	 * @param {Object} [data] Data to pass to the template renderer
	 * @param {String} [url]  Template loading url (overriding one from options)
	 *
	 * @return this
	 */
	$.fn.mus = function (name, data, partials, url) {
		// Render template
		Mus.render(this, name, data, partials, url);
		// Maintain chainability
		return this;
	};

	/**
	 * Auto-load predefined templates
	 */
	$(document).ready(function () {
		// Run Mus.dom against selected set
		Mus.dom(selector);
	});

}(window, document, jQuery));
