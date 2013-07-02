var connect_utils = require('express/node_modules/connect/lib/utils');
var cookie = require('express/node_modules/cookie');
var github = require('github');
var sharejs = require('share');

var config = require('./config');

// Initialize document with the contents of the corresponding gist file on GitHub.
// docName must be tilde-separated namespace, gist ID, and filename.
// Requires that the first ShareJS request is sent with GitHub auth token cookie.
var initializeDocument = function(model, signedCookie, docName) {
  var parts = docName.split('~');
  var origin = { id: parts[1], filename: parts[2] };
  var cookies = connect_utils.parseSignedCookies(cookie.parse(signedCookie), config.cookieSecret);
  var gh = new github({ version: '3.0.0' });
  gh.authenticate({ type: 'oauth', token: cookies.githubAccessToken });
  gh.gists.get({ id: origin.id }, function(err, gist) {
    model.applyOp(docName, { 
      op: [ { i: gist.files[origin.filename].content, p: 0 } ], v: 0
    });
  });
};

exports.attach = function(app) {
  console.log('Adding ShareJS routes');
  
  sharejs.server.attach(app, {
    db: { type: 'none' },
    auth: function(agent, action) {
      action.accept(); // XXX check that this user can edit this document
      if (action.name == 'create') {
        initializeDocument(app.model, agent.headers.cookie, action.docName);
      }
    }
  });
};
