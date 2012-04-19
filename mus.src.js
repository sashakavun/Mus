/**
 * Mus v1.0.2
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

	// {{mustache}} //

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
			// Compile prefix regex
			var rx = Mus.options.prefix ? new RegExp('^' + Mus.options.prefix) : null;

			// Add each template
			$(el).filter(selector).each(function(i, el){
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
			if (!_el.length)
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
		Mus.dom(selector);
	});

})(window, document, jQuery);
