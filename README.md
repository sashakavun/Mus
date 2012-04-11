Mus
=======
The Mustache.js wrapper for jQuery

Usage:

    // Parse and compite template
    Mus.set('user', '{{attribution}} {{name}}');

    // Use previously compiled template
    Mus.user({ attribution: 'Mr.', name: 'John Doe' });

    // Compile templates from DOM element contents
    // by passing jQuery selector or set of elements
    Mus.dom('script.template');
    Mus.dom($('.templates > script'));

    // Apply template and data to DOM element by passing
    // jQuery element selector (or jQuery set of elements),
    // template name and data. If template wasn't found,
    // it will be lazy-loaded via ajax (if configured to do that)
    Mus.apply('div.target', 'user', { attribution: 'Mrs.', name: 'Mary Doe' });
    $('div.target').mus('user', { attribution: 'Mrs.', name: 'Mary Doe' });
