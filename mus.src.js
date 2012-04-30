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

	// {{mustache}} //

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
