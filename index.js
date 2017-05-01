var express = require('express');
var app = express();
var pg = require('pg');
var req = require('request');
var _ = require('lodash');

app.set('port', (process.env.PORT || 5000));
app.get('/', function(request, response) {
  response.send('WIP');
});

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
