var events = require('events');
var fs = require('fs');
var https = require('https');

var connect_utils = require('express/node_modules/connect/lib/utils');
var express = require('express');
var hat = require('hat');
var oauth = require('oauth');

var config = require('./config');

var githubAuth = new oauth.OAuth2(
  config.github.id, config.github.secret,
  'https://github.com/', 'login/oauth/authorize', 'login/oauth/access_token'
);

var pointers = hat.rack(8, 16, 2); // exercise codes
var joiners = hat.rack(8, 20, 2);  // pair rendezvous codes
var namespaces = hat.rack();       // pair shared document namespaces

var joins = new events.EventEmitter(); // pair rendezvous notifications

var app = express();

require('./backend').attach(app);
require('./frontend').attach(app);

app.all('*', function(req, res, next) { // require a valid client certificate and extract user info
  var cert = req.connection.getPeerCertificate();
  
  if ( ! req.connection.authorized) { return res.status(401).render(401); }
  
  res.locals.authuser = cert.subject.emailAddress.replace('@MIT.EDU', '');
  if (config.userFakery) { res.locals.authuser += '+' + connect_utils.md5(req.headers['user-agent']).substr(0,3); }
  res.locals.clientside = { user: res.locals.authuser };
  next();
});

app.get('/github', function(req, res) { // handle GitHub authorization callback
  githubAuth.getOAuthAccessToken(req.query.code, {}, function(err, accessToken) {
    if (err) { return res.status(500).render(500); }
    
    res.cookie('githubAccessToken', accessToken, { signed: true });
    res.redirect('/');
  });
});

app.get('*', function(req, res, next) { // require GitHub authorization
  if ( ! req.signedCookies.githubAccessToken) {
    return res.render('auth', {
      url: githubAuth.getAuthorizeUrl({
        redirect_uri: req.protocol + '://' + req.headers.host + '/github',
        scope: 'gist'
      })
    });
  }
  
  res.locals.clientside.github = { accessToken: req.signedCookies.githubAccessToken };
  next();
});

app.get('/', function(req, res) { // welcome
  res.render('index', { host: req.headers.host });
});

app.get('/create/:gist', function(req, res) { // preview a new exercise
  res.locals.clientside.gist = req.params.gist;
  res.locals.pointer = pointers(req.params.gist);
  res.render('create');
});

app.post('/create/:gist', function(req, res) { // create a new exercise
  if (pointers.get(req.body.pointer) != req.params.gist) {
    return res.status(500).render(500);
  }
  res.redirect('/' + req.body.pointer);
});

app.get('/:pointer', function(req, res) { // work on an exercise by providing the shortcode
  var gist = pointers.get(req.params.pointer);
  if ( ! gist) {
    return res.status(404).render(404)
  }
  res.redirect('/' + req.params.pointer + '/' + gist);
});

app.get('/:pointer/:gist', function(req, res) { // work on an exercise
  var pointer = res.locals.clientside.pointer = req.params.pointer;
  var gist = res.locals.clientside.gist = pointers.get(pointer);
  if (gist != req.params.gist) { return res.status(404).render(404) }
  
  var namespace = res.locals.clientside.namespace = req.signedCookies.namespace;
  if (namespace) {
    res.locals.collaborators = namespaces.get(namespace);
    res.render('edit');
  } else {
    res.locals.joiner = joiners(res.locals.authuser);
    res.render('join');
  }
});

app.post('/join/:pointer/:gist/:joiner', function(req, res) { // rendezvous with a partner
  if (pointers.get(req.params.pointer) != req.params.gist) { return res.status(404).render(404); }
  
  var otheruser = joiners.get(req.params.joiner);
  if ( ! otheruser) { return res.status(404).render(404); }
  
  function join(namespace) {
    res.cookie('namespace', namespace, { path: '/' + req.params.pointer + '/' + req.params.gist, signed: true });
    res.send(200);
  }
  joins.once(res.locals.authuser + '~' + otheruser, join);
  var namespace = namespaces();
  if (joins.emit(otheruser + '~' + res.locals.authuser, namespace)) {
    namespaces.set(namespace, [ res.locals.authuser, otheruser ].sort());
    join(namespace);
  }
});

var port = config.httpsPort || 3000;
var server = https.createServer({
  key: fs.readFileSync('./config/ssl-private-key.pem'),
  cert: fs.readFileSync('./config/ssl-certificate.pem'),
  ca: [ fs.readFileSync('./config/ssl-ca.pem') ],
  requestCert: true
}, app);
server.listen(port, function() { // start the server
  console.log('Listening on port', port);
});
