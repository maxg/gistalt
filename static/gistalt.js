var gistalt = (function() {
  var exports = {};
  
  // Wire up a pair rendezvous form.
  exports.setupRendezvous = function(form, input, alert) {
    form.onsubmit = function() {
      var req = new XMLHttpRequest();
      req.onload = function() {
        if (req.status == 200) {
          document.location.reload(true);
        } else {
          alert.innerHTML = 'Error';
        }
      };
      var url = [ '/join', locals.pointer, locals.gist, input.value ].join('/');
      req.open('POST', url, true);
      req.send();
      alert.innerHTML = 'Waiting for partner...';
      return false;
    };
  };
  
  // Filter metadata files out of a gist object.
  var hideMetadata = function(gist) {
    var hidden = _.filter(_.keys(gist.files), function(name) { return name.charAt(0) == '_'; });
    gist.files = _.omit(gist.files, hidden);
    return gist;
  };
  
  // Read a gist.
  exports.readGist = function(id, callback) {
    github.getGist(id).read(function(err, gist) {
      if (err) { return console.log('Error reading gist', id, err); }
      return callback(hideMetadata(gist));
    });
  };
  
  // Find or create a secret "fork" of the given gist.
  // The API cannot create a secret fork of a public gist,
  //   so provenance is indicated with a specially-named file.
  exports.setupFork = function(origin, callback) {
    github.getUser().gists(function(err, gists) {
      if (err) { return console.log('Error listing gists', err); }
      var mangle = '_gistalt_' + origin.id;
      var fork = _.find(gists, function(gist) { return gist.files[mangle]; });
      if (fork) { return callback(hideMetadata(fork)); }
      var marker = {};
      marker[mangle] = { content: 'See ' + origin.html_url };
      new Github.Gist({}).create({
        public: false,
        description: origin.description,
        files: _.extend(_.clone(origin.files), marker)
      }, function(err, gist) {
        if (err) { return console.log('Error creating fork', err); }
        return callback(hideMetadata(gist));
      });
    });
  };
  
  // Wire up a collaborative editor.
  exports.setupEditors = function(container, origin, fork) {
    _.forEach(container.getElementsByClassName('editor'), function(div) {
      var filename = div.getAttribute('data-filename');
      var ext = filename.split('.').slice(-1)[0];
      
      var editor = ace.edit(div);
      editor.setTheme('ace/theme/eclipse');
      editor.getSession().setMode(({
        'java': 'ace/mode/java',
        'js': 'ace/mode/javascript'
      })[ext]);
      
      sharejs.open(locals.namespace + '~' + origin.id + '~' + filename, 'text', function(err, doc) {
        doc.attach_ace(editor);
      });
      
      var resize = (function() {
        var currentPixels = 0;
        return function() {
          var pixels = editor.getSession().getScreenLength() * editor.renderer.lineHeight
                       + editor.renderer.scrollBar.getWidth();
          if (pixels != currentPixels) {
            div.style.height = pixels + 'px';
            editor.resize();
            currentPixels = pixels;
          }
        };
      })();
      editor.getSession().on('change', resize);
      
      var save = _.throttle(function(text) {
        var files = {};
        files[filename] = { content: text };
        github.getGist(fork.id).update({ files: files }, function(err, gist) {
          if (err) { return console.log('Error updating fork', err); }
        });
      }, 1000 * 20);
      editor.getSession().on('change', _.debounce(function() { save(editor.getValue()); }, 1000 * 2));
    });
  };
  
  return exports;
})();
