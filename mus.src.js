/**
 * Mus v1.0
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
		selector = 'script[type = "text/x-mus"]'; // Selector to filter templates in DOM

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

		set: function(name, template, options)
		{
			// Check for protected names
			if (Mus.hasOwnProperty(name) && !Mus[name].hasOwnProperty(mus))
			{
				throw new Error('Illegal template name: ' + name);
			}

			// Compile template
			Mus[name] = Mustache.compile(template, $.extend({}, Mus.options, options || {}));
			Mus[name][mus] = 1;

			// Return it
			return Mus[name];
		},

		dom: function(el, options)
		{
			// Try to find element
			var _el = $(el);
			if (!_el.length)
			{
				throw new Error('Template not found in DOM: ' + el);
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

		apply: function(el, name, data)
		{
			if (!Mus.hasOwnProperty(name))
			{
				// Mus have no such template, and autoload isn't configured, throw an error
				if (!Mus.options.url)
				{
					throw new Error('Unknown template: ' + name + ' (autoload disabled)');
				}

				// Local data storage for callback function
				var render = {
					name: name,
					el: el,
					data: data
				};

				// Make ajax request
				$.ajax({
					accepts: 'text/x-mus',
					url: Mustache.render(Mus.options.url, { name: name})
				}).success((function(data) {
					// Pass local data storage to the callback function
					return function(tpl) {
						// Compile template
						Mus.set(data.name, tpl);

						// Apply html to the target element
						$(data.el).html(Mus[data.name](data.data));
					}
				})(render));
			}
			else if (Mus[name].hasOwnProperty(mus))
			{
				// Template already exists, apply html
				$(el).html(Mus[name](data));

				// Return true
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
	 * @param {String} template Template name
	 * @param {Object} data     Data to pass to the template renderer
	 *
	 * @return this
	 */
	$.fn.mus = function(template, data)
	{
		// Apply template
		Mus.apply(this, template, data);

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
