var path = require('path');

var express = require('express');
var jade_browser = require('jade-browser');
var _ = require('underscore');

var config = require('./config');

exports.attach = function(app) {
  console.log('Setting up Express');
  
  app.set('view engine', 'jade');
  
  app.use('/static', express.static(path.join(__dirname, 'static')));
  app.use(jade_browser('/jade/templates.js', '*', {
    root: path.join(__dirname, 'views', 'client'),
    minify: true,
    noCache: config.debugViews
  }));
  app.use(express.logger());
  app.use(express.cookieParser(config.cookieSecret));
  app.use(express.bodyParser());
  
  app.locals._ = _;
};
