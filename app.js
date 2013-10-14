/**
* Module dependencies.
*/

var express = require('express')
  , ejs = require('ejs')
  , routes = require('./routes')
//  , user = require('./routes/user')
  , http = require('http')
  , mongodb = require('mongodb')
  , path = require('path');

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);
//app.post('/single', routes.single);
app.post('/test', routes.test);
app.post('/oid', routes.oid);
app.post('/search', routes.search);
app.post('/count', routes.count);
app.post('/within', routes.within);
app.post('/add', routes.add);

var server = http.createServer(app);
var MongoClient = mongodb.MongoClient;

MongoClient.connect("mongodb://localhost:27017/data", function(err, db) {

  if (err) throw err;
  console.log("Connected to mongodb");

  //store ref to db and the collections so that it is easily accessible (app is accessible in req and res)
  app.set('db', db);
  app.set('geo', new mongodb.Collection(db, 'geo'));

  //TODO ensureIndex
  server.listen(4000, function(){
    console.log("Express server listening on port %d in %s mode", server.address().port, app.settings.env);

  });

});