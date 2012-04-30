Mus
=======
The Mustache.js wrapper for jQuery

Usage:

    // Parse and compite template
    Mus.set('user', '{{attribution}} {{name}}');

    // Use previously compiled template
    Mus.user({ attribution: 'Mr.', name: 'John Doe' });

    // Compile templates from DOM element contents by passing
    // jQuery selector or set of elements
    Mus.dom('script.template');
    Mus.dom($('.templates > script'));

    // Render template with data to DOM element by passing jQuery element selector
    // or jQuery set of elements, template name and data.
    Mus.render('div.target', 'user', { attribution: 'Mrs.', name: 'Ashley Doe' });

    // Or use jQuery way call
    $('div.target').mus('user', { attribution: 'Mrs.', name: 'Mary Doe' });

    // If template wasn't found, it will be lazy-loaded via ajax when configured to do that
    Mus.options.url = '/template.js?name={{name}}';
    $('div.target').mus('user', { attribution: 'Ms.', name: 'Polly Doe' });
    $('div.target').mus('user', { attribution: 'Ms.', name: 'Ginger Doe' });
    $('div.target').mus('app', '/app.js');
